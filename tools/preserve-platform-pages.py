"""Preserve an explicit list of public platform sources, including Korean HTML.

Downloads are immutable SHA-256 objects. Receipts include HTTP failures; a 200
response alone is not a verified document. No linked code or page JS is run.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import time
import urllib.error
import urllib.parse
import urllib.request


def text_module():
    spec = importlib.util.spec_from_file_location(
        "wayback_text", Path(__file__).with_name("wayback-text-index.py")
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def preserve(sources, root, delay=1.5, timeout=35, refresh=False):
    root.mkdir(parents=True, exist_ok=True)
    receipt_path = root / "receipts.jsonl"
    receipts = (
        [json.loads(line) for line in receipt_path.read_text("utf8").splitlines()]
        if receipt_path.exists()
        else []
    )
    cached = {
        r["url"]: r
        for r in receipts
        if r.get("status") == 200 and r.get("bodyComplete", True)
    }
    decoder = text_module()
    results = []
    for source in sources:
        url = source["url"]
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username:
            raise ValueError("Expected a public HTTPS URL")
        receipt = cached.get(url) if not refresh else None
        if receipt:
            body = (root / receipt["path"]).read_bytes()
            if hashlib.sha256(body).hexdigest() != receipt["sha256"]:
                raise ValueError("Changed original: " + url)
        else:
            time.sleep(delay)
            receipt = {
                "url": url,
                "retrievedUtc": datetime.now(timezone.utc).isoformat(),
            }
            body = None
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
                    body = response.read(32 * 1024 * 1024 + 1)
                    if len(body) > 32 * 1024 * 1024:
                        raise ValueError("Response exceeds 32 MiB; not preserved")
                    receipt.update(
                        status=response.status,
                        finalUrl=response.url,
                        headers=list(response.headers.items()),
                    )
                    length = response.headers.get("Content-Length")
                    if length is not None and not response.headers.get(
                        "Transfer-Encoding"
                    ):
                        receipt["bodyComplete"] = len(body) == int(length)
                digest = hashlib.sha256(body).hexdigest()
                name = "originals/" + digest
                destination = root / name
                destination.parent.mkdir(exist_ok=True)
                if not destination.exists():
                    destination.write_bytes(body)
                receipt.update(path=name, bytes=len(body), sha256=digest)
            except (OSError, ValueError) as error:
                receipt.update(status=0, error=str(error))
                body = None
            with receipt_path.open("a", encoding="utf8", newline="\n") as stream:
                stream.write(json.dumps(receipt, ensure_ascii=False) + "\n")
        result = {**source, "receipt": receipt, "verified": False}
        if body is not None and receipt["status"] == 200:
            extracted = decoder.extract(body)
            text = extracted["text"]
            loss = extracted["decoding"]["lossy"]
            requirements = source.get("requiredText", [])
            result.update(
                decoding=extracted["decoding"],
                title=extracted["title"],
                verified=bool(requirements)
                and receipt.get("bodyComplete", True)
                and not loss
                and all(token in text for token in requirements),
                links=extracted["hrefs"],
            )
            target = root / "derived" / (receipt["sha256"] + ".txt")
            target.parent.mkdir(exist_ok=True)
            target.write_text(text, encoding="utf8")
            result["textPath"] = target.relative_to(root).as_posix()
        results.append(result)
        print(json.dumps({"url": url, "verified": result["verified"]}), flush=True)
    (root / "sources.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf8"
    )
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sources", type=Path, help="JSON list: url, kind, requiredText")
    parser.add_argument("directory", type=Path)
    parser.add_argument("--delay", type=float, default=1.5)
    parser.add_argument("--timeout", type=float, default=35)
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    if args.delay < 0 or args.timeout <= 0:
        parser.error("delay must be nonnegative and timeout positive")
    preserve(
        json.loads(args.sources.read_text("utf8")),
        args.directory,
        args.delay,
        args.timeout,
        args.refresh,
    )


if __name__ == "__main__":
    main()
