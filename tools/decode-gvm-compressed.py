"""Decode the GVM1/2 stream selected by IMAGETYPE 4 or 8 in Kingston 2.12."""

import argparse
from hashlib import sha256
import json
from pathlib import Path
import runpy
from struct import unpack_from


PREFIX_BYTES = 100
HISTORY_BYTES = 64
MAX_INPUT_BYTES = 256 * 1024
MAX_OUTPUT_BYTES = 128 * 1024
parse_candidate = runpy.run_path(
    str(Path(__file__).with_name("scan-firmware-games.py"))
)["parse_candidate"]


def decode(body):
    """Return a bounded, structurally validated SGS and the decode evidence."""
    if (
        not PREFIX_BYTES < len(body) <= MAX_INPUT_BYTES
        or body[0] not in (1, 2)
        or body[2] not in (4, 8)
    ):
        raise ValueError("Expected a legacy SGS with IMAGETYPE 4 or 8")
    a, b, c, d = unpack_from("<4H", body, 44)
    if not (52 <= a < b <= c < d) or (b - a) % 4 or (d - c) % 4:
        raise ValueError("Invalid legacy section offsets")

    cursor = PREFIX_BYTES * 8
    end = len(body) * 8

    def bits(count):
        nonlocal cursor
        if cursor + count > end:
            raise ValueError("Truncated compressed token")
        first = cursor // 8
        cursor += count
        last = (cursor + 7) // 8
        value = int.from_bytes(body[first:last], "big")
        return (value >> (last * 8 - cursor)) & ((1 << count) - 1)

    history = bytearray(b"m" * HISTORY_BYTES)
    decoded = bytearray(body[:PREFIX_BYTES])
    literals = matches = 0
    while end - cursor >= 9:
        if bits(1):
            offset = bits(6)
            zeros = 0
            while not bits(1):
                zeros += 1
                if zeros > 6:
                    raise ValueError("Invalid match length")
            length = (1 << zeros) + bits(zeros)
            if length < 4 or offset + length > HISTORY_BYTES:
                raise ValueError("Match outside the 64-byte history")
            token = history[offset : offset + length]
            matches += 1
        else:
            token = bytes([bits(8)])
            literals += 1
        if len(decoded) + len(token) > MAX_OUTPUT_BYTES + 3:
            raise ValueError("Decoded content exceeds 128 KiB")
        decoded.extend(token)
        history.extend(token)
        del history[:-HISTORY_BYTES]
    padding_bits = end - cursor
    if bits(padding_bits):
        raise ValueError("Nonzero final compressed padding")

    layout = parse_candidate(decoded, 0)
    if layout is None:
        raise ValueError("Decoded content has an invalid SGS layout")
    size = layout["declared_body_bytes"]
    suffix = decoded[size:]
    # The SD1020 operator copy decodes to three zero bytes past the resources.
    if size > MAX_OUTPUT_BYTES or len(suffix) > 3 or any(suffix):
        raise ValueError("Unexpected bytes after the declared SGS resources")
    return bytes(decoded[:size]), {
        "layout": layout,
        "literals": literals,
        "matches": matches,
        "finalPaddingBits": padding_bits,
        "decodedZeroSuffixBytes": len(suffix),
        "expandedSha256": sha256(decoded).hexdigest(),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--offset", type=lambda value: int(value, 0), default=0)
    args = parser.parse_args()
    try:
        if not args.input.is_file() or args.input.is_symlink():
            raise ValueError("Input must be a regular file")
        with args.input.open("rb") as stream:
            source = stream.read(MAX_INPUT_BYTES + 1)
        if len(source) > MAX_INPUT_BYTES or not 0 <= args.offset < len(source):
            raise ValueError("Invalid offset or input exceeds 256 KiB")
        result, report = decode(source[args.offset :])
        with args.output.open("xb") as stream:
            stream.write(result)
    except (OSError, ValueError) as error:
        parser.exit(1, f"{error}\n")
    print(
        json.dumps(
            {
                "sourceBytes": len(source),
                "sourceSha256": sha256(source).hexdigest(),
                "sourceOffset": args.offset,
                "sgsBytes": len(result),
                "sgsSha256": sha256(result).hexdigest(),
                **report,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
