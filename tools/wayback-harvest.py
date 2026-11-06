"""Resume an auditable CDX/replay collection; original responses are never executed.

Python standard library only. No index collapse or date/status/MIME filtering.
The SQLite queue, raw HTTP bodies and receipts survive interruption. Downloads
are addressed by SHA-256; identical captures share bytes, not provenance.
"""

import argparse
import base64
from datetime import datetime, timezone
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import sqlite3
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

FIELDS = [
    "urlkey",
    "timestamp",
    "original",
    "mimetype",
    "statuscode",
    "digest",
    "length",
]
CDX = "https://web.archive.org/cdx/search/cdx"
REPLAY = "https://web.archive.org/web/"


def utc():
    return datetime.now(timezone.utc).isoformat()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def parse_cdx(data):
    """Read JSON plus the optional second JSON resume-key object, strictly."""
    text = data.decode("utf-8").strip()
    if not text:
        raise ValueError("Empty HTTP response is not an empty CDX index")
    decoder = json.JSONDecoder()
    rows, end = decoder.raw_decode(text)
    tail = text[end:].strip()
    resume = None
    # Current IA deployments put the marker inside the outer JSON array;
    # older documented deployments append a second JSON value instead.
    if isinstance(rows, list) and len(rows) >= 3 and rows[-2] == []:
        marker = rows[-1]
        if (
            not isinstance(marker, list)
            or len(marker) != 1
            or not isinstance(marker[0], str)
            or not marker[0]
        ):
            raise ValueError("Invalid embedded CDX resume key")
        resume = marker[0]
        rows = rows[:-2]
    if tail:
        if resume is not None:
            raise ValueError("Duplicate CDX resume marker")
        trailer = json.loads(tail)
        if not isinstance(trailer, list) or len(trailer) != 1:
            raise ValueError("Unexpected CDX resume trailer")
        resume = trailer[0]
        if isinstance(resume, list) and len(resume) == 1:
            resume = resume[0]
        if not isinstance(resume, str) or not resume:
            raise ValueError("Invalid CDX resume key")
    if rows == []:
        return [], resume
    if not isinstance(rows, list) or rows[0] != FIELDS:
        raise ValueError("Unexpected CDX field order or error response")
    records = []
    for row in rows[1:]:
        if (
            not isinstance(row, list)
            or len(row) != len(FIELDS)
            or not all(isinstance(x, str) for x in row)
        ):
            raise ValueError("Malformed CDX record")
        item = dict(zip(FIELDS, row))
        if not re.fullmatch(r"\d{14}", item["timestamp"]):
            raise ValueError("Invalid capture timestamp")
        if urllib.parse.urlsplit(item["original"]).scheme not in ("http", "https"):
            raise ValueError("Non-HTTP original in CDX")
        records.append(item)
    return records, resume


def in_scope(original, scope):
    parsed = urllib.parse.urlsplit(original)
    target = urllib.parse.urlsplit(
        "https://" + scope["url"].removeprefix("https://").removeprefix("http://")
    )
    host, wanted = (parsed.hostname or "").lower(), (target.hostname or "").lower()
    if scope["matchType"] == "domain":
        return host == wanted or host.endswith("." + wanted)
    if scope["matchType"] == "host":
        # CDX canonical host queries can include the ordinary www alias.
        # Accept that one alias only, never neighboring shared-host blogs.
        return host.removeprefix("www.") == wanted.removeprefix("www.")
    if host != wanted:
        return False
    return parsed.path.startswith(target.path)


def korean_replay_variants(original):
    """Derive at most two Korean transport alternatives, without changing the host.

    Literal CDX strings remain untouched. These are candidates, not assertions
    about a filename: only the original CDX payload digest can accept a result.
    Existing percent escapes and URL syntax are retained, not decoded twice.
    """
    parsed = urllib.parse.urlsplit(original)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return []
    target = urllib.parse.urlunsplit(
        ("", "", parsed.path, parsed.query, parsed.fragment)
    )
    if not any(ord(char) > 127 for char in target):
        return []
    repaired = target
    mojibake = False
    try:
        decoded = target.encode("latin1").decode("utf8")
        if re.search(r"[\uac00-\ud7a3]", decoded):
            repaired, mojibake = decoded, decoded != target
    except UnicodeError:
        pass
    if not re.search(r"[\uac00-\ud7a3]", repaired):
        return []
    safe = ":/?&=;%+@!$'()*,-._~[]#"
    prefix = parsed.scheme + "://" + parsed.netloc
    variants = []
    if mojibake:
        variants.append(
            (
                "latin1-utf8-bytes",
                prefix
                + urllib.parse.quote_from_bytes(target.encode("latin1"), safe=safe),
            )
        )
    try:
        variants.append(
            (
                "korean-cp949",
                prefix
                + urllib.parse.quote_from_bytes(repaired.encode("cp949"), safe=safe),
            )
        )
    except UnicodeError:
        pass
    literal_wire = urllib.parse.quote(original, safe=safe)
    seen = {literal_wire}
    result = []
    for method, url in variants:
        if url not in seen:
            seen.add(url)
            result.append((method, url))
    return result


def archive_redirect_url(receipt, original):
    """Accept only raw Wayback redirects for the same original resource.

    Nearest-capture redirects may change timestamp and www/default port. Final
    bytes still need the requested CDX digest. Live redirects stay as data.
    """
    headers = {name.lower(): value for name, value in receipt.get("headers", [])}
    if (
        receipt["status"] not in (301, 302, 303, 307, 308)
        or "x-archive-orig-location" in headers
        or "location" not in headers
    ):
        return None
    try:
        url = urllib.parse.urljoin(receipt["url"], headers["location"])
        replay = urllib.parse.urlsplit(url)
        if (
            replay.scheme != "https"
            or replay.hostname != "web.archive.org"
            or replay.port not in (None, 443)
            or replay.username
            or replay.password
            or replay.fragment
        ):
            return None
        match = re.fullmatch(r"/web/\d{14}id_/(https?://.+)", replay.path)
        if not match:
            return None
        candidate = urllib.parse.urlsplit(
            match[1] + ("?" + replay.query if replay.query else "")
        )
        expected = urllib.parse.urlsplit(original)
        for parsed in (candidate, expected):
            if (
                parsed.scheme not in ("http", "https")
                or not parsed.hostname
                or parsed.username
                or parsed.password
                or parsed.port not in (None, 80 if parsed.scheme == "http" else 443)
            ):
                return None
        if candidate.hostname.lower().removeprefix(
            "www."
        ) != expected.hostname.lower().removeprefix("www."):
            return None

        def target(parsed):
            value = urllib.parse.quote(
                parsed.path + ("?" + parsed.query if parsed.query else ""),
                safe=":/?&=;%+@!$'()*,-._~[]#",
            )
            return re.sub(r"%[a-fA-F0-9]{2}", lambda match: match[0].lower(), value)

        return url if target(candidate) == target(expected) else None
    except ValueError:
        return None


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Collector:
    def __init__(self, root, delay=1.5, timeout=35):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(self.root / "queue.sqlite3")
        # Offline readers may hold snapshots while HTTP receipts commit.
        self.db.execute("PRAGMA journal_mode=WAL").fetchone()
        self.db.row_factory = sqlite3.Row
        self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS scopes (
              id TEXT PRIMARY KEY, definition TEXT NOT NULL,
              resume TEXT, pages INTEGER NOT NULL DEFAULT 0,
              complete INTEGER NOT NULL DEFAULT 0, last_error TEXT);
            CREATE TABLE IF NOT EXISTS captures (
              id TEXT PRIMARY KEY, record TEXT NOT NULL,
              state TEXT NOT NULL DEFAULT 'pending', payload TEXT,
              attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT);
            CREATE TABLE IF NOT EXISTS membership (
              scope TEXT NOT NULL, capture TEXT NOT NULL,
              PRIMARY KEY(scope,capture));
            CREATE TABLE IF NOT EXISTS responses (
              id INTEGER PRIMARY KEY, receipt TEXT NOT NULL);
            """
        )
        columns = {row[1] for row in self.db.execute("PRAGMA table_info(captures)")}
        if "resolution" not in columns:
            with self.db:
                self.db.execute("ALTER TABLE captures ADD COLUMN resolution TEXT")
        self.delay, self.timeout, self.last = delay, timeout, 0
        self.opener = urllib.request.build_opener(NoRedirect())

    def stopping(self):
        return (self.root / "STOP").is_file()

    def blob(self, data):
        digest = sha(data)
        destination = self.root / "objects" / digest[:2] / digest
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists():
            if sha(destination.read_bytes()) != digest:
                raise ValueError("Stored object has changed: " + digest)
        else:
            # A killed request must not leave a partial object at its final hash.
            with tempfile.NamedTemporaryFile(
                dir=destination.parent, delete=False
            ) as stream:
                temporary = Path(stream.name)
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, destination)
        return digest

    def request(self, url, purpose):
        # Never follow a captured redirect into today's live website.
        if urllib.parse.urlsplit(url).hostname != "web.archive.org":
            raise ValueError("Only Wayback HTTP endpoints may be fetched")
        remaining = self.delay - (time.monotonic() - self.last)
        if remaining > 0:
            time.sleep(remaining)
        receipt = {"utc": utc(), "purpose": purpose, "url": url}
        wire_url = urllib.parse.quote(url, safe=":/?&=;%+@!$'()*,-._~[]#")
        receipt["wire_url"] = wire_url
        request = urllib.request.Request(
            wire_url,
            headers={
                "User-Agent": "KPEX100-Reunion-preservation/1.0 (+https://github.com/ALEXGREENCH/KPEX100-Reunion)",
                "Accept-Encoding": "identity",
            },
        )
        try:
            try:
                response = self.opener.open(request, timeout=self.timeout)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                receipt.update(
                    status=response.code,
                    headers=list(response.headers.items()),
                    final_url=response.url,
                )
                data = response.read()
            receipt.update(bytes=len(data), object=self.blob(data))
        except (OSError, urllib.error.URLError, http.client.HTTPException) as error:
            receipt.update(status=0, error=str(error))
            data = None
        finally:
            self.last = time.monotonic()
        with self.db:
            row = self.db.execute(
                "INSERT INTO responses(receipt) VALUES (?)", (json.dumps(receipt),)
            )
        receipt["response_id"] = row.lastrowid
        return receipt, data

    def index(self, scope, page_size=1000, max_pages=0):
        if scope["matchType"] not in ("domain", "host", "prefix"):
            raise ValueError("Unsupported CDX scope")
        if not re.fullmatch(r"[a-z0-9-]+", scope["id"]):
            raise ValueError("Invalid scope ID")
        definition = json.dumps(scope, sort_keys=True)
        with self.db:
            self.db.execute(
                "INSERT OR IGNORE INTO scopes(id,definition) VALUES (?,?)",
                (scope["id"], definition),
            )
        state = self.db.execute(
            "SELECT * FROM scopes WHERE id=?", (scope["id"],)
        ).fetchone()
        if state["definition"] != definition:
            raise ValueError(
                "Scope changed; use a new scope ID or collection directory"
            )
        pages = 0
        while (
            not state["complete"]
            and (not max_pages or pages < max_pages)
            and not self.stopping()
        ):
            query = dict(
                url=scope["url"],
                matchType=scope["matchType"],
                output="json",
                fl=",".join(FIELDS),
                limit=page_size,
                showResumeKey="true",
                gzip="false",
            )
            if state["resume"]:
                query["resumeKey"] = state["resume"]
            url = CDX + "?" + urllib.parse.urlencode(query)
            cached = [
                json.loads(row[0])
                for row in self.db.execute("SELECT receipt FROM responses ORDER BY id")
            ]
            cached = [
                row for row in cached if row["url"] == url and row["status"] == 200
            ]
            usable = None
            for previous in reversed(cached):
                candidate = (
                    self.root / "objects" / previous["object"][:2] / previous["object"]
                ).read_bytes()
                if sha(candidate) != previous["object"]:
                    raise ValueError("Cached CDX object changed")
                try:
                    parse_cdx(candidate)
                except (ValueError, UnicodeError):
                    continue  # An HTTP-200 error must not poison future retries.
                usable = (previous, candidate)
                break
            if usable is None:
                receipt, body = self.request(url, "cdx:" + scope["id"])
            else:
                receipt, body = usable
            try:
                if receipt["status"] != 200:
                    raise ValueError("CDX HTTP status " + str(receipt["status"]))
                records, resume = parse_cdx(body)
                if resume and resume == state["resume"]:
                    raise ValueError("CDX repeated its resume key")
                if any(not in_scope(row["original"], scope) for row in records):
                    raise ValueError("CDX returned an out-of-scope original")
                # Page cursor and all rows commit together, so interruption loses no tasks.
                with self.db:
                    for record in records:
                        packed = json.dumps(record, sort_keys=True)
                        identity = sha(packed.encode())
                        self.db.execute(
                            "INSERT OR IGNORE INTO captures(id,record) VALUES (?,?)",
                            (identity, packed),
                        )
                        self.db.execute(
                            "INSERT OR IGNORE INTO membership VALUES (?,?)",
                            (scope["id"], identity),
                        )
                    self.db.execute(
                        "UPDATE scopes SET resume=?,pages=pages+1,complete=?,last_error=NULL WHERE id=?",
                        (resume, int(resume is None), scope["id"]),
                    )
                pages += 1
                print(
                    json.dumps(
                        {
                            "scope": scope["id"],
                            "records": len(records),
                            "complete": resume is None,
                        }
                    ),
                    flush=True,
                )
            except (ValueError, UnicodeError) as error:
                with self.db:
                    self.db.execute(
                        "UPDATE scopes SET last_error=? WHERE id=?",
                        (str(error), scope["id"]),
                    )
                print(
                    json.dumps({"scope": scope["id"], "error": str(error)}), flush=True
                )
                break
            state = self.db.execute(
                "SELECT * FROM scopes WHERE id=?", (scope["id"],)
            ).fetchone()

    def download(
        self,
        limit=0,
        retry=False,
        scopes=None,
        repair_urls=False,
        failed_only=False,
        archive_redirects=False,
    ):
        states = (
            ("retry", "mismatch", "unverified")
            if failed_only
            else (
                ("pending", "retry", "mismatch", "unverified")
                if retry
                else ("pending",)
            )
        )
        placeholders = ",".join("?" for _ in states)
        # Snapshot the queue: a failed item is attempted once per invocation.
        query = f"SELECT * FROM captures WHERE state IN ({placeholders})"
        parameters = list(states)
        if scopes:
            query += (
                " AND id IN (SELECT capture FROM membership WHERE scope IN ("
                + ",".join("?" for _ in scopes)
                + "))"
            )
            parameters.extend(scopes)
        rows = self.db.execute(query + " ORDER BY id", parameters).fetchall()
        # Rescue vulnerable downloads first; no records are removed from the queue.
        rows.sort(
            key=lambda row: (
                not bool(
                    re.search(
                        r"\.(exe|msi|zip|rar|alz|7z|sgs|sis|cab|pdf|hwp|chm|doc|xls|ppt|mc|ssl|o|c|h)(?:[?]|$)",
                        json.loads(row["record"])["original"],
                        re.I,
                    )
                ),
                row["id"],
            )
        )
        if limit:
            rows = rows[:limit]
        for task in rows:
            if self.stopping():
                break
            record = json.loads(task["record"])
            expected = record["digest"].removeprefix("sha1:").upper()
            known_digest = bool(re.fullmatch(r"[A-Z2-7]{32}", expected))
            candidates = [("literal", record["original"])]
            if repair_urls and known_digest:
                candidates.extend(korean_replay_variants(record["original"]))
            tried = []
            seen = set()
            matched = blocked = False
            for method, original in candidates:
                if self.stopping():
                    break
                url = REPLAY + record["timestamp"] + "id_/" + original
                for hop in range(3):
                    if self.stopping() or url in seen or len(tried) >= 6:
                        break
                    seen.add(url)
                    receipt, body = self.request(
                        url, "capture:" + task["id"] + ":" + method + ":hop" + str(hop)
                    )
                    actual = (
                        base64.b32encode(hashlib.sha1(body).digest())
                        .decode()
                        .rstrip("=")
                        if body is not None
                        else None
                    )
                    tried.append(
                        {
                            "method": method,
                            "archiveRedirectDepth": hop,
                            "url": url,
                            "responseId": receipt.get("response_id"),
                            "status": receipt["status"],
                            "payload": receipt.get("object"),
                            "sha1Base32": actual,
                        }
                    )
                    matched = known_digest and actual == expected
                    blocked = receipt["status"] in (
                        0,
                        401,
                        403,
                        429,
                        500,
                        502,
                        503,
                        504,
                    )
                    if matched or blocked:
                        break
                    next_url = (
                        archive_redirect_url(receipt, original)
                        if archive_redirects
                        and known_digest
                        and record["statuscode"].startswith("2")
                        else None
                    )
                    if not next_url:
                        break
                    url = next_url
                if matched or blocked:
                    break
            if not tried:
                break
            # A Wayback error page cannot become a recovered original just by returning HTTP 200.
            state = "verified" if known_digest and actual == expected else "mismatch"
            error = (
                None
                if state == "verified"
                else f"CDX digest {expected}; received {actual}; HTTP {receipt['status']}"
            )
            if (
                body is None
                or receipt["status"] in (429, 500, 502, 503, 504)
                or (self.stopping() and state != "verified")
            ):
                state = "retry"
            if not known_digest and body is not None and state != "retry":
                state = "unverified"
            with self.db:
                self.db.execute(
                    "UPDATE captures SET state=?,payload=?,attempts=attempts+?,last_error=?,resolution=? WHERE id=?",
                    (
                        state,
                        receipt.get("object"),
                        len(tried),
                        error,
                        json.dumps(
                            {
                                "originalUnchanged": True,
                                "attempts": tried,
                                "acceptedMethod": (
                                    tried[-1]["method"] if state == "verified" else None
                                ),
                                "acceptedViaArchiveRedirect": state == "verified"
                                and tried[-1]["archiveRedirectDepth"] > 0,
                            }
                        ),
                        task["id"],
                    ),
                )
            print(
                json.dumps(
                    {
                        "capture": task["id"],
                        "state": state,
                        "status": receipt["status"],
                        "method": tried[-1]["method"],
                    }
                ),
                flush=True,
            )
            # Do not hammer an archive that is throttling or temporarily unavailable.
            if receipt["status"] in (429, 503):
                break

    def export(self):
        scopes = [
            dict(row) for row in self.db.execute("SELECT * FROM scopes ORDER BY id")
        ]
        counts = dict(
            self.db.execute("SELECT state,count(*) FROM captures GROUP BY state")
        )
        report = {
            "schema": 1,
            "utc": utc(),
            "scopes": scopes,
            "captures": sum(counts.values()),
            "states": counts,
            "stopRequested": self.stopping(),
            "complete": bool(scopes)
            and all(row["complete"] for row in scopes)
            and counts.get("verified", 0) == sum(counts.values()),
            "limits": "Public CDX and raw id_ replay only. Optional Korean URL variants and same-resource nearest-capture replay redirects are explicitly recorded; verified means payload digest equals the requested CDX, not that redirected HTTP metadata belongs to its timestamp. Not a WARC export; missing/private/live resources are not reconstructed. Unverified responses remain separate, never called recovered originals.",
        }
        # Regenerable views; the immutable object store and SQLite receipts are authoritative.
        (self.root / "summary.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf8"
        )
        for name, query in (
            ("captures", "SELECT * FROM captures ORDER BY id"),
            ("responses", "SELECT * FROM responses ORDER BY id"),
            ("membership", "SELECT * FROM membership ORDER BY scope,capture"),
        ):
            with (self.root / (name + ".jsonl")).open(
                "w", encoding="utf8", newline="\n"
            ) as stream:
                for row in self.db.execute(query):
                    stream.write(json.dumps(dict(row), ensure_ascii=False) + "\n")
        print(json.dumps(report, ensure_ascii=False), flush=True)
        return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument(
        "--config", type=Path, default=Path(__file__).with_name("wayback-sites.json")
    )
    parser.add_argument("--index", action="store_true")
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--retry", action="store_true")
    parser.add_argument(
        "--repair-urls",
        action="store_true",
        help="Try bounded Korean transport variants; require an exact CDX digest",
    )
    parser.add_argument(
        "--failed-only",
        action="store_true",
        help="Download previously unsuccessful captures without the pending queue",
    )
    parser.add_argument(
        "--archive-redirects",
        action="store_true",
        help="Follow at most two raw replay redirects for the same original resource; require its CDX digest",
    )
    parser.add_argument(
        "--scope", action="append", help="Scope ID from configuration; repeatable"
    )
    parser.add_argument("--page-size", type=int, default=1000)
    parser.add_argument(
        "--max-pages", type=int, default=0, help="Per scope, 0 means no limit"
    )
    parser.add_argument(
        "--max-downloads", type=int, default=0, help="0 means entire pending queue"
    )
    parser.add_argument("--delay", type=float, default=1.5)
    parser.add_argument("--timeout", type=float, default=35)
    args = parser.parse_args()
    if (
        not 1 <= args.page_size <= 10000
        or min(args.max_pages, args.max_downloads, args.delay) < 0
        or args.timeout <= 0
    ):
        parser.error("Invalid limits")
    config = json.loads(args.config.read_text("utf8"))
    scopes = config["scopes"]
    if args.scope:
        if set(args.scope) - {item["id"] for item in scopes}:
            parser.error("Unknown scope ID")
        scopes = [item for item in scopes if item["id"] in args.scope]
    collector = Collector(args.directory, args.delay, args.timeout)
    try:
        if args.index:
            for scope in scopes:
                if collector.stopping():
                    break
                collector.index(scope, args.page_size, args.max_pages)
        if args.download:
            collector.download(
                args.max_downloads,
                args.retry,
                args.scope,
                args.repair_urls,
                args.failed_only,
                args.archive_redirects,
            )
    finally:
        collector.export()
        collector.db.close()


if __name__ == "__main__":
    main()
