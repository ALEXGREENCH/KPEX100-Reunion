"""Build the Reunion Game Gear cartridges and their GNEX containers."""

import argparse
from pathlib import Path
from struct import pack
import sys
from tempfile import TemporaryDirectory

from cart import (
    Code,
    COLORS,
    CX,
    CY,
    FONT,
    NAME_LENGTH,
    PATTERNS,
    ROOM,
    RAM_ROOM,
    cartridge_image,
)
from signal_breaker import breaker_cartridge

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sgs_build import build_sgs, encode_kpex, pack_vfs  # noqa: E402


SOURCE = Path(__file__).with_name("prism-vault.mc")
GX, GY = 0xD000, 0xD001
PHASE, SHARDS, WON, PAD, PREV, DELAY, ACTION = range(0xD004, 0xD00B)

GLYPHS = {letter: index + 16 for index, letter in enumerate(FONT)}


def text_tiles(message):
    return [GLYPHS[letter] if letter != " " else 0 for letter in message]


def art():
    tiles = [
        ["00000000"] * 8,
        [
            "12222221",
            "21444412",
            "24111142",
            "24155142",
            "24155142",
            "24111142",
            "21444412",
            "12222221",
        ],
        [
            "00066000",
            "00677600",
            "06788760",
            "67888876",
            "67877876",
            "06766760",
            "00677600",
            "00066000",
        ],
        [
            "00333300",
            "03aaaa30",
            "03a3aa30",
            "03aa3a30",
            "03a3aa30",
            "03aa3a30",
            "03aaaa30",
            "00333300",
        ],
        [
            "00999900",
            "09bbbb90",
            "09b9bb90",
            "09bb9b90",
            "09b9bb90",
            "09bb9b90",
            "09bbbb90",
            "00999900",
        ],
        [
            "00099000",
            "009cc900",
            "09cddc90",
            "9cddddc9",
            "9cddddc9",
            "09cddc90",
            "009cc900",
            "00099000",
        ],
        [
            "00111100",
            "01222210",
            "12212221",
            "12121221",
            "12212221",
            "12121221",
            "12222221",
            "11111111",
        ],
        [
            "00300300",
            "03a00a30",
            "03a00a30",
            "03000030",
            "03000030",
            "03a00a30",
            "03a00a30",
            "00300300",
        ],
        [
            "00900900",
            "09b00b90",
            "09b00b90",
            "09000090",
            "09000090",
            "09b00b90",
            "09b00b90",
            "00900900",
        ],
        [
            "00333300",
            "03eeee30",
            "3e6666e3",
            "3e6006e3",
            "3e6006e3",
            "3e6006e3",
            "3e6666e3",
            "33333333",
        ],
        [
            "00000000",
            "01111110",
            "01000010",
            "01000010",
            "01000010",
            "01000010",
            "01111110",
            "00000000",
        ],
        [
            "00000000",
            "00999900",
            "09cccc90",
            "09cddc90",
            "09cddc90",
            "09cccc90",
            "00999900",
            "00000000",
        ],
        [
            "00000000",
            "00000000",
            "00000000",
            "22222222",
            "11111111",
            "00000000",
            "00000000",
            "00000000",
        ],
        [
            "00000000",
            "00000000",
            "00000000",
            "00002000",
            "00000000",
            "00000000",
            "00000000",
            "00000000",
        ],
        [
            "00000000",
            "00000000",
            "00040000",
            "00444000",
            "00040000",
            "00000000",
            "00000000",
            "00000000",
        ],
        ["00000000"] * 8,
    ]
    for rows in FONT.values():
        tiles.append(
            [
                "0" + "".join("f" if row & (16 >> x) else "0" for x in range(5)) + "00"
                for row in rows
            ]
            + ["00000000"]
        )
    patterns = bytes(
        sum(((int(pixel, 16) >> plane) & 1) << (7 - x) for x, pixel in enumerate(row))
        for tile in tiles
        for row in tile
        for plane in range(4)
    )

    cells = bytearray(NAME_LENGTH)

    def message(x, y, words):
        data = text_tiles(words)
        cells[y * 32 + x : y * 32 + x + len(data)] = bytes(data)

    message(7, 3, "PRISM VAULT")
    message(7, 19, "FIND TWO SHARDS")
    message(7, 20, "1 PHASE / START")
    for x in range(6, 26):
        cells[4 * 32 + x] = cells[18 * 32 + x] = 12
    for y in range(5, 18):
        for x in range(6, 26):
            wall = (
                x in (6, 25)
                or y in (5, 17)
                or x in (12, 18)
                or (x, y)
                in {
                    (9, 6),
                    (9, 7),
                    (8, 13),
                    (10, 15),
                    (14, 11),
                    (20, 8),
                    (23, 11),
                    (21, 16),
                }
            )
            cells[y * 32 + x] = 1 if wall else (13 if (x * 47 + y * 89) % 31 < 3 else 0)
    for x, y, tile in [
        (12, 10, 3),
        (18, 13, 8),
        (15, 8, 5),
        (22, 15, 5),
        (22, 8, 6),
        (23, 19, 10),
        (24, 19, 10),
    ]:
        cells[y * 32 + x] = tile
    palette = [
        0x211,
        0x544,
        0x765,
        0xA63,
        0x435,
        0x857,
        0xE95,
        0xFDE,
        0xFFF,
        0x168,
        0xFD3,
        0x6CF,
        0x4EF,
        0xAFF,
        0x8F6,
        0xFCC,
    ]
    return patterns, cells, pack("<32H", *(palette * 2))


def demo_cartridge():
    patterns, cells, palette = art()
    z = Code()
    emit, label, go, branch = z.emit, z.label, z.to, z.relative
    label("reset")
    emit(0xF3)
    z.word(0x31, 0xDFF0)
    z.port(0x06, 0xFF)
    z.port(0xBF, 0)
    z.port(0xBF, 0x81)
    go(0xCD, "vblank")
    go(0xCD, "vblank")
    go(0x21, "registers")
    emit(0x06, 11, 0x0E, 0x80)
    label("init_vdp")
    emit(0x7E, 0xD3, 0xBF, 0x79, 0xD3, 0xBF, 0x23, 0x0C)
    branch(0x10, "init_vdp")
    z.vdp(0xC000)
    z.send(COLORS, len(palette), "cram")
    z.vdp(0x4000)
    z.send(PATTERNS, len(patterns), "patterns")
    z.vdp(0x7F00)
    z.port(0xBE, 0xD0)
    z.vdp(0x7800)
    z.word(0x21, ROOM)
    z.word(0x11, RAM_ROOM)
    z.word(0x01, NAME_LENGTH)
    label("map")
    emit(0x7E, 0x12, 0xD3, 0xBE, 0xAF, 0xD3, 0xBE, 0x23, 0x13, 0x0B, 0x78, 0xB1)
    branch(0x20, "map")
    for address in (PHASE, SHARDS, WON, PREV, DELAY, ACTION):
        z.write(address, 0)
    z.write(GX, 8)
    z.write(GY, 8)
    go(0xCD, "player")
    go(0xCD, "vblank")
    z.vdp(0x8140)

    label("frame")
    go(0xCD, "vblank")
    emit(0xDB, 0x00, 0xE6, 0x80)
    go(0xCA, "reset")
    z.read(WON)
    emit(0xB7)
    go(0xC2, "frame")
    emit(0xDB, 0xDC, 0x2F, 0xE6, 0x1F)
    z.store(PAD)
    emit(0xE6, 0x10)
    branch(0x28, "action_released")
    z.read(ACTION)
    emit(0xB7)
    branch(0x20, "directions")
    z.write(ACTION, 1)
    go(0xCD, "phase")
    branch(0x18, "directions")
    label("action_released")
    z.store(ACTION)
    label("directions")
    z.read(PAD)
    emit(0xE6, 15, 0x47)
    z.read(PREV)
    emit(0xB8)
    branch(0x20, "new_direction")
    z.read(DELAY)
    emit(0xB7)
    branch(0x28, "move")
    emit(0x3D)
    z.store(DELAY)
    go(0xC3, "frame")
    label("new_direction")
    emit(0x78)
    z.store(PREV)
    label("move")
    z.write(DELAY, 3)
    z.read(PREV)
    emit(0xB7)
    go(0xCA, "frame")
    go(0xCD, "player_coords")
    for name, bit, op, address in [
        ("right", 8, 0x3C, CX),
        ("left", 4, 0x3D, CX),
        ("down", 2, 0x3C, CY),
        ("up", 1, 0x3D, CY),
    ]:
        z.read(PREV)
        emit(0xE6, bit)
        branch(0x28, name)
        z.read(address)
        emit(op)
        z.store(address)
        branch(0x18, "validate")
        label(name)

    label("validate")
    go(0xCD, "get")
    for value in (1, 3, 4):
        emit(0xFE, value)
        go(0xCA, "frame")
    emit(0xF5)
    z.read(CX)
    emit(0xF5)
    z.read(CY)
    emit(0xF5)
    go(0xCD, "player_coords")
    go(0xCD, "get")
    go(0xCD, "draw")
    emit(0xF1)
    z.store(GY)
    emit(0xF1)
    z.store(GX)
    emit(0xF1, 0xFE, 5)
    branch(0x28, "collect")
    emit(0xFE, 9)
    go(0xCA, "win")
    go(0xCD, "player")
    go(0xC3, "frame")

    label("collect")
    go(0xCD, "player_coords")
    z.load(0)
    go(0xCD, "set")
    z.read(SHARDS)
    emit(0x3C)
    z.store(SHARDS)
    emit(0xFE, 2)
    branch(0x28, "second_shard")
    z.coords(23, 19)
    branch(0x18, "meter")
    label("second_shard")
    z.coords(22, 8)
    z.load(9)
    go(0xCD, "set")
    z.coords(24, 19)
    label("meter")
    z.load(11)
    go(0xCD, "set")
    go(0xCD, "player")
    go(0xC3, "frame")

    label("win")
    z.write(WON, 1)
    go(0xCD, "player")
    for x, tile in enumerate(text_tiles("VAULT OPEN      "), 7):
        z.coords(x, 19)
        z.load(tile)
        go(0xCD, "draw")
    go(0xC3, "frame")

    label("phase")
    z.read(PHASE)
    emit(0xEE, 1)
    z.store(PHASE)
    branch(0x28, "phase_amber")
    z.coords(12, 10)
    z.load(7)
    go(0xCD, "set")
    z.coords(18, 13)
    z.load(4)
    branch(0x18, "phase_end")
    label("phase_amber")
    z.coords(12, 10)
    z.load(3)
    go(0xCD, "set")
    z.coords(18, 13)
    z.load(8)
    label("phase_end")
    go(0xCD, "set")
    go(0xC3, "player")

    label("player_coords")
    z.read(GX)
    z.store(CX)
    z.read(GY)
    z.store(CY)
    emit(0xC9)
    label("player")
    go(0xCD, "player_coords")
    z.load(2)
    go(0xC3, "draw")

    label("offset")
    z.read(CY)
    emit(0x6F, 0x26, 0, 0x29, 0x29, 0x29, 0x29, 0x29)
    z.read(CX)
    emit(0x5F, 0x16, 0, 0x19, 0xC9)
    label("ram_offset")
    go(0xCD, "offset")
    z.word(0x11, RAM_ROOM)
    emit(0x19, 0xC9)
    label("get")
    go(0xCD, "ram_offset")
    emit(0x7E, 0xC9)
    label("set")
    emit(0x47)
    go(0xCD, "ram_offset")
    emit(0x70, 0x78)
    label("draw")
    emit(0x47)
    go(0xCD, "offset")
    emit(0x29, 0x7D, 0xD3, 0xBF, 0x7C, 0xF6, 0x78, 0xD3, 0xBF)
    emit(0x78, 0xD3, 0xBE, 0xAF, 0xD3, 0xBE, 0xC9)
    label("vblank")
    emit(0xDB, 0xBF, 0xE6, 0x80)
    branch(0x28, "vblank")
    emit(0xC9)
    label("registers")
    emit(0x04, 0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0, 0, 0, 0xFF)

    return cartridge_image(z, patterns, cells, palette)


def check_cartridge(cart):
    if (
        len(cart) != 32768
        or cart[0x7FF0:0x7FF8] != b"TMR SEGA"
        or cart[0x7FFF] not in (0x5C, 0x6C, 0x7C)
    ):
        raise ValueError("Expected a 32 KiB Game Gear ROM with a TMR SEGA header")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--sdk", type=Path, help="extracted Sinjisoft SDK 2.12 tools")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--cart", type=Path, help="optional 32 KiB Game Gear test cartridge"
    )
    mode.add_argument(
        "--rom-only",
        action="store_true",
        help="write the original standalone cartridge",
    )
    parser.add_argument(
        "--signal-breaker", action="store_true", help="build Signal Breaker"
    )
    args = parser.parse_args()
    if args.signal_breaker and args.cart:
        parser.error("--signal-breaker uses its original cartridge")
    if args.cart:
        cart = args.cart.read_bytes()
    elif args.signal_breaker:
        cart = breaker_cartridge()
    else:
        cart = demo_cartridge()
    check_cartridge(cart)
    if args.rom_only:
        args.output.write_bytes(cart)
    else:
        if not args.sdk:
            parser.error("--sdk is required for SGS output")
        if args.signal_breaker:
            filename = "BREAKER.GGR"
            with TemporaryDirectory(prefix="reunion-breaker-") as directory:
                variant = Path(directory) / SOURCE.name
                variant.write_text(
                    "#define REUNION_BREAKER_INPUT 1\n"
                    + SOURCE.read_text(encoding="ascii")
                    .replace("#DEFINE APPID 995", "#DEFINE APPID 1002")
                    .replace('"Prism Vault"', '"Signal Breaker"')
                    .replace('"VAULT.GGR"', f'"{filename}"')
                    .replace("PRISM VAULT / LOADING", "SIGNAL BREAKER / LOADING"),
                    encoding="ascii",
                )
                sgs = build_sgs(args.sdk, variant)
        else:
            filename = "VAULT.GGR"
            sgs = build_sgs(args.sdk, SOURCE)
        args.output.write_bytes(encode_kpex(pack_vfs(sgs, {filename: cart})))


if __name__ == "__main__":
    main()
