"""Build Signal Breaker, an original Game Gear paddle game."""

from struct import pack

from cart import COLORS, CX, CY, FONT, NAME_LENGTH, PATTERNS, RAM_ROOM, ROOM, Code
from cart import cartridge_image


PADDLE, STATE = 0xD000, 0xD001
BX, BY, NX, NY, DX, DY, INPUT, MOVE_DELAY, BALL_DELAY, LIVES, HITS = range(
    0xD004, 0xD00F
)
LEFT, RIGHT = 7, 24
TOP, FLOOR = 6, 18
BRICKS = [(9, 7), (12, 7), (18, 7), (22, 7), (11, 8), (15, 8), (19, 8), (23, 8)]
FINISH_TEXT = ROOM + NAME_LENGTH

GLYPHS = {
    **FONT,
    "B": (30, 17, 17, 30, 17, 17, 30),
    "K": (17, 18, 20, 24, 20, 18, 17),
    "Y": (17, 17, 10, 4, 4, 4, 4),
}
CHAR = {letter: i + 16 for i, letter in enumerate(GLYPHS)}


def words(text):
    return bytes(CHAR[letter] if letter != " " else 0 for letter in text)


def graphics():
    tiles = [
        ["00000000"] * 8,
        ["11001100", "22112211"] * 4,
        [
            "00000000",
            "00000000",
            "00333333",
            "03444444",
            "03455555",
            "00333333",
            "00000000",
            "00000000",
        ],
        [
            "00000000",
            "00000000",
            "33333333",
            "44444444",
            "55555555",
            "33333333",
            "00000000",
            "00000000",
        ],
        [
            "00000000",
            "00000000",
            "33333300",
            "44444430",
            "55555430",
            "33333300",
            "00000000",
            "00000000",
        ],
        [
            "00000000",
            "00066000",
            "00677600",
            "06788760",
            "06788760",
            "00677600",
            "00066000",
            "00000000",
        ],
        [
            "00000000",
            "09999990",
            "09aaaa90",
            "09abba90",
            "09abba90",
            "09aaaa90",
            "09999990",
            "00000000",
        ],
        [
            "00000000",
            "0aaaaaa0",
            "0abbbba0",
            "0abccba0",
            "0abccba0",
            "0abbbba0",
            "0aaaaaa0",
            "00000000",
        ],
        [
            "00000000",
            "0dddddd0",
            "0deeeed0",
            "0deffed0",
            "0deffed0",
            "0deeeed0",
            "0dddddd0",
            "00000000",
        ],
        [
            "00000000",
            "00033000",
            "00355300",
            "03555530",
            "03555530",
            "00355300",
            "00033000",
            "00000000",
        ],
        [
            "00000000",
            "00011000",
            "00100100",
            "01000010",
            "01000010",
            "00100100",
            "00011000",
            "00000000",
        ],
        [
            "00000000",
            "00066000",
            "00677600",
            "06788760",
            "06788760",
            "00677600",
            "00066000",
            "00000000",
        ],
    ]
    tiles += [["00000000"] * 8] * (16 - len(tiles))
    for glyph in GLYPHS.values():
        tiles.append(
            [
                "0"
                + "".join("8" if row & (16 >> bit) else "0" for bit in range(5))
                + "00"
                for row in glyph
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
    cells[3 * 32 + 7 : 3 * 32 + 21] = words("SIGNAL BREAKER")
    cells[3 * 32 + 22 : 3 * 32 + 25] = bytes([9] * 3)
    for x in range(6, 26):
        cells[5 * 32 + x] = 1
    for y in range(6, 19):
        cells[y * 32 + 6] = cells[y * 32 + 25] = 1
    for i, (x, y) in enumerate(BRICKS):
        cells[y * 32 + x] = 6 + i % 3
    cells[19 * 32 + 7 : 19 * 32 + 15] = bytes([10] * len(BRICKS))
    cells[20 * 32 + 7 : 20 * 32 + 21] = words("1 SERVE / PLAY")
    for text in ("ALL NODES CLEAR", "OUT OF SIGNAL"):
        for tile in words(text.ljust(18)):
            cells.extend((tile, 0))
    palette = [
        0x211,
        0x432,
        0x653,
        0x974,
        0xBA6,
        0xEE9,
        0x47D,
        0x9CF,
        0xFFF,
        0x274,
        0x397,
        0x6FC,
        0xBFF,
        0x746,
        0xB6A,
        0xEAC,
    ]
    return patterns, cells, pack("<32H", *(palette * 2))


def breaker_cartridge():
    patterns, cells, palette = graphics()
    z = Code()
    emit, label, go = z.emit, z.label, z.to

    label("reset")
    emit(0xF3)
    z.word(0x31, 0xDFF0)
    z.port(0x06, 0xFF)
    z.vdp(0x8100)
    go(0xCD, "vblank")
    go(0xCD, "vblank")
    go(0x21, "registers")
    emit(0x06, 11, 0x0E, 0x80)
    label("init_vdp")
    emit(0x7E, 0xD3, 0xBF, 0x79, 0xD3, 0xBF, 0x23, 0x0C)
    z.relative(0x10, "init_vdp")
    z.vdp(0xC000)
    z.send(COLORS, len(palette), "palette")
    z.vdp(0x4000)
    z.send(PATTERNS, len(patterns), "patterns")
    z.vdp(0x7F00)
    z.port(0xBE, 0xD0)
    z.vdp(0x7800)
    z.word(0x21, ROOM)
    z.word(0x11, RAM_ROOM)
    z.word(0x01, NAME_LENGTH)
    label("copy_map")
    emit(0x7E, 0x12, 0xD3, 0xBE, 0xAF, 0xD3, 0xBE, 0x23, 0x13, 0x0B, 0x78, 0xB1)
    z.relative(0x20, "copy_map")
    for address, value in (
        (PADDLE, 15),
        (STATE, 0),
        (MOVE_DELAY, 0),
        (LIVES, 3),
        (HITS, 0),
    ):
        z.write(address, value)
    go(0xCD, "paddle")
    go(0xCD, "home")
    go(0xCD, "vblank")
    z.vdp(0x8140)

    label("frame")
    go(0xCD, "vblank")
    emit(0xDB, 0x00, 0xE6, 0x80)  # Game Gear Start is active low.
    go(0xCA, "reset")
    z.read(STATE)
    for state in (2, 3):
        emit(0xFE, state)
        go(0xCA, "frame")
    emit(0xDB, 0xDC, 0x2F)
    z.store(INPUT)
    z.read(MOVE_DELAY)
    emit(0xB7)
    go(0xCA, "controls")
    emit(0x3D)
    z.store(MOVE_DELAY)
    go(0xC3, "serve")
    label("controls")
    z.read(INPUT)
    emit(0xE6, 4)
    go(0xCA, "right_input")
    z.read(PADDLE)
    emit(0xFE, LEFT)
    go(0xCA, "serve")
    emit(0x3D)
    go(0xC3, "move_paddle")
    label("right_input")
    z.read(INPUT)
    emit(0xE6, 8)
    go(0xCA, "serve")
    z.read(PADDLE)
    emit(0xFE, RIGHT - 2)
    go(0xCA, "serve")
    emit(0x3C)
    label("move_paddle")
    emit(0xF5)
    go(0xCD, "erase_paddle")
    z.read(STATE)
    emit(0xB7)
    go(0xC2, "move_paddle_live")
    go(0xCD, "erase_ball")
    label("move_paddle_live")
    emit(0xF1)
    z.store(PADDLE)
    go(0xCD, "paddle")
    z.write(MOVE_DELAY, 2)
    z.read(STATE)
    emit(0xB7)
    go(0xC2, "serve")
    go(0xCD, "home")
    label("serve")
    z.read(STATE)
    emit(0xB7)
    go(0xC2, "in_flight")
    z.read(INPUT)
    emit(0xE6, 16)
    go(0xCA, "frame")
    z.write(STATE, 1)
    z.write(BALL_DELAY, 4)
    go(0xC3, "frame")
    label("in_flight")
    z.read(BALL_DELAY)
    emit(0x3D)
    z.store(BALL_DELAY)
    go(0xC2, "frame")
    z.write(BALL_DELAY, 6)
    go(0xCD, "erase_ball")
    go(0xCD, "next_x")
    z.store(NX)
    z.read(DY)
    emit(0xB7)
    go(0xC2, "downward")
    z.read(BY)
    emit(0xFE, TOP)
    go(0xCA, "top_bounce")
    emit(0x3D)
    z.store(NY)
    z.store(CY)
    z.read(NX)
    z.store(CX)
    go(0xCD, "get")
    for tile in (6, 7, 8):
        emit(0xFE, tile)
        go(0xCA, "hit_node")
    go(0xC3, "commit")
    label("top_bounce")
    z.write(DY, 1)
    label("downward")
    z.read(BY)
    emit(0x3C)
    z.store(NY)
    emit(0xFE, FLOOR)
    go(0xC2, "commit")
    z.read(NX)
    emit(0x47)
    z.read(PADDLE)
    emit(0xB8)
    go(0xCA, "left_bounce")
    emit(0x3C, 0xB8)
    go(0xCA, "paddle_bounce")
    emit(0x3C, 0xB8)
    go(0xC2, "miss")
    z.write(DX, 0)
    go(0xC3, "paddle_bounce")
    label("left_bounce")
    z.write(DX, 1)
    label("paddle_bounce")
    z.write(DY, 0)
    z.write(NY, FLOOR - 1)
    go(0xC3, "commit")

    label("hit_node")
    emit(0xAF)
    go(0xCD, "set")
    z.read(HITS)
    emit(*([0x3C] * 7))
    z.store(CX)
    z.write(CY, 19)
    z.load(11)
    go(0xCD, "draw")
    z.read(HITS)
    emit(0x3C)
    z.store(HITS)
    emit(0xFE, len(BRICKS))
    go(0xCA, "win")
    z.write(DY, 1)
    z.read(BY)
    z.store(NY)
    label("commit")
    z.read(NX)
    z.store(BX)
    z.read(NY)
    z.store(BY)
    go(0xCD, "ball")
    go(0xC3, "frame")

    label("miss")
    z.read(LIVES)
    emit(0x3D)
    z.store(LIVES)
    emit(*([0x3C] * 22))
    z.store(CX)
    z.write(CY, 3)
    z.load(10)
    go(0xCD, "draw")
    z.read(LIVES)
    emit(0xB7)
    go(0xCA, "lost")
    z.write(STATE, 0)
    go(0xCD, "home")
    go(0xC3, "frame")
    for label_name, state, message in (("win", 2, 0), ("lost", 3, 1)):
        label(label_name)
        z.write(STATE, state)
        z.vdp(0x7800 + 2 * (20 * 32 + 7))
        z.send(FINISH_TEXT + message * 36, 36, label_name + "_text")
        go(0xC3, "frame")

    label("next_x")
    z.read(DX)
    emit(0xB7)
    go(0xC2, "step_left")
    z.read(BX)
    emit(0xFE, RIGHT)
    go(0xCA, "turn_left")
    emit(0x3C, 0xC9)
    label("turn_left")
    z.write(DX, 1)
    z.load(RIGHT - 1)
    emit(0xC9)
    label("step_left")
    z.read(BX)
    emit(0xFE, LEFT)
    go(0xCA, "turn_right")
    emit(0x3D, 0xC9)
    label("turn_right")
    z.write(DX, 0)
    z.load(LEFT + 1)
    emit(0xC9)

    label("home")
    z.read(PADDLE)
    emit(0x3C)
    z.store(BX)
    z.write(BY, FLOOR - 1)
    z.write(DX, 0)
    z.write(DY, 0)
    label("ball")
    go(0xCD, "ball_coords")
    z.load(5)
    go(0xC3, "draw")
    label("erase_ball")
    go(0xCD, "ball_coords")
    go(0xCD, "get")
    go(0xC3, "draw")
    label("ball_coords")
    z.read(BX)
    z.store(CX)
    z.read(BY)
    z.store(CY)
    emit(0xC9)
    for routine, tiles in (("paddle", (2, 3, 4)), ("erase_paddle", (0, 0, 0))):
        label(routine)
        z.read(PADDLE)
        z.store(CX)
        z.write(CY, FLOOR)
        for i, tile in enumerate(tiles):
            if i:
                z.read(CX)
                emit(0x3C)
                z.store(CX)
            z.load(tile)
            go(0xCD, "draw")
        emit(0xC9)

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
    z.relative(0x28, "vblank")
    emit(0xC9)
    label("registers")
    emit(0x04, 0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0, 0, 0, 0xFF)
    return cartridge_image(z, patterns, cells, palette)
