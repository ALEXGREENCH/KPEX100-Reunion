%{
#DEFINE PLAYERVER 4
#DEFINE LCDCLASS 255
#DEFINE IMAGETYPE 255
#DEFINE AUDIOTYPE 255
#DEFINE APPTYPE 1
#DEFINE APPCPID 100
#DEFINE APPID 991
#DEFINE APPVER 256
#DEFINE APPNAME "Reunion GB"
#DEFINE VALIDCOUNT 255
#DEFINE VALIDTERM 255
%}

// ROM-only DMG/CGB prototype. The cartridge runs in Mobile C bytecode.
int cart[8192], video[16384], ram[8192], colors[64];
int seen[360], seenVersion[360], tileVersion[768], paletteVersion[8], dmgVersion;
int a, b, c, d, e, hl, pc, zero, buttons, p1, lcd, bgp;
int ready, failure, ox, oy, paintRow, pendingButtons, repaintSlices, joypadWait;
int colorMode, bank, colorIndex, paintColor;

int Read8(int addr) {
    if (addr < 32768) return (cart[addr >> 2] >> ((addr & 3) * 8)) & 255;
    if (addr < 40960) return video[bank * 8192 + addr - 32768];
    if (addr >= 49152 && addr < 57344) return ram[addr - 49152];
    if (addr == 65280) {
        if ((p1 & 16) == 0) return 192 | p1 | (15 ^ buttons);
        return 192 | p1 | 15;
    }
    if (colorMode && addr == 65359) return 254 | bank;
    if (colorMode && addr == 65384) return 64 | colorIndex;
    if (colorMode && addr == 65385) return colors[colorIndex & 63];
    return 255;
}

void Write8(int addr, int value) {
    int offset, index;
    if (addr >= 32768 && addr < 40960) {
        offset = addr - 32768;
        index = bank * 8192 + offset;
        if (video[index] != value) {
            video[index] = value;
            if (offset < 6144) tileVersion[bank * 384 + offset / 16]++;
            repaintSlices = 6;
        }
        return;
    }
    if (addr >= 49152 && addr < 57344) ram[addr - 49152] = value;
    if (addr == 65280) p1 = value & 48;
    if (addr == 65344 && lcd != value) {
        lcd = value;
        repaintSlices = 6;
    }
    if (addr == 65351 && bgp != value) {
        bgp = value;
        dmgVersion++;
        repaintSlices = 6;
    }
    if (!colorMode) return;
    if (addr == 65359) bank = value & 1;
    if (addr == 65384) colorIndex = value & 191;
    if (addr == 65385) {
        index = colorIndex & 63;
        if (colors[index] != value) {
            colors[index] = value;
            paletteVersion[index / 8]++;
            repaintSlices = 6;
        }
        if (colorIndex & 128) colorIndex = 128 | ((index + 1) & 63);
    }
}

int Fetch8() {
    int value;
    value = Read8(pc);
    pc = (pc + 1) & 65535;
    return value;
}

int Fetch16() {
    int low;
    low = Fetch8();
    return low | (Fetch8() << 8);
}

void JumpRelative(int condition) {
    int delta, opcode;
    delta = Fetch8();
    if (delta >= 128) delta -= 256;
    if (!condition) return;
    pc = (pc + delta) & 65535;
    // LDH A,[JOYP]; CPL; AND 15; JR Z/NZ to itself. Inputs stay
    // constant for this event, so every further iteration is identical.
    if (delta == -7 && pc <= 32761 && Read8(pc) == 240 && Read8(pc + 1) == 0 &&
        Read8(pc + 2) == 47 && Read8(pc + 3) == 230 && Read8(pc + 4) == 15) {
        opcode = Read8(pc + 5);
        if (opcode == 32 || opcode == 40) joypadWait = 1;
    }
}

void Step() {
    int op, value;
    op = Fetch8();
    switch (op) {
        case 0: break;
        case 1: value = Fetch16(); b = value >> 8; c = value & 255; break;
        case 9: hl = (hl + (b << 8) + c) & 65535; break;
        case 11: value = ((b << 8) + c - 1) & 65535; b = value >> 8; c = value & 255; break;
        case 17: value = Fetch16(); d = value >> 8; e = value & 255; break;
        case 19: value = ((d << 8) + e + 1) & 65535; d = value >> 8; e = value & 255; break;
        case 20: d = (d + 1) & 255; zero = d == 0; break;
        case 21: d = (d - 1) & 255; zero = d == 0; break;
        case 24: JumpRelative(1); break;
        case 26: a = Read8((d << 8) | e); break;
        case 28: e = (e + 1) & 255; zero = e == 0; break;
        case 29: e = (e - 1) & 255; zero = e == 0; break;
        case 32: JumpRelative(!zero); break;
        case 33: hl = Fetch16(); break;
        case 34: Write8(hl, a); hl = (hl + 1) & 65535; break;
        case 35: hl = (hl + 1) & 65535; break;
        case 40: JumpRelative(zero); break;
        case 47: a = a ^ 255; break;
        case 54: Write8(hl, Fetch8()); break;
        case 60: a = (a + 1) & 255; zero = a == 0; break;
        case 61: a = (a - 1) & 255; zero = a == 0; break;
        case 62: a = Fetch8(); break;
        case 87: d = a; break;
        case 95: e = a; break;
        case 120: a = b; break;
        case 122: a = d; break;
        case 123: a = e; break;
        case 126: a = Read8(hl); break;
        case 177: a = a | c; zero = a == 0; break;
        case 195: pc = Fetch16(); break;
        case 224: Write8(65280 + Fetch8(), a); break;
        case 230: a = a & Fetch8(); zero = a == 0; break;
        case 234: Write8(Fetch16(), a); break;
        case 240: a = Read8(65280 + Fetch8()); break;
        case 250: a = Read8(Fetch16()); break;
        case 254: zero = a == Fetch8(); break;
        default: failure = op + 1; break;
    }
}

void Color(int index, int attr) {
    int offset, rgb, r, g, b;
    if (colorMode) {
        offset = (attr & 7) * 8 + index * 2;
        rgb = colors[offset] | ((colors[offset + 1] & 127) << 8);
        if (paintColor == rgb) return;
        paintColor = rgb;
        r = rgb & 31;
        g = (rgb >> 5) & 31;
        b = (rgb >> 10) & 31;
        SetColorRGB((r << 3) | (r >> 2), (g << 3) | (g >> 2), (b << 3) | (b >> 2));
        return;
    }
    index = (bgp >> (index * 2)) & 3;
    if (paintColor == index + 32768) return;
    paintColor = index + 32768;
    if (index == 0) SetColorRGB(192, 217, 127);
    if (index == 1) SetColorRGB(120, 165, 82);
    if (index == 2) SetColorRGB(63, 109, 58);
    if (index == 3) SetColorRGB(23, 57, 42);
}

void TileRun(int x, int y, int key, int count) {
    int row, end, bit, lo, hi, index, start, last, at, first, step, base, stride, attr, tile, dx;
    attr = key >> 10;
    tile = key & 1023;
    first = 7;
    step = -1;
    if (attr & 32) {
        first = 0;
        step = 1;
    }
    base = tile * 16;
    if (tile >= 384) base += 2048;
    stride = 2;
    if (attr & 64) {
        base += 14;
        stride = -2;
    }
    // Merge adjacent identical rows before drawing their horizontal runs.
    for (row = 0; row < 8; row = end) {
        at = base + row * stride;
        lo = video[at];
        hi = video[at + 1];
        end = row + 1;
        at += stride;
        while (end < 8) {
            if (video[at] != lo || video[at + 1] != hi) break;
            end++;
            at += stride;
        }
        if ((lo == 0 || lo == 255) && (hi == 0 || hi == 255)) {
            Color((lo & 1) | ((hi & 1) << 1), attr);
            FillRect(x, y + row, x + count * 8 - 1, y + end - 1);
            continue;
        }
        start = 0;
        last = ((lo >> first) & 1) | (((hi >> first) & 1) << 1);
        at = first;
        for (bit = 1; bit <= 8; bit++) {
            at += step;
            if (bit == 8) index = -1;
            else index = ((lo >> at) & 1) | (((hi >> at) & 1) << 1);
            if (index != last) {
                Color(last, attr);
                FillRect(x + start, y + row, x + bit - 1, y + end - 1);
                for (dx = 8; dx < count * 8; dx += 8)
                    FillRect(x + dx + start, y + row, x + dx + bit - 1, y + end - 1);
                start = bit;
                last = index;
            }
        }
    }
}

void Status(int failed) {
    paintColor = -1;
    SetColorRGB(13, 35, 29);
    FillRect(0, 0, swWidth - 1, swHeight - 1);
    SetColorRGB(192, 217, 127);
    FillRect(0, 0, swWidth - 1, 14);
    if (failed) DrawStr(8, 3, "GB: unsupported cartridge");
    else {
        if (colorMode) DrawStr(8, 3, "REUNION / PRISM RELAY");
        else DrawStr(8, 3, "REUNION / POCKET LAB");
        FillRect(0, swHeight - 14, swWidth - 1, swHeight - 1);
        if (colorMode) DrawStr(8, swHeight - 11, "GET 3 CELLS / REACH EXIT");
        else DrawStr(8, swHeight - 11, "D-PAD / MOVE");
    }
    Flush();
}

void main() {
    int file, count, i;
    ox = (swWidth - 160) / 2;
    oy = (swHeight - 144) / 2;
    file = FileOpen("POCKET.GBR", 3);
    if (file >= 0) {
        count = FileReadInt(file, &cart[0], 8192);
        if (FileClose(file) < 0) count = 0;
    } else count = 0;
    if (count != 32768 || Read8(327) != 0 || Read8(328) != 0) {
        Status(1);
        return;
    }
    if (ox < 0 || oy < 0) {
        Status(1);
        return;
    }
    for (i = 0; i < 360; i++) seen[i] = -1;
    colorMode = (Read8(323) & 128) != 0;
    Status(0);
    pc = 256;
    p1 = 48;
    bgp = 228;
    ready = 1;
    SetTimer(20, 1);
}

void EVENT_TIMEOUT() {
    int i, x, y, tile, n, updated, map, attr, offset, version, key, first, count, runKey;
    if (!ready) return;
    buttons = pendingButtons;
    pendingButtons = 0;
    joypadWait = 0;
    for (i = 0; i < 160 && !failure && !joypadWait; i++) Step();
    if (failure) {
        ResetTimer();
        Status(1);
        return;
    }
    if ((lcd & 128) == 0) return;
    if (!repaintSlices) {
        paintRow = (paintRow + 3) % 18;
        return;
    }
    repaintSlices--;
    updated = 0;
    map = 6144;
    if (lcd & 8) map = 7168;
    for (y = paintRow; y < paintRow + 3; y++) {
        count = 0;
        for (x = 0; x < 20; x++) {
            n = y * 20 + x;
            offset = map + y * 32 + x;
            tile = video[offset];
            attr = 0;
            version = dmgVersion;
            if (colorMode) {
                attr = video[8192 + offset] & 111;
                version = paletteVersion[attr & 7];
            }
            if (!(lcd & 16) && tile < 128) tile += 256;
            if (attr & 8) tile += 384;
            key = (attr << 10) | tile;
            version += tileVersion[tile];
            if (seen[n] == key && seenVersion[n] == version) {
                if (count) TileRun(ox + first * 8, oy + y * 8, runKey, count);
                count = 0;
                continue;
            }
            if (count && runKey != key) {
                TileRun(ox + first * 8, oy + y * 8, runKey, count);
                count = 0;
            }
            if (!count) {
                first = x;
                runKey = key;
            }
            count++;
            seen[n] = key;
            seenVersion[n] = version;
            updated = 1;
        }
        if (count) TileRun(ox + first * 8, oy + y * 8, runKey, count);
    }
    paintRow = (paintRow + 3) % 18;
    if (updated) Flush();
}

void EVENT_KEYPRESS() {
    if (swData == 17) pendingButtons = 1;
    if (swData == 16) pendingButtons = 2;
    if (swData == 18) pendingButtons = 4;
    if (swData == 19) pendingButtons = 8;
}
