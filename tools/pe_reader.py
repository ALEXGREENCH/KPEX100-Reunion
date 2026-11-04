"""Small bounded PE32 reader for static research tools; never loads native code."""

import struct


class Pe32:
    def __init__(self, data: bytes):
        self.data = data
        if len(data) < 64 or data[:2] != b"MZ":
            raise ValueError("Not a DOS/PE executable")
        pe = self.u32(0x3C)
        self.require(pe, 24)
        if data[pe : pe + 4] != b"PE\0\0":
            raise ValueError("Missing PE signature")
        count = self.u16(pe + 6)
        opt_size = self.u16(pe + 20)
        opt = pe + 24
        self.require(opt, opt_size)
        if opt_size < 64 or self.u16(opt) != 0x10B or not 1 <= count <= 96:
            raise ValueError("Expected bounded PE32 section table")
        self.image_base = self.u32(opt + 28)
        self.sections = []
        for i in range(count):
            pos = opt + opt_size + i * 40
            self.require(pos, 40)
            virtual_size, rva, size, raw = struct.unpack_from("<4I", data, pos + 8)
            self.require(raw, size)
            self.sections.append((rva, virtual_size, raw, size))
        self.overlay = max(raw + size for _, _, raw, size in self.sections)

    def require(self, offset: int, size: int):
        if offset < 0 or size < 0 or offset + size > len(self.data):
            raise ValueError(f"Truncated input at 0x{offset:X}, length {size}")

    def u16(self, offset):
        self.require(offset, 2)
        return struct.unpack_from("<H", self.data, offset)[0]

    def u32(self, offset):
        self.require(offset, 4)
        return struct.unpack_from("<I", self.data, offset)[0]

    def va_offset(self, address):
        rva = address - self.image_base
        for start, _, raw, size in self.sections:
            if start <= rva < start + size:
                return raw + rva - start
        raise ValueError(f"VA 0x{address:X} has no file-backed section")

    def ascii_at_va(self, address, limit=256):
        start = self.va_offset(address)
        end = self.data.find(b"\0", start, min(start + limit, len(self.data)))
        if end < 0:
            raise ValueError(f"Unterminated ASCII string at VA 0x{address:X}")
        return self.data[start:end].decode("ascii")
