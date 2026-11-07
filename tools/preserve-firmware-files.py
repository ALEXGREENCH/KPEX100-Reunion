"""Download an explicit firmware URL list as immutable, hashed original bodies.

No device flashing, historical executables or companion DLLs are run. HTTP200
and a complete body mean an acquired response, not a verified firmware model.
Archive structure, model identity, engines and games require separate checks.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import http.client
import json
from pathlib import Path
import shutil
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request


def file_sha(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while block := stream.read(1024 * 1024):
            digest.update(block)
    return digest.hexdigest()


def preserve(sources, root, delay=1.5, timeout=45, max_bytes=512 * 1024 * 1024):
    root.mkdir(parents=True, exist_ok=True)
    receipt_path = root / "receipts.jsonl"
    old = (
        [json.loads(line) for line in receipt_path.read_text("utf8").splitlines()]
        if receipt_path.exists()
        else []
    )
    cached = {
        r["url"]: r for r in old if r.get("status") == 200 and r.get("complete") is True
    }
    results = []
    for source in sources:
        url = source["url"]
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username:
            raise ValueError("Expected a public HTTPS URL")
        receipt = cached.get(url)
        if receipt:
            path = root / receipt["path"]
            if (
                path.stat().st_size != receipt["bytes"]
                or file_sha(path) != receipt["sha256"]
            ):
                raise ValueError("Changed cached response: " + url)
        else:
            time.sleep(delay)
            receipt = {
                "url": url,
                "retrievedUtc": datetime.now(timezone.utc).isoformat(),
                "complete": False,
            }
            with tempfile.TemporaryDirectory(prefix="firmware-body-", dir=root) as tmp:
                body = Path(tmp) / "body"
                try:
                    request = urllib.request.Request(
                        url,
                        headers={
                            "User-Agent": "KPEX100-Reunion-preservation/1.0",
                            "Accept-Encoding": "identity",
                        },
                    )
                    try:
                        response = urllib.request.urlopen(request, timeout=timeout)
                    except urllib.error.HTTPError as error:
                        response = error
                    with response:
                        receipt.update(
                            status=response.status,
                            finalUrl=response.url,
                            headers=list(response.headers.items()),
                        )
                        length = response.headers.get("Content-Length")
                        expected = (
                            int(length)
                            if length is not None
                            and not response.headers.get("Transfer-Encoding")
                            else None
                        )
                        if expected is not None and not 0 <= expected <= max_bytes:
                            raise ValueError("Declared body exceeds download bound")
                        count = 0
                        with body.open("xb") as stream:
                            while True:
                                interrupted = None
                                try:
                                    block = response.read(
                                        min(1024 * 1024, max_bytes - count + 1)
                                    )
                                except http.client.IncompleteRead as error:
                                    block = error.partial
                                    interrupted = error
                                if len(block) > max_bytes - count:
                                    stream.write(block[: max_bytes - count])
                                    raise ValueError("Body exceeds download bound")
                                stream.write(block)
                                count += len(block)
                                if interrupted is not None:
                                    raise interrupted
                                if not block:
                                    break
                        receipt["complete"] = expected is None or count == expected
                        if not receipt["complete"]:
                            receipt["error"] = "Short HTTP body"
                except (OSError, ValueError, http.client.HTTPException) as error:
                    receipt.setdefault("status", 0)
                    receipt["error"] = str(error)
                if body.exists():
                    digest = file_sha(body)
                    destination = root / "objects" / digest
                    destination.parent.mkdir(exist_ok=True)
                    if not destination.exists():
                        with (
                            destination.open("xb") as output,
                            body.open("rb") as stream,
                        ):
                            shutil.copyfileobj(stream, output, 1024 * 1024)
                    if file_sha(destination) != digest:
                        raise ValueError("Changed immutable response object")
                    receipt.update(
                        path=destination.relative_to(root).as_posix(),
                        bytes=body.stat().st_size,
                        sha256=digest,
                    )
            with receipt_path.open("a", encoding="utf8", newline="\n") as stream:
                stream.write(json.dumps(receipt, ensure_ascii=False) + "\n")
        results.append({**source, "receipt": receipt})
        print(
            json.dumps(
                {
                    "url": url,
                    "status": receipt["status"],
                    "complete": receipt["complete"],
                    "bytes": receipt.get("bytes"),
                }
            ),
            flush=True,
        )
        (root / "sources.json").write_text(
            json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf8"
        )
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sources", type=Path, help="JSON list with url and provenance")
    parser.add_argument("directory", type=Path)
    parser.add_argument("--delay", type=float, default=1.5)
    parser.add_argument("--timeout", type=float, default=45)
    parser.add_argument("--max-bytes", type=int, default=512 * 1024 * 1024)
    args = parser.parse_args()
    if args.delay < 0 or args.timeout <= 0 or args.max_bytes < 1:
        parser.error("Invalid download bounds")
    preserve(
        json.loads(args.sources.read_text("utf8")),
        args.directory,
        args.delay,
        args.timeout,
        args.max_bytes,
    )


if __name__ == "__main__":
    main()
