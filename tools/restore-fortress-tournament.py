"""Extract the preserved Fortress Tournament bytes and prepare a playable copy."""

import argparse
import hashlib
from pathlib import Path
import struct


DUMP_HASH = "18891253b9074a7b89a67cca4731c28b5f60041ade20b604fabb94163433acca"
FRAGMENT_HASH = "1ca7546cae5b18bbc895d899daddea0f216076cb39681fd3cdc7d05f01024e50"
FILE_ID = 789
HEADER_PAGE = 2769408
SGS_START = 176
GAP = 98179
MISSING_BYTES = 12


def recover(raw):
    if hashlib.sha256(raw).hexdigest() != DUMP_HASH:
        raise ValueError("Expected the archived LG-SD1000-pt2.bin")
    header = struct.unpack_from("<6H", raw, HEADER_PAGE)
    name = raw[HEADER_PAGE + 29 : HEADER_PAGE + 45]
    if header[:4] != (0xDB, FILE_ID, 0, 16) or name != b"gvm2x/gvm2x_001\0":
        raise ValueError("Unexpected filesystem entry")
    first = raw[HEADER_PAGE + 45 : HEADER_PAGE + 252]
    pages = {}
    for offset in range(0, len(raw) - 11, 256):
        marker, file_id, index, _, _, length = struct.unpack_from("<6H", raw, offset)
        if marker == 0xFE and file_id == FILE_ID:
            if index in pages or not 0 < length <= 240:
                raise ValueError(f"Unexpected file page at {offset:#x}")
            pages[index] = raw[offset + 12 : offset + 12 + length]
    if set(pages) != set(range(1, 431)):
        raise ValueError("Unexpected page index set")
    fragments = first + b"".join(pages[i] for i in range(1, 431))
    if hashlib.sha256(fragments).hexdigest() != FRAGMENT_HASH:
        raise ValueError("Recovered byte hash mismatch")
    sgs = fragments[SGS_START:]
    # This exact gap lies in the ADPCM payload of SMAF resource 397.
    # Retain the damaged original CRC and every captured byte.
    playable = sgs[:GAP] + bytes(MISSING_BYTES) + sgs[GAP:]
    return fragments, playable


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", type=Path, help="LG-SD1000-pt2.bin from SD430I13.7z")
    parser.add_argument("output", type=Path, help="new output directory")
    args = parser.parse_args()
    if args.image.stat().st_size != 2944496:
        parser.error("Expected the 2,944,496-byte source image")
    fragments, playable = recover(args.image.read_bytes())
    args.output.mkdir()
    (args.output / "gvm2x_001.fragments").write_bytes(fragments)
    (args.output / "fortress-tournament-reconstruction.sgs").write_bytes(playable)


if __name__ == "__main__":
    main()
