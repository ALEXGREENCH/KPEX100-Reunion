"""Inventory Anycall Land MBIN files without executing or modifying them."""

import argparse
from binascii import crc_hqx
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
import zipfile
import zlib


PAYLOAD_OFFSET = 0x109
MAX_MEMBER_BYTES = 16 * 1024 * 1024
MAX_TOTAL_BYTES = 128 * 1024 * 1024
HEADERS = {0x90: b"ADS\0", 0x48: b"PSW\0"}
DATE_STRING = re.compile(
    rb"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [ 0-3][0-9] 20[0-9]{2}"
)
SMAF_MAGIC = re.compile(rb"MMMD")


def read_members(source):
    if source.suffix.lower() == ".mbin":
        if source.stat().st_size > MAX_MEMBER_BYTES:
            raise ValueError("MBIN exceeds the file size limit")
        yield source.name, source.read_bytes()
        return
    if source.stat().st_size > MAX_TOTAL_BYTES:
        raise ValueError("ZIP exceeds the archive size limit")
    with zipfile.ZipFile(source, metadata_encoding="cp949") as archive:
        entries = [
            item
            for item in archive.infolist()
            if not item.is_dir() and item.filename.lower().endswith(".mbin")
        ]
        if any(item.file_size > MAX_MEMBER_BYTES for item in entries):
            raise ValueError("MBIN exceeds the member size limit")
        if sum(item.file_size for item in entries) > MAX_TOTAL_BYTES:
            raise ValueError("Expanded MBIN files exceed the size limit")
        for item in entries:
            yield item.filename, archive.read(item)


def inspect_member(name, data):
    if len(data) <= PAYLOAD_OFFSET + 1:
        raise ValueError(f"Truncated MBIN: {name}")
    key = data[7]
    signature = bytes(value ^ key for value in data[4:8])
    if signature != HEADERS.get(key):
        raise ValueError(f"Unrecognized MBIN header: {name}")

    header = bytes(value ^ key for value in data[:PAYLOAD_OFFSET])
    body = data[PAYLOAD_OFFSET:]
    entry = int.from_bytes(body[:2], "little")
    return {
        "path": name,
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "crc32": f"{zlib.crc32(data):08x}",
        "headerSignature": signature[:3].decode("ascii"),
        "headerXor": key,
        "headerLabel": header[12:28].rstrip(b"\0").decode("ascii", errors="replace"),
        "headerWordAt0x104": int.from_bytes(header[0x104:0x108], "little"),
        "bodySha256": hashlib.sha256(body).hexdigest(),
        "bodyPrefix": body[:12].hex(),
        "thumbPushLr": entry & 0xFF00 == 0xB500,
        "thumbRuntimeMessage": b"This code can only run on a Thumb compatible processor"
        in body,
        "dateStrings": sorted(
            {match.decode("ascii") for match in DATE_STRING.findall(body)}
        ),
    }


def find_smaf(data):
    clips = []
    for match in SMAF_MAGIC.finditer(data, PAYLOAD_OFFSET):
        offset = match.start()
        if offset + 18 > len(data) or data[offset + 8 : offset + 12] != b"CNTI":
            continue
        length = int.from_bytes(data[offset + 4 : offset + 8], "big") + 8
        end = offset + length
        if length < 18 or end > len(data):
            continue
        crc = int.from_bytes(data[end - 2 : end], "big")
        if crc != crc_hqx(memoryview(data)[offset : end - 2], 0xFFFF) ^ 0xFFFF:
            continue
        chunks = []
        cursor = offset + 8
        while cursor + 8 <= end - 2:
            tag = data[cursor : cursor + 4]
            chunks.append(tag.decode("ascii", errors="backslashreplace"))
            cursor += 8 + int.from_bytes(data[cursor + 4 : cursor + 8], "big")
        if cursor == end - 2:
            clips.append(
                {
                    "mbinOffset": offset,
                    "bytes": length,
                    "sha256": hashlib.sha256(memoryview(data)[offset:end]).hexdigest(),
                    "smafCRC16": f"{crc:04x}",
                    "chunks": chunks,
                }
            )
    return clips


def inspect(source, *, smaf=False):
    members = []
    by_body = defaultdict(list)
    for name, data in read_members(source):
        row = inspect_member(name, data)
        if smaf:
            row["smafClips"] = find_smaf(data)
        members.append(row)
        by_body[row["bodySha256"]].append((name, data[:PAYLOAD_OFFSET]))
    if not members:
        raise ValueError("No MBIN files found")

    aliases = []
    for digest, copies in by_body.items():
        first_name, first_header = copies[0]
        for name, header in copies[1:]:
            differences = [
                offset
                for offset, (left, right) in enumerate(
                    zip(first_header, header, strict=True)
                )
                if left != right
            ]
            aliases.append(
                {
                    "first": first_name,
                    "second": name,
                    "bodySha256": digest,
                    "differentHeaderBytes": len(differences),
                    "lastDifferentOffset": differences[-1] if differences else None,
                }
            )

    return {
        "schema": 1,
        "bodyOffset": PAYLOAD_OFFSET,
        "members": members,
        "memberCount": len(members),
        "uniqueFiles": len({row["sha256"] for row in members}),
        "uniqueBodies": len(by_body),
        "headerTypes": dict(Counter(row["headerSignature"] for row in members)),
        "aliases": aliases,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "source", type=Path, help="An MBIN file or a ZIP containing MBINs"
    )
    parser.add_argument(
        "--output", type=Path, required=True, help="Path for the new JSON report"
    )
    parser.add_argument(
        "--smaf", action="store_true", help="Inventory bounded, CRC-checked SMAF clips"
    )
    args = parser.parse_args()
    report = inspect(args.source, smaf=args.smaf)
    with args.output.open("x", encoding="utf-8", newline="\n") as output:
        json.dump(report, output, ensure_ascii=False, indent=2)
        output.write("\n")


if __name__ == "__main__":
    main()
