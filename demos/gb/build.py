"""Build an original ROM-only DMG cartridge and its GNEX SGS test host."""

import argparse
from hashlib import sha256
from pathlib import Path
from struct import pack, unpack_from
from subprocess import run
from tempfile import TemporaryDirectory


HERE = Path(__file__).resolve().parent
COMPILER = "a02ffd612a4a242852f35a1fc0fc4bdf1911c0a07375a75955822ce5629f996f"
ASSEMBLER = "c9dd8612c392b0a1f9189b838b529157c1235f48e344e781fdb4c47ff3b5530a"


def demo_cartridge():
    rom = bytearray(32768)
    rom[0x100:0x104] = bytes.fromhex("00 c3 50 01")
    rom[0x134:0x13E] = b"POCKET LAB"
    code = bytearray()
    labels = {}
    branches = []

    def emit(*values):
        code.extend(values)

    def label(name):
        labels[name] = len(code)

    def branch(opcode, destination):
        emit(opcode, 0)
        branches.append((len(code) - 1, destination))

    def copy(destination, source, size, name):
        emit(0x21, destination & 255, destination >> 8)
        emit(0x11, source & 255, source >> 8, 1, size & 255, size >> 8)
        label(name)
        emit(0x1A, 0x22, 0x13, 0x0B, 0x78, 0xB1)
        branch(0x20, name)

    tile_count = 8
    copy(0x8000, 0x400, tile_count * 16, "tiles")
    copy(0x9800, 0x500, 32 * 18, "map")
    emit(0x3E, 0xE4, 0xE0, 0x47, 0x3E, 0x91, 0xE0, 0x40)
    emit(0x3E, 0x20, 0xE0, 0, 0x11, 9, 10)  # D=x, E=y.
    emit(0x21, 0x2A, 0x99, 0x36, 2)
    label("wait")
    emit(0xF0, 0, 0x2F, 0xE6, 15)
    branch(0x28, "wait")
    emit(0x36, 0)
    for direction, bit, read, edge, move in (
        ("right", 1, 0x7A, 15, 0x14),
        ("left", 2, 0x7A, 4, 0x15),
        ("up", 4, 0x7B, 5, 0x1D),
        ("down", 8, 0x7B, 13, 0x1C),
    ):
        emit(0xF0, 0, 0x2F, 0xE6, bit)
        branch(0x28, direction)
        emit(read, 0xFE, edge)
        branch(0x28, direction)
        emit(move)
        label(direction)
    emit(0x21, 0, 0x98, 1, 32, 0, 0x7B)
    label("row")
    emit(9, 0x3D)
    branch(0x20, "row")
    emit(1, 1, 0, 0x7A)
    label("column")
    emit(9, 0x3D)
    branch(0x20, "column")
    emit(0x36, 2)
    label("release")
    emit(0xF0, 0, 0x2F, 0xE6, 15)
    branch(0x20, "release")
    branch(0x18, "wait")
    for offset, name in branches:
        delta = labels[name] - (offset + 1)
        assert -128 <= delta < 128
        code[offset] = delta & 255
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
    for tile, rows in enumerate(tiles):
        for y, row in enumerate(rows):
            for plane in range(2):
                rom[0x400 + tile * 16 + y * 2 + plane] = sum(
                    ((int(pixel) >> plane) & 1) << (7 - x)
                    for x, pixel in enumerate(row)
                )
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


def pack_cart(sgs, cart):
    if len(cart) != 32768 or cart[0x147:0x149] != b"\0\0" or cart[0x143] & 128:
        raise ValueError("Expected a 32 KiB ROM-only monochrome cartridge")
    if sgs[0] != 4 or unpack_from("<I", sgs, 120)[0] != len(sgs):
        raise ValueError("Expected a plain SGS v4 build without appended files")
    name = b"cart.gb\0"
    entry_size = 12 + len(name)
    return (
        sgs
        + pack("<III", entry_size, 1, len(name))
        + name
        + pack("<II", len(sgs) + 8 + entry_size, len(cart))
        + cart
    )


def checked(path, digest):
    data = path.read_bytes()
    if sha256(data).hexdigest() != digest:
        raise ValueError(f"Unexpected SDK executable {path}")
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--sdk", type=Path, required=True, help="extracted Sinjisoft SDK 2.12 tools"
    )
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--cart", type=Path, help="optional 32 KiB test cartridge")
    args = parser.parse_args()
    sdk = args.sdk.resolve(strict=True)
    original = checked(sdk / "mcc_GNEX.exe", COMPILER)
    assembler = sdk / "MASM_GNEX.exe"
    checked(assembler, ASSEMBLER)
    with TemporaryDirectory(prefix="reunion-gb-") as directory:
        work = Path(directory)
        # The 2009 compiler exits after 31 January 2010. Keep the modification
        # confined to its temporary copy, leaving the host clock and SDK intact.
        assert unpack_from("<I", original, 0x100F)[0] == 2010
        compiler = work / "mcc_GNEX.exe"
        compiler.write_bytes(original[:0x100F] + pack("<I", 2099) + original[0x1013:])
        (work / "gb-reunion.mc").write_bytes((HERE / "gb-reunion.mc").read_bytes())
        run([compiler, "gb-reunion.mc"], cwd=work, check=False)
        if not (work / "gb-reunion.sal").is_file():
            raise RuntimeError("Mobile C did not emit gb-reunion.sal")
        run(
            [
                assembler,
                "-gvmswap",
                "-exe",
                "-optimize",
                "-o",
                "gb-reunion",
                "-l",
                "gb-reunion.sal",
            ],
            cwd=work,
            check=True,
        )
        cart = args.cart.read_bytes() if args.cart else demo_cartridge()
        args.output.write_bytes(pack_cart((work / "gb-reunion.sgs").read_bytes(), cart))


if __name__ == "__main__":
    main()
