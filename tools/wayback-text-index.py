"""Build/search a static Korean/English text index of a frozen Wayback ZIP.

Only verified HTTP200 HTML captures are indexed. Original bytes are checked
against both SHA256 object names and CDX SHA1 before decoding. Nothing in the
historical pages is rendered, requested or executed. This is a derivative
search aid, not a replacement for the raw archive or a relevance classifier.
"""

import argparse
import base64
import codecs
from collections import Counter
from contextlib import nullcontext
from datetime import datetime, timezone
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import unicodedata
import zipfile


class Text(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.hidden = []
        self.in_title = False
        self.title = []
        self.parts = []
        self.links = []

    def handle_starttag(self, tag, attrs):
        if self.hidden:
            if tag in ("script", "style", "template"):
                self.hidden.append(tag)
            return
        if tag in ("script", "style", "template"):
            self.hidden.append(tag)
        elif tag == "title":
            self.in_title = True
        elif tag == "a":
            value = dict(attrs).get("href")
            if value:
                self.links.append(value)
        if tag in ("p", "br", "tr", "td", "div", "li", "h1", "h2", "hr"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if self.hidden:
            if self.hidden[-1] == tag:
                self.hidden.pop()
            return
        if tag == "title":
            self.in_title = False
        elif tag in ("p", "tr", "div", "li", "h1", "h2"):
            self.parts.append("\n")

    def handle_data(self, value):
        if self.hidden:
            return
        (self.title if self.in_title else self.parts).append(value)


def decode_html(body):
    """Record declarations and loss; EUC-KR web labels include CP949 extensions."""
    match = re.search(rb'charset\s*=\s*["\x27]?([a-zA-Z0-9_.-]+)', body[:8192], re.I)
    declared = match[1].decode("ascii") if match else None
    encoding = declared
    if body.startswith(codecs.BOM_UTF8):
        encoding = "utf-8-sig"
    elif encoding and encoding.lower().replace("_", "-") in (
        "euc-kr",
        "ks-c-5601-1987",
        "ks-c-5601",
        "ksc5601",
        "windows-949",
    ):
        encoding = "cp949"
    if encoding:
        try:
            codecs.lookup(encoding)
        except LookupError:
            encoding = None
    if not encoding:
        try:
            body.decode("utf8")
            encoding = "utf8"
        except UnicodeDecodeError:
            encoding = "cp949"
    try:
        value = body.decode(encoding)
        lossy = False
    except UnicodeDecodeError:
        value = body.decode(encoding, errors="replace")
        lossy = True
    return value, {"declared": declared, "used": encoding, "lossy": lossy}


def extract(body):
    value, decoding = decode_html(body)
    parser = Text()
    parser.feed(value)
    parser.close()
    text = "\n".join(
        line
        for part in "".join(parser.parts).splitlines()
        if (line := re.sub(r"\s+", " ", part).strip())
    )
    return {
        "title": re.sub(r"\s+", " ", "".join(parser.title)).strip(),
        "text": text,
        "decoding": decoding,
        "hrefs": sorted(set(parser.links)),
    }


def build(path, base=None):
    documents = {}
    counts = Counter()
    with (
        zipfile.ZipFile(path) as archive,
        zipfile.ZipFile(base) if base is not None else nullcontext() as original,
    ):
        members = set(archive.namelist())
        required = (
            json.loads(archive.read("manifest.json")).get("base")
            if "manifest.json" in members
            else None
        )
        if required is not None:
            if base is None:
                raise ValueError(
                    "Delta archive requires --base " + required["filename"]
                )
            with base.open("rb") as source:
                identity = hashlib.file_digest(source, "sha256").hexdigest()
            if identity != required["sha256"]:
                raise ValueError("Base archive SHA256 mismatch")
        elif base is not None:
            raise ValueError("A standalone archive does not require --base")
        for line in (
            archive.read("collection/captures.jsonl").decode("utf8").splitlines()
        ):
            row = json.loads(line)
            record = json.loads(row["record"])
            counts["captures"] += 1
            if row["state"] != "verified" or record["statuscode"] != "200":
                counts["excludedUnverifiedOrNon200"] += 1
                continue
            if record["mimetype"].lower().split(";")[0] not in (
                "text/html",
                "application/xhtml+xml",
            ):
                counts["excludedNonHtmlMime"] += 1
                continue
            digest = row["payload"]
            if not isinstance(digest, str) or not re.fullmatch("[0-9a-f]{64}", digest):
                raise ValueError("Invalid object hash")
            name = f"collection/objects/{digest[:2]}/{digest}"
            objects = archive if original is None or name in members else original
            if objects.getinfo(name).file_size > 16 * 1024 * 1024:
                raise ValueError("HTML object exceeds 16MiB bound")
            body = objects.read(name)
            if hashlib.sha256(body).hexdigest() != digest:
                raise ValueError("Object SHA256 mismatch")
            cdx = base64.b32encode(hashlib.sha1(body).digest()).decode().rstrip("=")
            if cdx != record["digest"].removeprefix("sha1:").upper().rstrip("="):
                raise ValueError("Original CDX SHA1 mismatch")
            if digest not in documents:
                documents[digest] = {
                    "sha256": digest,
                    "bytes": len(body),
                    **extract(body),
                    "captures": [],
                }
            documents[digest]["captures"].append(
                {
                    "id": row["id"],
                    "original": record["original"],
                    "timestamp": record["timestamp"],
                    "cdxSha1": record["digest"],
                }
            )
            counts["indexedCaptures"] += 1
    counts["uniqueHtmlBodies"] = len(documents)
    counts["lossyDecodedBodies"] = sum(
        doc["decoding"]["lossy"] for doc in documents.values()
    )
    return {
        "schema": 1,
        "utc": datetime.now(timezone.utc).isoformat(),
        "sourceArchive": {
            "name": path.name,
            "bytes": path.stat().st_size,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        },
        **({"baseArchive": required} if required is not None else {}),
        "scope": "Verified HTTP200 HTML only, grouped by exact body hash. Multiple captures are retained. Includes corporate notices, copied news, forum posts, forms, spam and historic error bodies with HTTP200; a text match is not a recovered binary or an endorsement. Links are literal, not fetched. Raw archive remains authoritative; lossy decoding is explicit.",
        "counts": dict(counts),
        "documents": sorted(documents.values(), key=lambda doc: doc["sha256"]),
    }


def search(index, query):
    normalize = lambda text: unicodedata.normalize("NFC", text).casefold()
    needle = normalize(query)
    if not needle.strip():
        raise ValueError("Query must not be empty")
    for document in index["documents"]:
        haystack = document["title"] + "\n" + document["text"]
        normalized = normalize(haystack)
        if needle in normalized:
            # Normalization can change character counts: return matching whole lines.
            lines = [
                line for line in haystack.splitlines() if needle in normalize(line)
            ]
            yield {
                "sha256": document["sha256"],
                "decoding": document["decoding"],
                "captures": document["captures"],
                "matchingLines": lines,
            }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_subparsers(dest="action", required=True)
    create = actions.add_parser("build")
    create.add_argument("archive", type=Path)
    create.add_argument("--output", type=Path, required=True)
    create.add_argument("--base", type=Path)
    find = actions.add_parser("search")
    find.add_argument("index", type=Path)
    find.add_argument("query")
    args = parser.parse_args()
    if args.action == "build":
        if args.output.exists():
            parser.error("Output must be new")
        result = build(args.archive, args.base)
        with args.output.open("x", encoding="utf8") as stream:
            stream.write(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps(result["counts"]))
    else:
        index = json.loads(args.index.read_text(encoding="utf8"))
        for result in search(index, args.query):
            print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
