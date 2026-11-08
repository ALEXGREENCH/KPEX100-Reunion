"""Build Freight Shift, an original crate puzzle for Game Gear."""

from struct import pack

from cart import COLORS, CX, CY, DIGITS, EXTRA, FONT, NAME_LENGTH, PATTERNS, RAM_ROOM
from cart import Code, cartridge_image


LEVELS = (
    (
        "########",
        "#  .   #",
        "#  $   #",
        "# @$ . #",
        "#      #",
        "#      #",
        "########",
    ),
    (
        "########",
        "#  .   #",
        "# #$#  #",
        "#  $ . #",
        "# @$   #",
        "#  .   #",
        "########",
    ),
    (
        "########",
        "#   .  #",
        "# #$## #",
        "# . $  #",
        "# # $# #",
        "#  . @ #",
        "########",
    ),
    (
        "########",
        "# ..   #",
        "# $$ # #",
        "#  #   #",
        "# $ $  #",
        "#  ..@ #",
        "########",
    ),
)
WIDTH, HEIGHT = 8, 7
BOARD_X, BOARD_Y = 8, 5
SIZE = WIDTH * HEIGHT
LEVEL_SIZE = NAME_LENGTH + SIZE + 2
TILE_START = 4  # VDP tile zero is the plain background.
DIGIT_START, LETTER_START = 32, 42
MODE, LEVEL = 0xD000, 0xD001
PLAYER, REMAINING, MOVES_1, MOVES_10, MOVES_100 = range(0xD004, 0xD009)
HIST_NEXT, HIST_COUNT, PRESSED, START_HELD, REPEAT = range(0xD009, 0xD00E)
DIRECTION, ORIGIN, TARGET, BEYOND, TARGET_TILE, BEYOND_TILE, CALC_SOURCE = range(
    0xD00E, 0xD015
)
DRAW_INDEX, DRAW_BASE = 0xD015, 0xD016
BOARD = 0xD100
HISTORY_ORIGIN, HISTORY_PUSH = 0xD200, 0xD220
WALL, FLOOR, GOAL, BOX, BOX_GOAL, PERSON, PERSON_GOAL = range(7)
TILES = dict(zip("# .$*@+", range(7)))
MESSAGES = ("PUSH TO MARKS", "ROOM CLEAR / NEXT", "ALL ROOMS CLEAR")
STATUS_X, STATUS_Y, STATUS_WIDTH = 6, 20, 20
TITLE, COUNTERS, CONTROLS = "FREIGHT SHIFT", "LEFT 0  MOVES 000", "A UNDO / PLAY RESET"
EXTRA_LETTERS = {
    "K": (17, 18, 20, 24, 20, 18, 17),
    "Y": (17, 17, 10, 4, 4, 4, 4),
}
USED_LETTERS = sorted(
    set(TITLE + COUNTERS + CONTROLS + "".join(MESSAGES)) - set(" 0123456789")
)
CHARS = {letter: LETTER_START + i for i, letter in enumerate(USED_LETTERS)}
CHARS.update({str(i): DIGIT_START + i for i in range(10)})


def words(text):
    return bytes(CHARS[char] if char != " " else 0 for char in text)


def board_art(kind):
    pixels = [[1] * 16 for _ in range(16)]
    for i in range(16):
        pixels[0][i] = pixels[i][0] = 2

    def rect(x1, y1, x2, y2, color):
        for y in range(y1, y2 + 1):
            for x in range(x1, x2 + 1):
                pixels[y][x] = color

    if kind == WALL:
        rect(0, 0, 15, 15, 3)
        rect(0, 0, 15, 1, 4)
        rect(0, 8, 15, 8, 4)
        rect(8, 2, 8, 7, 4)
        rect(4, 9, 4, 15, 4)
        rect(12, 9, 12, 15, 4)
    if kind in (GOAL, BOX_GOAL, PERSON_GOAL):
        for x, y in ((2, 2), (11, 2), (2, 11), (11, 11)):
            rect(x, y, x + 2, y + 2, 5)
        rect(7, 4, 8, 11, 5)
        rect(4, 7, 11, 8, 5)
    if kind in (BOX, BOX_GOAL):
        dark, light = (6, 7) if kind == BOX else (8, 9)
        rect(2, 2, 13, 13, dark)
        rect(2, 2, 13, 3, light)
        rect(2, 3, 3, 13, light)
        rect(12, 3, 13, 13, light)
        rect(3, 12, 13, 13, light)
        for n in range(4, 12):
            pixels[n][n] = pixels[15 - n][n] = light
        rect(7, 7, 8, 8, 13)
    if kind in (PERSON, PERSON_GOAL):
        rect(5, 2, 10, 6, 12)
        rect(6, 3, 10, 4, 13)
        rect(4, 7, 11, 12, 10)
        rect(3, 8, 4, 10, 11)
        rect(11, 8, 12, 10, 11)
        rect(5, 12, 6, 14, 12)
        rect(9, 12, 10, 14, 12)
        rect(7, 8, 8, 9, 13)
    return [
        [row[x : x + 8] for row in pixels[y : y + 8]] for y in (0, 8) for x in (0, 8)
    ]


def artwork():
    tiles = [[[0] * 8 for _ in range(8)]] * TILE_START
    for kind in range(7):
        tiles.extend(board_art(kind))
    assert len(tiles) == DIGIT_START
    glyphs = FONT | EXTRA_LETTERS
    for glyph in (*DIGITS, *(glyphs[char] for char in USED_LETTERS)):
        tiles.append(
            [
                [0, *(13 if row & (16 >> i) else 0 for i in range(5)), 0, 0]
                for row in (*glyph, 0)
            ]
        )
    patterns = bytes(
        sum(((pixel >> plane) & 1) << (7 - x) for x, pixel in enumerate(row))
        for tile in tiles
        for row in tile
        for plane in range(4)
    )
    palette = (
        0x211,
        0x322,
        0x543,
        0x656,
        0x878,
        0x3BD,
        0x259,
        0x49D,
        0x265,
        0x6EA,
        0x965,
        0xCB6,
        0xFD6,
        0xFFF,
        0,
        0,
    )
    return patterns, pack("<32H", *(palette * 2))


def level_data(rows, number):
    assert len(rows) == HEIGHT and all(len(row) == WIDTH for row in rows)
    assert rows[0] == rows[-1] == "#" * WIDTH and all(
        row[0] == row[-1] == "#" for row in rows
    )
    board = bytes(TILES[char] for row in rows for char in row)
    assert board.count(PERSON) + board.count(PERSON_GOAL) == 1
    assert board.count(BOX) == board.count(GOAL) + board.count(PERSON_GOAL)
    cells = bytearray(NAME_LENGTH)

    def text(x, y, value):
        cells[y * 32 + x : y * 32 + x + len(value)] = words(value)

    text(6, 3, TITLE)
    text(23, 3, f"R{number}")
    text(6, 4, COUNTERS.replace("LEFT 0", f"LEFT {board.count(BOX)}"))
    text(6, 19, CONTROLS)
    text(STATUS_X, STATUS_Y, MESSAGES[0].center(STATUS_WIDTH))
    for index, kind in enumerate(board):
        x, y = BOARD_X + 2 * (index % WIDTH), BOARD_Y + 2 * (index // WIDTH)
        tile = TILE_START + 4 * kind
        cells[y * 32 + x : y * 32 + x + 2] = bytes((tile, tile + 1))
        cells[(y + 1) * 32 + x : (y + 1) * 32 + x + 2] = bytes((tile + 2, tile + 3))
    player = next(i for i, kind in enumerate(board) if kind in (PERSON, PERSON_GOAL))
    return bytes(cells) + board + bytes((player, board.count(BOX)))


def freight_cartridge():
    patterns, palette = artwork()
    levels = b"".join(level_data(rows, i + 1) for i, rows in enumerate(LEVELS))
    z = Code()
    emit, label, go = z.emit, z.label, z.to

    def call(name):
        go(0xCD, name)

    def jump(name):
        go(0xC3, name)

    def if_equal(value, name):
        emit(0xFE, value)
        go(0xCA, name)

    def indexed_address(address):
        emit(0x5F, 0x16, 0)  # LD E,A / LD D,0.
        z.word(0x21, address)
        emit(0x19)  # ADD HL,DE.

    def adjust(addr, op, count=1):
        z.read(addr)
        emit(*([op] * count))
        z.store(addr)

    label("reset")
    emit(0xF3)
    z.word(0x31, 0xDFF0)
    z.port(0x06, 0xFF)
    z.vdp(0x8100)
    call("vblank")
    call("vblank")
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
    z.write(LEVEL, 1)
    z.write(START_HELD, 0)

    label("load_room")
    z.vdp(0x8100)
    z.vdp(0x7800)
    z.read(LEVEL)
    for i in range(1, len(LEVELS)):
        if_equal(i, f"room_{i}")
    for i in (len(LEVELS), *range(1, len(LEVELS))):
        label(f"room_{i}")
        z.word(0x21, EXTRA + (i - 1) * LEVEL_SIZE)
        jump("load_map")
    label("load_map")
    z.word(0x11, RAM_ROOM)
    z.word(0x01, NAME_LENGTH)
    label("copy_map")
    emit(0x7E, 0x12, 0xD3, 0xBE, 0xAF, 0xD3, 0xBE, 0x23, 0x13, 0x0B, 0x78, 0xB1)
    z.relative(0x20, "copy_map")
    z.word(0x11, BOARD)
    z.word(0x01, SIZE)
    label("copy_board")
    emit(0x7E, 0x12, 0x23, 0x13, 0x0B, 0x78, 0xB1)
    z.relative(0x20, "copy_board")
    emit(0x7E)
    z.store(PLAYER)
    emit(0x23, 0x7E)
    z.store(REMAINING)
    emit(0xAF)
    for addr in (
        MODE,
        MOVES_1,
        MOVES_10,
        MOVES_100,
        HIST_NEXT,
        HIST_COUNT,
        PRESSED,
        REPEAT,
    ):
        z.store(addr)
    call("vblank")
    z.vdp(0x8140)

    label("frame")
    call("vblank")
    emit(0xDB, 0x00, 0xE6, 0x80)
    go(0xC2, "start_released")
    z.read(START_HELD)
    emit(0xB7)
    go(0xC2, "frame")
    z.write(START_HELD, 1)
    z.read(MODE)
    if_equal(2, "restart_pack")
    if_equal(0, "load_room")
    adjust(LEVEL, 0x3C)
    jump("load_room")
    label("restart_pack")
    z.write(LEVEL, 1)
    jump("load_room")

    label("start_released")
    z.write(START_HELD, 0)
    emit(0xDB, 0xDC, 0x2F, 0xE6, 31, 0x47)
    z.read(PRESSED)
    emit(0xB8)
    go(0xCA, "held_input")
    emit(0x78)
    z.store(PRESSED)
    emit(0xE6, 16)
    go(0xC2, "undo")
    z.write(REPEAT, 10)
    jump("direction")
    label("held_input")
    emit(0xE6, 16)
    go(0xC2, "frame")
    z.read(PRESSED)
    emit(0xB7)
    go(0xCA, "frame")
    adjust(REPEAT, 0x3D)
    go(0xC2, "frame")
    z.write(REPEAT, 4)
    label("direction")
    z.read(MODE)
    emit(0xB7)
    go(0xC2, "frame")
    z.read(PRESSED)
    z.store(DIRECTION)
    for key in (1, 2, 4, 8):
        if_equal(key, "move")
    jump("frame")

    label("move")
    z.read(PLAYER)
    z.store(ORIGIN)
    call("neighbor")
    z.store(TARGET)
    call("read_cell")
    z.store(TARGET_TILE)
    if_equal(WALL, "frame")
    if_equal(BOX, "push")
    if_equal(BOX_GOAL, "push")
    z.write(BEYOND, 0)
    jump("remember")

    label("push")
    z.read(TARGET)
    call("neighbor")
    z.store(BEYOND)
    call("read_cell")
    z.store(BEYOND_TILE)
    if_equal(FLOOR, "push_ok")
    emit(0xFE, GOAL)
    go(0xC2, "frame")
    label("push_ok")
    z.read(TARGET_TILE)
    emit(0xFE, BOX_GOAL)
    go(0xC2, "push_old_floor")
    adjust(REMAINING, 0x3C)
    label("push_old_floor")
    z.read(BEYOND_TILE)
    emit(0xFE, GOAL)
    go(0xC2, "push_new_floor")
    adjust(REMAINING, 0x3D)
    label("push_new_floor")
    z.read(BEYOND_TILE)
    emit(0x3C, 0x3C, 0x47)
    z.read(BEYOND)
    call("write_draw")
    adjust(TARGET_TILE, 0x3D, 2)

    label("remember")
    for value, buffer in ((ORIGIN, HISTORY_ORIGIN), (BEYOND, HISTORY_PUSH)):
        z.read(value)
        emit(0x47)
        z.read(HIST_NEXT)
        indexed_address(buffer)
        emit(0x70)  # LD (HL),B.
    z.read(HIST_NEXT)
    emit(0x3C, 0xE6, 31)
    z.store(HIST_NEXT)
    z.read(HIST_COUNT)
    if_equal(32, "commit")
    adjust(HIST_COUNT, 0x3C)

    label("commit")
    z.read(ORIGIN)
    call("read_cell")
    emit(0x3D, 0x3D, 0x3D, 0x3D, 0x47)
    z.read(ORIGIN)
    call("write_draw")
    z.read(TARGET_TILE)
    emit(0x3C, 0x3C, 0x3C, 0x3C, 0x47)
    z.read(TARGET)
    z.store(PLAYER)
    call("write_draw")
    call("increment_moves")
    call("hud")
    z.read(REMAINING)
    emit(0xB7)
    go(0xC2, "frame")
    z.read(LEVEL)
    if_equal(len(LEVELS), "complete")
    z.write(MODE, 1)
    go(0x21, "message_1")
    jump("message_frame")
    label("complete")
    z.write(MODE, 2)
    go(0x21, "message_2")
    jump("message_frame")

    label("undo")
    z.read(HIST_COUNT)
    emit(0xB7)
    go(0xCA, "frame")
    adjust(HIST_COUNT, 0x3D)
    z.read(HIST_NEXT)
    emit(0x3D, 0xE6, 31)
    z.store(HIST_NEXT)
    for value, buffer in ((ORIGIN, HISTORY_ORIGIN), (BEYOND, HISTORY_PUSH)):
        z.read(HIST_NEXT)
        indexed_address(buffer)
        emit(0x7E)
        z.store(value)
    z.read(PLAYER)
    z.store(TARGET)
    call("read_cell")
    emit(0x3D, 0x3D, 0x3D, 0x3D)
    z.store(TARGET_TILE)
    z.read(BEYOND)
    emit(0xB7)
    go(0xCA, "undo_target")
    call("read_cell")
    emit(0x3D, 0x3D)
    z.store(BEYOND_TILE)
    emit(0xFE, GOAL)
    go(0xC2, "undo_beyond_floor")
    adjust(REMAINING, 0x3C)
    label("undo_beyond_floor")
    z.read(TARGET_TILE)
    emit(0xFE, GOAL)
    go(0xC2, "undo_write")
    adjust(REMAINING, 0x3D)
    label("undo_write")
    z.read(BEYOND_TILE)
    emit(0x47)
    z.read(BEYOND)
    call("write_draw")
    adjust(TARGET_TILE, 0x3C, 2)
    label("undo_target")
    z.read(TARGET_TILE)
    emit(0x47)
    z.read(TARGET)
    call("write_draw")
    z.read(ORIGIN)
    call("read_cell")
    emit(0x3C, 0x3C, 0x3C, 0x3C, 0x47)
    z.read(ORIGIN)
    z.store(PLAYER)
    call("write_draw")
    call("decrement_moves")
    call("hud")
    z.read(MODE)
    emit(0xB7)
    go(0xCA, "frame")
    z.write(MODE, 0)
    go(0x21, "message_0")
    label("message_frame")
    z.vdp(0x7800 + 2 * (STATUS_Y * 32 + STATUS_X))
    z.word(0x01, STATUS_WIDTH * 2)
    label("message_bytes")
    emit(0x7E, 0xD3, 0xBE, 0x23, 0x0B, 0x78, 0xB1)
    z.relative(0x20, "message_bytes")
    jump("frame")

    for routine, op, rollover, next_digit in (
        ("increment_moves", 0x3C, 10, 0),
        ("decrement_moves", 0x3D, 255, 9),
    ):
        label(routine)
        for index, addr in enumerate((MOVES_1, MOVES_10, MOVES_100)):
            z.read(addr)
            emit(op, 0xFE, rollover)
            go(0xC2, f"{routine}_{index}")
            z.load(next_digit)
            z.store(addr)
        emit(0xC9)
        for index, addr in enumerate((MOVES_1, MOVES_10, MOVES_100)):
            label(f"{routine}_{index}")
            z.store(addr)
            emit(0xC9)

    label("neighbor")
    z.store(CALC_SOURCE)
    z.read(DIRECTION)
    for key, delta in ((1, -WIDTH), (2, WIDTH), (4, -1)):
        if_equal(key, f"delta_{delta}")
    for delta in (1, -WIDTH, WIDTH, -1):
        label(f"delta_{delta}")
        z.read(CALC_SOURCE)
        emit(*([0x3C if delta > 0 else 0x3D] * abs(delta)), 0xC9)

    label("read_cell")
    indexed_address(BOARD)
    emit(0x7E, 0xC9)
    label("write_draw")
    z.store(DRAW_INDEX)
    indexed_address(BOARD)
    emit(0x70, 0x78)  # Write cell kind from B, then load it into A.
    emit(0x6F, 0x26, 0, 0x29, 0x29, 0x7D, 0x3C, 0x3C, 0x3C, 0x3C)
    z.store(DRAW_BASE)
    z.read(DRAW_INDEX)
    emit(0x5F, 0x16, 0)
    go(0x21, "column_table")
    emit(0x19, 0x7E)
    z.store(CX)
    go(0x21, "row_table")
    emit(0x19, 0x7E)
    z.store(CY)
    call("tile_pair")
    adjust(CY, 0x3C)
    adjust(DRAW_BASE, 0x3C, 2)
    label("tile_pair")
    call("vdp_address")
    z.read(DRAW_BASE)
    call("write_tile")
    z.read(DRAW_BASE)
    emit(0x3C)
    jump("write_tile")

    label("hud")
    for x, addr in ((11, REMAINING), (20, MOVES_100), (21, MOVES_10), (22, MOVES_1)):
        z.coords(x, 4)
        call("vdp_address")
        z.read(addr)
        emit(0xF6, DIGIT_START)
        call("write_tile")
    emit(0xC9)

    label("vdp_address")
    z.read(CY)
    emit(0x6F, 0x26, 0, 0x29, 0x29, 0x29, 0x29, 0x29)
    z.read(CX)
    emit(
        0x5F, 0x16, 0, 0x19, 0x29, 0x7D, 0xD3, 0xBF, 0x7C, 0xF6, 0x78, 0xD3, 0xBF, 0xC9
    )
    label("write_tile")
    emit(0xD3, 0xBE, 0xAF, 0xD3, 0xBE, 0xC9)
    label("vblank")
    emit(0xDB, 0xBF, 0xE6, 0x80)
    z.relative(0x28, "vblank")
    emit(0xC9)
    label("registers")
    emit(0x04, 0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0, 0, 0, 0xFF)
    label("column_table")
    emit(*(BOARD_X + 2 * (i % WIDTH) for i in range(SIZE)))
    label("row_table")
    emit(*(BOARD_Y + 2 * (i // WIDTH) for i in range(SIZE)))
    for i, text in enumerate(MESSAGES):
        label(f"message_{i}")
        for tile in words(text.center(STATUS_WIDTH)):
            emit(tile, 0)
    return cartridge_image(z, patterns, b"", palette, extra=levels)
