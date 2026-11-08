"""Extract three native games and their checksum-verified SMAF audio from W420 CD16."""

import argparse
from binascii import crc_hqx, crc32
from hashlib import sha256
import json
from pathlib import Path
import re
import struct


IMAGE_BYTES = 61_472_768
IMAGE_SHA256 = "c72e381ab9a29313c9e52876db314dd0285cdf438f5f57aa9b33c12cc959e706"
GAMES = (
    ("nom-2", 0x128753C, 394_496, 22),
    ("mini-game-heaven-anycall", 0x12E7A3C, 298_328, 25),
    ("bluetooth-janggi", 0x13307AC, 280_872, 12),
)


def identity(data):
    return {
        "bytes": len(data),
        "sha256": sha256(data).hexdigest(),
        "crc32": f"{crc32(data):08x}",
    }


def audio_chunks(data):
    """Return the original MMMD boundaries, including the two-byte CRC footer."""
    chunks = []
    for match in re.finditer(b"MMMD", data):
        offset = match.start()
        if offset + 8 > len(data):
            continue
        size = struct.unpack_from(">I", data, offset + 4)[0]
        end = offset + 8 + size
        if not offset + 18 <= end <= len(data):
            continue
        clip = data[offset:end]
        crc = crc_hqx(clip[:-2], 0xFFFF) ^ 0xFFFF
        if crc != int.from_bytes(clip[-2:], "big") or clip[8:12] != b"CNTI":
            continue
        pos = 8
        tags = []
        while pos + 8 <= len(clip) - 2:
            tag, length = struct.unpack_from(">4sI", clip, pos)
            tags.append({"tagHex": tag.hex(), "bytes": length})
            pos += 8 + length
        if pos != len(clip) - 2:
            continue
        if chunks and offset < chunks[-1][0] + len(chunks[-1][1]):
            raise ValueError("overlapping SMAF clips")
        chunks.append((offset, clip, tags, crc))
    return chunks


def extract(path, output):
    if path.stat().st_size != IMAGE_BYTES:
        raise ValueError("unexpected W420 CD16 DAT size")
    data = path.read_bytes()
    if sha256(data).hexdigest() != IMAGE_SHA256:
        raise ValueError("unexpected W420 CD16 DAT SHA-256")

    files = {}
    games = []
    for slug, offset, length, audio_count in GAMES:
        record = data[offset : offset + length]
        if (
            record[:4] != b"EADS"
            or struct.unpack_from("<I", record, 16)[0] + 48 != length
        ):
            raise ValueError(f"invalid EADS record at {offset:#x}")
        resources = audio_chunks(record)
        if len(resources) != audio_count:
            raise ValueError(f"unexpected number of SMAF clips for {slug}")

        filename = f"games/{slug}.eads"
        files[filename] = record
        game = {"path": filename, "offset": offset, **identity(record), "audio": []}
        for resource_offset, clip, tags, crc in resources:
            filename = f"audio/{slug}/{resource_offset:05x}.mmf"
            files[filename] = clip
            game["audio"].append(
                {
                    "path": filename,
                    "gameOffset": resource_offset,
                    "firmwareOffset": offset + resource_offset,
                    **identity(clip),
                    "smafCRC16": f"{crc:04x}",
                    "chunks": tags,
                }
            )
        games.append(game)

    output.mkdir(parents=True, exist_ok=False)
    for filename, contents in files.items():
        target = output / filename
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(contents)
    report = {"schema": 1, "firmware": identity(data), "games": games}
    (output / "manifest.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8", newline="\n"
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dat", type=Path)
    parser.add_argument("output", type=Path, help="New output directory")
    args = parser.parse_args()
    try:
        extract(args.dat, args.output)
    except (OSError, ValueError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
