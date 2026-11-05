"""Recover a verified Samsung Push Push level table from a local ROM."""

import argparse
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path


FIRST_LEVEL_PREFIX = bytes.fromhex("080808081010100808080808100110080808080810041010")
TILES = {1: ".", 2: "$", 3: "*", 4: " ", 8: " ", 16: "#", 32: "@"}


@dataclass(frozen=True)
class LevelTable:
    variant: str
    levels: int
    record_bytes: int
    prefix: bytes
    sha256: str


TABLES = (
    LevelTable(
        "I",
        50,
        122,
        FIRST_LEVEL_PREFIX,
        "a9b49ef9bd94869ec8cc371e852765739184be16eb57e0e18c5afe5d749965e9",
    ),
    LevelTable(
        "II",
        66,
        162,
        FIRST_LEVEL_PREFIX,
        "949fbf7e7d221bd253d7a9e2013beeb93c952b5471f64f4878b746326131ed04",
    ),
    LevelTable(
        "III",
        50,
        162,
        bytes.fromhex("0d0b08080810101010101010080808101010100404040404"),
        "1563fb9016cedd18c00716325538761667ffe4cac23d15f5bf9ebb9d8a9debad",
    ),
)


def find_table(firmware, variant=None):
    matches = []
    for spec in TABLES:
        if variant is not None and spec.variant != variant:
            continue
        offset = firmware.find(spec.prefix)
        while offset != -1:
            table = firmware[offset : offset + spec.levels * spec.record_bytes]
            if sha256(table).hexdigest() == spec.sha256:
                matches.append((spec, offset, table))
                break
            offset = firmware.find(spec.prefix, offset + 1)
    if not matches:
        raise ValueError("no verified Push Push table was found")
    if len(matches) > 1:
        raise ValueError("more than one edition was found; select --variant")
    return matches[0]


def as_xsb(spec, table):
    lines = []
    for index in range(spec.levels):
        offset = index * spec.record_bytes
        width, height = table[offset : offset + 2]
        tiles = table[offset + 2 : offset + 2 + width * height]
        lines.append(f"; Stage {index + 1}")
        for row in range(height):
            start = row * width
            lines.append(
                "".join(TILES[tile] for tile in tiles[start : start + width]).rstrip()
            )
        lines.append("")
    return "\n".join(lines).encode("ascii")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("firmware", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--variant", choices=[spec.variant for spec in TABLES])
    parser.add_argument("--format", choices=("xsb", "raw"), default="xsb")
    args = parser.parse_args()
    try:
        spec, offset, table = find_table(args.firmware.read_bytes(), args.variant)
        data = table if args.format == "raw" else as_xsb(spec, table)
        with args.output.open("xb") as output:
            output.write(data)
    except (OSError, ValueError) as error:
        parser.exit(1, f"{error}\n")
    print(f"Extracted {spec.levels} Push Push {spec.variant} levels at 0x{offset:x}")


if __name__ == "__main__":
    main()
