"""Recover and verify the four Amos resource packs in the Samsung SCH-S250 YD01 ROM."""

import argparse
from hashlib import sha256
import json
from pathlib import Path
import re
from struct import unpack_from
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo
from zlib import crc32

ROM_SIZE = 19_300_352
ROM_SHA256 = "ea94aac903d463a943423d4b1e682da4de0c9010f41e06a9aaa0dedefa6fad7b"
PACKS = (
    ("lost-planet-ii", "world", 0x717DF4, 66),
    ("lost-planet-ii", "graphics", 0x759E10, 61),
    ("haunted-school", "graphics", 0x7AD218, 49),
    ("haunted-school", "world", 0x80DD00, 50),
)
HEADER_SIZE = 64
RESOURCE_NAME = re.compile(rb"[A-Z0-9_]+\.(MRA|MZB)")


def identity(data):
    return {
        "bytes": len(data),
        "sha256": sha256(data).hexdigest(),
        "crc32": f"{crc32(data):08x}",
    }


def load_rom(path):
    with path.open("rb") as stream:
        rom = stream.read(ROM_SIZE + 1)
    if len(rom) != ROM_SIZE or sha256(rom).hexdigest() != ROM_SHA256:
        raise ValueError("Unexpected SCH-S250 YD01 ROM size or SHA-256")
    return rom


def expand(source, size):
    """Read the LSB-first Amos LZW stream with 9–12 bit codes."""
    if not 0 < size <= 1_048_576:
        raise ValueError("Expanded member size outside supported bounds")
    bit = 0
    width = 9
    literals = [bytes([i]) for i in range(256)]
    dictionary = []
    previous = None
    output = bytearray()
    while bit + width <= len(source) * 8:
        index = bit // 8
        code = (int.from_bytes(source[index : index + 3], "little") >> (bit % 8)) & (
            (1 << width) - 1
        )
        if bit == 0 and code != 256:
            raise ValueError("Missing initial LZW clear code")
        bit += width
        if code == 257:
            if len(output) != size or (bit + 7) // 8 != len(source):
                raise ValueError("Unexpected LZW stream boundary")
            return bytes(output)
        if code == 256:
            dictionary = literals + [b"", b""]
            previous = None
            width = 9
            continue
        if code < len(dictionary):
            entry = dictionary[code]
        elif code == len(dictionary) and previous is not None and code < 4096:
            entry = previous + previous[:1]
        else:
            raise ValueError("Invalid LZW dictionary reference")
        if len(output) + len(entry) > size:
            raise ValueError("LZW output exceeds declared size")
        output.extend(entry)
        if previous is not None and len(dictionary) < 4096:
            dictionary.append(previous + entry[:1])
            if len(dictionary) == 1 << width and width < 12:
                width += 1
        previous = entry
    raise ValueError("Missing LZW end code")


def recover(rom):
    files = {}
    records = []
    for game, label, offset, expected_count in PACKS:
        version, count, area_size = unpack_from("<III", rom, offset + 20)
        if (
            rom[offset : offset + 20] != b"Amos Resource File;\0"
            or version != 0x100
            or count != expected_count
        ):
            raise ValueError(f"Unexpected Amos header at {offset:#x}")
        directory = offset + HEADER_SIZE
        data_start = directory + count * HEADER_SIZE
        end = offset + count * HEADER_SIZE + area_size
        if not data_start < end <= len(rom):
            raise ValueError("Invalid Amos container end")
        archive_path = f"original/{game}-{label}.amos"
        files[archive_path] = rom[offset:end]
        record = {
            "game": game,
            "group": label,
            "path": archive_path,
            "offset": offset,
            **identity(files[archive_path]),
            "members": [],
        }
        cursor = data_start
        for index in range(count):
            entry = directory + index * HEADER_SIZE
            resource_id = unpack_from("<I", rom, entry)[0]
            name = rom[entry + 4 : entry + 44].split(b"\0", 1)[0]
            relative, compression, stored_size, size = unpack_from(
                "<4I", rom, entry + 44
            )
            start = data_start + relative
            stop = start + stored_size
            if (
                not RESOURCE_NAME.fullmatch(name)
                or compression != 1
                or cursor != start
                or not start < stop <= end
            ):
                raise ValueError(f"Invalid Amos entry at {entry:#x}")
            compressed = rom[start:stop]
            data = expand(compressed, size)
            filename = name.decode("ascii")
            path = f"expanded/{game}/{label}/{filename}"
            if path in files:
                raise ValueError(f"Duplicate Amos resource {path}")
            details = {}
            if name.endswith(b".MRA"):
                width, height = unpack_from("<II", data)
                if not (
                    0 < width <= 320
                    and 0 < height <= 320
                    and 12 + 2 * width * height == size
                ):
                    raise ValueError(f"Invalid RGB565 image {name!r}")
                details = {"width": width, "height": height}
            elif re.fullmatch(rb"MAP\d+\.MZB", name):
                width, height = unpack_from("<II", data)
                if not (
                    0 < width <= 64
                    and 0 < height <= 64
                    and 8 + 8 * width * height == size
                ):
                    raise ValueError(f"Invalid map {name!r}")
                details = {"mapWidth": width, "mapHeight": height}
            files[path] = data
            record["members"].append(
                {
                    "id": resource_id,
                    "name": filename,
                    "path": path,
                    "storedOffset": start,
                    "stored": identity(compressed),
                    "expanded": identity(data),
                    **details,
                }
            )
            cursor = (stop + 3) & ~3
        if cursor != end:
            raise ValueError("Amos resource bounds do not cover declared size")
        records.append(record)
    return files, records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("rom", type=Path)
    parser.add_argument("output", type=Path, help="new output ZIP")
    args = parser.parse_args()
    try:
        rom = load_rom(args.rom)
        files, packs = recover(rom)
        report = {"rom": identity(rom), "packs": packs}
        files["resources.json"] = (json.dumps(report, indent=2) + "\n").encode()
        with ZipFile(args.output, "x", compression=ZIP_DEFLATED) as archive:
            for path, data in sorted(files.items()):
                archive.writestr(ZipInfo(path), data, compress_type=ZIP_DEFLATED)
    except (OSError, ValueError) as exc:
        parser.error(str(exc))


if __name__ == "__main__":
    main()
