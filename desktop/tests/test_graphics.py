import pytest
from kpex.graphics import Graphics, decode_sgs_image, ImageFormatError


def rgb_fixture():
    # 2x2, 1-bit true color, anchor (1,1), transparent index 0 / red index 1.
    return bytes([9, 2, 2, 1, 1, 1, 2, 0, 0, 0, 255, 0, 0, 0b10010000])


def test_packed_rgb_palette_and_transparency():
    image = decode_sgs_image(rgb_fixture())
    assert image.size == (2, 2)
    assert list(image.get_flattened_data()) == [
        (255, 0, 0, 255),
        (0, 0, 0, 0),
        (0, 0, 0, 0),
        (255, 0, 0, 255),
    ]
    assert image.info["anchor"] == (1, 1)


def test_anchor_clip_and_transparency_preserve_destination():
    g = Graphics(4, 4)
    g.clear((0, 255, 0))
    g.set_clip(1, 1, 2, 2)
    g.draw_image(rgb_fixture(), 1, 1)
    assert g.framebuffer.getpixel((0, 0)) == (0, 255, 0)
    assert g.framebuffer.getpixel((1, 1)) == (255, 0, 0)
    assert g.framebuffer.getpixel((0, 1)) == (0, 255, 0)


def test_mirror_relocates_anchor():
    g = Graphics(4, 4)
    g.draw_image(rgb_fixture(), 1, 1, 1)
    assert g.framebuffer.getpixel((2, 0)) == (255, 0, 0)
    assert g.framebuffer.getpixel((1, 1)) == (255, 0, 0)


@pytest.mark.parametrize(
    "payload",
    [
        b"",
        bytes([9, 1, 1, 0, 0]),
        bytes([127, 1, 1, 0, 0]),
        bytes([9, 0, 1, 0, 0]),
        rgb_fixture()[:-1],
    ],
)
def test_malformed_image_rejected(payload):
    with pytest.raises(ImageFormatError):
        decode_sgs_image(payload)


def test_unknown_palette_never_misrepresented_as_verified_color():
    image = decode_sgs_image(bytes([8, 1, 1, 0, 0, 42]))
    assert image.getpixel((0, 0)) == (255, 0, 255, 255)
    assert image.info["unknown_palette_indices"] == [42]
