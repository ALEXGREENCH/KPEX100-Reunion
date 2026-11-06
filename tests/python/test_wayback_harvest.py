"""Offline failure/resume tests; no network requests or historical programs."""

import base64
import hashlib
import importlib.util
import json
from pathlib import Path

import pytest

SPEC = importlib.util.spec_from_file_location(
    "wayback_harvest", Path(__file__).resolve().parents[2] / "tools/wayback-harvest.py"
)
harvest = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(harvest)


def test_receipt_commit_survives_a_concurrent_reader_and_reopens(tmp_path):
    import io
    import sqlite3

    path = tmp_path / "queue.sqlite3"
    # An existing collection initially uses SQLite's rollback journal.
    with sqlite3.connect(path) as legacy:
        legacy.execute("CREATE TABLE responses(id INTEGER PRIMARY KEY, receipt TEXT)")
        legacy.execute("INSERT INTO responses(receipt) VALUES ('{}')")
    legacy.close()
    collector = harvest.Collector(tmp_path, delay=0)
    reader = sqlite3.connect(path)
    try:
        reader.execute("BEGIN")
        assert reader.execute("SELECT count(*) FROM responses").fetchone()[0] == 1
        collector.db.execute("PRAGMA busy_timeout=30")
        response = io.BytesIO(b"original")
        response.code = 200
        response.headers = {"Content-Type": "application/octet-stream"}
        response.url = (
            "https://web.archive.org/web/20040215031403id_/http://gnexclub.com/download"
        )
        collector.opener.open = lambda request, timeout: response
        receipt, body = collector.request(response.url, "regression:reader-lock")
        assert body == b"original" and receipt["response_id"] == 2
        assert reader.execute("SELECT count(*) FROM responses").fetchone()[0] == 1
        assert collector.db.execute("SELECT count(*) FROM responses").fetchone()[0] == 2
        reader.rollback()
        assert reader.execute("SELECT count(*) FROM responses").fetchone()[0] == 2
    finally:
        reader.close()
        collector.db.close()
    reopened = harvest.Collector(tmp_path, delay=0)
    try:
        receipt = json.loads(
            reopened.db.execute("SELECT receipt FROM responses WHERE id=2").fetchone()[
                0
            ]
        )
        digest = receipt["object"]
        assert (tmp_path / "objects" / digest[:2] / digest).read_bytes() == b"original"
    finally:
        reopened.db.close()


def record(body=b"original", timestamp="20040215031403"):
    return [
        "com,gnexclub)/download",
        timestamp,
        "http://www.gnexclub.com/download",
        "text/html",
        "200",
        base64.b32encode(hashlib.sha1(body).digest()).decode(),
        "100",
    ]


def page(rows, resume=None):
    output = json.dumps([harvest.FIELDS, *rows])
    return (output + ("\n\n" + json.dumps([resume]) if resume else "")).encode()


def test_cdx_resume_and_rejected_error_pages():
    records, resume = harvest.parse_cdx(page([record()], "next%2Bcursor"))
    assert records[0]["timestamp"] == "20040215031403"
    assert resume == "next%2Bcursor"
    embedded = json.dumps([harvest.FIELDS, record(), [], ["live-IA-cursor"]]).encode()
    assert harvest.parse_cdx(embedded)[1] == "live-IA-cursor"
    assert harvest.parse_cdx(b"[]") == ([], None)
    for bad in (b"", b"<html>Service unavailable</html>", b"[{}]", b"[]\n[42]"):
        with pytest.raises((ValueError, TypeError)):
            harvest.parse_cdx(bad)


def test_scopes_do_not_collect_a_shared_host_or_fake_suffix():
    domain = {"url": "gnexclub.com", "matchType": "domain"}
    assert harvest.in_scope("http://www.gnexclub.com:80/a", domain)
    assert not harvest.in_scope("https://evilgnexclub.com/a", domain)
    scope = {"url": "https://cafe.naver.com/kpex100/", "matchType": "prefix"}
    assert harvest.in_scope("http://cafe.naver.com/kpex100/79", scope)
    assert not harvest.in_scope("https://cafe.naver.com/unrelated/79", scope)
    host = {"url": "chamcham.tistory.com", "matchType": "host"}
    assert harvest.in_scope("http://www.chamcham.tistory.com/robots.txt", host)
    assert harvest.in_scope("https://chamcham.tistory.com/1", host)
    for name in [
        "other.tistory.com",
        "evilchamcham.tistory.com",
        "sub.chamcham.tistory.com",
        "www.www.chamcham.tistory.com",
    ]:
        assert not harvest.in_scope("https://" + name + "/1", host)
    assert not harvest.in_scope("https://www.cafe.naver.com/kpex100/79", scope)


def test_failed_index_does_not_advance_and_resume_survives_reopen(tmp_path):
    scope = {"id": "gnexclub", "url": "gnexclub.com", "matchType": "domain"}
    collector = harvest.Collector(tmp_path, delay=0)
    collector.request = lambda *_: ({"status": 503}, b"error")
    collector.index(scope)
    state = collector.db.execute("SELECT * FROM scopes").fetchone()
    assert state["pages"] == 0 and not state["complete"]
    collector.request = lambda *_: ({"status": 200}, page([record()], "cursor"))
    collector.index(scope, max_pages=1)
    collector.db.close()
    collector = harvest.Collector(tmp_path, delay=0)
    urls = []

    def request(url, _):
        urls.append(url)
        return {"status": 200}, page([record(timestamp="20050215031403")])

    collector.request = request
    collector.index(scope)
    assert "resumeKey=cursor" in urls[0]
    assert collector.db.execute("SELECT count(*) FROM captures").fetchone()[0] == 2
    assert collector.db.execute("SELECT complete FROM scopes").fetchone()[0] == 1
    collector.db.close()


def test_http200_error_is_not_a_recovered_capture_and_can_retry(tmp_path):
    collector = harvest.Collector(tmp_path, delay=0)
    scope = {"id": "gnexclub", "url": "gnexclub.com", "matchType": "domain"}
    collector.request = lambda *_: ({"status": 200}, page([record()]))
    collector.index(scope)
    collector.request = lambda *_: (
        {"status": 200, "object": "wrong"},
        b"Wayback error",
    )
    collector.download()
    assert (
        collector.db.execute("SELECT state FROM captures").fetchone()[0] == "mismatch"
    )
    assert not collector.export()["complete"]
    collector.request = lambda *_: (
        {"status": 200, "object": harvest.sha(b"original")},
        b"original",
    )
    collector.download(retry=True)
    assert collector.export()["complete"]
    assert collector.db.execute("SELECT attempts FROM captures").fetchone()[0] == 2
    collector.db.close()


def test_download_scope_and_frozen_snapshot_manifest(tmp_path):
    collector = harvest.Collector(tmp_path / "collection", delay=0)
    for scope_id, host in [("gnexclub", "gnexclub.com"), ("gvmclub", "gvmclub.com")]:
        item = record()
        item[2] = "http://" + host + "/download"
        collector.request = lambda *_, item=item: ({"status": 200}, page([item]))
        collector.index({"id": scope_id, "url": host, "matchType": "domain"})
    digest = collector.blob(b"original")
    collector.request = lambda *_: ({"status": 200, "object": digest}, b"original")
    collector.download(scopes=["gnexclub"])
    assert dict(
        collector.db.execute("SELECT state,count(*) FROM captures GROUP BY state")
    ) == {"pending": 1, "verified": 1}
    # A concurrent reader/writer connection can stay open during the backup.
    spec = importlib.util.spec_from_file_location(
        "package_wayback",
        Path(__file__).resolve().parents[2] / "tools/package-wayback.py",
    )
    package = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(package)
    output = tmp_path / "snapshot.zip"
    result = package.package(tmp_path / "collection", output)
    assert result["objects"] == 1 and result["crcPassed"]
    import zipfile

    with zipfile.ZipFile(output) as archive:
        assert (
            archive.read("collection/objects/" + digest[:2] + "/" + digest)
            == b"original"
        )
        manifest = json.loads(archive.read("manifest.json"))
        assert all(
            hashlib.sha256(archive.read(item["path"])).hexdigest() == item["sha256"]
            for item in manifest["files"]
        )
    collector.db.close()


def test_cached_http200_error_cannot_poison_index_retries(tmp_path):
    collector = harvest.Collector(tmp_path, delay=0)
    bad = collector.blob(b"<html>temporary error</html>")
    scope = {"id": "gnexclub", "url": "gnexclub.com", "matchType": "domain"}
    called = []

    def fetch(url, purpose):
        if not called:
            with collector.db:
                collector.db.execute(
                    "INSERT INTO responses(receipt) VALUES (?)",
                    (json.dumps({"url": url, "status": 200, "object": bad}),),
                )
            body = b"<html>temporary error</html>"
        else:
            body = page([record()])
        called.append(url)
        return {"status": 200}, body

    collector.request = fetch
    collector.index(scope)
    assert not collector.db.execute("SELECT complete FROM scopes").fetchone()[0]
    collector.index(scope)
    assert len(called) == 2
    assert collector.db.execute("SELECT complete FROM scopes").fetchone()[0]
    collector.db.close()


def korean_record(body=b"original", digest=True):
    row = record(body)
    name = "20021130_단말기별_개발가이드.pdf"
    row[2] = "http://www.gnexclub.com:80/" + name.encode("utf8").decode("latin1")
    if not digest:
        row[5] = "-"
    return row


def test_korean_candidates_keep_host_syntax_and_existing_escapes():
    original = korean_record()[2]
    variants = harvest.korean_replay_variants(original)
    assert [method for method, _ in variants] == ["latin1-utf8-bytes", "korean-cp949"]
    assert all(
        url.startswith("http://www.gnexclub.com:80/20021130_") for _, url in variants
    )
    assert "%EB%8B%A8" in variants[0][1]
    assert "%B4%DC" in variants[1][1]
    query = "?literal=%2f%25&name=" + "게임".encode("utf8").decode("latin1")
    assert (
        "literal=%2f%25&name=%B0%D4%C0%D3"
        in harvest.korean_replay_variants(original + query)[1][1]
    )
    assert harvest.korean_replay_variants("http://gnexclub.com/%b4%dc/file.pdf") == []
    assert harvest.korean_replay_variants("http://gnexclub.com/café.pdf") == []
    assert harvest.korean_replay_variants("http://gnexclub.com/資料.pdf") == []
    assert len(harvest.korean_replay_variants("http://gnexclub.com/게임.pdf")) == 1


def test_korean_recovery_requires_digest_and_keeps_original_cdx(tmp_path):
    collector = harvest.Collector(tmp_path, delay=0)
    original = korean_record()
    collector.request = lambda *_: ({"status": 200}, page([original]))
    collector.index({"id": "gnexclub", "url": "gnexclub.com", "matchType": "domain"})
    before = collector.db.execute("SELECT id,record FROM captures").fetchone()
    calls = []

    def fetch(url, _):
        calls.append(url)
        body = b"original" if "%B4%DC" in url else b"not the archived document"
        return {
            "status": 200 if body == b"original" else 404,
            "object": collector.blob(body),
            "response_id": len(calls),
        }, body

    collector.request = fetch
    collector.download(repair_urls=True)
    after = collector.db.execute("SELECT * FROM captures").fetchone()
    assert after["id"] == before["id"] and after["record"] == before["record"]
    assert after["state"] == "verified" and after["payload"] == harvest.sha(b"original")
    resolution = json.loads(after["resolution"])
    assert resolution["acceptedMethod"] == "korean-cp949"
    assert len(calls) == len(resolution["attempts"]) == after["attempts"] == 3
    assert [item["responseId"] for item in resolution["attempts"]] == [1, 2, 3]
    collector.db.close()


@pytest.mark.parametrize("status", [0, 401, 403, 429, 500, 502, 503, 504])
def test_korean_repair_does_not_work_around_access_or_temporary_errors(
    tmp_path, status
):
    collector = harvest.Collector(tmp_path, delay=0)
    collector.request = lambda *_: ({"status": 200}, page([korean_record()]))
    collector.index({"id": "gnexclub", "url": "gnexclub.com", "matchType": "domain"})
    calls = []

    def fetch(url, _):
        calls.append(url)
        return {"status": status, "object": collector.blob(b"error")}, (
            None if status == 0 else b"error"
        )

    collector.request = fetch
    collector.download(repair_urls=True)
    assert len(calls) == 1
    assert (
        collector.db.execute("SELECT state FROM captures").fetchone()[0] != "verified"
    )
    collector.db.close()


def test_unknown_digest_and_bad_variants_stay_unverified(tmp_path):
    collector = harvest.Collector(tmp_path, delay=0)
    collector.request = lambda *_: (
        {"status": 200},
        page([korean_record(digest=False), korean_record(body=b"different")]),
    )
    collector.index({"id": "gnexclub", "url": "gnexclub.com", "matchType": "domain"})
    calls = []

    def fetch(url, _):
        calls.append(url)
        return {
            "status": 200,
            "object": collector.blob(b"a successful error page"),
        }, b"a successful error page"

    collector.request = fetch
    collector.download(repair_urls=True)
    assert len(calls) == 4  # One unknown-digest literal plus three checked candidates.
    assert dict(
        collector.db.execute("SELECT state,count(*) FROM captures GROUP BY state")
    ) == {"mismatch": 1, "unverified": 1}
    collector.db.close()


def test_stop_marker_does_not_start_requests_and_failed_only_excludes_pending(tmp_path):
    collector = harvest.Collector(tmp_path, delay=0)
    collector.request = lambda *_: (
        {"status": 200},
        page([record(), record(timestamp="20050215031403")]),
    )
    scope = {"id": "gnexclub", "url": "gnexclub.com", "matchType": "domain"}
    (tmp_path / "STOP").write_bytes(b"")
    collector.index(scope)
    assert collector.db.execute("SELECT count(*) FROM captures").fetchone()[0] == 0
    (tmp_path / "STOP").unlink()
    collector.index(scope)
    with collector.db:
        identity = collector.db.execute(
            "SELECT id FROM captures ORDER BY id LIMIT 1"
        ).fetchone()[0]
        collector.db.execute(
            "UPDATE captures SET state='mismatch' WHERE id=?", (identity,)
        )
    calls = []

    def fetch(url, _):
        calls.append(url)
        (tmp_path / "STOP").write_bytes(b"")
        return {"status": 200, "object": collector.blob(b"original")}, b"original"

    collector.request = fetch
    collector.download(failed_only=True)
    assert len(calls) == 1
    assert dict(
        collector.db.execute("SELECT state,count(*) FROM captures GROUP BY state")
    ) == {"pending": 1, "verified": 1}
    collector.download()
    assert len(calls) == 1 and collector.export()["stopRequested"]
    collector.db.close()


def test_archive_redirect_accepts_only_same_raw_resource():
    original = "http://www.gnexclub.com:80/File.h?q=%2F"
    source = harvest.REPLAY + "20040215031403id_/" + original
    target = (
        "https://web.archive.org/web/20030117084521id_/http://gnexclub.com/File.h?q=%2f"
    )
    receipt = {"url": source, "status": 302, "headers": [("Location", target)]}
    assert harvest.archive_redirect_url(receipt, original) == target
    for bad in [
        "https://gnexclub.com/File.h?q=%2f",
        target.replace("web.archive.org", "web.archive.org.evil.test"),
        target.replace("File.h", "Login.h"),
        target.replace("gnexclub.com/File", "other.gnexclub.com/File"),
        target.replace("id_/", "/"),
        target.replace("q=%2f", "q=other"),
        target.replace("https://web.archive.org/", "http://web.archive.org/"),
        target.replace("web.archive.org/", "web.archive.org:444/"),
        target + "#fragment",
    ]:
        assert (
            harvest.archive_redirect_url(
                {**receipt, "headers": [("location", bad)]}, original
            )
            is None
        )
    assert (
        harvest.archive_redirect_url(
            {
                **receipt,
                "headers": receipt["headers"]
                + [("X-Archive-Orig-Location", "/File.h")],
            },
            original,
        )
        is None
    )


@pytest.mark.parametrize("matches", [True, False])
def test_nearest_capture_body_still_requires_requested_digest(tmp_path, matches):
    collector = harvest.Collector(tmp_path, delay=0)
    item = record()
    collector.request = lambda *_: ({"status": 200}, page([item]))
    collector.index({"id": "gnexclub", "url": "gnexclub.com", "matchType": "domain"})
    calls = []

    def fetch(url, _):
        calls.append(url)
        body = b"original" if matches else b"different archived capture"
        if len(calls) == 1:
            return {
                "url": url,
                "status": 302,
                "headers": [
                    (
                        "Location",
                        "https://web.archive.org/web/20030117084521id_/http://gnexclub.com/download",
                    )
                ],
            }, b"redirect"
        return {"url": url, "status": 200, "object": collector.blob(body)}, body

    collector.request = fetch
    collector.download(archive_redirects=True)
    row = collector.db.execute("SELECT * FROM captures").fetchone()
    assert json.loads(row["record"])["timestamp"] == item[1]
    assert len(calls) == 2 and "20030117084521id_" in calls[-1]
    resolution = json.loads(row["resolution"])
    assert resolution["acceptedViaArchiveRedirect"] is matches
    assert row["state"] == ("verified" if matches else "mismatch")
    collector.db.close()


@pytest.mark.parametrize("historical_redirect", [True, False])
def test_redirect_chain_is_bounded_and_captured_redirects_are_not_followed(
    tmp_path, historical_redirect
):
    collector = harvest.Collector(tmp_path, delay=0)
    item = record()
    if historical_redirect:
        item[4] = "302"
    collector.request = lambda *_: ({"status": 200}, page([item]))
    collector.index({"id": "gnexclub", "url": "gnexclub.com", "matchType": "domain"})
    calls = []

    def fetch(url, _):
        calls.append(url)
        stamp = str(20030117084520 + len(calls))
        return {
            "url": url,
            "status": 302,
            "headers": [
                (
                    "Location",
                    harvest.REPLAY + stamp + "id_/http://gnexclub.com/download",
                )
            ],
        }, b"redirect"

    collector.request = fetch
    collector.download(archive_redirects=True)
    assert len(calls) == (1 if historical_redirect else 3)
    assert (
        collector.db.execute("SELECT state FROM captures").fetchone()[0] == "mismatch"
    )
    collector.db.close()


def test_downloads_prioritize_korean_archive_and_document_types_before_html(tmp_path):
    collector = harvest.Collector(tmp_path, delay=0)
    records = []
    for extension in ["html", "alz", "hwp", "doc", "chm"]:
        item = record()
        item[2] = "https://gnexclub.com/archive." + extension
        records.append(item)
    collector.request = lambda *_: ({"status": 200}, page(records))
    collector.index({"id": "gnexclub", "url": "gnexclub.com", "matchType": "domain"})
    calls = []

    def receive(url, _):
        calls.append(url)
        return {"status": 200, "object": collector.blob(b"original")}, b"original"

    collector.request = receive
    collector.download()
    assert len(calls) == 5 and calls[-1].endswith(".html")
    assert set(url.rsplit(".", 1)[1] for url in calls[:-1]) == {
        "alz",
        "hwp",
        "doc",
        "chm",
    }
    assert (
        collector.db.execute(
            "SELECT count(*) FROM captures WHERE state='verified'"
        ).fetchone()[0]
        == 5
    )
    collector.db.close()
