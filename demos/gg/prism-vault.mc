%{
#DEFINE PLAYERVER 4
#DEFINE LCDCLASS 255
#DEFINE IMAGETYPE 255
#DEFINE AUDIOTYPE 255
#DEFINE APPTYPE 1
#DEFINE APPCPID 100
#DEFINE APPID 995
#DEFINE APPVER 256
#DEFINE APPNAME "Prism Vault"
#DEFINE VALIDCOUNT 255
#DEFINE VALIDTERM 255
%}

// Fixed-ROM Game Gear with the Z80 and Mode 4 features used by Prism Vault.
int rom[8193], ram[8192], vram[4096], cram[32], vdpRegs[11], solids[512];
int queue[360], queued[360], head, tail, count;
int a, b, c, d, e, hl, sp, pc, zero, carry, failed;
int access, address, latch, commandLow, cramLow, vblank, vdpRead, table;
int pad, pending, yieldGuest, statusPc, lastColor, ox, oy, ready;

int Rom(int offset) {
    return (rom[offset >> 2] >> ((offset & 3) * 8)) & 255;
}

int Read(int addr) {
    if (addr < 49152) return Rom(addr & 32767);
    return ram[addr & 8191];
}

void Write(int addr, int value) {
    if (addr >= 49152) ram[addr & 8191] = value & 255;
}

int VramByte(int offset) {
    return (vram[offset >> 2] >> ((offset & 3) * 8)) & 255;
}

void Mark(int index) {
    if (queued[index]) return;
    queued[index] = 1;
    queue[tail] = index;
    tail++;
    if (tail == 360) tail = 0;
    count++;
}

void MarkAll() {
    int i;
    for (i = 0; i < 360; i++) Mark(i);
}

void VdpControl(int value) {
    int reg, previous;
    if (!latch) {
        commandLow = value;
        latch = 1;
        return;
    }
    latch = 0;
    access = value >> 6;
    address = commandLow | ((value & 63) << 8);
    if (access == 0) {
        vdpRead = VramByte(address);
        address = (address + 1) & 16383;
    }
    if (access != 2) return;
    reg = value & 15;
    if (reg > 10) return;
    previous = vdpRegs[reg];
    vdpRegs[reg] = commandLow;
    if (reg == 2) {
        table = (commandLow & 14) << 10;
        if (commandLow != previous) MarkAll();
    }
    if (reg == 1 && ((commandLow ^ previous) & 64) && (commandLow & 64)) MarkAll();
}

void VdpData(int value) {
    int word, shift, old, row, col, offset;
    latch = 0;
    vdpRead = value;
    if (access == 3) {
        if (address & 1) {
            offset = (address & 62) >> 1;
            old = cram[offset];
            cram[offset] = cramLow | ((value & 15) << 8);
            if (old != cram[offset] && (vdpRegs[1] & 64)) MarkAll();
        } else cramLow = value;
    } else {
        old = VramByte(address);
        if (old != value) {
            word = address >> 2;
            shift = (address & 3) * 8;
            vram[word] += (value - old) << shift;
            solids[address >> 5] = 0;
            offset = address - table;
            if (offset >= 0 && offset < 1792) {
                row = offset >> 6;
                col = (offset >> 1) & 31;
                if (row >= 3 && row <= 20 && col >= 6 && col <= 25) Mark((row - 3) * 20 + col - 6);
            } else if (address < table && (vdpRegs[1] & 64)) MarkAll();
        }
    }
    address = (address + 1) & 16383;
}

int Input(int port) {
    int value;
    if (port == 191) {
        value = vblank;
        vblank = 0;
        latch = 0;
        return value;
    }
    if (port == 190) {
        value = vdpRead;
        vdpRead = VramByte(address);
        address = (address + 1) & 16383;
        latch = 0;
        return value;
    }
    if (port == 220) return 255 ^ (pad & 63);
    if (port == 0) return 255 ^ (pad & 128);
    return 255;
}

void Output(int port, int value) {
    if (port == 191) VdpControl(value);
    if (port == 190) VdpData(value);
}

int Fetch() {
    int value;
    value = Read(pc);
    pc = (pc + 1) & 65535;
    return value;
}

int Word() {
    int low;
    low = Fetch();
    return low | (Fetch() << 8);
}

void Relative(int condition) {
    int delta;
    delta = Fetch();
    if (delta & 128) delta -= 256;
    if (condition) pc = (pc + delta) & 65535;
}

void Jump(int condition) {
    int destination;
    destination = Word();
    if (condition) pc = destination;
}

void Push(int value) {
    sp = (sp - 1) & 65535;
    Write(sp, value >> 8);
    sp = (sp - 1) & 65535;
    Write(sp, value);
}

int Pop() {
    int low;
    low = Read(sp);
    sp = (sp + 1) & 65535;
    low |= Read(sp) << 8;
    sp = (sp + 1) & 65535;
    return low;
}

void Or(int value) {
    a |= value;
    zero = a == 0;
    carry = 0;
}

void Compare(int value) {
    zero = a == value;
    carry = a < value;
}

void AddHL(int value) {
    value += hl;
    hl = value & 65535;
    carry = value > 65535;
}

void Step() {
    int op, value;
    op = Fetch();
    switch (op) {
        case 0: break;
        case 1: value = Word(); b = value >> 8; c = value & 255; break;
        case 6: b = Fetch(); break;
        case 11: value = ((b << 8) + c - 1) & 65535; b = value >> 8; c = value & 255; break;
        case 12: c = (c + 1) & 255; zero = c == 0; break;
        case 14: c = Fetch(); break;
        case 16: b = (b - 1) & 255; Relative(b != 0); break;
        case 17: value = Word(); d = value >> 8; e = value & 255; break;
        case 18: Write((d << 8) | e, a); break;
        case 19: value = ((d << 8) + e + 1) & 65535; d = value >> 8; e = value & 255; break;
        case 22: d = Fetch(); break;
        case 24: Relative(1); break;
        case 25: AddHL((d << 8) | e); break;
        case 32: Relative(!zero); break;
        case 33: hl = Word(); break;
        case 35: hl = (hl + 1) & 65535; break;
        case 38: hl = (hl & 255) | (Fetch() << 8); break;
        case 40:
            Relative(zero);
            // The exact IN BF / AND 80 / JR Z polling loop can wait for the timer.
            if (pc == statusPc && Read(pc) == 219 && Read(pc + 2) == 230 && Read(pc + 3) == 128)
                yieldGuest = 1;
            break;
        case 41: AddHL(hl); break;
        case 47: a ^= 255; break;
        case 49: sp = Word(); break;
        case 50: value = Word(); Write(value, a); break;
        case 58: a = Read(Word()); break;
        case 60: a = (a + 1) & 255; zero = a == 0; break;
        case 61: a = (a - 1) & 255; zero = a == 0; break;
        case 62: a = Fetch(); break;
        case 71: b = a; break;
        case 95: e = a; break;
        case 111: hl = (hl & 65280) | a; break;
        case 112: Write(hl, b); break;
        case 120: a = b; break;
        case 121: a = c; break;
        case 124: a = hl >> 8; break;
        case 125: a = hl & 255; break;
        case 126: a = Read(hl); break;
        case 175: a = 0; carry = 0; zero = 1; break;
        case 177: Or(c); break;
        case 183: Or(a); break;
        case 184: Compare(b); break;
        case 194: Jump(!zero); break;
        case 195: Jump(1); break;
        case 201: pc = Pop(); break;
        case 202: Jump(zero); break;
        case 205: value = Word(); Push(pc); pc = value; break;
        case 211: value = Fetch(); Output(value, a); break;
        case 219:
            value = Fetch();
            if (value == 191) statusPc = pc - 2;
            else statusPc = -1;
            a = Input(value);
            break;
        case 230: a &= Fetch(); zero = a == 0; carry = 0; break;
        case 238: a ^= Fetch(); zero = a == 0; carry = 0; break;
        case 241: value = Pop(); a = value >> 8; zero = (value & 64) != 0; carry = value & 1; break;
        case 243: break;
        case 245: Push((a << 8) | (zero << 6) | carry); break;
        case 246: Or(Fetch()); break;
        case 254: Compare(Fetch()); break;
        default: failed = 1; break;
    }
}

int Solid(int pattern) {
    int i, planes, color;
    if (solids[pattern]) return solids[pattern] - 2;
    planes = vram[pattern * 8];
    color = 0;
    for (i = 0; i < 4; i++) {
        if ((planes & 255) == 255) color |= 1 << i;
        else if (planes & 255) break;
        planes >>= 8;
    }
    if (i == 4) {
        planes = vram[pattern * 8];
        for (i = 1; i < 8; i++) if (vram[pattern * 8 + i] != planes) break;
        if (i == 8) {
            solids[pattern] = color + 2;
            return color;
        }
    }
    solids[pattern] = 1;
    return -1;
}

void Color(int index) {
    int rgb;
    rgb = cram[index];
    if (rgb == lastColor) return;
    lastColor = rgb;
    SetColorRGB((rgb & 15) * 17, ((rgb >> 4) & 15) * 17, (rgb >> 8) * 17);
}

void DrawTile(int col, int row) {
    int pos, name, flags, pattern, palette, sx, sy, y, scan, planes, bit, x, index, start, last;
    pos = table + (row + 3) * 64 + (col + 6) * 2;
    name = VramByte(pos);
    flags = VramByte(pos + 1);
    pattern = name | ((flags & 1) << 8);
    palette = (flags & 8) << 1;
    sx = ox + col * 8;
    sy = oy + row * 8;
    index = Solid(pattern);
    if (index >= 0) {
        Color(palette + index);
        FillRect(sx, sy, sx + 7, sy + 7);
        return;
    }
    for (y = 0; y < 8; y++) {
        scan = y;
        if (flags & 4) scan = 7 - y;
        planes = vram[pattern * 8 + scan];
        start = 0;
        last = -1;
        for (x = 0; x <= 8; x++) {
            index = -1;
            if (x < 8) {
                bit = 7 - x;
                if (flags & 2) bit = x;
                index = ((planes >> bit) & 1) | ((planes >> (bit + 7)) & 2) |
                    ((planes >> (bit + 14)) & 4) | ((planes >> (bit + 21)) & 8);
            }
            if (last == index) continue;
            if (last >= 0) {
                Color(palette + last);
                FillRect(sx + start, sy + y, sx + x - 1, sy + y);
            }
            start = x;
            last = index;
        }
    }
}

void Paint() {
    int n, index;
    if (!(vdpRegs[1] & 64) || !count) return;
    for (n = 0; n < 10 && count > 0; n++) {
        index = queue[head];
        head++;
        if (head == 360) head = 0;
        count--;
        queued[index] = 0;
        DrawTile(index % 20, index / 20);
    }
    Flush();
}

int Key(int code) {
    if (code == 16) return 4;
    if (code == 17) return 8;
    if (code == 18) return 1;
    if (code == 19) return 2;
    if (code == 20) return 16;
    if (code == 10) return 32;
    if (code == 21) return 128;
    return 0;
}

void Status(int error) {
    SetColorRGB(16, 16, 32);
    FillRect(0, 0, swWidth - 1, swHeight - 1);
    SetColorRGB(189, 221, 255);
    if (error) DrawStr(8, 8, "GG: unsupported cartridge");
    else DrawStr(35, 65, "PRISM VAULT / LOADING");
    Flush();
}

void main() {
    int file, bytes, region;
    Status(0);
    bytes = 0;
    file = FileOpen("VAULT.GGR", 3);
    if (file >= 0) {
        bytes = FileReadInt(file, &rom[0], 8193);
        if (FileClose(file) < 0) bytes = 0;
    }
    region = Rom(32767);
    if (swWidth < 160 || swHeight < 144 || bytes != 32768 ||
        Rom(32752) != 84 || Rom(32753) != 77 || Rom(32754) != 82 || Rom(32755) != 32 ||
        Rom(32756) != 83 || Rom(32757) != 69 || Rom(32758) != 71 || Rom(32759) != 65 ||
        (region != 92 && region != 108 && region != 124)) {
        Status(1);
        return;
    }
    ox = (swWidth - 160) / 2;
    oy = (swHeight - 144) / 2;
    lastColor = -1;
    statusPc = -1;
    ready = 1;
    SetTimer(20, 1);
}

void EVENT_TIMEOUT() {
    int i, held;
    if (!ready) return;
    held = GetKeyState();
    pad = pending;
    pending = 0;
    if (held & (1 << 10)) pad |= 32;
    for (i = 16; i <= 21; i++) if (held & (1 << i)) pad |= Key(i);
    vblank = 128;
    yieldGuest = 0;
    for (i = 0; i < 512 && !yieldGuest && !failed; i++) Step();
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
