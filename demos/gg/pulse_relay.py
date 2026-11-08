"""Build Pulse Relay, an original four-lane Game Gear timing game."""

from struct import pack

from cart import (
    COLORS,
    CX,
    CY,
    DIGITS,
    FONT,
    NAME_LENGTH,
    PATTERNS,
    RAM_ROOM,
    ROOM,
    Code,
)
from cart import cartridge_image


MODE, DECK = 0xD000, 0xD001
NOTE, ROW, LANE_X, NOTE_TILE, TARGET, TICKS, SPEED, PREV, INPUT = range(0xD004, 0xD00D)
ENERGY, HITS_1, HITS_10, CHAIN_1, CHAIN_10, SECTION = range(0xD00D, 0xD013)
LANES = (8, 13, 18, 23)
KEYS = (4, 1, 2, 8)
CHARTS = (
    (0, 1, 2, 3, 2, 1, 0, 3, 0, 2, 1, 3, 0, 0, 1, 2, 3, 1, 3, 2, 0, 2, 1, 3),
    (2, 0, 3, 1, 0, 2, 3, 2, 1, 3, 0, 1, 2, 3, 3, 0, 2, 1, 0, 3, 1, 1, 0, 2),
    (3, 0, 3, 0, 1, 2, 2, 1, 0, 3, 1, 2, 0, 2, 1, 1, 3, 0, 2, 3, 2, 2, 1, 0),
)
FIRST, JUDGE = 7, 15
NOTE_COUNT = len(CHARTS[0])
TRACK, LINE, ENERGY_ON, ENERGY_OFF = 1, 2, 3, 4
NOTE_FIRST, ARROW_FIRST, DIGIT_FIRST, GLYPH_FIRST = 5, 9, 16, 32
MESSAGES = ("1 TO PLAY", "GET READY", "ON BEAT", "GOOD", "MISS", "CLEAR", "NO SIGNAL")
TEXT_WIDTH = 10
CHART_DATA = ROOM + NAME_LENGTH
LANE_DATA = CHART_DATA + len(CHARTS) * NOTE_COUNT

GLYPHS = {
    **FONT,
    "B": (30, 17, 17, 30, 17, 17, 30),
    "K": (17, 18, 20, 24, 20, 18, 17),
    "Y": (17, 17, 10, 4, 4, 4, 4),
}
CHAR = {letter: GLYPH_FIRST + i for i, letter in enumerate(GLYPHS)}
CHAR.update({str(digit): DIGIT_FIRST + digit for digit in range(10)})


def words(text):
    return bytes(CHAR[letter] if letter != " " else 0 for letter in text)


def graphics():
    blank = ["00000000"] * 8
    tiles = [
        blank,
        ["00011000"] * 8,
        ["00011000"] * 3 + ["22222222"] * 2 + ["00011000"] * 3,
        ["00000000", "00033000", "00333300", "03366330"] * 2,
        ["00000000", "00011000", "00100100", "01000010"] * 2,
    ]
    note = ("...xx...", "..xyyx..", ".xyyyyx.", "xyyyyyyx")
    for color in "789a":
        tiles.append(
            [
                row.translate(str.maketrans(".xy", "0" + color + "b"))
                for row in (*note, *reversed(note))
            ]
        )
    arrows = (
        (
            "...x....",
            "..xx....",
            ".xxxxxx.",
            "xxxxxxx.",
            ".xxxxxx.",
            "..xx....",
            "...x....",
        ),
        (
            "...x....",
            "..xxx...",
            ".xxxxx..",
            "xxxxxxx.",
            "..xxx...",
            "..xxx...",
            "..xxx...",
        ),
        (
            "..xxx...",
            "..xxx...",
            "..xxx...",
            "xxxxxxx.",
            ".xxxxx..",
            "..xxx...",
            "...x....",
        ),
        (
            "....x...",
            "....xx..",
            ".xxxxxx.",
            ".xxxxxxx",
            ".xxxxxx.",
            "....xx..",
            "....x...",
        ),
    )
    for color, arrow in zip("789a", arrows):
        tiles.append(
            [row.replace(".", "0").replace("x", color) for row in arrow] + ["00000000"]
        )
    tiles += [blank] * (DIGIT_FIRST - len(tiles))
    for group, start in ((DIGITS, DIGIT_FIRST), (GLYPHS.values(), GLYPH_FIRST)):
        tiles += [blank] * (start - len(tiles))
        for glyph in group:
            tiles.append(
                [
                    "0"
                    + "".join("b" if row & (16 >> bit) else "0" for bit in range(5))
                    + "00"
                    for row in glyph
                ]
                + ["00000000"]
            )
    assert all(len(row) == 8 for tile in tiles for row in tile)
    patterns = bytes(
        sum(((int(pixel, 16) >> plane) & 1) << (7 - x) for x, pixel in enumerate(row))
        for tile in tiles
        for row in tile
        for plane in range(4)
    )
    cells = bytearray(NAME_LENGTH)

    def text(x, y, value):
        cells[y * 32 + x : y * 32 + x + len(value)] = words(value)

    text(8, 3, "PULSE RELAY")
    text(7, 5, "HITS 00   CHAIN 00")
    text(7, 19, "DECK 1   SPEED 1")
    text(11, 20, MESSAGES[0].center(TEXT_WIDTH))
    cells[3 * 32 + 21 : 3 * 32 + 25] = bytes([ENERGY_ON] * 4)
    cells[JUDGE * 32 + 6 : JUDGE * 32 + 26] = bytes([LINE] * 20)
    for lane, x in enumerate(LANES):
        for y in range(FIRST, JUDGE + 2):
            cells[y * 32 + x] = LINE if y == JUDGE else TRACK
        cells[17 * 32 + x] = ARROW_FIRST + lane
    cells.extend(lane for chart in CHARTS for lane in chart)
    cells.extend(LANES)
    cells.extend(KEYS)
    cells.extend(range(NOTE_FIRST, NOTE_FIRST + len(LANES)))
    palette = (
        0x211,
        0x432,
        0x864,
        0x6C5,
        0,
        0,
        0xBF9,
        0x48F,
        0xFD5,
        0x4EF,
        0xE9D,
        0xFFF,
        0,
        0,
        0,
        0,
    )
    return patterns, cells, pack("<32H", *(palette * 2))


def pulse_cartridge():
    patterns, cells, palette = graphics()
    z = Code()
    emit, label, go = z.emit, z.label, z.to

    def digit(x, y, value):
        z.coords(x, y)
        z.read(value)
        emit(0xF6, DIGIT_FIRST)
        go(0xCD, "draw")

    def message(index, name):
        z.vdp(0x7800 + 2 * (20 * 32 + 11))
        go(0x21, f"message_{index}")
        z.word(0x01, TEXT_WIDTH * 2)
        label(name)
        emit(0x7E, 0xD3, 0xBE, 0x23, 0x0B, 0x78, 0xB1)
        z.relative(0x20, name)

    def inc_digit(units, tens, done):
        z.read(units)
        emit(0x3C, 0xFE, 10)
        go(0xC2, done)
        z.read(tens)
        emit(0x3C)
        z.store(tens)
        emit(0xAF)
        label(done)
        z.store(units)

    def load_lane_data(base):
        z.word(0x21, base)
        emit(0x19, 0x7E)

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
        (MODE, 0),
        (DECK, 1),
        (PREV, 0),
        (ENERGY, 4),
        (NOTE, 0),
        (ROW, FIRST),
        (SECTION, 1),
    ):
        z.write(address, value)
    go(0xCD, "vblank")
    z.vdp(0x8140)

    label("frame")
    go(0xCD, "vblank")
    emit(0xDB, 0x00, 0xE6, 0x80)  # Start returns to chart selection.
    go(0xCA, "reset")
    emit(0xDB, 0xDC, 0x2F, 0xE6, 31)
    z.store(INPUT)
    z.read(MODE)
    emit(0xFE, 1)
    go(0xC2, "edge")
    z.read(INPUT)
    emit(0xE6, 15)
    z.store(INPUT)
    label("edge")
    z.read(INPUT)
    emit(0x47)
    z.read(PREV)
    emit(0xB8)
    go(0xCA, "advance")
    emit(0x78)
    z.store(PREV)
    z.store(INPUT)
    z.read(MODE)
    emit(0xFE, 1)
    go(0xCA, "judge")
    z.read(INPUT)
    emit(0xE6, 16)
    go(0xC2, "begin")
    z.read(MODE)
    emit(0xB7)
    go(0xC2, "frame")
    z.read(INPUT)
    emit(0xFE, 4)
    go(0xCA, "deck_left")
    emit(0xFE, 8)
    go(0xCA, "deck_right")
    go(0xC3, "frame")

    label("deck_left")
    z.read(DECK)
    emit(0x3D)
    go(0xC2, "deck_number")
    z.load(len(CHARTS))
    go(0xC3, "deck_number")
    label("deck_right")
    z.read(DECK)
    emit(0x3C, 0xFE, len(CHARTS) + 1)
    go(0xC2, "deck_number")
    z.load(1)
    label("deck_number")
    z.store(DECK)
    digit(12, 19, DECK)
    go(0xC3, "frame")

    label("begin")
    emit(0xAF)
    for address in (NOTE, HITS_1, HITS_10, CHAIN_1, CHAIN_10):
        z.store(address)
    for address, value in ((MODE, 1), (ENERGY, 4), (SECTION, 1), (SPEED, 7)):
        z.write(address, value)
    go(0xCD, "scores")
    digit(22, 19, SECTION)
    for x in range(21, 25):
        z.coords(x, 3)
        z.load(ENERGY_ON)
        go(0xCD, "draw")
    message(1, "ready_text")
    go(0xC3, "spawn")

    label("judge")
    z.read(INPUT)
    emit(0xE6, 15)
    go(0xCA, "advance")
    emit(0x47)
    z.read(ROW)
    emit(0xFE, JUDGE - 1)
    go(0xCA, "compare")
    emit(0xFE, JUDGE)
    go(0xCA, "compare")
    emit(0xFE, JUDGE + 1)
    go(0xC2, "advance")
    label("compare")
    z.read(TARGET)
    emit(0xB8)
    go(0xC2, "miss")
    go(0xCD, "erase_note")
    inc_digit(HITS_1, HITS_10, "hits_units")
    inc_digit(CHAIN_1, CHAIN_10, "chain_units")
    go(0xCD, "scores")
    z.read(ROW)
    emit(0xFE, JUDGE)
    go(0xC2, "good")
    message(2, "beat_text")
    go(0xC3, "next_note")
    label("good")
    message(3, "good_text")
    go(0xC3, "next_note")

    label("advance")
    z.read(MODE)
    emit(0xFE, 1)
    go(0xC2, "frame")
    z.read(TICKS)
    emit(0x3D)
    z.store(TICKS)
    go(0xC2, "frame")
    z.read(ROW)
    emit(0xFE, JUDGE + 1)
    go(0xCA, "miss")
    go(0xCD, "erase_note")
    z.read(ROW)
    emit(0x3C)
    z.store(ROW)
    go(0xC3, "paint_note")

    label("miss")
    go(0xCD, "erase_note")
    emit(0xAF)
    z.store(CHAIN_1)
    z.store(CHAIN_10)
    go(0xCD, "scores")
    z.read(ENERGY)
    emit(0x3D)
    z.store(ENERGY)
    emit(*([0x3C] * 21))
    z.store(CX)
    z.write(CY, 3)
    z.load(ENERGY_OFF)
    go(0xCD, "draw")
    z.read(ENERGY)
    emit(0xB7)
    go(0xCA, "lost")
    message(4, "miss_text")

    label("next_note")
    z.read(NOTE)
    emit(0x3C)
    z.store(NOTE)
    emit(0xFE, NOTE_COUNT)
    go(0xCA, "clear")
    emit(0xFE, 8)
    go(0xCA, "speed_two")
    emit(0xFE, 16)
    go(0xC2, "spawn")
    z.write(SECTION, 3)
    z.write(SPEED, 4)
    go(0xC3, "show_speed")
    label("speed_two")
    z.write(SECTION, 2)
    z.write(SPEED, 5)
    label("show_speed")
    digit(22, 19, SECTION)

    label("spawn")
    z.read(NOTE)
    emit(0x5F, 0x16, 0)
    z.read(DECK)
    emit(0xFE, 1)
    go(0xCA, "first_chart")
    emit(0xFE, 2)
    go(0xCA, "second_chart")
    z.word(0x21, CHART_DATA + 2 * NOTE_COUNT)
    go(0xC3, "lookup_chart")
    label("second_chart")
    z.word(0x21, CHART_DATA + NOTE_COUNT)
    go(0xC3, "lookup_chart")
    label("first_chart")
    z.word(0x21, CHART_DATA)
    label("lookup_chart")
    emit(0x19, 0x7E, 0x5F)
    load_lane_data(LANE_DATA)
    z.store(LANE_X)
    load_lane_data(LANE_DATA + len(LANES))
    z.store(TARGET)
    load_lane_data(LANE_DATA + 2 * len(LANES))
    z.store(NOTE_TILE)
    z.write(ROW, FIRST)
    label("paint_note")
    go(0xCD, "note_coords")
    z.read(NOTE_TILE)
    go(0xCD, "draw")
    z.read(SPEED)
    z.store(TICKS)
    go(0xC3, "frame")

    for outcome, mode, text in (("clear", 2, 5), ("lost", 3, 6)):
        label(outcome)
        z.write(MODE, mode)
        message(text, outcome + "_text")
        go(0xC3, "frame")

    label("scores")
    for x, value in ((12, HITS_10), (13, HITS_1), (23, CHAIN_10), (24, CHAIN_1)):
        digit(x, 5, value)
    emit(0xC9)

    label("erase_note")
    go(0xCD, "note_coords")
    emit(0xFE, JUDGE)
    go(0xCA, "erase_line")
    z.load(TRACK)
    go(0xC3, "draw")
    label("erase_line")
    z.load(LINE)
    go(0xC3, "draw")
    label("note_coords")
    z.read(LANE_X)
    z.store(CX)
    z.read(ROW)
    z.store(CY)
    emit(0xC9)

    label("draw")
    emit(0x47)
    z.read(CY)
    emit(0x6F, 0x26, 0, 0x29, 0x29, 0x29, 0x29, 0x29)
    z.read(CX)
    emit(0x5F, 0x16, 0, 0x19, 0x29, 0x7D, 0xD3, 0xBF, 0x7C, 0xF6, 0x78, 0xD3, 0xBF)
    emit(0x78, 0xD3, 0xBE, 0xAF, 0xD3, 0xBE, 0xC9)
    label("vblank")
    emit(0xDB, 0xBF, 0xE6, 0x80)
    z.relative(0x28, "vblank")
    emit(0xC9)
    label("registers")
    emit(0x04, 0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0, 0, 0, 0xFF)
    for index, text in enumerate(MESSAGES):
        label(f"message_{index}")
        for tile in words(text.center(TEXT_WIDTH)):
            emit(tile, 0)
    return cartridge_image(z, patterns, cells, palette)
