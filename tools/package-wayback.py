"""Freeze a resumable Wayback collection and verify every byte in a new ZIP.

SQLite backup takes a consistent snapshot even while the collector is active.
Only immutable objects referenced by that snapshot are included. No website
HTML, JavaScript, installers or other historical programs are executed.
"""

import argparse
from contextlib import ExitStack
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import zipfile
import zlib

ROOT = Path(__file__).resolve().parents[1]
PRIVATE_HEADERS = {"authorization", "cookie", "proxy-authorization", "set-cookie"}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def package(collection, output, base=None):
    if output.exists():
        raise ValueError("Archive must be new")
    spec = importlib.util.spec_from_file_location(
        "wayback_harvest", ROOT / "tools/wayback-harvest.py"
    )
    harvest = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(harvest)
    with (
        tempfile.TemporaryDirectory(prefix="reunion-wayback-") as temporary,
        ExitStack() as resources,
    ):
        base_zip = None
        base_info = None
        base_names = set()
        if base is not None:
            base_zip = resources.enter_context(zipfile.ZipFile(base))
            base_manifest = json.loads(base_zip.read("manifest.json"))
            if (
                base_manifest.get("schema") != 1
                or base_manifest.get("base") is not None
            ):
                raise ValueError("Base must be a standalone Wayback snapshot")
            base_zip.getinfo("collection/queue.sqlite3")
            base_names = set(base_zip.namelist())
            with base.open("rb") as source:
                base_hash = hashlib.file_digest(source, "sha256").hexdigest()
            base_info = {"filename": base.name, "sha256": base_hash}
        snapshot = Path(temporary)
        source = sqlite3.connect(
            collection.resolve().as_uri() + "/queue.sqlite3?mode=ro", uri=True
        )
        destination = sqlite3.connect(snapshot / "queue.sqlite3")
        try:
            source.backup(destination)
        finally:
            destination.close()
            source.close()
        collector = harvest.Collector(snapshot)
        try:
            redacted_headers = 0
            with collector.db:
                receipts = collector.db.execute("SELECT id,receipt FROM responses")
                for response_id, raw in receipts:
                    receipt = json.loads(raw)
                    headers = receipt.get("headers", [])
                    changed = False
                    for header in headers:
                        name = header[0].lower().removeprefix("x-archive-orig-")
                        if name in PRIVATE_HEADERS:
                            header[1] = "[redacted]"
                            redacted_headers += 1
                            changed = True
                    if changed:
                        collector.db.execute(
                            "UPDATE responses SET receipt=? WHERE id=?",
                            (json.dumps(receipt), response_id),
                        )
            report = collector.export()
            objects = {
                json.loads(row[0])["object"]
                for row in collector.db.execute("SELECT receipt FROM responses")
                if "object" in json.loads(row[0])
            }
            objects.update(
                row[0]
                for row in collector.db.execute(
                    "SELECT payload FROM captures WHERE payload IS NOT NULL"
                )
            )
        finally:
            collector.db.close()
        entries = {
            "collection/" + item.name: item.read_bytes()
            for item in snapshot.iterdir()
            if item.is_file()
        }
        reused = 0
        for digest in sorted(objects):
            if len(digest) != 64 or any(
                char not in "0123456789abcdef" for char in digest
            ):
                raise ValueError("Invalid object identity")
            name = "objects/" + digest[:2] + "/" + digest
            data = (collection / name).read_bytes()
            if sha(data) != digest:
                raise ValueError("Changed object: " + digest)
            member = "collection/" + name
            if member in base_names:
                if base_zip.read(member) != data:
                    raise ValueError("Base object mismatch: " + digest)
                reused += 1
            else:
                entries[member] = data
        for name in ("tools/wayback-harvest.py", "tools/wayback-sites.json", "LICENSE"):
            entries[name] = (ROOT / name).read_bytes()
        readme = (
            "Resumable public Wayback collection, PARTIAL snapshot.\n"
            "collection/summary.json states which CDX scopes reached the end and which captures were verified. An indexed capture is NOT a recovered payload.\n"
            "Original response bytes are in collection/objects/<SHA256-prefix>/<SHA256>. responses.jsonl records URL, UTC, status and headers. captures.jsonl records original CDX rows, digest checks and pending/mismatch/error states. membership.jsonl preserves the scope relation.\n"
            "Cookie and authorization header values are redacted in the public snapshot. Response bodies are unchanged.\n"
            "queue.sqlite3 is a consistent SQLite backup and can resume with: python tools/wayback-harvest.py collection --index --download --retry --repair-urls --archive-redirects\n"
            "No domain/date/status/MIME collapse was requested. Duplicate identical CDX rows share a queue task; their original raw CDX response remains intact. UTF-8 URL quoting is recorded separately from the literal CDX original. Optional Korean transport variants and at most two same-resource raw replay redirects are explicitly recorded in resolution; they require the requested CDX payload digest. Actual redirected timestamps/headers are not metadata for the original requested timestamp. Redirects never lead into today's live websites.\n"
            "This is NOT a complete WARC export or proof that missing/private files were archived. Error pages and unknown digests remain unverified. No historical code is executed. Original third-party content retains its existing rights; the MIT license covers Reunion tools only.\n"
            "manifest.json covers all other members, excluding itself.\n"
        )
        if base_info is not None:
            entries["tools/package-wayback.py"] = Path(__file__).read_bytes()
            readme += (
                "\nThis delta requires the standalone snapshot "
                + base_info["filename"]
                + "\nSHA-256 "
                + base_info["sha256"]
                + "\nVerify that SHA-256, extract the base to an empty directory, "
                "then extract this delta into the same directory. The delta supplies "
                "the current queue, manifests and every referenced object missing from "
                "the base. The manifest below covers only this ZIP's members.\n"
            )
        entries["README.txt"] = readme.encode()
        manifest = [
            {
                "path": name,
                "bytes": len(data),
                "sha256": sha(data),
                "crc32": f"{zlib.crc32(data):08x}",
            }
            for name, data in sorted(entries.items())
        ]
        manifest_record = {"schema": 1, "selfExcluded": True, "files": manifest}
        if base_info is not None:
            manifest_record["base"] = base_info
        entries["manifest.json"] = (
            json.dumps(manifest_record, indent=2) + "\n"
        ).encode()
        with zipfile.ZipFile(
            output, "x", zipfile.ZIP_DEFLATED, compresslevel=9
        ) as archive:
            for name, data in sorted(entries.items()):
                info = zipfile.ZipInfo(name, (2026, 11, 6, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                archive.writestr(info, data)
        with zipfile.ZipFile(output) as archive:
            if archive.testzip() is not None:
                raise ValueError("ZIP CRC mismatch")
            for member in manifest:
                if sha(archive.read(member["path"])) != member["sha256"]:
                    raise ValueError("ZIP member identity mismatch")
        result = {
            "archiveBytes": output.stat().st_size,
            "archiveSha256": sha(output.read_bytes()),
            "members": len(entries),
            "objects": len(objects),
            "redactedHeaders": redacted_headers,
            "crcPassed": True,
            "manifestMembersVerified": len(manifest),
            "collection": report,
        }
        if base_info is not None:
            result["base"] = base_info
            result["objectsReusedFromBase"] = reused
            result["objectsIncluded"] = len(objects) - reused
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("collection", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--base", type=Path, help="omit objects in this standalone ZIP")
    args = parser.parse_args()
    if args.output.exists() or args.report.exists():
        parser.error("Both outputs must be new")
    result = package(args.collection, args.output, args.base)
    with args.report.open("x", encoding="utf8") as stream:
        stream.write(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(
        json.dumps({key: value for key, value in result.items() if key != "collection"})
    )


if __name__ == "__main__":
    main()
