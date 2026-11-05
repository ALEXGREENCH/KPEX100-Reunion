"""Native pixel conversion must preserve the original display's exact colors."""

import struct

from kpex.firmware import _rgb565_image


def test_all_rgb565_colors_preserve_bit_replication():
    packed = struct.pack("<65536H", *range(65536))
    expected = bytes(
        channel
        for value in range(65536)
        for channel in (
            ((value >> 8) & 0xF8) | (value >> 13),
            ((value >> 3) & 0xFC) | ((value >> 9) & 3),
            ((value << 3) & 0xF8) | ((value >> 2) & 7),
        )
    )
    assert _rgb565_image(packed, (256, 256)).tobytes() == expected
    assert _rgb565_image(bytearray(packed), (256, 256)).tobytes() == expected
