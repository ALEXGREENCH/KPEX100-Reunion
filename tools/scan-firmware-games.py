"""Find structurally validated SGS games in binary images without executing them.

Extraction retains the original stored SGS, including supported compressed
v4 bodies. Unknown packing, native ARM games and trailers are outside its scope.
Python 3.11+, standard library only.
"""

import argparse
import hashlib
import json
from pathlib import Path
import struct
import sys
import zlib

ROOT = Path(__file__).resolve().parents[1]
VERSIONS = (1, 2, 4, 36)
MAX_INPUT_BYTES = 64 * 1024 * 1024
XOR_TABLE = bytes.maketrans(bytes(range(256)), bytes(n ^ 165 for n in range(256)))


def digest(data):
    return hashlib.sha256(data).hexdigest()


def valid_type2_stream(data, offset, media, stored, expanded):
    # The observed SKT WIPI layout leaves 18 media bytes before zlib.
    start = media + 18
    if (
        start + 6 >= stored
        or stored >= expanded
        or expanded > 0xC00000
        or data[offset + stored - 1] != 0xFF
    ):
        return False
    size = expanded - start
    inflater = zlib.decompressobj()
    try:
        payload = inflater.decompress(
            data[offset + start : offset + stored - 1], size + 1
        )
    except zlib.error:
        return False
    return inflater.eof and not inflater.unused_data and len(payload) == size


def parse_candidate(decoded, offset):
    """Return a nontrivial, bounded game descriptor, or None for a coincidence."""
    remaining = len(decoded) - offset
    if remaining < 52:
        return None
    version = decoded[offset]
    if version not in VERSIONS:
        return None
    header = 128 if version >= 4 else (52 if version == 1 else 100)
    if remaining < header:
        return None
    expanded = None
    if version >= 4:
        a, b, c, d = struct.unpack_from("<4I", decoded, offset + 72)
        size = struct.unpack_from("<I", decoded, offset + 120)[0]
        if not (header <= a <= b <= c <= d <= size <= remaining):
            return None
        if (b - a) % 8 or (d - c) % 12:
            return None
        entries = struct.unpack_from("<11I", decoded, offset + 28)
        if not entries[0] or any(e and (not header <= e < a or e % 2) for e in entries):
            return None
        variables, resources = (b - a) // 8, (d - c) // 12
        if not variables or not resources or a - header < 16:
            return None
        initialized = sum(
            struct.unpack_from("<H", decoded, offset + p + 2)[0] for p in range(a, b, 8)
        )
        if initialized * 4 != c - b:
            return None
        resource_bytes = sum(
            struct.unpack_from("<I", decoded, offset + p + 4)[0]
            for p in range(c, d, 12)
        )
        resource_end = d + resource_bytes
        if resource_end != size:
            if version != 4 or decoded[offset + 26] != 2:
                return None
            expanded = struct.unpack_from("<I", decoded, offset + 108)[0]
            if expanded != resource_end or not valid_type2_stream(
                decoded, offset, d, size, expanded
            ):
                return None
    else:
        a, b, c, d = struct.unpack_from("<4H", decoded, offset + 44)
        if not (header <= a <= b <= c <= d <= remaining):
            return None
        if (b - a) % 4 or (d - c) % 4:
            return None
        entries = struct.unpack_from("<8H", decoded, offset + 28)
        if not entries[0] or any(e and not header <= e < a for e in entries):
            return None
        variables, resources = (b - a) // 4, (d - c) // 4
        if not variables or not resources or a - header < 16:
            return None
        initialized = 0
        for p in range(a, b, 4):
            kind, count, init = decoded[offset + p : offset + p + 3]
            if kind > 1 or not count:
                return None
            if not kind or init:
                initialized += count * 2
        if initialized != c - b:
            return None
        size = d + sum(
            struct.unpack_from("<H", decoded, offset + p + 2)[0] for p in range(c, d, 4)
        )
        if size > remaining:
            return None
    title_bytes = decoded[offset + 10 : offset + 26].split(b"\0", 1)[0]
    candidate = {
        "version": version,
        "title": title_bytes.decode("euc-kr", errors="replace"),
        "title_bytes_hex": title_bytes.hex(),
        "declared_body_bytes": size,
        "sections": dict(zip(("a", "b", "c", "d"), (a, b, c, d))),
        "entries": list(entries),
        "variables": variables,
        "resources": resources,
        "compression_type": decoded[offset + 26],
    }
    if expanded is not None:
        candidate["expanded_body_bytes"] = expanded
    return candidate


def scan_bytes(raw):
    """Search every possible version-byte offset, including unaligned positions."""
    if len(raw) > MAX_INPUT_BYTES:
        raise ValueError("Input exceeds the 64 MiB scan bound")
    hits, candidates = [], 0
    for mask in (0, 165):
        decoded = raw.translate(XOR_TABLE) if mask else raw
        for version in VERSIONS:
            needle = bytes([version])
            offset = decoded.find(needle)
            while offset >= 0:
                candidates += 1
                candidate = parse_candidate(decoded, offset)
                if candidate:
                    wrapper = (
                        32
                        if offset >= 32 and raw[offset - 32 : offset - 28] == b" \0\0\0"
                        else 0
                    )
                    start = offset - wrapper
                    end = offset + candidate["declared_body_bytes"]
                    candidate.update(
                        source_offset=start,
                        body_offset=offset,
                        wrapper_bytes=wrapper,
                        xor_mask=mask,
                        extracted_bytes=end - start,
                        raw_sha256=digest(raw[start:end]),
                        decoded_body_sha256=digest(decoded[offset:end]),
                    )
                    hits.append(candidate)
                offset = decoded.find(needle, offset + 1)
    return {
        "bytes": len(raw),
        "sha256": digest(raw),
        "candidate_offsets_tested": candidates,
        "containers": sorted(hits, key=lambda hit: hit["body_offset"]),
    }


def read_input(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"Input is not a regular file: {path}")
    if path.stat().st_size > MAX_INPUT_BYTES:
        raise ValueError(f"Input exceeds 64 MiB: {path.name}")
    return path.read_bytes()


def extract_hits(raw, hits, directory):
    """Write one original representation per decoded body; never replace files."""
    unique = {}
    for hit in hits:
        unique.setdefault(hit["decoded_body_sha256"], hit)
    targets = [
        (directory / f"sgs-v{hit['version']}-{identity[:16]}.sgs", hit)
        for identity, hit in unique.items()
    ]
    if any(path.exists() or path.is_symlink() for path, _ in targets):
        raise ValueError("Refusing to replace an existing extraction")
    directory.mkdir(parents=True, exist_ok=True)
    for path, hit in targets:
        start = hit["source_offset"]
        with path.open("xb") as stream:
            stream.write(raw[start : start + hit["extracted_bytes"]])
    return [path.name for path, _ in targets]


def check_controls(catalog):
    records = []
    for game in catalog["games"]:
        raw = read_input(ROOT / "web" / game["url"])
        if digest(raw) != game["sha256"]:
            raise ValueError("Control checksum mismatch: " + game["id"])
        report = scan_bytes(raw)
        expected = 32 if raw[:4] == b" \0\0\0" else 0
        matches = [
            hit for hit in report["containers"] if hit["body_offset"] == expected
        ]
        passed = len(report["containers"]) == 1 and len(matches) == 1
        records.append(
            {
                "id": game["id"],
                "sha256": game["sha256"],
                "passed": passed,
                "containers_found": len(report["containers"]),
                "body_offset": expected,
                "decoded_body_sha256": (
                    matches[0]["decoded_body_sha256"] if matches else None
                ),
                "bytes_after_declared_end": (
                    len(raw) - expected - matches[0]["declared_body_bytes"]
                    if matches
                    else None
                ),
            }
        )
    if not all(record["passed"] for record in records):
        raise ValueError("Scanner positive controls failed")
    return {"files": len(records), "passed": len(records), "records": records}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "inputs",
        nargs="*",
        type=Path,
        help="Images to scan; defaults to the nine catalogue ROMs",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="New JSON report file; otherwise write JSON to stdout",
    )
    parser.add_argument(
        "--extract",
        type=Path,
        help="New or empty extraction directory; existing files are never replaced",
    )
    parser.add_argument(
        "--check-controls",
        action="store_true",
        help="Also detect the unchanged SGS collection as positive controls",
    )
    args = parser.parse_args()
    if args.output and args.output.exists():
        parser.error("Report already exists; select a new --output path")
    if args.extract and (
        args.extract.is_symlink()
        or (
            args.extract.exists()
            and (not args.extract.is_dir() or any(args.extract.iterdir()))
        )
    ):
        parser.error("Extraction directory must be new or empty")
    catalog = json.loads((ROOT / "web/data/catalog.json").read_text(encoding="utf-8"))
    inputs = args.inputs or [
        ROOT / "web" / item["url"] for item in catalog["firmwares"]
    ]
    identities = {entry["sha256"]: entry["id"] for entry in catalog["firmwares"]}
    scans, extracted, seen = [], [], set()
    for path in inputs:
        raw = read_input(path)
        scan = {"file": path.name, **scan_bytes(raw)}
        scan["catalogue_firmware"] = identities.get(scan["sha256"])
        if args.extract:
            distinct = [
                hit
                for hit in scan["containers"]
                if hit["decoded_body_sha256"] not in seen
            ]
            extracted.extend(extract_hits(raw, distinct, args.extract))
            seen.update(hit["decoded_body_sha256"] for hit in distinct)
        scans.append(scan)
    report = {
        "schema": 1,
        "method": "Every byte offset; SGS v1/v2/v4/v36; plain and XOR-A5; bounded header, entry, variable and complete resource validation.",
        "limits": [
            "Candidate requires nonzero START, at least one variable and resource, and at least 16 bytecode bytes; this is a conservative game scan.",
            "Unknown proprietary packing and native ARM games are not ruled out.",
            "Extraction preserves the original stored SGS, including an observed v4 type 2 zlib layout and a recognized 32-byte wrapper; unknown appended data is not guessed.",
            "A structurally valid extraction is not proof that the game is playable.",
        ],
        "scans": scans,
        "summary": {
            "images": len(scans),
            "bytes": sum(scan["bytes"] for scan in scans),
            "candidate_offsets_tested": sum(
                scan["candidate_offsets_tested"] for scan in scans
            ),
            "container_occurrences": sum(len(scan["containers"]) for scan in scans),
            "unique_decoded_bodies": len(
                {
                    hit["decoded_body_sha256"]
                    for scan in scans
                    for hit in scan["containers"]
                }
            ),
        },
        "extracted_files": extracted,
    }
    if args.check_controls:
        report["positive_controls"] = check_controls(catalog)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("x", encoding="utf-8", newline="\n") as stream:
            json.dump(report, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
        print(json.dumps(report["summary"]))
    else:
        print(json.dumps(report, ensure_ascii=True, indent=2))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
