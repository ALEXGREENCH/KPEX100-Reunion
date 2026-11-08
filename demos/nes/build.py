"""Build Reunion's NES NROM SGS demos."""

import argparse
from pathlib import Path
from string import Template
from struct import pack
import sys
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sgs_build import build_sgs, encode_kpex, pack_vfs  # noqa: E402


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "nrom.mc.in"
AUDIO = HERE / "pulse-audio.mc"
NAME = b"NES\x1a"
MAP = 0x8800
PALETTE = 0x8C00
BEACONS = [(9, 15), (16, 15), (22, 15)]

# Glyphs are encoded as five-bit rows. The cartridge uses them as CHR tiles.
FONT = {
    "A": (14, 17, 17, 31, 17, 17, 17),
    "B": (30, 17, 17, 30, 17, 17, 30),
    "C": (14, 17, 16, 16, 16, 17, 14),
    "D": (30, 17, 17, 17, 17, 17, 30),
    "E": (31, 16, 16, 30, 16, 16, 31),
    "F": (31, 16, 16, 30, 16, 16, 16),
    "G": (14, 17, 16, 23, 17, 17, 15),
    "H": (17, 17, 17, 31, 17, 17, 17),
    "I": (14, 4, 4, 4, 4, 4, 14),
    "K": (17, 18, 20, 24, 20, 18, 17),
    "L": (16, 16, 16, 16, 16, 16, 31),
    "M": (17, 27, 21, 21, 17, 17, 17),
    "N": (17, 25, 25, 21, 19, 19, 17),
    "O": (14, 17, 17, 17, 17, 17, 14),
    "P": (30, 17, 17, 30, 16, 16, 16),
    "R": (30, 17, 17, 30, 20, 18, 17),
    "S": (15, 16, 16, 14, 1, 1, 30),
    "T": (31, 4, 4, 4, 4, 4, 4),
    "U": (17, 17, 17, 17, 17, 17, 14),
    "V": (17, 17, 17, 17, 17, 10, 4),
    "X": (17, 17, 10, 4, 10, 17, 17),
}
GLYPHS = {letter: index + 8 for index, letter in enumerate(FONT)}


def text_tiles(message):
    return bytes(GLYPHS.get(letter, 0) for letter in message)


def write_text(nametable, x, y, message):
    start = y * 32 + x
    data = text_tiles(message)
    nametable[start : start + len(data)] = data


def art():
    patterns = bytearray(8192)
    tiles = [
        ["00000000"] * 8,
        [
            "01111110",
            "12111121",
            "11221111",
            "11122111",
            "11112211",
            "11111221",
            "12111121",
            "01111110",
        ],
        [
            "00000000",
            "00000000",
            "00001000",
            "00000000",
            "00000000",
            "00000000",
            "00000000",
            "00000000",
        ],
        [
            "00033000",
            "00033000",
            "00322300",
            "00311300",
            "03311330",
            "03111130",
            "03011030",
            "00022000",
        ],
        [
            "00011000",
            "00100100",
            "01022010",
            "10233201",
            "10233201",
            "01022010",
            "00100100",
            "00011000",
        ],
        [
            "22222222",
            "20000002",
            "20000002",
            "20000002",
            "20000002",
            "20000002",
            "20000002",
            "22222222",
        ],
        [
            "00000000",
            "00011000",
            "00122100",
            "01233210",
            "01233210",
            "00122100",
            "00011000",
            "00000000",
        ],
        [
            "00000000",
            "00000000",
            "00000000",
            "11111111",
            "00000000",
            "00000000",
            "00000000",
            "00000000",
        ],
    ]
    for index, rows in enumerate(tiles):
        for y, row in enumerate(rows):
            for plane in range(2):
                patterns[index * 16 + plane * 8 + y] = sum(
                    ((int(pixel) >> plane) & 1) << (7 - x)
                    for x, pixel in enumerate(row)
                )
    for letter, rows in FONT.items():
        offset = GLYPHS[letter] * 16 + 8
        patterns[offset : offset + 7] = bytes(row << 2 for row in rows)
    nametable = bytearray(1024)
    write_text(nametable, 4, 5, "ORBITAL COURIER")
    write_text(nametable, 4, 23, "LINK THE BEACONS")
    write_text(nametable, 4, 24, "A RESTART")
    for x in range(3, 29):
        nametable[6 * 32 + x] = nametable[22 * 32 + x] = 7
    for y in range(7, 22):
        for x in range(3, 29):
            solid = (
                x in (3, 28)
                or y in (7, 21)
                or (x == 13 and 8 <= y <= 16 and y != 12)
                or (x == 19 and 13 <= y <= 20 and y != 18)
                or (x, y) in {(7, 10), (8, 10), (10, 18), (16, 10), (24, 9), (25, 19)}
            )
            nametable[y * 32 + x] = (
                1 if solid else 2 if (x * 19 + y * 71) % 31 < 3 else 0
            )
    for x, y in BEACONS:
        nametable[y * 32 + x] = 4
    for x in (23, 25, 27):
        nametable[23 * 32 + x] = 5
    # Attribute table. Give the debris belts their own palettes.
    for y in range(30):
        for x in range(32):
            palette = 0
            if 8 <= y < 22 and 12 <= x < 16:
                palette = 1
            elif 12 <= y < 22 and 18 <= x < 20:
                palette = 2
            elif y >= 22:
                palette = 3
            offset = 960 + (y // 4) * 8 + x // 4
            shift = ((y & 2) * 2) + (x & 2)
            nametable[offset] |= palette << shift
    return patterns, nametable


def demo_cartridge():
    prg = bytearray(16384)
    code = bytearray()
    labels = {}
    patches = []
    x, y, old_x, old_y, pad, previous, lo, hi, remaining, linked = range(10)

    def emit(*values):
        code.extend(values)

    def label(name):
        assert name not in labels
        labels[name] = 0x8000 + len(code)

    def jump(op, name):
        emit(op, 0, 0)
        patches.append((len(code) - 2, name, False))

    def branch(op, name):
        emit(op, 0)
        patches.append((len(code) - 1, name, True))

    def address(addr):
        emit(
            0xAD,
            2,
            0x20,
            0xA9,
            addr >> 8,
            0x8D,
            6,
            0x20,
            0xA9,
            addr & 255,
            0x8D,
            6,
            0x20,
        )

    label("reset")
    emit(
        0x78,
        0xD8,
        0xA2,
        0xFF,
        0x9A,
        0xA9,
        0,
        0x8D,
        0,
        0x20,
        0x8D,
        1,
        0x20,
        0x8D,
        0x10,
        0x40,
    )
    emit(0x85, linked, 0x85, previous, 0x85, remaining)
    for name in ("warmup", "warm"):
        label(name)
        emit(0xAD, 2, 0x20)
        branch(0x10, name)
    emit(0xA2, 0, 0xA9, 0xFF)
    label("hide_sprites")
    emit(0x9D, 0, 2, 0xE8)
    branch(0xD0, "hide_sprites")
    emit(0xA9, 0, 0x8D, 3, 0x20, 0xA9, 2, 0x8D, 0x14, 0x40)

    address(0x3F00)
    emit(0xA2, 0)
    label("palettes")
    emit(0xBD, PALETTE & 255, PALETTE >> 8, 0x8D, 7, 0x20, 0xE8, 0xE0, 32)
    branch(0xD0, "palettes")
    address(0x2000)
    emit(0xA9, MAP & 255, 0x85, lo, 0xA9, MAP >> 8, 0x85, hi, 0xA2, 4, 0xA0, 0)
    label("nametable")
    emit(0xB1, lo, 0x8D, 7, 0x20, 0xC8)
    branch(0xD0, "nametable")
    emit(0xE6, hi, 0xCA)
    branch(0xD0, "nametable")
    emit(0xA9, 6, 0x85, x, 0xA9, 15, 0x85, y)
    jump(0x20, "sprite")
    jump(0x20, "scroll")
    emit(0xA9, 0x1E, 0x8D, 1, 0x20)

    label("wait")
    emit(0xAD, 2, 0x20)
    branch(0x10, "wait")
    jump(0x20, "controller")
    emit(0xA5, pad, 0xC5, previous)
    branch(0xD0, "fresh")
    emit(0xA5, remaining)
    branch(0xF0, "move")
    emit(0xC6, remaining)
    jump(0x4C, "wait")
    label("fresh")
    emit(0x85, previous)
    label("move")
    emit(0xA9, 3, 0x85, remaining, 0xA5, pad, 0x29, 1)
    branch(0xF0, "dirs")
    jump(0x4C, "reset")
    label("dirs")
    emit(0xA5, linked, 0xC9, 3)
    branch(0xD0, "active")
    jump(0x4C, "wait")
    label("active")
    emit(0xA5, pad, 0x29, 0xF0)
    branch(0xF0, "wait")
    emit(0xA5, x, 0x85, old_x, 0xA5, y, 0x85, old_y)
    for name, bit, op, coordinate in (
        ("right", 0x80, 0xE6, x),
        ("left", 0x40, 0xC6, x),
        ("down", 0x20, 0xE6, y),
        ("up", 0x10, 0xC6, y),
    ):
        emit(0xA5, pad, 0x29, bit)
        branch(0xF0, name)
        emit(op, coordinate)
        jump(0x4C, "validate")
        label(name)
    label("validate")
    # Form a pointer into the ROM copy of the tile map for collision detection.
    emit(0xA5, y, 0x4A, 0x4A, 0x4A, 0x18, 0x69, MAP >> 8, 0x85, hi)
    emit(0xA5, y, 0x29, 7, 0x0A, 0x0A, 0x0A, 0x0A, 0x0A, 0x05, x, 0x85, lo)
    emit(0xA0, 0, 0xB1, lo, 0xC9, 1)
    branch(0xD0, "advance")
    emit(0xA5, old_x, 0x85, x, 0xA5, old_y, 0x85, y)
    jump(0x4C, "wait")
    label("advance")
    jump(0x20, "sprite")
    emit(0xA6, linked, 0xA5, x)
    jump(0xDD, "beacon_x")
    branch(0xD0, "done")
    emit(0xA5, y)
    jump(0xDD, "beacon_y")
    branch(0xD0, "done")
    emit(0xAD, 2, 0x20, 0xA5, hi, 0x38, 0xE9, (MAP >> 8) - 0x20, 0x8D, 6, 0x20)
    emit(0xA5, lo, 0x8D, 6, 0x20, 0xA9, 6, 0x8D, 7, 0x20)
    emit(0xA9, 0x22, 0x8D, 6, 0x20)
    jump(0xBD, "indicator")
    emit(0x8D, 6, 0x20, 0xA9, 6, 0x8D, 7, 0x20, 0xE6, linked, 0xA5, linked, 0xC9, 3)
    branch(0xD0, "restore_scroll")
    address(0x22E4)
    emit(0xA2, 0)
    label("win")
    jump(0xBD, "message")
    emit(0x8D, 7, 0x20, 0xE8, 0xE0, 18)
    branch(0xD0, "win")
    label("restore_scroll")
    jump(0x20, "scroll")
    label("done")
    jump(0x4C, "wait")

    label("sprite")
    emit(
        0xA9, 0, 0x8D, 3, 0x20, 0xA5, y, 0x0A, 0x0A, 0x0A, 0x38, 0xE9, 1, 0x8D, 4, 0x20
    )
    emit(
        0xA9,
        3,
        0x8D,
        4,
        0x20,
        0xA9,
        0,
        0x8D,
        4,
        0x20,
        0xA5,
        x,
        0x0A,
        0x0A,
        0x0A,
        0x8D,
        4,
        0x20,
        0x60,
    )
    label("controller")
    emit(0xA9, 1, 0x8D, 0x16, 0x40, 0xA9, 0, 0x8D, 0x16, 0x40, 0x85, pad, 0xA2, 8)
    label("bits")
    emit(0xAD, 0x16, 0x40, 0x4A, 0xA5, pad, 0x6A, 0x85, pad, 0xCA)
    branch(0xD0, "bits")
    emit(0x60)
    label("scroll")
    emit(0xAD, 2, 0x20, 0xA9, 0, 0x8D, 5, 0x20, 0x8D, 5, 0x20, 0x60)
    label("beacon_x")
    emit(*(x for x, _ in BEACONS))
    label("beacon_y")
    emit(*(y for _, y in BEACONS))
    label("indicator")
    emit(0xF7, 0xF9, 0xFB)
    label("message")
    emit(*text_tiles("MISSION COMPLETE  "))

    for offset, name, relative in patches:
        target = labels[name]
        if relative:
            delta = target - (0x8000 + offset + 1)
            assert -128 <= delta <= 127, (name, delta)
            code[offset] = delta & 255
        else:
            code[offset : offset + 2] = pack("<H", target)

    chr_rom, names = art()
    assert len(code) < MAP - 0x8000
    prg[: len(code)] = code
    prg[MAP - 0x8000 : PALETTE - 0x8000] = names
    palette = [
        0x0F,
        0x12,
        0x31,
        0x20,
        0x0F,
        0x15,
        0x35,
        0x20,
        0x0F,
        0x1C,
        0x2B,
        0x20,
        0x0F,
        0x17,
        0x37,
        0x2A,
        0x0F,
        0x1C,
        0x2A,
        0x30,
        0x0F,
        0x12,
        0x31,
        0x20,
        0x0F,
        0x15,
        0x35,
        0x20,
        0x0F,
        0x17,
        0x37,
        0x20,
    ]
    prg[PALETTE - 0x8000 : PALETTE - 0x8000 + 32] = bytes(palette)
    prg[-6:] = pack("<HHH", labels["reset"], labels["reset"], labels["reset"])
    return NAME + bytes([1, 1] + [0] * 10) + prg + chr_rom


def check_cartridge(rom):
    if (
        len(rom) < 16
        or rom[:4] != NAME
        or rom[4] not in (1, 2)
        or rom[5] != 1
        or rom[6] & 0xFE
        or rom[7]
        or len(rom) != 16 + rom[4] * 16384 + 8192
    ):
        raise ValueError(
            "Expected an iNES mapper-0 cartridge with CHR-ROM and no trainer"
        )


CONTAINERS = {
    "orbital-courier": ("Orbital Courier", 993, "ORBITAL.NES", (3, 5, 26, 20, 8)),
    "neon-ranger": ("Neon Ranger", 996, "NEON.NES", (0, 2, 32, 28, 6)),
    "lan-master": ("Lan Master", 997, "LAN.NES", (0, 2, 32, 28, 6)),
    "chase": ("Chase", 1003, "CHASE.NES", (0, 2, 32, 28, 6)),
}


CC65_CPU = {
    "extra_cpu_helpers": """int IndirectY() {
    int addr;
    addr = Fetch();
    return (ram[addr] + (ram[(addr + 1) & 255] << 8) + y) & 65535;
}

""",
    "extra_cpu_cases": """        case 17: a |= CpuRead(IndirectY()); nz = a; break;
        case 38:
            addr = Fetch(); value = ram[addr];
            nz = ((value << 1) | carry) & 255;
            carry = value >> 7;
            ram[addr] = nz;
            break;
        case 49: a &= CpuRead(IndirectY()); nz = a; break;
        case 57: addr = Word(); a &= CpuRead((addr + y) & 65535); nz = a; break;
        case 70:
            addr = Fetch(); value = ram[addr];
            carry = value & 1;
            nz = value >> 1;
            ram[addr] = nz;
            break;
        case 89: addr = Word(); a ^= CpuRead((addr + y) & 65535); nz = a; break;
        case 113: Add(CpuRead(IndirectY())); break;
        case 145: addr = IndirectY(); CpuWrite(addr, a); break;
        case 209: Compare(a, CpuRead(IndirectY())); break;
        case 229: Add(ram[Fetch()] ^ 255); break;
        case 237: Add(CpuRead(Word()) ^ 255); break;
""",
    "extra_cpu_wait": """
                // neslib's NTSC compensation waits for the next frame at count 5.
                if (pc == destination && CpuRead(destination) == 165 && CpuRead(destination + 1) == 2 &&
                    CpuRead(destination + 2) == 201 && CpuRead(destination + 3) == 5) guestYield = 1;""",
}


PAINT_DEFAULT = {
    "extra_paint_state": "",
    "extra_paint_helpers": "",
    "extra_cell_locals": "",
    "cell_key": "    key = (paletteEpoch << 13) | ((ctrl & 16) << 8) | (pal << 8) | tile;",
    "cell_compare": """    if (!force && seen[cell] == key) return 0;
    seen[cell] = key;""",
    "sprite_changes": "mode != lastSpriteMode",
    "extra_sprite_update": "",
}


# Chase switches between CHR halves and changes one palette entry on its title.
# Compare the visible pattern and colors before drawing an unchanged cell.
CHASE_PAINT = {
    "extra_paint_state": "\nint seenColors[896], bankMatch[256], lastSpriteColors;",
    "extra_paint_helpers": """int BackgroundPattern(int tile) {
    int addr, i;
    if (!(ctrl & 16)) return tile;
    if (!bankMatch[tile]) {
        addr = chrStart + tile * 16;
        for (i = 0; i < 16; i++) if (ROM(addr + i) != ROM(addr + 4096 + i)) break;
        bankMatch[tile] = (i == 16) + 1;
    }
    if (bankMatch[tile] == 2) return tile;
    return tile + 256;
}

""",
    "extra_cell_locals": "\n    int colors, index;",
    "cell_key": """    key = BackgroundPattern(tile);
    index = SolidPattern(key * 16);
    if (index == 0) { key = -2; colors = palettes[0]; }
    else if (index > 0) { key = -2; colors = palettes[pal + index]; }
    else colors = palettes[0] | (palettes[pal + 1] << 6) |
                  (palettes[pal + 2] << 12) | (palettes[pal + 3] << 18);""",
    "cell_compare": """    if (!force && seen[cell] == key && seenColors[cell] == colors) return 0;
    seen[cell] = key;
    seenColors[cell] = colors;""",
    "sprite_changes": "(mode != lastSpriteMode || paletteEpoch != lastSpriteColors)",
    "extra_sprite_update": "\n    lastSpriteColors = paletteEpoch;",
}


PAD_DEFAULT = {
    "pad_state": "",
    "pad_strobe": """        if (strobe || (value & 1)) shift = buttons;
        strobe = value & 1;""",
    "pad_helper": "",
    "timeout_vars": "    int i, held, limit;",
    "pad_sample": """    held = GetKeyState();
    buttons = pending;
    if (held & (1 << 10)) buttons |= 2;
    if (held & (1 << 11)) buttons |= 4;
    for (i = 16; i <= 21; i++) if (held & (1 << i)) buttons |= Key(i);
    pending = 0;""",
    "pad_keypress": "    pending |= Key(swData);",
}


# Shiru's padPoll validates three serial reports. Replay a released tap
# for the entire group, then use the current held mask on the next poll.
PAD_TRIPLE_REPORT = {
    "pad_state": "\nint edgeHeld, padPulse, padReport;",
    "pad_strobe": """        if (strobe && !(value & 1)) {
            if (padReport == 0) {
                padPulse = pending;
                pending = 0;
            }
            shift = buttons | padPulse;
            padReport++;
            if (padReport == 3) {
                padReport = 0;
                padPulse = 0;
            }
        }
        strobe = value & 1;""",
    "pad_helper": """int PhysicalButtons() {
    int i, held, mask;
    held = GetKeyState();
    mask = 0;
    if (held & (1 << 10)) mask |= 2;
    if (held & (1 << 11)) mask |= 4;
    for (i = 16; i <= 21; i++) if (held & (1 << i)) mask |= Key(i);
    return mask;
}
""",
    "timeout_vars": "    int i, limit;",
    "pad_sample": "    buttons = edgeHeld;",
    "pad_keypress": """    int key, remaining;
    if (!painted) return;
    if (swData == 255) {
        remaining = edgeHeld & PhysicalButtons();
        // Kingston can report the old bitmap on the unnamed release event.
        if (remaining == edgeHeld) remaining = 0;
        edgeHeld = remaining;
        return;
    }
    key = Key(swData);
    if (!(edgeHeld & key)) pending |= key;
    edgeHeld |= key;""",
}


def build_container(sdk, cart, profile, plain=False):
    title, app_id, filename, viewport = CONTAINERS[profile]
    col, row, cols, rows, size = viewport
    # Shiru's boards use one-pixel tile edges. Center sampling keeps both
    # edges visible at six pixels per tile.
    center = profile in ("lan-master", "chase")
    script = Template(SOURCE.read_text(encoding="ascii")).substitute(
        **(PAD_TRIPLE_REPORT if center else PAD_DEFAULT),
        **(CHASE_PAINT if profile == "chase" else PAINT_DEFAULT),
        **(CC65_CPU if profile == "chase" else dict.fromkeys(CC65_CPU, "")),
        audio_code=("\n" + AUDIO.read_text(encoding="ascii") if center else ""),
        apu_write=(
            """    if (addr >= 16384) {
        if (addr < 16392) apuPulse[addr - 16384] = value;
        else if (addr == 16405) apuEnable = value;
        return;
    }"""
            if center
            else "    if (addr >= 16384) return;"
        ),
        audio_tick="\n    AudioTick();" if center else "",
        title=title,
        app_id=app_id,
        loading=f"{title.upper()} / LOADING",
        cart_name=filename,
        view_col=col,
        view_row=row,
        view_cols=cols,
        view_rows=rows,
        tile_size=size,
        guest_limit=(
            "    limit = 1024;"
            if profile == "chase"
            else "    limit = 512;\n    if (!(mask & 24)) limit = 768;"
        ),
        sample_scan=(
            "if (tileSize == 6) scan += (row >= 1) + (row >= 4);"
            if center
            else "if (tileSize == 6 && row >= 3) scan++;"
        ),
        sample_bit=(
            "if (tileSize == 6) bit += (px >= 1) + (px >= 4);"
            if center
            else "if (tileSize == 6 && px >= 3) bit++;"
        ),
    )
    with TemporaryDirectory(prefix="reunion-nes-") as directory:
        source = Path(directory) / "nrom.mc"
        source.write_text(script, encoding="ascii")
        packaged = pack_vfs(build_sgs(sdk, source), {filename: cart})
    return packaged if plain else encode_kpex(packaged)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sdk", type=Path, help="extracted Sinjisoft SDK 2.12 tools")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--plain", action="store_true", help="omit the K-PEX encoding")
    variant = parser.add_mutually_exclusive_group()
    variant.add_argument(
        "--neon-ranger", dest="profile", action="store_const", const="neon-ranger"
    )
    variant.add_argument(
        "--lan-master", dest="profile", action="store_const", const="lan-master"
    )
    variant.add_argument("--chase", dest="profile", action="store_const", const="chase")
    parser.set_defaults(profile="orbital-courier")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--cart", type=Path, help="optional iNES mapper-0 test cartridge")
    mode.add_argument(
        "--rom-only", action="store_true", help="write the original NES cartridge"
    )
    args = parser.parse_args()
    if args.cart:
        rom = args.cart.read_bytes()
    elif args.profile == "orbital-courier":
        rom = demo_cartridge()
    else:
        rom = (HERE / args.profile / CONTAINERS[args.profile][2]).read_bytes()
    check_cartridge(rom)
    if args.rom_only:
        args.output.write_bytes(rom)
    else:
        if not args.sdk:
            parser.error("--sdk is required to build an SGS")
        args.output.write_bytes(
            build_container(args.sdk, rom, args.profile, args.plain)
        )


if __name__ == "__main__":
    main()
