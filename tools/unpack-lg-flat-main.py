"""Decode LG MAIN LZO1F slots with or without a preserved ELF prefix."""

import argparse
import ctypes
import hashlib
import json
from pathlib import Path
import struct


SLOT_BYTES = 16 * 1024
ELF_SLOT_BYTES = 128 * 1024
ELF_OFFSET = 0x220
ELF_PREFIX_BYTES = 8192
MAX_INPUT_BYTES = 128 * 1024 * 1024
MAX_OUTPUT_BYTES = 192 * 1024 * 1024


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def unpack(raw, library, *, slot_bytes=SLOT_BYTES, start=0, prefix=b""):
    decode = ctypes.CDLL(str(library.resolve())).lzo1f_decompress_safe
    decode.argtypes = [
        ctypes.c_void_p,
        ctypes.c_size_t,
        ctypes.c_void_p,
        ctypes.POINTER(ctypes.c_size_t),
        ctypes.c_void_p,
    ]
    decode.restype = ctypes.c_int
    blocks = []
    output = bytearray(prefix)
    max_slot_output = 1024 * 1024 if slot_bytes == SLOT_BYTES else 16 * 1024 * 1024
    for offset in range(start, len(raw), slot_bytes):
        slot = raw[offset : offset + slot_bytes]
        count = int.from_bytes(slot[:4], "little")
        stream = slot[4:].rstrip(b"\xff")
        if (
            not 1 <= count <= max_slot_output
            or len(output) + count > MAX_OUTPUT_BYTES
            or not stream.endswith(b"\xe1\0\0")
            or len(slot) - 4 - len(stream) > 31
        ):
            raise ValueError(f"Invalid LZO1F slot at {offset:#x}")
        buffer = ctypes.create_string_buffer(count)
        used = ctypes.c_size_t(count)
        status = decode(stream, len(stream), buffer, ctypes.byref(used), None)
        if status != 0 or used.value != count:
            raise ValueError(f"LZO1F size or status mismatch at {offset:#x}")
        body = buffer.raw
        blocks.append(
            {
                "offset": offset,
                "storedBytes": len(slot),
                "streamBytes": len(stream),
                "outputOffset": len(output),
                "outputBytes": len(body),
                "sha256": sha256(body),
            }
        )
        output.extend(body)
    return output, blocks


def unpack_wrapped_elf(raw, library):
    stream_start = ELF_OFFSET + ELF_PREFIX_BYTES
    if (
        len(raw) <= stream_start
        or not raw.startswith(b"MAIN\xd0\x01\0\0")
        or struct.unpack_from("<II", raw, 0x20) != (40, len(raw) - ELF_OFFSET)
    ):
        raise ValueError("Invalid single-image MAIN wrapper")
    prefix = raw[ELF_OFFSET:stream_start]
    fields = struct.unpack_from("<16sHHIIIIIHHHHHH", prefix)
    phoff, phsize, phnum = fields[5], fields[9], fields[10]
    if (
        not prefix.startswith(b"\x7fELF\x01\x01\x01")
        or fields[2] != 40
        or phoff < 52
        or phsize != 32
        or not 1 <= phnum <= 128
        or phoff + phsize * phnum > ELF_PREFIX_BYTES
    ):
        raise ValueError("Invalid ARM ELF program header table")
    output, blocks = unpack(
        raw, library, slot_bytes=ELF_SLOT_BYTES, start=stream_start, prefix=prefix
    )
    segment_ends = []
    for index in range(phnum):
        segment = struct.unpack_from("<8I", prefix, phoff + index * phsize)
        segment_ends.append(segment[1] + segment[4])
    if max(segment_ends) != len(output):
        raise ValueError("ELF segments do not cover the decoded extent")
    return output, blocks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path, help="new output directory")
    parser.add_argument(
        "--lzo-library", type=Path, required=True, help="trusted LZO2 build"
    )
    parser.add_argument(
        "--wrapped-elf", action="store_true", help="single ARM ELF image, as in KH1800M"
    )
    args = parser.parse_args()
    if not 0 < args.source.stat().st_size <= MAX_INPUT_BYTES:
        parser.error("Invalid input size")
    raw = args.source.read_bytes()
    try:
        decoder = unpack_wrapped_elf if args.wrapped_elf else unpack
        output, blocks = decoder(raw, args.lzo_library)
    except (OSError, ValueError, struct.error) as error:
        parser.exit(1, f"{error}\n")
    report = {
        "sourceBytes": len(raw),
        "sourceSha256": sha256(raw),
        "slotBytes": ELF_SLOT_BYTES if args.wrapped_elf else SLOT_BYTES,
        "blocks": blocks,
        "outputBytes": len(output),
        "outputSha256": sha256(output),
    }
    if args.wrapped_elf:
        report["elfOffset"] = ELF_OFFSET
        report["elfPrefixBytes"] = ELF_PREFIX_BYTES
    args.output.mkdir()
    (args.output / "main.bin").write_bytes(output)
    (args.output / "report.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
