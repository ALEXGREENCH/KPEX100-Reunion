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
