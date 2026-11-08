"""Build Coil Runner, an original Game Gear action-platformer."""

from struct import pack

from cart import COLORS, CX, CY, EXTRA, FONT, NAME_LENGTH, PATTERNS, RAM_ROOM
from cart import Code, cartridge_image


WIDTH, HEIGHT, LEFT, TOP = 20, 15, 6, 4
STEP_FRAMES = 5
EMPTY, WALL, SPRING, SPIKE, CELL, FLAG, FLAG_ON, GATE, OPEN, RUNNER, DRONE = range(11)
MODE, LEVEL = 0xD000, 0xD001
X, Y, EX, EY, MIN_X, MAX_X, EXIT_X, EXIT_Y, REMAIN, CHECK_X, CHECK_Y = range(
    0xD004, 0xD00F
)
FACING, ARC, BOOST, AIR, STEPS, INPUT, JUMP_HELD, JUMP_REQUEST, START_HELD = range(
    0xD00F, 0xD018
)
DRONE_DIR, DRONE_CLOCK, HIT_COUNT, ACTIVE_CHECK, CANDIDATE = range(0xD018, 0xD01D)
TITLE, HELP = "COIL RUNNER", "A JUMP / PLAY RESET"
MESSAGES = (
    "CHARGE THE AIRLOCK",
    "CHECKPOINT SAVED",
    "BACK AT CHECKPOINT",
    "AIRLOCK OPEN",
    "SECTOR CLEAR / NEXT",
    "ALL SECTORS CLEAR",
)
TEXT_WIDTH = 20
DIGITS, LETTERS = 16, 32
GLYPHS = FONT | {
    "B": (30, 17, 17, 30, 17, 17, 30),
    "J": (7, 2, 2, 2, 18, 18, 12),
    "K": (17, 18, 20, 24, 20, 18, 17),
    "Y": (17, 17, 10, 4, 4, 4, 4),
    "0": (14, 17, 17, 17, 17, 17, 14),
    "2": (14, 17, 1, 2, 4, 8, 31),
    "3": (30, 1, 1, 14, 1, 1, 30),
}
CHARS = {char: DIGITS + i for i, char in enumerate("0123")}
CHARS.update(
    {
        char: LETTERS + i
        for i, char in enumerate(sorted(set(TITLE + HELP + "".join(MESSAGES)) - {" "}))
    }
)

# The three stages share the same viewport. Spans are inclusive.
ROOMS = (
    # Split floor, then a battery on a raised gantry.
    (
        ((12, 1, 5), (12, 8, 18), (9, 13, 16)),
        ((6, 7),),
        {(4, 11): CELL, (15, 8): CELL, (9, 11): FLAG},
        (2, 11),
        (14, 11, 12, 17),
    ),
    # A spring reaches the high catwalk above the wider pit.
    (
        ((12, 1, 8), (12, 13, 18), (7, 10, 12)),
        ((9, 12),),
        {(5, 12): SPRING, (11, 6): CELL, (16, 11): CELL, (13, 11): FLAG},
        (2, 11),
        (16, 11, 15, 17),
    ),
    # Two adjacent gantries require consecutive jumps.
    (
        ((12, 1, 7), (12, 11, 18), (9, 8, 10), (6, 12, 14)),
        ((8, 10),),
        {(9, 8): CELL, (13, 5): CELL, (12, 11): FLAG},
        (2, 11),
        (16, 11, 14, 17),
    ),
)
ROOM_SIZE = NAME_LENGTH + 7


def words(text):
    return bytes(CHARS[char] if char != " " else 0 for char in text)


def stage_data(spec, number):
    spans, pits, features, spawn, drone = spec
    cells = bytearray(NAME_LENGTH)

    def put(x, y, tile):
        cells[(TOP + y) * 32 + LEFT + x] = tile

    def text(x, y, message):
        cells[y * 32 + x : y * 32 + x + len(message)] = words(message)

    for x in range(WIDTH):
        put(x, 0, WALL)
        put(x, HEIGHT - 1, WALL)
    for y in range(1, HEIGHT - 1):
        put(0, y, WALL)
        put(WIDTH - 1, y, WALL)
    for y, x1, x2 in spans:
        for x in range(x1, x2 + 1):
            put(x, y, WALL)
    for x1, x2 in pits:
        for x in range(x1, x2 + 1):
            put(x, HEIGHT - 2, SPIKE)
    for (x, y), tile in features.items():
        put(x, y, tile)
    exit_at = (18, 11)
    put(*exit_at, GATE)
    assert list(features.values()).count(CELL) == 2
    text(6, 3, TITLE)
    text(19, 3, f"S{number}")
    text(23, 3, "C2")
    text(6, 19, HELP)
    text(6, 20, MESSAGES[0].center(TEXT_WIDTH))
    ex, ey, minimum, maximum = drone
    return bytes(cells) + bytes(
        (
            spawn[0] + LEFT,
            spawn[1] + TOP,
            ex + LEFT,
            ey + TOP,
            minimum + LEFT,
            maximum + LEFT,
            exit_at[0] + LEFT,
        )
    )


def artwork():
    tiles = [
        ("00000000",) * 8,
        (
            "11111111",
            "22222222",
            "22212222",
            "22212222",
            "22212222",
            "22222222",
            "21111112",
            "12222221",
        ),
        (
            "00000000",
            "00000000",
            "05666650",
            "00566500",
            "05555550",
            "00666600",
            "05555550",
            "11111111",
        ),
        (
            "00000000",
            "00000000",
            "30030030",
            "40040040",
            "43043043",
            "44044044",
            "44344344",
            "11111111",
        ),
        (
            "00000000",
            "00055000",
            "00666500",
            "066d6650",
            "066dd650",
            "06666650",
            "00555500",
            "00000000",
        ),
        (
            "00000000",
            "00222000",
            "00222000",
            "00200000",
            "00200000",
            "00200000",
            "02222000",
            "00000000",
        ),
        (
            "00000000",
            "00aaa000",
            "00999000",
            "00900000",
            "00900000",
            "00900000",
            "09999000",
            "00000000",
        ),
        (
            "01111110",
            "01888810",
            "01800810",
            "018f0810",
            "01800810",
            "01888810",
            "01888810",
            "01111110",
        ),
        (
            "01111110",
            "01a99a10",
            "01a00a10",
            "01a00a10",
            "01a00a10",
            "01a00a10",
            "01a99a10",
            "01111110",
        ),
        (
            "00000000",
            "000bb000",
            "00bcd000",
            "00bbb000",
            "0cbcbb00",
            "00bbc000",
            "00b0b000",
            "0bb0bb00",
        ),
        (
            "00000000",
            "00344300",
            "03444430",
            "044dd440",
            "04444440",
            "00300300",
            "00000000",
            "00000000",
        ),
    ]
    tiles += [("00000000",) * 8] * (max(CHARS.values()) + 1 - len(tiles))
    for letter, index in CHARS.items():
        tiles[index] = tuple(
            "0" + "".join("d" if row & (16 >> bit) else "0" for bit in range(5)) + "00"
            for row in (*GLYPHS[letter], 0)
        )
    patterns = bytes(
        sum(((int(pixel, 16) >> plane) & 1) << (7 - x) for x, pixel in enumerate(row))
        for tile in tiles
        for row in tile
        for plane in range(4)
    )
    palette = (
        0x211,
        0x544,
        0x755,
        0x337,
        0x45E,
        0x38D,
        0x6EF,
        0x355,
        0x639,
        0x6C5,
        0x9F9,
        0xC73,
        0xFE7,
        0xFFF,
        0x451,
        0xCCE,
    )
    return patterns, pack("<32H", *(palette * 2))


def coil_cartridge():
    patterns, palette = artwork()
    rooms = b"".join(stage_data(spec, index + 1) for index, spec in enumerate(ROOMS))
    z = Code()
    emit, label, go = z.emit, z.label, z.to

    def call(name):
        go(0xCD, name)

    def jump(name):
        go(0xC3, name)

    def if_equal(value, name):
        emit(0xFE, value)
        go(0xCA, name)

    def adjust(address, opcode):
        z.read(address)
        emit(opcode)
        z.store(address)

    def coords(x_addr, y_addr):
        z.read(x_addr)
        z.store(CX)
        z.read(y_addr)
        z.store(CY)

    def actors(x_addr, y_addr, tile):
        coords(x_addr, y_addr)
        if tile is None:
            call("map_tile")
        else:
            z.load(tile)
        call("draw")

    def message(index):
        go(0x21, f"text_{index}")
        call("message")

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
    for i in range(1, len(ROOMS)):
        if_equal(i, f"room_{i}")
    for i in (len(ROOMS), *range(1, len(ROOMS))):
        label(f"room_{i}")
        z.word(0x21, EXTRA + (i - 1) * ROOM_SIZE)
        jump("load_map")
    label("load_map")
    z.word(0x11, RAM_ROOM)
    z.word(0x01, NAME_LENGTH)
    label("copy_map")
    emit(0x7E, 0x12, 0xD3, 0xBE, 0xAF, 0xD3, 0xBE, 0x23, 0x13, 0x0B, 0x78, 0xB1)
    z.relative(0x20, "copy_map")
    for address in (X, Y, EX, EY, MIN_X, MAX_X, EXIT_X):
        emit(0x7E, 0x23)
        z.store(address)
    z.write(EXIT_Y, TOP + 11)
    z.read(X)
    z.store(CHECK_X)
    z.read(Y)
    z.store(CHECK_Y)
    emit(0xAF)
    for addr in (
        MODE,
        ARC,
        BOOST,
        AIR,
        INPUT,
        JUMP_HELD,
        JUMP_REQUEST,
        DRONE_DIR,
        DRONE_CLOCK,
        HIT_COUNT,
        ACTIVE_CHECK,
    ):
        z.store(addr)
    for addr, value in ((REMAIN, 2), (STEPS, STEP_FRAMES), (FACING, 8)):
        z.write(addr, value)
    actors(EX, EY, DRONE)
    actors(X, Y, RUNNER)
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
    if_equal(0, "load_room")
    if_equal(1, "next_room")
    z.write(LEVEL, 1)
    jump("load_room")
    label("next_room")
    adjust(LEVEL, 0x3C)
    jump("load_room")

    label("start_released")
    z.write(START_HELD, 0)
    z.read(MODE)
    emit(0xB7)
    go(0xC2, "frame")
    emit(0xDB, 0xDC, 0x2F, 0xE6, 28)
    z.store(INPUT)
    emit(0xE6, 16)
    go(0xCA, "jump_released")
    z.read(JUMP_HELD)
    emit(0xB7)
    go(0xC2, "wait_step")
    z.write(JUMP_HELD, 1)
    z.write(JUMP_REQUEST, 1)
    jump("wait_step")
    label("jump_released")
    z.write(JUMP_HELD, 0)
    label("wait_step")
    adjust(STEPS, 0x3D)
    go(0xC2, "frame")
    z.write(STEPS, STEP_FRAMES)

    # The jump keeps its take-off direction when no arrow is held, so a
    # single-key Kingston can jump with Select alone and steer after release.
    actors(X, Y, None)
    actors(EX, EY, None)
    z.read(INPUT)
    emit(0xE6, 12)
    if_equal(4, "face")
    if_equal(8, "face")
    jump("ground")
    label("face")
    z.store(FACING)
    label("ground")
    z.write(AIR, 0)
    z.read(ARC)
    emit(0xB7)
    go(0xC2, "jump_arc")
    coords(X, Y)
    adjust(CY, 0x3C)
    call("map_tile")
    if_equal(WALL, "grounded")
    if_equal(SPRING, "spring")
    jump("fall")
    label("grounded")
    z.write(BOOST, 0)
    jump("takeoff")
    label("spring")
    z.write(BOOST, 1)
    label("takeoff")
    z.read(JUMP_REQUEST)
    emit(0xB7)
    go(0xCA, "horizontal")
    z.write(ARC, 1)

    # Normal arc: 3 up, 1 apex, 3 down. Coil arc: 5 up, 1 apex, 5 down.
    label("jump_arc")
    z.write(AIR, 1)
    z.read(BOOST)
    emit(0xB7)
    go(0xC2, "boosted_arc")
    adjust(ARC, 0x3C)
    if_equal(9, "end_arc")
    if_equal(5, "horizontal")
    jump("vertical")
    label("boosted_arc")
    adjust(ARC, 0x3C)
    if_equal(13, "end_arc")
    if_equal(7, "horizontal")
    label("vertical")
    z.read(ARC)
    emit(0x5F, 0x16, 0)
    z.read(BOOST)
    emit(0xB7)
    go(0xC2, "boost_table")
    go(0x21, "normal_deltas")
    jump("lookup_delta")
    label("boost_table")
    go(0x21, "boosted_deltas")
    label("lookup_delta")
    emit(0x19, 0x7E)
    if_equal(1, "rise")
    jump("fall")
    label("end_arc")
    z.write(ARC, 0)
    label("fall")
    z.read(Y)
    emit(0x3C)
    jump("vertical_candidate")
    label("rise")
    z.read(Y)
    emit(0x3D)
    label("vertical_candidate")
    z.store(CANDIDATE)
    z.store(CY)
    z.read(X)
    z.store(CX)
    call("map_tile")
    if_equal(WALL, "vertical_blocked")
    if_equal(SPRING, "vertical_blocked")
    z.read(CANDIDATE)
    z.store(Y)
    jump("horizontal")
    label("vertical_blocked")
    z.write(ARC, 0)
    z.write(AIR, 0)

    label("horizontal")
    z.write(JUMP_REQUEST, 0)
    z.read(AIR)
    emit(0xB7)
    go(0xC2, "walk")
    z.read(INPUT)
    emit(0xE6, 12)
    if_equal(4, "walk")
    if_equal(8, "walk")
    jump("land")
    label("walk")
    z.read(FACING)
    if_equal(4, "walk_left")
    z.read(X)
    emit(0x3C)
    jump("horizontal_candidate")
    label("walk_left")
    z.read(X)
    emit(0x3D)
    label("horizontal_candidate")
    z.store(CANDIDATE)
    z.store(CX)
    z.read(Y)
    z.store(CY)
    call("map_tile")
    if_equal(WALL, "land")
    if_equal(SPRING, "land")
    z.read(CANDIDATE)
    z.store(X)

    label("land")
    coords(X, Y)
    call("map_tile")
    if_equal(SPIKE, "damage")
    if_equal(CELL, "collect")
    if_equal(FLAG, "checkpoint")
    if_equal(OPEN, "clear_room")
    jump("patrol")

    label("collect")
    emit(0xAF)
    call("set_map_tile")
    adjust(REMAIN, 0x3D)
    z.coords(24, 3)
    z.read(REMAIN)
    emit(0xF6, DIGITS)
    call("draw")
    z.read(REMAIN)
    emit(0xB7)
    go(0xC2, "patrol")
    coords(EXIT_X, EXIT_Y)
    z.load(OPEN)
    call("set_map_tile")
    z.load(OPEN)
    call("draw")
    message(3)
    jump("patrol")

    label("checkpoint")
    z.read(X)
    z.store(CHECK_X)
    z.read(Y)
    z.store(CHECK_Y)
    z.write(ACTIVE_CHECK, 1)
    z.load(FLAG_ON)
    call("set_map_tile")
    message(1)

    label("patrol")
    call("collision")
    go(0xCA, "damage")
    z.read(DRONE_CLOCK)
    emit(0xEE, 1)
    z.store(DRONE_CLOCK)
    go(0xCA, "paint_actors")
    z.read(DRONE_DIR)
    emit(0xB7)
    go(0xC2, "patrol_left")
    z.read(MAX_X)
    emit(0x47)
    z.read(EX)
    emit(0xB8)
    go(0xC2, "drone_right")
    z.write(DRONE_DIR, 1)
    jump("drone_left")
    label("patrol_left")
    z.read(MIN_X)
    emit(0x47)
    z.read(EX)
    emit(0xB8)
    go(0xC2, "drone_left")
    z.write(DRONE_DIR, 0)
    label("drone_right")
    adjust(EX, 0x3C)
    jump("drone_check")
    label("drone_left")
    adjust(EX, 0x3D)
    label("drone_check")
    call("collision")
    go(0xCA, "damage")
    label("paint_actors")
    actors(EX, EY, DRONE)
    actors(X, Y, RUNNER)
    jump("frame")

    label("damage")
    adjust(HIT_COUNT, 0x3C)
    z.read(CHECK_X)
    z.store(X)
    z.read(CHECK_Y)
    z.store(Y)
    z.write(ARC, 0)
    message(2)
    jump("paint_actors")

    label("clear_room")
    z.read(LEVEL)
    if_equal(len(ROOMS), "complete")
    z.write(MODE, 1)
    message(4)
    jump("paint_actors")
    label("complete")
    z.write(MODE, 2)
    message(5)
    jump("paint_actors")

    label("collision")
    z.read(EX)
    emit(0x47)
    z.read(X)
    emit(0xB8)
    go(0xC2, "collision_done")
    z.read(EY)
    emit(0x47)
    z.read(Y)
    emit(0xB8)
    label("collision_done")
    emit(0xC9)

    label("offset")
    z.read(CY)
    emit(0x6F, 0x26, 0, 0x29, 0x29, 0x29, 0x29, 0x29)
    z.read(CX)
    emit(0x5F, 0x16, 0, 0x19, 0xC9)
    label("map_offset")
    call("offset")
    z.word(0x11, RAM_ROOM)
    emit(0x19, 0xC9)
    label("map_tile")
    call("map_offset")
    emit(0x7E, 0xC9)
    label("set_map_tile")
    emit(0x47)
    call("map_offset")
    emit(0x70, 0xC9)
    label("draw")
    emit(0x47)
    call("offset")
    emit(0x29, 0x7D, 0xD3, 0xBF, 0x7C, 0xF6, 0x78, 0xD3, 0xBF)
    emit(0x78, 0xD3, 0xBE, 0xAF, 0xD3, 0xBE, 0xC9)
    label("message")
    z.vdp(0x7800 + 2 * (20 * 32 + 6))
    z.word(0x01, TEXT_WIDTH * 2)
    label("message_bytes")
    emit(0x7E, 0xD3, 0xBE, 0x23, 0x0B, 0x78, 0xB1)
    z.relative(0x20, "message_bytes")
    emit(0xC9)
    label("vblank")
    emit(0xDB, 0xBF, 0xE6, 0x80)
    z.relative(0x28, "vblank")
    emit(0xC9)
    label("registers")
    emit(0x04, 0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0, 0, 0, 0xFF)
    label("normal_deltas")
    emit(0, 0, 1, 1, 1, 0, 0, 0, 0)
    label("boosted_deltas")
    emit(0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0)
    for index, text in enumerate(MESSAGES):
        label(f"text_{index}")
        for tile in words(text.center(TEXT_WIDTH)):
            emit(tile, 0)
    return cartridge_image(z, patterns, b"", palette, extra=rooms)
