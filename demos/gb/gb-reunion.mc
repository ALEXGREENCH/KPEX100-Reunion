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

// ROM-only DMG prototype. The cartridge runs in Mobile C bytecode.
int cart[8192], video[8192], seen[360];
int a, b, c, d, e, hl, pc, zero, buttons, p1, lcd, bgp;
int ready, failure, ox, oy, paintRow, pendingButtons;

int Read8(int addr) {
    if (addr < 32768) return (cart[addr >> 2] >> ((addr & 3) * 8)) & 255;
    if (addr < 40960) return video[addr - 32768];
    if (addr == 65280) {
        if ((p1 & 16) == 0) return 192 | p1 | (15 ^ buttons);
        return 192 | p1 | 15;
    }
    return 255;
}

void Write8(int addr, int value) {
    if (addr >= 32768 && addr < 40960) video[addr - 32768] = value & 255;
    if (addr == 65280) p1 = value & 48;
    if (addr == 65344) lcd = value;
    if (addr == 65351) bgp = value;
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
    int delta;
    delta = Fetch8();
    if (delta >= 128) delta -= 256;
    if (condition) pc = (pc + delta) & 65535;
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
        case 40: JumpRelative(zero); break;
        case 47: a = a ^ 255; break;
        case 54: Write8(hl, Fetch8()); break;
        case 61: a = (a - 1) & 255; zero = a == 0; break;
        case 62: a = Fetch8(); break;
        case 120: a = b; break;
        case 122: a = d; break;
        case 123: a = e; break;
        case 177: a = a | c; zero = a == 0; break;
        case 195: pc = Fetch16(); break;
        case 224: Write8(65280 + Fetch8(), a); break;
        case 230: a = a & Fetch8(); zero = a == 0; break;
        case 240: a = Read8(65280 + Fetch8()); break;
        case 254: zero = a == Fetch8(); break;
        default: failure = op + 1; break;
    }
}

void Color(int index) {
    if (index == 0) SetColorRGB(192, 217, 127);
    if (index == 1) SetColorRGB(120, 165, 82);
    if (index == 2) SetColorRGB(63, 109, 58);
    if (index == 3) SetColorRGB(23, 57, 42);
}

void Tile(int x, int y, int tile) {
    int row, bit, lo, hi, index, start, last;
    for (row = 0; row < 8; row++) {
        lo = video[tile * 16 + row * 2];
        hi = video[tile * 16 + row * 2 + 1];
        start = 0;
        last = (lo >> 7) | ((hi >> 7) << 1);
        for (bit = 1; bit <= 8; bit++) {
            if (bit == 8) index = -1;
            else index = ((lo >> (7 - bit)) & 1) | (((hi >> (7 - bit)) & 1) << 1);
            if (index != last) {
                Color((bgp >> (last * 2)) & 3);
                FillRect(x + start, y + row, x + bit - 1, y + row);
                start = bit;
                last = index;
            }
        }
    }
}

void Status(int failed) {
    SetColorRGB(13, 35, 29);
    FillRect(0, 0, swWidth - 1, swHeight - 1);
    SetColorRGB(192, 217, 127);
    FillRect(0, 0, swWidth - 1, 14);
    if (failed) DrawStr(8, 3, "GB: unsupported cartridge");
    else {
        DrawStr(8, 3, "REUNION / POCKET LAB");
        FillRect(0, swHeight - 14, swWidth - 1, swHeight - 1);
        DrawStr(8, swHeight - 11, "D-PAD / MOVE");
    }
    Flush();
}

void main() {
    int file, count, i;
    ox = (swWidth - 160) / 2;
    oy = (swHeight - 144) / 2;
    Status(0);
    file = FileOpen("cart.gb", 3);
    if (file >= 0) {
        count = FileReadInt(file, &cart[0], 8192);
        if (FileClose(file) < 0) count = 0;
    } else count = 0;
    if (count != 32768 || Read8(327) != 0 || Read8(328) != 0 || (Read8(323) & 128)) {
        Status(1);
        return;
    }
    if (ox < 0 || oy < 0) {
        Status(1);
        return;
    }
    for (i = 0; i < 360; i++) seen[i] = -1;
    pc = 256;
    p1 = 48;
    bgp = 228;
    ready = 1;
    SetTimer(20, 1);
}

void EVENT_TIMEOUT() {
    int i, x, y, tile, n, updated;
    if (!ready) return;
    buttons = pendingButtons;
    pendingButtons = 0;
    for (i = 0; i < 160 && !failure; i++) Step();
    if (failure) {
        ResetTimer();
        Status(1);
        return;
    }
    if ((lcd & 128) == 0) return;
    updated = 0;
    for (y = paintRow; y < paintRow + 3; y++) {
        for (x = 0; x < 20; x++) {
            n = y * 20 + x;
            tile = video[6144 + y * 32 + x];
            if (seen[n] != tile) {
                Tile(ox + x * 8, oy + y * 8, tile);
                seen[n] = tile;
                updated = 1;
            }
        }
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
