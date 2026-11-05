"""Execute authored SGS through the original ARM Save/Flush/Restore handlers."""

from pathlib import Path
import struct

import pytest

from kpex.gnex import GnexRuntime

pytestmark = pytest.mark.originals
ROOT = Path(__file__).resolve().parents[1]


def call(number):
    return [146, number]


def push(value):
    return [5, value & 0xFFFF]


def script(start, timeout=(255,), keypress=(255,)):
    # Ten scalar variables include the native width/height and timer counters.
    code = [*start, *timeout, *keypress]
    a = 128 + len(code) * 2
    b, c = a + 80, a + 120
    body = bytearray(c)
    body[0] = 4
    struct.pack_into("<I", body, 28, 128)
    struct.pack_into("<I", body, 36, 128 + len(start) * 2)
    struct.pack_into("<I", body, 40, 128 + (len(start) + len(timeout)) * 2)
    struct.pack_into("<4I", body, 72, a, b, c, c)
    struct.pack_into("<I", body, 120, c)
    struct.pack_into(f"<{len(code)}H", body, 128, *code)
    for i in range(10):
        struct.pack_into("<HHI", body, a + i * 8, 1, 1, 0)
    return bytes(body)


@pytest.fixture(scope="module")
def rom():
    return (ROOT / "data/firmware/Kingston-2.12.rom").read_bytes()


def test_flush_survives_native_restore_and_later_events(rom):
    game = GnexRuntime(
        rom,
        script(
            [*call(0x3A), *call(0x51), *call(0x3B), *call(0x5F), *call(0x52), 255],
            keypress=[*call(0x3A), 255],
        ),
        width=64,
        height=64,
    )
    game.event("START")
    assert game.status == "idle", game.diagnostics
    drawing_buffer = game._read(0x20B41260)
    assert bytes(game.u.mem_read(drawing_buffer, 64 * 64 * 2)) == b"\xff" * 8192
    assert game.framebuffer.getextrema() == ((0, 0),) * 3
    for event in ("TIMEOUT", "KEYPRESS", "TIMEOUT"):
        game.event(event)
        assert game.status == "idle", game.diagnostics
        assert game.framebuffer.getextrema() == ((0, 0),) * 3


@pytest.mark.parametrize(
    "rectangle,expected_box",
    [
        ((1, 2, 3, 4), (1, 2, 3, 4)),
        ((63, 63, 63, 63), (63, 63, 63, 63)),
        ((-2, -1, 1, 2), (0, 0, 1, 2)),
        ((62, 62, 80, 90), (62, 62, 63, 63)),
        ((65, 0, 90, 30), None),
        ((8, 9, 3, 4), (3, 4, 8, 9)),
    ],
)
def test_partial_flush_clips_inclusive_endpoints_and_preserves_rest(
    rom, rectangle, expected_box
):
    arguments = [word for value in rectangle for word in push(value)]
    game = GnexRuntime(
        rom,
        script(
            [*call(0x3A), *call(0x51), *call(0x5F), 255],
            [*call(0x3B), *arguments, *call(0x60), *call(0x52), 255],
            [*call(0x3B), 255],
        ),
        width=64,
        height=64,
    )
    game.event("START")
    game.event("TIMEOUT")
    assert game.status == "idle", game.diagnostics
    for y in range(64):
        for x in range(64):
            inside = expected_box and (
                expected_box[0] <= x <= expected_box[2]
                and expected_box[1] <= y <= expected_box[3]
            )
            color = 0 if inside else 255
            assert game.framebuffer.getpixel((x, y)) == (color,) * 3
    presented = game.framebuffer.tobytes()
    game.event("KEYPRESS")
    assert game.status == "idle", game.diagnostics
    assert game.framebuffer.tobytes() == presented


def test_legacy_fallback_stops_at_first_partial_flush(rom):
    game = GnexRuntime(
        rom,
        script(
            [*call(0x3A), 255],
            [*call(0x3B), *push(0), *push(0), *push(0), *push(0), *call(0x60), 255],
            [*call(0x3A), 255],
        ),
        width=64,
        height=64,
    )
    game.event("START")
    assert game.framebuffer.getextrema() == ((255, 255),) * 3
    game.event("TIMEOUT")
    assert game.status == "idle", game.diagnostics
    assert game.framebuffer.getpixel((0, 0)) == (0, 0, 0)
    assert game.framebuffer.getpixel((1, 0)) == (255, 255, 255)
    presented = game.framebuffer.tobytes()
    game.event("KEYPRESS")
    assert game.status == "idle", game.diagnostics
    assert game.framebuffer.tobytes() == presented
