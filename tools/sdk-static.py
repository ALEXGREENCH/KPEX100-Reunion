#!/usr/bin/env python3
"""Inventory or extract the known GNEX InstallShield overlay without execution.

Independent Python implementation of the container format described by ISx:
https://github.com/lifenjoiner/ISx (MIT, Copyright 2017 lifenjoiner).
Only the GNEX SDK 2.10/2.12 ANSI layout is supported. MSI/CAB are left as data.
"""
import argparse
import hashlib
import json
from pathlib import Path, PureWindowsPath
import struct

from pe_reader import Pe32

KNOWN = {
    "87d852091c8d25134d6b57bf14e8745b5e99f6c6277fdb56bff801b1ff0fd3a7": "GNEX SDK 2.12",
    "075f010557029a53a5c7e01fc7f492e4236a26b8edb019fcd7193d0719a0dd19": "GNEX SDK 2.10",
}
MAX_INPUT = 256 * 1024 * 1024


def inspect(source):
    if source.stat().st_size > MAX_INPUT:
        raise ValueError("Installer exceeds the 256 MiB research limit")
    data = source.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if digest not in KNOWN:
        raise ValueError(f"Unrecognized SDK SHA-256: {digest}; no files written")
    pe = Pe32(data)
    pos = pe.overlay
    pe.require(pos, 46)
    if data[pos : pos + 14] != b"InstallShield\0":
        raise ValueError("Expected the ANSI InstallShield overlay")
    count = pe.u16(pos + 14)
    if not 1 <= count <= 99:
        raise ValueError("Unexpected member count")
    pos += 46
    members = []
    seen = set()
    for _ in range(count):
        pe.require(pos, 312)
        raw_name = data[pos : pos + 260].split(b"\0")[0]
        name = raw_name.decode("cp949")
        windows = PureWindowsPath(name)
        if (
            not name
            or windows.name != name
            or windows.is_reserved()
            or any(c in name for c in '\\/:*?"<>|')
            or name in (".", "..")
            or name.endswith((".", " "))
            or any(ord(c) < 32 for c in name)
            or name.casefold() in seen
        ):
            raise ValueError("Unsafe or duplicate archive member name")
        seen.add(name.casefold())
        flags, _, size = struct.unpack_from("<III", data, pos + 260)
        if pe.u16(pos + 280) or flags not in (0, 2, 4):
            raise ValueError(f"Unsupported container flags for {name}")
        pos += 312
        pe.require(pos, size)
        payload = data[pos : pos + size]
        if flags:
            key = bytes(
                c ^ (0x13, 0x35, 0x86, 7)[i % 4] for i, c in enumerate(raw_name)
            )
            payload = bytes(
                (
                    ~(
                        key[(i % 1024 if flags == 4 else i) % len(key)]
                        ^ ((c << 4) | (c >> 4))
                    )
                )
                & 255
                for i, c in enumerate(payload)
            )
        members.append(
            (
                {
                    "name": name,
                    "offset": pos,
                    "bytes": size,
                    "sha256": hashlib.sha256(payload).hexdigest(),
                },
                payload,
            )
        )
        pos += size
    if pos != len(data):
        raise ValueError("Unexpected trailing container bytes")
    receipt = {
        "format": 1,
        "product": KNOWN[digest],
        "source_bytes": len(data),
        "source_sha256": digest,
        "execution": "none",
        "members": [meta for meta, _ in members],
    }
    return receipt, members


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("installer", type=Path)
    ap.add_argument(
        "--extract", type=Path, help="New or empty output directory; no overwrite"
    )
    ap.add_argument("--report", type=Path, help="Write inventory JSON to a new file")
    args = ap.parse_args()
    receipt, members = inspect(args.installer)
    if args.extract:
        dest = args.extract.resolve()
        if dest.exists() and (not dest.is_dir() or any(dest.iterdir())):
            raise ValueError("Extraction destination must be new or empty")
        dest.mkdir(parents=True, exist_ok=True)
        for meta, payload in members:
            target = (dest / meta["name"]).resolve()
            if target.parent != dest:
                raise ValueError("Archive path escapes destination")
            with target.open("xb") as stream:
                stream.write(payload)
        with (dest / "receipt.json").open("x", encoding="utf-8") as stream:
            json.dump(receipt, stream, indent=2, ensure_ascii=False)
    if args.report:
        with args.report.open("x", encoding="utf-8") as stream:
            json.dump(receipt, stream, indent=2, ensure_ascii=False)
    print(json.dumps(receipt, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, UnicodeError) as error:
        raise SystemExit(f"ERROR: {error}")
