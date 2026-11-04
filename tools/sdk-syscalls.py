#!/usr/bin/env python3
"""Reproduce GNEX SDK 2.12 syscall names and signatures from two PE files.

Reads only data. Hash-locked offsets avoid treating another binary as this SDK.
Compiler IDs differ from assembler syscall IDs: signatures are joined by name.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct

from pe_reader import Pe32

MASM_HASH = "c9dd8612c392b0a1f9189b838b529157c1235f48e344e781fdb4c47ff3b5530a"
MCC_HASH = "a02ffd612a4a242852f35a1fc0fc4bdf1911c0a07375a75955822ce5629f996f"
COUNT = 908


def read_known(path, expected):
    if path.stat().st_size > 4 * 1024 * 1024:
        raise ValueError("Input exceeds the bounded SDK tool size")
    data = path.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if digest != expected:
        raise ValueError(f"Unrecognized {path.name} SHA-256: {digest}")
    return Pe32(data)


def extract(masm_path, mcc_path):
    masm = read_known(masm_path, MASM_HASH)
    mcc = read_known(mcc_path, MCC_HASH)
    signatures = {}
    for i in range(COUNT):
        offset = 0x266A4 + i * 52
        mcc.require(offset, 52)
        cid, name_va, argc, result, *types = struct.unpack_from(
            "<13I", mcc.data, offset
        )
        if cid != i + 1 or argc > 9:
            raise ValueError("Compiler signature table shape changed")
        name = mcc.ascii_at_va(name_va)
        if name in signatures:
            raise ValueError(f"Duplicate compiler function {name}")
        signatures[name] = {
            "compiler_id": cid,
            "argc": argc,
            "return_type_code": result,
            "argument_type_codes": types[:argc],
        }
    table = masm.va_offset(0x41DE38)
    result = []
    for i in range(COUNT):
        name = masm.ascii_at_va(masm.u32(table + i * 4))
        if name not in signatures and name not in (
            "//_GetCenterPoint",
            "//_SetCenterPoint",
        ):
            raise ValueError(f"Missing signature for {name}")
        result.append(
            {"id": i, "hex": f"0x{i:03X}", "name": name, **signatures.get(name, {})}
        )
    if [r["name"] for r in result[:3]] != ["GetHwConfig", "GetSysMin", "GetSysUserID"]:
        raise ValueError("Assembler table shape changed")
    return result


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--masm", type=Path, required=True)
    ap.add_argument("--mcc", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True, help="New JSON output file")
    args = ap.parse_args()
    records = extract(args.masm, args.mcc)
    with args.output.open("x", encoding="utf-8") as stream:
        json.dump(records, stream, indent=2, ensure_ascii=False)
        stream.write("\n")
    print(f"{len(records)} syscall records written to {args.output}")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, UnicodeError) as error:
        raise SystemExit(f"ERROR: {error}")
