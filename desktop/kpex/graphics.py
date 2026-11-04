"""GNEX packed image decoding and a clipped software LCD.

Image layouts are corroborated by the supplied SGS corpus and GNEX SScript.h.
Unresolved device palette entries and host text substitution are reported.
"""

from __future__ import annotations

import struct
from collections import OrderedDict
from PIL import Image, ImageDraw, ImageFont, ImageOps


class ImageFormatError(ValueError):
    pass


GLOBAL_PALETTE = {
    0: (255, 255, 255, 255),
    1: (170, 170, 170, 255),
    2: (85, 85, 85, 255),
    3: (0, 0, 0, 255),
    4: (0, 0, 0, 0),
}


def decode_sgs_image(payload: bytes, palette=None) -> Image.Image:
    """Decode 1/2/4/8-bit SGS image formats 2..12, preserving anchors.

    Unknown global colors are magenta, with indices in Image.info. The buffer
    may include allocation padding; the exact packed pixel bounds are checked.
    """
    if len(payload) < 5:
        raise ImageFormatError("Truncated image header")
    tag = payload[0]
    fmt, wide = tag & 127, bool(tag & 128)
    header = 9 if wide else 5
    if len(payload) < header:
        raise ImageFormatError("Truncated wide image header")
    if wide:
        w, h, ax, ay = struct.unpack_from("<HHhh", payload, 1)
    else:
        w, h = payload[1:3]
        ax, ay = struct.unpack_from("bb", payload, 3)
    if not w or not h or w * h > 4_000_000:
        raise ImageFormatError(f"Invalid image dimensions: {w}x{h}")
    pos = header
    local = None
    transparent = False
    if fmt in (2, 3):
        bits = 1 << (fmt - 2)
        n = 1 << (bits - 1)
        if len(payload) < pos + n:
            raise ImageFormatError("Truncated grayscale palette")
        local = [v for b in payload[pos : pos + n] for v in (b >> 4, b & 15)]
        pos += n
    elif fmt == 4:
        bits = 4
    elif fmt in (5, 6, 7, 8):
        bits = 1 << (fmt - 5)
        n = (1 << bits) if fmt < 8 else 0
        if len(payload) < pos + n:
            raise ImageFormatError("Truncated indexed palette")
        local = list(payload[pos : pos + n]) if n else None
        pos += n
    elif fmt in (9, 10, 11, 12):
        bits = 1 << (fmt - 9)
        if len(payload) < pos + 2 or payload[pos] not in (0, 1):
            raise ImageFormatError("Invalid RGB palette header")
        transparent = payload[pos] == 1
        n = payload[pos + 1] or 256
        pos += 2
        if len(payload) < pos + n * 3:
            raise ImageFormatError("Truncated RGB palette")
        local = [
            tuple(payload[pos + i * 3 : pos + i * 3 + 3])
            + (0 if transparent and i == 0 else 255,)
            for i in range(n)
        ]
        pos += n * 3
    else:
        raise ImageFormatError(f"Unsupported SGS image format {fmt}")
    needed = (w * h * bits + 7) // 8
    if pos + needed > len(payload):
        raise ImageFormatError("Truncated image pixels")
    indices = [
        (payload[pos + (k * bits) // 8] >> (8 - bits - (k * bits) % 8))
        & ((1 << bits) - 1)
        for k in range(w * h)
    ]
    unknown = set()
    if fmt >= 9:
        if max(indices) >= len(local):
            raise ImageFormatError("Pixel index exceeds RGB palette")
        pixels = [local[x] for x in indices]
    else:
        table = GLOBAL_PALETTE if palette is None else palette
        mapped = [local[x] if local is not None else x for x in indices]
        unknown = {i for i in mapped if i not in table}
        pixels = [tuple(table[i]) if i in table else (255, 0, 255, 255) for i in mapped]
    im = Image.new("RGBA", (w, h))
    im.putdata(pixels)
    im.info.update(anchor=(ax, ay), format=fmt, unknown_palette_indices=sorted(unknown))
    return im


class Graphics:
    def __init__(self, width=220, height=176):
        if not (0 < width <= 2048 and 0 < height <= 2048):
            raise ValueError("Invalid LCD dimensions")
        self.width, self.height = width, height
        self.framebuffer = Image.new("RGB", (width, height), "black")
        self.color = (0, 0, 0, 255)
        self.text_fg, self.text_bg = self.color, (255, 255, 255, 255)
        self.clip = (0, 0, width, height)
        self.diagnostics = set()
        self.draw_calls = 0
        self._cache = OrderedDict()
        self._cache_bytes = 0
        self._font = ImageFont.load_default(size=10)
        self._saved = None
        self.palette = dict(GLOBAL_PALETTE)
        self._rom_palettes = None
        self.gamma, self.phase = 3, 0
        self._color_index = 3
        self._rom_fonts = None

    def load_rom_palette(self, rom: bytes, gamma=3, phase=0):
        """K2.12 native SetGamma table (file 0x43d178; RAM 0x21f3d178).

        Native routine at file 0x45a4c selects gamma*2184+phase*364.
        Initializer 0x45c78 explicitly selects gamma 3 and phase 0.
        """
        import hashlib

        if (
            hashlib.sha256(rom).hexdigest()
            != "743d0b9a377dc6a3f0a80b7816cee575ad2f8249643876367c4bfaac54ddd19a"
        ):
            raise ValueError("Palette profile requires the verified Kingston 2.12 ROM")
        self._rom_palettes = bytes(rom[0x43D178 : 0x43D178 + 7 * 6 * 182 * 2])
        self._rom_fonts = [
            bytes(rom[o : o + 128 * n])
            for o, n in [(0x440D30, 2), (0x440E30, 5), (0x4410B0, 7)]
        ]
        self.gamma, self.phase = int(gamma), int(phase)
        self._select_palette()

    def _select_palette(self):
        if self._rom_palettes is None:
            return
        pos = (self.gamma * 6 + self.phase) * 364
        words = struct.unpack_from("<182H", self._rom_palettes, pos)
        self.palette = {
            i: (
                ((v >> 11) & 31) * 255 // 31,
                ((v >> 5) & 63) * 255 // 63,
                (v & 31) * 255 // 31,
                0 if i == 4 else 255,
            )
            for i, v in enumerate(words)
        }
        self._cache.clear()
        self._cache_bytes = 0
        if self._color_index is not None:
            self.color = self.resolve_color(self._color_index)

    def set_gamma(self, gamma):
        if 0 <= gamma < 7:
            self.gamma = int(gamma)
            self._select_palette()

    def set_phase(self, phase):
        phase = int(phase) % 6
        if phase != self.phase:
            self.phase = phase
            self._select_palette()

    def resolve_color(self, color):
        if isinstance(color, (tuple, list)):
            vals = tuple(max(0, min(255, int(v))) for v in color)
            if len(vals) not in (3, 4):
                raise ValueError("RGB/RGBA color requires 3/4 channels")
            return vals if len(vals) == 4 else vals + (255,)
        if color not in self.palette:
            self.diagnostics.add(f"Unknown global palette index {color}")
        elif color in (1, 2) and self._rom_palettes is None:
            self.diagnostics.add("Grayscale intensities 170/85 are approximated")
        return self.palette.get(color, (255, 0, 255, 255))

    def set_color(self, color):
        self._color_index = color if isinstance(color, int) else None
        self.color = self.resolve_color(color)

    def clear(self, color=3):
        # GNEX Clear affects the selected clipping region, like other primitives.
        self._paint(
            lambda d: d.rectangle(
                (0, 0, self.width, self.height), fill=self.resolve_color(color)
            )
        )

    def set_clip(self, x1, y1, x2, y2):
        x1, x2 = sorted((x1, x2))
        y1, y2 = sorted((y1, y2))
        self.clip = (
            max(0, int(x1)),
            max(0, int(y1)),
            min(self.width, int(x2) + 1),
            min(self.height, int(y2) + 1),
        )

    def reset_clip(self):
        self.clip = (0, 0, self.width, self.height)

    def _paste(self, layer):
        a, b, c, d = self.clip
        if c > a and d > b:
            area = layer.crop((a, b, c, d))
            self.framebuffer.paste(area, (a, b), area)
        self.draw_calls += 1

    def _paint(self, fn):
        layer = Image.new("RGBA", self.framebuffer.size)
        fn(ImageDraw.Draw(layer))
        self._paste(layer)

    def pixel(self, x, y, color=None):
        self._paint(
            lambda d: d.point(
                (x, y), fill=self.color if color is None else self.resolve_color(color)
            )
        )

    def get_pixel(self, x, y):
        if 0 <= x < self.width and 0 <= y < self.height:
            return self.framebuffer.getpixel((x, y))
        return (0, 0, 0)

    def line(self, x1, y1, x2, y2):
        self._paint(lambda d: d.line((x1, y1, x2, y2), fill=self.color))

    def rect(self, x1, y1, x2, y2, fill=True):
        if x2 < x1 or y2 < y1:
            return
        self._paint(
            lambda d: d.rectangle(
                (x1, y1, x2, y2), fill=self.color if fill else None, outline=self.color
            )
        )

    def ellipse(self, x, y, rx, ry, fill=True):
        if rx < 0 or ry < 0:
            return
        self._paint(
            lambda d: d.ellipse(
                (x - rx, y - ry, x + rx, y + ry),
                fill=self.color if fill else None,
                outline=self.color,
            )
        )

    def invert_rect(self, x1, y1, x2, y2):
        layer = Image.new("RGBA", self.framebuffer.size)
        box = (
            max(0, x1),
            max(0, y1),
            min(self.width, x2 + 1),
            min(self.height, y2 + 1),
        )
        if box[2] > box[0] and box[3] > box[1]:
            layer.paste(ImageOps.invert(self.framebuffer.crop(box)), box[:2])
            self._paste(layer)

    def draw_image(self, payload, x, y, mode=0):
        payload = bytes(payload)
        im = self._cache.get(payload)
        if im is None:
            im = decode_sgs_image(payload, self.palette)
            self._cache[payload] = im
            self._cache_bytes += len(payload) + im.width * im.height * 4
            while self._cache_bytes > 32 * 1024 * 1024 and len(self._cache) > 1:
                key, old = self._cache.popitem(last=False)
                self._cache_bytes -= len(key) + old.width * old.height * 4
        else:
            self._cache.move_to_end(payload)
        if im.info["unknown_palette_indices"]:
            self.diagnostics.add(
                "Unknown image palette indices: "
                + str(im.info["unknown_palette_indices"])
            )
        ax, ay = im.info["anchor"]
        if mode & 1:
            im = ImageOps.mirror(im)
            ax = im.width - 1 - ax
        if mode & ~1:
            self.diagnostics.add(f"Unsupported image direction flags {mode:#x}")
        layer = Image.new("RGBA", self.framebuffer.size)
        layer.paste(im, (int(x) - ax, int(y) - ay))
        self._paste(layer)

    def set_text_color(self, fg, bg=3):
        self.text_fg, self.text_bg = self.resolve_color(fg), self.resolve_color(bg)

    def draw_text(self, text, x, y, font_id=2, align=0, solid=False):
        text = str(text)[:4096]
        if (
            self._rom_fonts is not None
            and 0 <= font_id <= 5
            and all(ord(c) < 128 for c in text)
        ):
            idx = min(font_id, 2)
            scale = 2 if font_id in (3, 5) else 1
            w, h, n = [(3, 5, 2), (5, 7, 5), (5, 11, 7)][idx]
            advance, line_height = (w + 1) * scale, (h + 1) * scale
            layer = Image.new("RGBA", self.framebuffer.size)
            for row, line in enumerate(text.split("\n")):
                width = len(line) * advance
                px = int(x) - (width // 2 if align == 1 else width if align == 2 else 0)
                py = int(y) + row * line_height
                for ch in line:
                    glyph = self._rom_fonts[idx][ord(ch) * n : (ord(ch) + 1) * n]
                    mask = Image.new("L", (w, h))
                    mask.putdata(
                        [
                            255 if (glyph[k // 8] & (0x80 >> (k % 8))) else 0
                            for k in range(w * h)
                        ]
                    )
                    if scale != 1:
                        mask = mask.resize(
                            (w * scale, h * scale), Image.Resampling.NEAREST
                        )
                    if solid:
                        ImageDraw.Draw(layer).rectangle(
                            (px, py, px + advance - 1, py + line_height - 1),
                            fill=self.text_bg,
                        )
                    glyph_layer = Image.new("RGBA", mask.size, self.text_fg)
                    layer.paste(glyph_layer, (px, py), mask)
                    px += advance
            self._paste(layer)
            return
        self.diagnostics.add(
            "Non-ASCII or unavailable font uses host glyph substitution"
        )
        width = int(self._font.getlength(text))
        x -= width // 2 if align == 1 else width if align == 2 else 0

        def paint(d):
            if solid:
                d.rectangle((x, y, x + width, y + 11), fill=self.text_bg)
            d.text((x, y), text, font=self._font, fill=self.text_fg, anchor="lt")

        self._paint(paint)

    def save_lcd(self):
        self._saved = self.framebuffer.copy()

    def restore_lcd(self):
        if self._saved is not None:
            self.framebuffer.paste(self._saved)
            self.draw_calls += 1
