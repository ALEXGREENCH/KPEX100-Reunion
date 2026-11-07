"""Decode the headerless 16 KiB LZO1F slots used by LG SH170 MAIN."""

import argparse
import ctypes
import hashlib
import json
from pathlib import Path


SLOT_BYTES = 16 * 1024
MAX_INPUT_BYTES = 128 * 1024 * 1024
MAX_OUTPUT_BYTES = 192 * 1024 * 1024


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def unpack(raw, library):
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
    output = bytearray()
    for offset in range(0, len(raw), SLOT_BYTES):
        slot = raw[offset : offset + SLOT_BYTES]
        count = int.from_bytes(slot[:4], "little")
        stream = slot[4:].rstrip(b"\xff")
        if (
            not 1 <= count <= 1024 * 1024
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path, help="new output directory")
    parser.add_argument(
        "--lzo-library", type=Path, required=True, help="trusted LZO2 build"
    )
    args = parser.parse_args()
    if not 0 < args.source.stat().st_size <= MAX_INPUT_BYTES:
        parser.error("Invalid input size")
    raw = args.source.read_bytes()
    output, blocks = unpack(raw, args.lzo_library)
    report = {
        "sourceBytes": len(raw),
        "sourceSha256": sha256(raw),
        "slotBytes": SLOT_BYTES,
        "blocks": blocks,
        "outputBytes": len(output),
        "outputSha256": sha256(output),
    }
    args.output.mkdir()
    (args.output / "main.bin").write_bytes(output)
    (args.output / "report.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
