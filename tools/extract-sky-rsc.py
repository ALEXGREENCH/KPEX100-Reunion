"""Inspect/extract bounded original resources from observed SKY RSC tables.

Python 3.11+, standard library only. Supports the observed leading-table and
trailing-table layouts. Offsets and partition bounds are caller-supplied.
This does not decode BINX or proprietary formats within individual resources.
"""

import argparse
import hashlib
import json
from pathlib import Path
import struct
import sys

MAX_INPUT = 512 * 1024 * 1024
MAX_RECORDS = 100_000
TYPES = {0, 2, 4, 5, 6, 7, 8}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def parse_table(data, offset=0, region_bytes=None):
    """Validate all records before exposing any extraction ranges."""
    available = len(data) - offset if region_bytes is None else region_bytes
    if offset < 0 or available < 16 or offset + available > len(data):
        raise ValueError("Table region is outside input bounds")
    used, unknown_word, reserved, count = struct.unpack_from("<4I", data, offset)
    if reserved != 0:
        raise ValueError("Unsupported nonzero header reserved word")
    if not 3 <= count <= MAX_RECORDS:
        raise ValueError("Unsupported record count")
    table_bytes = 16 + count * 16
    if not table_bytes <= used <= available:
        raise ValueError("Table or declared resource area exceeds region")
    rows = []
    for index in range(count):
        record_offset = offset + 16 + index * 16
        rid, kind, relative, size = struct.unpack_from("<4I", data, record_offset)
        if kind not in TYPES:
            raise ValueError(f"Record {index}: unsupported type {kind}")
        if relative % 4 or not table_bytes <= relative <= used:
            raise ValueError(f"Record {index}: invalid payload offset")
        if size > used - relative:
            raise ValueError(f"Record {index}: payload exceeds declared area")
        if kind == 0:
            if rid != 0 or size != 0 or relative != table_bytes:
                raise ValueError(f"Record {index}: invalid group sentinel")
        elif kind == 8:
            if rid != 4 or index == 0 or not size:
                raise ValueError(f"Record {index}: invalid group header")
        elif index == 1:
            if rid != 0 or kind != 4 or not size:
                raise ValueError("Invalid initial resource alias")
        elif rid != index:
            raise ValueError(f"Record {index}: invalid resource ID/size")
        rows.append(
            {
                "index": index,
                "id": rid,
                "type": kind,
                "record_offset": record_offset,
                "relative_offset": relative,
                "source_offset": offset + relative,
                "bytes": size,
            }
        )
    if rows[0]["type"] != 0:
        raise ValueError("Missing opening group sentinel")
    # Known group headers alias payloads once. Bound repeated-range hashing.
    if sum(row["bytes"] for row in rows) > 2 * used:
        raise ValueError("Resource ranges exceed the supported hashing budget")
    for row in rows:
        if row["type"] == 8 or row["index"] == 1:
            index = row["index"]
            if index + 1 >= count:
                raise ValueError("Alias has no following resource")
            following = rows[index + 1]
            if (row["relative_offset"], row["bytes"]) != (
                following["relative_offset"],
                following["bytes"],
            ) or following["type"] in {0, 8}:
                raise ValueError(f"Record {index}: invalid payload alias")
    return {
        "table_offset": offset,
        "region_bytes": available,
        "declared_bytes": used,
        "unknown_header_word": unknown_word,
        "reserved": reserved,
        "record_count": count,
        "records": rows,
    }


def number(value):
    return int(value, 0)


def parse_tail_table(data, payload_offset, region_bytes=None):
    """Read the table pointer stored before a trailing-table payload area."""
    available = len(data) - payload_offset if region_bytes is None else region_bytes
    if payload_offset < 0 or available < 4 or payload_offset + available > len(data):
        raise ValueError("Payload region is outside input bounds")
    relative_table = struct.unpack_from("<I", data, payload_offset)[0]
    if relative_table < 4 or relative_table % 4 or relative_table + 16 > available:
        raise ValueError("Invalid trailing-table pointer")
    offset = payload_offset + relative_table
    first_word, unknown_word, reserved, count = struct.unpack_from("<4I", data, offset)
    if reserved != 0 or not 3 <= count <= MAX_RECORDS:
        raise ValueError("Unsupported trailing-table header")
    table_bytes = 16 + count * 16
    if relative_table + table_bytes > available:
        raise ValueError("Trailing table exceeds region")
    rows = []
    for index in range(count):
        record_offset = offset + 16 + index * 16
        rid, kind, relative, size = struct.unpack_from("<4I", data, record_offset)
        if kind not in TYPES | {9, 10}:
            raise ValueError(f"Record {index}: unsupported type {kind}")
        if kind == 0:
            if (rid, relative, size) != (0, 0, 0):
                raise ValueError(f"Record {index}: invalid group sentinel")
        elif (
            relative < 4
            or relative % 4
            or relative > relative_table
            or size > relative_table - relative
        ):
            raise ValueError(f"Record {index}: payload exceeds payload area")
        elif index == 1:
            if rid != 0 or kind != 4:
                raise ValueError("Invalid initial resource alias")
        elif rid != index and not (rid == 4 and kind in {9, 10}):
            raise ValueError(f"Record {index}: invalid resource ID")
        rows.append(
            {
                "index": index,
                "id": rid,
                "type": kind,
                "record_offset": record_offset,
                "relative_offset": relative,
                "source_offset": payload_offset + relative,
                "bytes": size,
            }
        )
    if rows[0]["type"] != 0:
        raise ValueError("Missing opening group sentinel")
    if sum(row["bytes"] for row in rows) > 2 * relative_table:
        raise ValueError("Resource ranges exceed the supported hashing budget")
    for row in rows:
        if row["index"] == 1 or row["id"] == 4 and row["type"] in {9, 10}:
            index = row["index"]
            if index + 1 >= count:
                raise ValueError("Alias has no following resource")
            following = rows[index + 1]
            if (row["relative_offset"], row["bytes"]) != (
                following["relative_offset"],
                following["bytes"],
            ) or following["type"] == 0:
                raise ValueError(f"Record {index}: invalid payload alias")
            if index == 1 and following["type"] != 4:
                raise ValueError("Invalid initial resource alias type")
    return {
        "layout": "trailing-table",
        "payload_offset": payload_offset,
        "table_offset": offset,
        "region_bytes": available,
        "unknown_first_word": first_word,
        "unknown_header_word": unknown_word,
        "reserved": reserved,
        "record_count": count,
        "records": rows,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    offsets = parser.add_mutually_exclusive_group()
    offsets.add_argument(
        "--table-offset", type=number, help="Leading-table offset, defaults to 0"
    )
    offsets.add_argument(
        "--payload-offset",
        type=number,
        help="Trailing-table payload origin with table pointer",
    )
    parser.add_argument("--region-bytes", type=number)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--extract-index", type=number, action="append", default=[])
    parser.add_argument("--out-dir", type=Path)
    args = parser.parse_args(argv)
    if args.input.is_symlink() or not args.input.is_file():
        raise ValueError("Input must be a regular file, not a symlink")
    if args.input.stat().st_size > MAX_INPUT:
        raise ValueError("Input exceeds the 512 MiB limit")
    if args.extract_index and args.out_dir is None:
        raise ValueError("--extract-index requires --out-dir")
    if args.report.exists() or args.report.is_symlink():
        raise ValueError("Refusing to overwrite an existing report")
    data = args.input.read_bytes()
    if args.payload_offset is None:
        report = parse_table(data, args.table_offset or 0, args.region_bytes)
    else:
        report = parse_tail_table(data, args.payload_offset, args.region_bytes)
    report.update(
        input=str(args.input), input_bytes=len(data), input_sha256=digest(data)
    )
    for row in report["records"]:
        start = row["source_offset"]
        row["sha256"] = digest(data[start : start + row["bytes"]])
    selected = []
    for index in sorted(set(args.extract_index)):
        if not 0 <= index < report["record_count"]:
            raise ValueError(f"Invalid extraction index {index}")
        row = report["records"][index]
        if row["type"] in {0, 8, 9, 10} or not row["bytes"]:
            raise ValueError(f"Record {index} is a group marker/header")
        target = args.out_dir / f"resource-{index:05d}-type{row['type']}.bin"
        if target.exists() or target.is_symlink():
            raise ValueError(f"Refusing to overwrite {target}")
        selected.append((row, target))
    # All structural and output collision checks finish before writes.
    if selected:
        args.out_dir.mkdir(parents=True, exist_ok=True)
    report["extracted"] = []
    created = []
    try:
        for row, target in selected:
            start = row["source_offset"]
            with target.open("xb") as stream:
                created.append(target)
                stream.write(data[start : start + row["bytes"]])
            report["extracted"].append(
                {"index": row["index"], "file": str(target), "sha256": row["sha256"]}
            )
        args.report.parent.mkdir(parents=True, exist_ok=True)
        with args.report.open("x", encoding="utf-8") as stream:
            created.append(args.report)
            json.dump(report, stream, indent=2)
            stream.write("\n")
    except BaseException:
        for target in reversed(created):
            target.unlink(missing_ok=True)
        raise
    print(
        f"Validated {report['record_count']} RSC records; extracted {len(selected)} original resources"
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, struct.error) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
