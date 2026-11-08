"""Build an original ROM-only DMG cartridge and its GNEX SGS test host."""

import argparse
import sys
from pathlib import Path
from struct import pack
from tempfile import TemporaryDirectory


HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from sgs_build import build_sgs, pack_vfs


def demo_cartridge(color=False):
    rom = bytearray(32768)
    rom[0x100:0x104] = bytes.fromhex("00 c3 50 01")
    rom[0x134:0x13F] = b"PRISM RELAY" if color else b"POCKET LAB\0"
    if color:
        rom[0x143] = 0xC0
    code = bytearray()
    labels = {}
    branches = []
    jumps = []

    def emit(*values):
        code.extend(values)

    def label(name):
        labels[name] = len(code)

    def branch(opcode, destination):
        emit(opcode, 0)
        branches.append((len(code) - 1, destination))

    def jump(destination):
        emit(0xC3, 0, 0)
        jumps.append((len(code) - 2, destination))

    def copy(destination, source, size, name):
        emit(0x21, destination & 255, destination >> 8)
        emit(0x11, source & 255, source >> 8, 1, size & 255, size >> 8)
        label(name)
        emit(0x1A, 0x22, 0x13, 0x0B, 0x78, 0xB1)
        branch(0x20, name)

    def position(name):
        emit(0x21, 0, 0x98, 1, 32, 0, 0x7B)
        label(name + "-row")
        emit(9, 0x3D)
        branch(0x20, name + "-row")
        emit(1, 1, 0, 0x7A)
        label(name + "-column")
        emit(9, 0x3D)
        branch(0x20, name + "-column")

    letters = "LINKED"
    tile_count = 9 + len(letters) if color else 8
    copy(0x8000, 0x400, tile_count * 16, "tiles")
    copy(0x9800, 0x500, 32 * 18, "map")
    if color:
        emit(0x3E, 1, 0xE0, 0x4F)
        copy(0x8000, 0x900, 16, "bank-one-tile")
        copy(0x9800, 0xA00, 32 * 18, "attributes")
        emit(0x3E, 0, 0xE0, 0x4F, 0x3E, 0x80, 0xE0, 0x68)
        emit(0x21, 0, 0x0D, 0x11, 0, 32)
        label("palettes")
        emit(0x7E, 0x23, 0xE0, 0x69, 0x15)
        branch(0x20, "palettes")
    emit(0x3E, 0xE4, 0xE0, 0x47, 0x3E, 0x91, 0xE0, 0x40)
    # D=x, E=y. HL points at the robot's current tile in the name table.
    start_x, start_y = (3, 9) if color else (10, 9)
    emit(0x3E, 0x20, 0xE0, 0, 0x11, start_y, start_x)
    start_tile = 0x9800 + 32 * start_y + start_x
    emit(0x21, start_tile & 255, start_tile >> 8, 0x36, 2)
    label("wait")
    emit(0xF0, 0, 0x2F, 0xE6, 15)
    branch(0x28, "wait")
    emit(0x36, 0)
    if color:
        emit(0x7A, 0xEA, 1, 0xC0, 0x7B, 0xEA, 2, 0xC0)
    for direction, bit, read, edge, move in (
        ("right", 1, 0x7A, 18 if color else 15, 0x14),
        ("left", 2, 0x7A, 1 if color else 4, 0x15),
        ("up", 4, 0x7B, 3 if color else 5, 0x1D),
        ("down", 8, 0x7B, 14 if color else 13, 0x1C),
    ):
        emit(0xF0, 0, 0x2F, 0xE6, bit)
        branch(0x28, direction)
        emit(read, 0xFE, edge)
        branch(0x28, direction)
        emit(move)
        label(direction)
    position("next")
    if color:
        emit(0x7E, 0xFE, 1)
        branch(0x28, "blocked")
        emit(0xFE, 7)
        branch(0x28, "collect")
        emit(0xFE, 8)
        branch(0x20, "move")
        emit(0xFA, 0, 0xC0, 0xFE, 3)
        branch(0x28, "won")
        label("blocked")
        emit(0xFA, 1, 0xC0, 0x57, 0xFA, 2, 0xC0, 0x5F)
        position("previous")
        branch(0x18, "move")
        label("collect")
        emit(0xFA, 0, 0xC0, 0x3C, 0xEA, 0, 0xC0)
        label("move")
    emit(0x36, 2)
    label("release")
    emit(0xF0, 0, 0x2F, 0xE6, 15)
    branch(0x20, "release")
    if color:
        jump("wait")
        label("won")
        emit(0x36, 2, 0x21, 0x27, 0x98)
        for glyph in range(len(letters)):
            emit(0x3E, 9 + glyph, 0x22)
        label("end")
        branch(0x18, "end")
    else:
        branch(0x18, "wait")
    for offset, name in branches:
        delta = labels[name] - (offset + 1)
        assert -128 <= delta < 128
        code[offset] = delta & 255
    for offset, name in jumps:
        code[offset : offset + 2] = pack("<H", 0x150 + labels[name])
    assert 0x150 + len(code) <= 0x400
    rom[0x150 : 0x150 + len(code)] = code

    tiles = [
        ["00000000"] * 7 + ["00010000"],
        ["33333333", "32222223", "32111123", "32111123"] * 2,
        [
            "00333300",
            "03222230",
            "32111123",
            "32100123",
            "32111123",
            "32333323",
            "03222230",
            "00333300",
        ],
        [
            "33333333",
            "32222223",
            "32100123",
            "32111123",
            "32111123",
            "32100123",
            "32222223",
            "33333333",
        ],
        [
            "00000000",
            "00011000",
            "00122100",
            "01233210",
            "01233210",
            "00122100",
            "00033000",
            "00033000",
        ],
        [
            "22222222",
            "22222222",
            "21111112",
            "21000012",
            "21000012",
            "21111112",
            "22222222",
            "22222222",
        ],
        [
            "00000000",
            "00000000",
            "00011000",
            "00111100",
            "01121110",
            "11222111",
            "12222211",
            "22222222",
        ],
        [
            "00000000",
            "00003000",
            "00033300",
            "00333330",
            "00033300",
            "00003000",
            "00000000",
            "00000000",
        ],
    ]
    if color:
        tiles.append(["33333333", "31111113", "31222213", "31233213"] * 2)
        glyphs = (
            ("10000", "10000", "10000", "10000", "11111"),
            ("11111", "00100", "00100", "00100", "11111"),
            ("10001", "11001", "10101", "10011", "10001"),
            ("10010", "10100", "11000", "10100", "10010"),
            ("11111", "10000", "11110", "10000", "11111"),
            ("11110", "10001", "10001", "10001", "11110"),
        )
        tiles.extend(
            ["00000000"]
            + ["0" + row.replace("1", "3") + "00" for row in glyph]
            + ["00000000"] * 2
            for glyph in glyphs
        )
    for tile, rows in enumerate(tiles):
        for y, row in enumerate(rows):
            for plane in range(2):
                rom[0x400 + tile * 16 + y * 2 + plane] = sum(
                    ((int(pixel) >> plane) & 1) << (7 - x)
                    for x, pixel in enumerate(row)
                )
    if color:
        color_map(rom)
    else:
        for y in range(18):
            for x in range(20):
                tile = 0
                if x in (0, 19) or y in (0, 17):
                    tile = 1
                elif y == 2:
                    tile = 6
                elif x in (2, 17) and y in (4, 7, 10, 13, 15):
                    tile = 4
                elif y == 15 and x in (6, 8, 10, 12, 14):
                    tile = 5 if x != 10 else 7
                rom[0x500 + y * 32 + x] = tile
        rom[0x500 + 9 * 32 + 10] = 2
    rom[0x14D] = (-sum(rom[0x134:0x14D]) - 25) & 255
    rom[0x14E:0x150] = pack(">H", sum(rom) & 65535)
    return bytes(rom)


def color_map(rom):
    # Bank 1 tile zero is a diagonal trace. It marks the three colored zones
    # in the outer trim, with the same tile mirrored in alternate corners.
    for y in range(8):
        rom[0x900 + y * 2] = 128 >> y
        rom[0x901 + y * 2] = 128 >> y
    for y in range(18):
        for x in range(20):
            tile = 0
            attr = min(2, x // 7)
            if x in (0, 19) or y in (0, 17):
                attr |= 8
                if x >= 10:
                    attr |= 32
                if y >= 9:
                    attr |= 64
            elif x in (1, 18) or y in (3, 14):
                if 3 <= y <= 14:
                    tile = 1
            elif (x == 7 and 5 <= y <= 11 and y != 8) or (
                x == 13 and 6 <= y <= 12 and y != 10
            ):
                tile = 1
            elif (x, y) in ((5, 5), (10, 12), (15, 5)):
                tile = 7
                attr = 3
            elif (x, y) == (16, 9):
                tile = 8
                attr = 3
            elif (x, y) == (3, 9):
                tile = 2
            offset = y * 32 + x
            rom[0x500 + offset] = tile
            rom[0xA00 + offset] = attr
    colors = (
        ((2, 4, 7), (6, 12, 17), (8, 23, 24), (16, 31, 28)),
        ((2, 4, 7), (12, 8, 19), (22, 15, 28), (30, 22, 31)),
        ((2, 4, 7), (13, 9, 6), (25, 15, 7), (31, 25, 12)),
        ((2, 4, 7), (13, 10, 4), (26, 17, 5), (31, 30, 15)),
    )
    rom[0xD00:0xD20] = b"".join(
        pack("<H", r | g << 5 | b << 10) for palette in colors for r, g, b in palette
    )


def pack_cart(sgs, cart):
    if len(cart) != 32768 or cart[0x147:0x149] != b"\0\0":
        raise ValueError("Expected a 32 KiB ROM-only Game Boy cartridge")
    return pack_vfs(sgs, {"cart.gb": cart})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sdk", type=Path, help="extracted Sinjisoft SDK 2.12 tools")
    parser.add_argument("--output", type=Path, required=True)
    source_group = parser.add_mutually_exclusive_group()
    source_group.add_argument(
        "--cart", type=Path, help="optional 32 KiB test cartridge"
    )
    source_group.add_argument(
        "--rom-only", action="store_true", help="write only the original cartridge"
    )
    parser.add_argument("--color", action="store_true", help="build Prism Relay (CGB)")
    args = parser.parse_args()
    cart = args.cart.read_bytes() if args.cart else demo_cartridge(args.color)
    if args.rom_only:
        args.output.write_bytes(cart)
        return
    if args.sdk is None:
        parser.error("--sdk is required when building an SGS")
    source = HERE / "gb-reunion.mc"
    if args.color:
        with TemporaryDirectory(prefix="reunion-cgb-") as directory:
            variant = Path(directory) / source.name
            variant.write_text(
                source.read_text(encoding="ascii")
                .replace("#DEFINE APPID 991", "#DEFINE APPID 992")
                .replace('"Reunion GB"', '"Reunion CGB"'),
                encoding="ascii",
            )
            sgs = build_sgs(args.sdk, variant)
    else:
        sgs = build_sgs(args.sdk, source)
    args.output.write_bytes(pack_cart(sgs, cart))


if __name__ == "__main__":
    main()
