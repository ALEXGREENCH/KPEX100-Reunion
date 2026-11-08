"""ROM layout and bytecode helpers for Reunion Game Gear cartridges."""

from struct import pack


PATTERNS = 0x1000
ROOM = 0x1800
COLORS = 0x1C00
NAME_LENGTH = 32 * 28
RAM_ROOM = 0xC000
CX, CY = 0xD002, 0xD003


FONT = {
    "A": (14, 17, 17, 31, 17, 17, 17),
    "C": (14, 17, 16, 16, 16, 17, 14),
    "D": (30, 17, 17, 17, 17, 17, 30),
    "E": (31, 16, 16, 30, 16, 16, 31),
    "F": (31, 16, 16, 30, 16, 16, 16),
    "G": (14, 17, 16, 23, 17, 17, 15),
    "H": (17, 17, 17, 31, 17, 17, 17),
    "I": (14, 4, 4, 4, 4, 4, 14),
    "L": (16, 16, 16, 16, 16, 16, 31),
    "M": (17, 27, 21, 21, 17, 17, 17),
    "N": (17, 25, 21, 19, 17, 17, 17),
    "O": (14, 17, 17, 17, 17, 17, 14),
    "P": (30, 17, 17, 30, 16, 16, 16),
    "R": (30, 17, 17, 30, 20, 18, 17),
    "S": (15, 16, 16, 14, 1, 1, 30),
    "T": (31, 4, 4, 4, 4, 4, 4),
    "U": (17, 17, 17, 17, 17, 17, 14),
    "V": (17, 17, 17, 17, 17, 10, 4),
    "W": (17, 17, 17, 17, 21, 27, 17),
    "X": (17, 17, 10, 4, 10, 17, 17),
    "1": (4, 12, 4, 4, 4, 4, 14),
    "/": (1, 2, 2, 4, 8, 8, 16),
}


class Code:
    def __init__(self):
        self.data = bytearray()
        self.labels = {}
        self.patches = []

    def emit(self, *values):
        self.data.extend(values)

    def word(self, opcode, address):
        self.emit(opcode, address & 255, address >> 8)

    def label(self, name):
        assert name not in self.labels
        self.labels[name] = len(self.data)

    def to(self, opcode, name):
        self.patches.append((len(self.data) + 1, name, False))
        self.emit(opcode, 0, 0)

    def relative(self, opcode, name):
        self.patches.append((len(self.data) + 1, name, True))
        self.emit(opcode, 0)

    def resolve(self):
        for offset, name, relative in self.patches:
            address = self.labels[name]
            if relative:
                delta = address - offset - 1
                assert -128 <= delta <= 127, (name, delta)
                self.data[offset] = delta & 255
            else:
                self.data[offset : offset + 2] = pack("<H", address)
        return self.data

    def load(self, value):
        self.emit(0x3E, value)

    def store(self, address):
        self.word(0x32, address)

    def read(self, address):
        self.word(0x3A, address)

    def write(self, address, value):
        self.load(value)
        self.store(address)

    def coords(self, x, y):
        self.write(CX, x)
        self.write(CY, y)

    def port(self, port, value):
        self.load(value)
        self.emit(0xD3, port)

    def vdp(self, address):
        self.port(0xBF, address & 255)
        self.port(0xBF, address >> 8)

    def send(self, address, count, label):
        self.word(0x21, address)
        self.word(0x01, count)
        self.label(label)
        self.emit(0x7E, 0xD3, 0xBE, 0x23, 0x0B, 0x78, 0xB1)
        self.relative(0x20, label)


def cartridge_image(z, patterns, cells, palette):
    rom = bytearray(32768)
    code = z.resolve()
    assert len(code) < PATTERNS
    rom[: len(code)] = code
    rom[PATTERNS : PATTERNS + len(patterns)] = patterns
    rom[ROOM : ROOM + len(cells)] = cells
    rom[COLORS : COLORS + len(palette)] = palette
    rom[0x7FF0:0x7FF8] = b"TMR SEGA"
    rom[0x7FFA:0x7FFC] = pack("<H", sum(rom[:0x7FF0]) & 65535)
    rom[0x7FFF] = 0x6C
    return bytes(rom)
