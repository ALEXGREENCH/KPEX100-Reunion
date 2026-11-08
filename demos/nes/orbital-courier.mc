%{
#DEFINE PLAYERVER 4
#DEFINE LCDCLASS 255
#DEFINE IMAGETYPE 255
#DEFINE AUDIOTYPE 255
#DEFINE APPTYPE 1
#DEFINE APPCPID 100
#DEFINE APPID 993
#DEFINE APPVER 256
#DEFINE APPNAME "Orbital Courier"
#DEFINE VALIDCOUNT 255
#DEFINE VALIDTERM 255
%}

// RP2A03/NROM and a frame-stepped PPU for the original cartridge.
int rom[10245], ram[2048], names[2048], palettes[32], oam[256];
int seen[520], hue[16], solid[512];
int prgSize, chrStart, vertical, pc, sp, a, x, y, carry, nz;
int ctrl, mask, vramAddr, addrHigh, addrLatch, oamAddr, vblank, ppuBuffer, pollPc, guestYield;
int buttons, pending, strobe, shift;
int ready, failed, originX, originY, paintAt, painted, paletteEpoch, lastSprite, currentColor;

int ROM(int offset) {
    return (rom[offset >> 2] >> ((offset & 3) * 8)) & 255;
}

int NameIndex(int addr) {
    int table;
    table = (addr >> 10) & 3;
    if (!vertical) table = table >> 1;
    return ((table & 1) << 10) | (addr & 1023);
}

int PaletteIndex(int addr) {
    addr &= 31;
    if ((addr & 19) == 16) addr -= 16;
    return addr;
}

int PpuRead(int addr) {
    addr &= 16383;
    if (addr < 8192) return ROM(chrStart + addr);
    if (addr < 16128) return names[NameIndex(addr)];
    return palettes[PaletteIndex(addr)];
}

void PpuWrite(int addr, int value) {
    addr &= 16383;
    if (addr < 8192) return;
    if (addr < 16128) names[NameIndex(addr)] = value;
    else if (palettes[PaletteIndex(addr)] != (value & 63)) {
        palettes[PaletteIndex(addr)] = value & 63;
        paletteEpoch++;
    }
}

int CpuRead(int addr) {
    int result, value;
    if (addr >= 32768) return ROM(16 + (addr & (prgSize - 1)));
    if (addr < 8192) return ram[addr & 2047];
    if (addr == 16406) {
        if (strobe) return 64 | (buttons & 1);
        result = shift & 1;
        shift = (shift >> 1) | 128;
        return 64 | result;
    }
    if (addr >= 16384) return 0;
    switch (addr & 7) {
        case 2:
            result = vblank;
            vblank = 0;
            addrLatch = 0;
            return result;
        case 4: return oam[oamAddr];
        case 7:
            result = ppuBuffer;
            value = PpuRead(vramAddr);
            ppuBuffer = value;
            if ((vramAddr & 16383) >= 16128) {
                result = value;
                ppuBuffer = PpuRead(vramAddr - 4096);
            }
            if (ctrl & 4) vramAddr = (vramAddr + 32) & 16383;
            else vramAddr = (vramAddr + 1) & 16383;
            return result;
    }
    return 0;
}

void CpuWrite(int addr, int value) {
    int i;
    value &= 255;
    if (addr < 8192) { ram[addr & 2047] = value; return; }
    if (addr == 16406) {
        if (strobe || (value & 1)) shift = buttons;
        strobe = value & 1;
        return;
    }
    if (addr == 16404) {
        for (i = 0; i < 256; i++) oam[(oamAddr + i) & 255] = CpuRead(value * 256 + i);
        return;
    }
    if (addr >= 16384) return;
    switch (addr & 7) {
        case 0: ctrl = value; break;
        case 1: mask = value; break;
        case 3: oamAddr = value; break;
        case 4: oam[oamAddr] = value; oamAddr = (oamAddr + 1) & 255; break;
        case 5: addrLatch ^= 1; break;
        case 6:
            if (addrLatch) vramAddr = addrHigh | value;
            else addrHigh = (value & 63) << 8;
            addrLatch ^= 1;
            break;
        case 7:
            PpuWrite(vramAddr, value);
            if (ctrl & 4) vramAddr = (vramAddr + 32) & 16383;
            else vramAddr = (vramAddr + 1) & 16383;
            break;
    }
}

int Fetch() {
    int value;
    value = CpuRead(pc);
    pc = (pc + 1) & 65535;
    return value;
}

int Word() {
    int lo;
    lo = Fetch();
    return lo | (Fetch() << 8);
}

void Branch(int condition) {
    int delta;
    delta = Fetch();
    if (delta & 128) delta -= 256;
    if (condition) pc = (pc + delta) & 65535;
}

void Compare(int left, int right) {
    carry = left >= right;
    nz = (left - right) & 255;
}

void Add(int value) {
    int sum;
    sum = a + value + carry;
    carry = sum > 255;
    a = sum & 255;
    nz = a;
}

void Push(int value) {
    ram[256 + sp] = value & 255;
    sp = (sp - 1) & 255;
}

int Pull() {
    sp = (sp + 1) & 255;
    return ram[256 + sp];
}

void Step() {
    int op, addr, value;
    op = Fetch();
    switch (op) {
        case 5: a |= ram[Fetch()]; nz = a; break;
        case 9: a |= Fetch(); nz = a; break;
        case 10: carry = a >> 7; a = (a << 1) & 255; nz = a; break;
        case 16:
            Branch((nz & 128) == 0);
            // A tight LDA PPUSTATUS / BPL loop can wait for the next timer slice.
            if (pc == pollPc) guestYield = 1;
            break;
        case 24: carry = 0; break;
        case 32: addr = Word(); value = pc - 1; Push(value >> 8); Push(value); pc = addr; break;
        case 36: value = ram[Fetch()]; nz = (value & 128) | ((value & a) != 0); break;
        case 41: a &= Fetch(); nz = a; break;
        case 48: Branch(nz & 128); break;
        case 56: carry = 1; break;
        case 69: a ^= ram[Fetch()]; nz = a; break;
        case 73: a ^= Fetch(); nz = a; break;
        case 74: carry = a & 1; a >>= 1; nz = a; break;
        case 76: pc = Word(); break;
        case 96: value = Pull(); pc = ((value | (Pull() << 8)) + 1) & 65535; break;
        case 105: Add(Fetch()); break;
        case 106: value = a & 1; a = (a >> 1) | (carry << 7); carry = value; nz = a; break;
        case 120: break;
        case 132: ram[Fetch()] = y; break;
        case 133: ram[Fetch()] = a; break;
        case 134: ram[Fetch()] = x; break;
        case 136: y = (y - 1) & 255; nz = y; break;
        case 138: a = x; nz = a; break;
        case 141: addr = Word(); CpuWrite(addr, a); break;
        case 144: Branch(!carry); break;
        case 152: a = y; nz = a; break;
        case 154: sp = x; break;
        case 157: addr = Word(); CpuWrite((addr + x) & 65535, a); break;
        case 160: y = Fetch(); nz = y; break;
        case 162: x = Fetch(); nz = x; break;
        case 164: y = ram[Fetch()]; nz = y; break;
        case 165: a = ram[Fetch()]; nz = a; break;
        case 166: x = ram[Fetch()]; nz = x; break;
        case 168: y = a; nz = y; break;
        case 169: a = Fetch(); nz = a; break;
        case 170: x = a; nz = x; break;
        case 173:
            addr = Word();
            if (addr >= 8192 && addr < 16384 && (addr & 7) == 2) pollPc = pc - 3;
            else pollPc = -1;
            a = CpuRead(addr);
            nz = a;
            break;
        case 176: Branch(carry); break;
        case 177: addr = Fetch(); a = CpuRead((ram[addr] + (ram[(addr + 1) & 255] << 8) + y) & 65535); nz = a; break;
        case 185: addr = Word(); a = CpuRead((addr + y) & 65535); nz = a; break;
        case 189: addr = Word(); a = CpuRead((addr + x) & 65535); nz = a; break;
        case 192: Compare(y, Fetch()); break;
        case 197: Compare(a, ram[Fetch()]); break;
        case 198: addr = Fetch(); ram[addr] = (ram[addr] - 1) & 255; nz = ram[addr]; break;
        case 200: y = (y + 1) & 255; nz = y; break;
        case 201: Compare(a, Fetch()); break;
        case 202: x = (x - 1) & 255; nz = x; break;
        case 208: Branch(nz != 0); break;
        case 216: break;
        case 221: addr = Word(); Compare(a, CpuRead((addr + x) & 65535)); break;
        case 224: Compare(x, Fetch()); break;
        case 230: addr = Fetch(); ram[addr] = (ram[addr] + 1) & 255; nz = ram[addr]; break;
        case 232: x = (x + 1) & 255; nz = x; break;
        case 233: Add(Fetch() ^ 255); break;
        case 234: break;
        case 240: Branch(nz == 0); break;
        default: failed = 1; break;
    }
}

void Color(int value) {
    int rgb, light, wash;
    if (value == currentColor) return;
    currentColor = value;
    rgb = hue[value & 15];
    light = 12 + (value >> 4) * 10;
    wash = 0;
    if (value >= 48) wash = 60;
    if ((value & 15) >= 13) { light = 0; wash = 0; }
    SetColorRGB(((rgb >> 16) * light >> 6) + wash,
                (((rgb >> 8) & 255) * light >> 6) + wash,
                ((rgb & 255) * light >> 6) + wash);
}

int SolidPattern(int pattern) {
    int row, lo, hi, index;
    index = pattern >> 4;
    if (solid[index]) return solid[index] - 2;
    lo = ROM(chrStart + pattern);
    hi = ROM(chrStart + pattern + 8);
    if ((lo == 0 || lo == 255) && (hi == 0 || hi == 255)) {
        for (row = 1; row < 8; row++)
            if (ROM(chrStart + pattern + row) != lo || ROM(chrStart + pattern + row + 8) != hi) break;
        if (row == 8) {
            solid[index] = 2 + (lo & 1) + (hi & 2);
            return solid[index] - 2;
        }
    }
    solid[index] = 1;
    return -1;
}

void DrawTile(int sx, int sy, int pattern, int pal, int flags, int sprite) {
    int row, scan, lo, hi, px, bit, index, start, last;
    if (!sprite) {
        index = SolidPattern(pattern);
        if (index >= 0) {
            if (index == 0) Color(palettes[0]);
            else Color(palettes[pal + index]);
            FillRect(sx, sy, sx + 7, sy + 7);
            return;
        }
    }
    for (row = 0; row < 8; row++) {
        if (sy + row < originY || sy + row >= originY + 160) continue;
        scan = row;
        if (flags & 128) scan = 7 - row;
        lo = ROM(chrStart + pattern + scan);
        hi = ROM(chrStart + pattern + scan + 8);
        start = 0;
        last = -1;
        for (px = 0; px <= 8; px++) {
            index = -1;
            if (px < 8 && sx + px >= originX && sx + px < originX + 208) {
                bit = 7 - px;
                if (flags & 64) bit = px;
                index = ((lo >> bit) & 1) | (((hi >> bit) & 1) << 1);
                if (sprite && index == 0) index = -1;
            }
            if (index == last) continue;
            if (last >= 0) {
                if (last == 0) Color(palettes[0]);
                else Color(palettes[pal + last]);
                FillRect(sx + start, sy + row, sx + px - 1, sy + row);
            }
            start = px;
            last = index;
        }
    }
}

int PaintCell(int col, int row, int force) {
    int base, attr, tile, pal, key, cell;
    if (col < 3 || col > 28 || row < 5 || row > 24) return 0;
    base = 8192 + (ctrl & 3) * 1024;
    tile = PpuRead(base + row * 32 + col);
    attr = PpuRead(base + 960 + (row >> 2) * 8 + (col >> 2));
    pal = ((attr >> ((row & 2) * 2 + (col & 2))) & 3) * 4;
    key = (paletteEpoch << 13) | ((ctrl & 16) << 8) | (pal << 8) | tile;
    cell = (row - 5) * 26 + col - 3;
    if (!force && seen[cell] == key) return 0;
    seen[cell] = key;
    DrawTile(originX + (col - 3) * 8, originY + (row - 5) * 8,
             ((ctrl & 16) << 8) + tile * 16, pal, 0, 0);
    return 1;
}

int RestoreSprite(int signature) {
    int col, row, sx, sy, changed;
    if (signature == -1) return 0;
    sx = signature & 255;
    sy = ((signature >> 8) & 255) + 1;
    changed = 0;
    for (row = sy >> 3; row <= (sy + 7) >> 3; row++)
        for (col = sx >> 3; col <= (sx + 7) >> 3; col++) changed |= PaintCell(col, row, 1);
    return changed;
}

void Paint() {
    int row, col, changed, signature, scanned, drawn;
    if (!(mask & 8)) return;
    signature = -1;
    if (mask & 16) signature = oam[0] * 256 + oam[3] + (oam[1] << 16) + (oam[2] << 24);
    changed = signature != lastSprite;
    if (painted && changed) changed |= RestoreSprite(lastSprite);
    lastSprite = signature;
    drawn = 0;
    for (scanned = 0; scanned < 52 && drawn < 12; scanned++) {
        row = 5 + paintAt / 26;
        col = 3 + paintAt % 26;
        drawn += PaintCell(col, row, 0);
        paintAt++;
        if (paintAt == 520) {
            paintAt = 0;
            if (!painted) {
                painted = 1;
                changed = 1;
            }
        }
    }
    changed |= drawn;
    if (!painted || !changed) return;
    if (signature != -1)
        DrawTile(originX + oam[3] - 24, originY + oam[0] + 1 - 40,
                 ((ctrl & 8) << 9) + oam[1] * 16, 16 + (oam[2] & 3) * 4, oam[2], 1);
    Flush();
}

int Key(int code) {
    if (code == 17) return 128;
    if (code == 16) return 64;
    if (code == 19) return 32;
    if (code == 18) return 16;
    if (code == 20) return 1;
    return 0;
}

void Status(int error) {
    SetColorRGB(6, 10, 23);
    FillRect(0, 0, swWidth - 1, swHeight - 1);
    SetColorRGB(98, 193, 245);
    if (error) DrawStr(8, 6, "NES: unsupported cartridge");
    else DrawStr(26, 64, "ORBITAL COURIER / LOADING");
    Flush();
}

void main() {
    int file, count, i;
    Status(0);
    file = FileOpen("cart.nes", 3);
    count = 0;
    if (file >= 0) {
        count = FileReadInt(file, &rom[0], 10245);
        if (FileClose(file) < 0) count = 0;
    }
    prgSize = ROM(4) * 16384;
    chrStart = 16 + prgSize;
    if (swWidth < 208 || swHeight < 160 || ROM(0) != 78 || ROM(1) != 69 ||
        ROM(2) != 83 || ROM(3) != 26 || (ROM(4) != 1 && ROM(4) != 2) || ROM(5) != 1 ||
        (ROM(6) & 254) || ROM(7) || count != chrStart + 8192) {
        Status(1);
        return;
    }
    vertical = ROM(6) & 1;
    originX = (swWidth - 208) / 2;
    originY = (swHeight - 160) / 2;
    for (i = 0; i < 520; i++) seen[i] = -1;
    hue[0] = 0xe5f0ff; hue[1] = 0x528fff; hue[2] = 0x7d6cff; hue[3] = 0xb24aff;
    hue[4] = 0xdf5eda; hue[5] = 0xff658e; hue[6] = 0xff704f; hue[7] = 0xffcb4f;
    hue[8] = 0xd9ca52; hue[9] = 0x87d351; hue[10] = 0x55df99; hue[11] = 0x3adcc9;
    hue[12] = 0x42c2f2;
    pc = CpuRead(65532) | (CpuRead(65533) << 8);
    sp = 253;
    lastSprite = -1;
    pollPc = -1;
    currentColor = -1;
    ready = 1;
    SetTimer(20, 1);
}

void EVENT_TIMEOUT() {
    int i, held;
    if (!ready) return;
    held = GetKeyState();
    buttons = pending;
    for (i = 16; i <= 20; i++) if (held & (1 << i)) buttons |= Key(i);
    pending = 0;
    vblank = 128;
    guestYield = 0;
    for (i = 0; i < 384 && !failed && !guestYield; i++) Step();
    if (failed) {
        ResetTimer();
        Status(1);
        return;
    }
    Paint();
}

void EVENT_KEYPRESS() {
    pending |= Key(swData);
}
