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

#define FLOODER_DIVISION 0
#define DMG_WINDOW 0
#define CGB_MBC5 0

#if DMG_WINDOW
#define PAINT_CELLS 380
#define PAINT_SLICES 7
#define BUFFERED_INPUT 1
#define MAIN_BUTTON 64
#define TILE_ROWS maxRows
#define MAP_ROW sourceY
#define DRAW_Y drawY
#else
#if CGB_MBC5
#define PAINT_CELLS 2880
#define PAINT_SLICES 26
#else
#define PAINT_CELLS 360
#define PAINT_SLICES 6
#endif
#define BUFFERED_INPUT colorMode
#define MAIN_BUTTON 16
#if CGB_MBC5
#define TILE_ROWS stripeHeight
#else
#define TILE_ROWS 8
#endif
#define MAP_ROW y
#define DRAW_Y y * 8
#endif

// The cartridge runs in Mobile C bytecode. CGB_MBC5 enables the Geometrix profile.
int cart[8192], video[16384], ram[8192], colors[64];
int seen[PAINT_CELLS], seenVersion[PAINT_CELLS], tileVersion[768], paletteVersion[8], dmgVersion;
int a, b, c, d, e, hl, pc, zero, buttons, p1, lcd, bgp;
int ready, failure, ox, oy, paintRow, pendingButtons, repaintSlices, joypadWait;
int colorMode, bank, colorIndex, paintColor;
int expanded, sp, carry, half, subtract, ime, eiDelay, halted, interruptMask, interruptFlags;
int phase, divider, oam[160], highRam[127], obp0, obp1, spritesDirty, paintedOam[160];

int objColors[64], objIndex, windowX, windowY;
#if DMG_WINDOW
int splitY, bgRows, screenRows, bgMap, winMap, layout;
int layoutEpoch, seenLayout[PAINT_CELLS], tileWritePC;
#endif
// Keep a tap through all reads of the selected JOYP group.
int heldButtons, latchedButtons, polledButtons;

#if CGB_MBC5
int cartRam[2048], cartRamEnabled, cartRamDirty, romBank;
int scrollY, lyc, statControl;
int sampledLine, capturedLayout[144], drawnLayout[144];
int stripeOffset, stripeHeight;
int dmaSourceHigh, dmaSourceLow, dmaTargetHigh, dmaTargetLow, dmaRuns, dmaDebt;

int UntilLyc() {
    int delta;
    if (!(statControl & 64) || lyc >= 154 || !(lcd & 128)) return 70224;
    delta = lyc * 456 - phase;
    if (delta <= 0) delta += 70224;
    return delta;
}

int StatAt(int dot) {
    int mode, line;
    line = dot / 456;
    mode = 0;
    if (lcd & 128) {
        if (line >= 144) mode = 1;
        else if (dot % 456 < 80) mode = 2;
        else if (dot % 456 < 252) mode = 3;
    }
    if (lyc == line) mode |= 4;
    return 128 | statControl | mode;
}

void CaptureLines(int end) {
    int layout;
    if (end > 144) end = 144;
    layout = scrollY | ((lcd & 24) << 8);
    while (sampledLine < end) {
        capturedLayout[sampledLine] = layout;
        sampledLine++;
    }
}

void CapturePriorLines() {
    int line;
    if (!(lcd & 128)) return;
    line = phase / 456;
    if (phase % 456 >= 80) line++;
    CaptureLines(line);
}

void AdvanceLCD(int cost) {
    int i, differs;
    if (cost >= UntilLyc()) interruptFlags |= 2;
    if (cost >= UntilVBlank()) {
        interruptFlags |= 1;
        CaptureLines(144);
        differs = 0;
        for (i = 0; i < 144; i++) {
            if (drawnLayout[i] != capturedLayout[i]) {
                drawnLayout[i] = capturedLayout[i];
                differs = 1;
            }
        }
        if (differs) {
            MemSetInt(&seen[0], -1, PAINT_CELLS);
            paintRow = 0;
            repaintSlices = PAINT_SLICES;
            spritesDirty = 1;
        }
    }
    phase += cost;
    if (phase >= 70224) {
        phase -= 70224;
        sampledLine = 0;
    }
}

void SaveCartRam() {
    int file, count, closed;
    if (!cartRamDirty) return;
    file = FileOpen("GEOM.SAV", 1);
    if (file < 0) file = FileOpen("GEOM.SAV", 2);
    if (file < 0) return;
    count = FileWriteInt(file, &cartRam[0], 2048);
    closed = FileClose(file);
    if (count == 8192 && closed >= 0) cartRamDirty = 0;
}

void LoadCartRam() {
    int file, count, i;
    file = FileOpen("GEOM.SAV", 3);
    count = 0;
    if (file >= 0) {
        count = FileReadInt(file, &cartRam[0], 2048);
        if (FileClose(file) < 0) count = 0;
    }
    if (count != 8192)
        for (i = 0; i < 2048; i++) cartRam[i] = -1;
}

void WriteCartRam(int offset, int value) {
    int slot, shift, old;
    slot = offset >> 2;
    shift = (offset & 3) << 3;
    old = cartRam[slot];
    if (((old >> shift) & 255) == value) return;
    cartRam[slot] = (old & ((255 << shift) ^ -1)) | (value << shift);
    cartRamDirty = 1;
}

#endif

int PpuMode() {
    int dot;
    if (!(lcd & 128)) return 0;
    if (phase >= 65664) return 1;
    dot = phase % 456;
    if (dot < 80) return 2;
    if (dot < 252) return 3;
    return 0;
}

int Joypad() {
    int bits, state;
    bits = 15;
    state = buttons | latchedButtons;
    if (!(p1 & 16)) bits &= 15 ^ (state & 15);
    if (!(p1 & 32)) bits &= 15 ^ ((state >> 4) & 15);
    return 192 | p1 | bits;
}

int Read8(int addr) {
#if CGB_MBC5
    if (addr < 32768) {
        if (addr >= 16384) addr = (addr & 16383) | (romBank << 14);
        return (cart[addr >> 2] >> ((addr & 3) * 8)) & 255;
    }
#else
    if (addr < 32768) return (cart[addr >> 2] >> ((addr & 3) * 8)) & 255;
#endif
    if (addr < 40960) return video[bank * 8192 + addr - 32768];
#if CGB_MBC5
    if (addr < 49152 && cartRamEnabled) return (cartRam[(addr - 40960) >> 2] >> ((addr & 3) << 3)) & 255;
#endif
    if (addr >= 49152 && addr < 57344) return ram[addr - 49152];
    if (addr == 65280) {
        if (!(p1 & 16)) polledButtons |= latchedButtons & 15;
        if (!(p1 & 32)) polledButtons |= latchedButtons & 240;
        return Joypad();
    }
    if (expanded) {
        if (addr >= 57344 && addr < 65024) return ram[addr - 57344];
        if (addr >= 65024 && addr < 65184) return oam[addr - 65024];
        if (addr >= 65408 && addr < 65535) return highRam[addr - 65408];
        if (addr == 65535) return interruptMask;
        if (addr == 65284) return divider >> 8;
        if (addr == 65295) return 224 | interruptFlags;
        if (addr == 65344) return lcd;
#if CGB_MBC5
        if (addr == 65346) return scrollY;
        if (addr == 65345) return StatAt(phase);
        if (addr == 65349) return lyc;
#else
        if (addr == 65345) return 128 | PpuMode();
#endif
        if (addr == 65348 && (lcd & 128)) return phase / 456;
        if (addr == 65348) return 0;
        if (addr == 65351) return bgp;
#if DMG_WINDOW
        if (addr == 65354) return windowY;
        if (addr == 65355) return windowX;
#endif
        if (addr == 65352) return obp0;
        if (addr == 65353) return obp1;
    }
    if (colorMode && addr == 65359) return 254 | bank;
    if (colorMode && addr == 65384) return 64 | colorIndex;
    if (colorMode && addr == 65385) return colors[colorIndex & 63];
    if (expanded && colorMode) {
        if (addr == 65354) return windowY;
        if (addr == 65355) return windowX;
        if (addr == 65386) return 64 | objIndex;
        if (addr == 65387) return objColors[objIndex & 63];
    }
    return 255;
}

void Write8(int addr, int value) {
#if CGB_MBC5
    int offset, index, i, active, src, dst, count, data;
    if (colorMode && addr >= 65361 && addr <= 65365) {
        if (addr == 65361) dmaSourceHigh = value;
        if (addr == 65362) dmaSourceLow = value & 240;
        if (addr == 65363) dmaTargetHigh = value & 31;
        if (addr == 65364) dmaTargetLow = value & 240;
        if (addr == 65365 && !(value & 128)) {
            src = (dmaSourceHigh << 8) | dmaSourceLow;
            dst = (dmaTargetHigh << 8) | dmaTargetLow;
            count = ((value & 127) + 1) << 4;
            if (dst + count > 8192) count = 8192 - dst;
            dmaDebt += count << 1;
            if (src >= 49152 && src + count <= 57344 && dst >= 6144 && dst + count <= 8192) {
                MemCpyInt(&video[bank * 8192 + dst], &ram[src - 49152], count);
                repaintSlices = PAINT_SLICES;
            } else {
                for (i = 0; i < count; i++) {
                    data = Read8((src + i) & 65535);
                    offset = (dst + i) & 8191;
                    index = bank * 8192 + offset;
                    if (video[index] == data) continue;
                    video[index] = data;
                    if (offset < 6144) tileVersion[bank * 384 + offset / 16]++;
                    repaintSlices = PAINT_SLICES;
                }
            }
            dmaRuns++;
        }
        return;
    }
    if (addr < 32768) {
        if (addr < 8192) {
            cartRamEnabled = (value & 15) == 10;
            if (!cartRamEnabled) SaveCartRam();
        } else if (addr < 12288) romBank = value & 1;
        return;
    }
    if (addr >= 40960 && addr < 49152) {
        if (cartRamEnabled) WriteCartRam(addr - 40960, value);
        return;
    }
    if (addr == 65346 && scrollY != value) {
        CapturePriorLines();
        scrollY = value;
    }
    if (addr == 65345 || addr == 65349) {
        active = (statControl & 64) && phase / 456 == lyc;
        if (addr == 65345) statControl = value & 64;
        else lyc = value;
        if (!active && (lcd & 128) && (statControl & 64) && phase / 456 == lyc)
            interruptFlags |= 2;
    }
#else
    int offset, index, i;
#endif
    if (addr >= 32768 && addr < 40960) {
        offset = addr - 32768;
        index = bank * 8192 + offset;
        if (video[index] != value) {
            video[index] = value;
            if (offset < 6144) tileVersion[bank * 384 + offset / 16]++;
            repaintSlices = PAINT_SLICES;
        }
        return;
    }
    if (addr >= 49152 && addr < 57344) ram[addr - 49152] = value;
    if (expanded) {
        if (addr >= 57344 && addr < 65024) ram[addr - 57344] = value;
        if (addr >= 65024 && addr < 65184 && oam[addr - 65024] != value) {
            oam[addr - 65024] = value;
            spritesDirty = 1;
        }
        if (addr >= 65408 && addr < 65535) highRam[addr - 65408] = value;
        if (addr == 65535) interruptMask = value & 31;
        if (addr == 65295) interruptFlags = value & 31;
        if (addr == 65284) divider = 0;
        if (addr == 65350) {
            offset = value << 8;
            for (i = 0; i < 160; i++) {
                index = Read8(offset + i);
                if (oam[i] != index) {
                    oam[i] = index;
                    spritesDirty = 1;
                }
            }
        }
        if (addr == 65354) { windowY = value; repaintSlices = PAINT_SLICES; }
        if (addr == 65355) { windowX = value; repaintSlices = PAINT_SLICES; }
        if (addr == 65352 && obp0 != value) { obp0 = value; spritesDirty = 1; }
        if (addr == 65353 && obp1 != value) { obp1 = value; spritesDirty = 1; }
    }
    if (addr == 65280) {
        index = Joypad();
        if (p1 != (value & 48)) {
            latchedButtons &= 255 ^ polledButtons;
            polledButtons = 0;
        }
        p1 = value & 48;
        if (expanded && (index & (Joypad() ^ 255) & 15)) interruptFlags |= 16;
    }
    if (addr == 65344 && lcd != value) {
#if CGB_MBC5
        if ((lcd ^ value) & 24) CapturePriorLines();
        if ((lcd ^ value) & 128) {
            phase = 0;
            sampledLine = 0;
            if ((value & 128) && (statControl & 64) && lyc == 0) interruptFlags |= 2;
        }
#else
        if ((lcd ^ value) & 128) phase = 0;
#endif
        lcd = value;
        repaintSlices = PAINT_SLICES;
        spritesDirty = 1;
    }
    if (addr == 65351 && bgp != value) {
        bgp = value;
        dmgVersion++;
        repaintSlices = PAINT_SLICES;
    }
    if (!colorMode) return;
    if (addr == 65359) bank = value & 1;
    if (addr == 65384) colorIndex = value & 191;
    if (expanded && addr == 65386) objIndex = value & 191;
    if (expanded && addr == 65387) {
        index = objIndex & 63;
        if (objColors[index] != value) {
            objColors[index] = value;
            spritesDirty = 1;
        }
        if (objIndex & 128) objIndex = 128 | ((index + 1) & 63);
    }
    if (addr == 65385) {
        index = colorIndex & 63;
        if (colors[index] != value) {
            colors[index] = value;
            paletteVersion[index / 8]++;
            repaintSlices = PAINT_SLICES;
        }
        if (colorIndex & 128) colorIndex = 128 | ((index + 1) & 63);
    }
}

int Fetch8() {
#if CGB_MBC5
    int value;
    int addr;
    addr = pc;
    if (pc < 32768) {
        if (pc >= 16384) addr = (pc & 16383) | (romBank << 14);
        value = (cart[addr >> 2] >> ((addr & 3) << 3)) & 255;
    } else value = Read8(pc);
#else
    int value;
    if (pc < 32768) value = (cart[pc >> 2] >> ((pc & 3) * 8)) & 255;
    else value = Read8(pc);
#endif
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

int Pair(int index) {
    if (index == 0) return (b << 8) | c;
    if (index == 1) return (d << 8) | e;
    if (index == 2) return hl;
    return sp;
}

void SetPair(int index, int value) {
    value &= 65535;
    if (index == 0) { b = value >> 8; c = value & 255; }
    if (index == 1) { d = value >> 8; e = value & 255; }
    if (index == 2) hl = value;
    if (index == 3) sp = value;
}

int Reg(int index) {
    if (index == 0) return b;
    if (index == 1) return c;
    if (index == 2) return d;
    if (index == 3) return e;
    if (index == 4) return hl >> 8;
    if (index == 5) return hl & 255;
    if (index == 6) return Read8(hl);
    return a;
}

void SetReg(int index, int value) {
    value &= 255;
    if (index == 0) b = value;
    if (index == 1) c = value;
    if (index == 2) d = value;
    if (index == 3) e = value;
    if (index == 4) hl = (hl & 255) | (value << 8);
    if (index == 5) hl = (hl & 65280) | value;
    if (index == 6) Write8(hl, value);
    if (index == 7) a = value;
}

void Push(int value) {
    sp = (sp - 1) & 65535;
    Write8(sp, value >> 8);
    sp = (sp - 1) & 65535;
    Write8(sp, value & 255);
}

int Pop() {
    int low, high;
    low = Read8(sp);
    sp = (sp + 1) & 65535;
    high = Read8(sp);
    sp = (sp + 1) & 65535;
    return low | (high << 8);
}

int Condition(int code) {
    if (code == 0) return !zero;
    if (code == 1) return zero;
    if (code == 2) return !carry;
    return carry;
}

void Alu(int code, int value) {
    int result, input;
    input = 0;
    if (code == 1 || code == 3) input = carry;
    subtract = 0;
    half = 0;
    carry = 0;
    result = 0;
    if (code < 2) {
        result = a + value + input;
        half = ((a & 15) + (value & 15) + input) > 15;
        carry = result > 255;
    } else if (code < 4 || code == 7) {
        result = a - value - input;
        subtract = 1;
        half = (a & 15) < (value & 15) + input;
        carry = result < 0;
    } else if (code == 4) { result = a & value; half = 1; }
    else if (code == 5) result = a ^ value;
    else result = a | value;
    zero = (result & 255) == 0;
    if (code != 7) a = result & 255;
}

int Rotate(int code, int value) {
    int oldCarry, result;
    oldCarry = carry;
    carry = 0;
    if (code == 0) { carry = value >> 7; result = (value << 1) | carry; }
    if (code == 1) { carry = value & 1; result = (value >> 1) | (carry << 7); }
    if (code == 2) { carry = value >> 7; result = (value << 1) | oldCarry; }
    if (code == 3) { carry = value & 1; result = (value >> 1) | (oldCarry << 7); }
    if (code == 4) { carry = value >> 7; result = value << 1; }
    if (code == 5) { carry = value & 1; result = (value >> 1) | (value & 128); }
    if (code == 6) result = (value << 4) | (value >> 4);
    if (code == 7) { carry = value & 1; result = value >> 1; }
    subtract = 0;
    half = 0;
    zero = (result & 255) == 0;
    return result & 255;
}

int StepCB() {
    int op, reg, group, bit, value;
    op = Fetch8();
    reg = op & 7;
    group = op >> 6;
    bit = (op >> 3) & 7;
    value = Reg(reg);
    if (group == 0) SetReg(reg, Rotate(bit, value));
    if (group == 1) {
        zero = (value & (1 << bit)) == 0;
        half = 1;
        subtract = 0;
        if (reg == 6) return 12;
    }
    if (group == 2) SetReg(reg, value & (255 ^ (1 << bit)));
    if (group == 3) SetReg(reg, value | (1 << bit));
    if (reg == 6) return 16;
    return 8;
}

int UntilVBlank() {
    if (phase < 65664) return 65664 - phase;
    return 135888 - phase;
}

#if FLOODER_DIVISION
// Recognize the SDCC unsigned divider's complete 16-bit loop. Restrict
// batching to a byte divisor, a reduced remainder and a stack in WRAM.
int SmallDivideLoop(int at, int budget) {
    int word, stack, flags, shifted, cost;
    if (at < 0 || at > 32732 || (at & 3) || a < 2 || a > 16 ||
        sp < 49156 || sp > 57344 || d || b || c >= e || budget < 152)
        return 0;
    word = at >> 2;
    if (cart[word] != 0xcb15cbf5 || cart[word + 1] != 0xcb11cb14 ||
        cart[word + 2] != 0x9b79c510 || cart[word + 3] != 0x479a784f ||
        cart[word + 4] != 0xc108383f || cart[word + 5] != 0x20b73df1 ||
        cart[word + 6] != 0x330918e7 || cart[word + 7] != 0x373df133 ||
        cart[word + 8] != 0x0018de20)
        return 0;

    stack = sp - 49156;
    flags = (zero << 7) | (subtract << 6) | (half << 5) | (carry << 4);
    cost = 0;
    while (a > 1 && budget - cost >= 152) {
        shifted = (c << 1) | (hl >> 15);
        hl = ((hl << 1) | carry) & 65535;
        // PUSH AF and PUSH BC leave these bytes behind after the loop pops.
        ram[stack] = shifted & 255;
        ram[stack + 1] = shifted >> 8;
        ram[stack + 2] = flags;
        ram[stack + 3] = a;
        carry = shifted >= e;
        c = shifted - e * carry;
        a--;
        flags = carry << 4;
        cost += 144 + carry * 8;
    }
    zero = 0;
    subtract = 0;
    half = 0;
    pc = at;
    return cost;
}

#endif

#if DMG_WINDOW
// This GBDK set_tile_xy variant returns through POP HL / INC SP / JP HL.
// Cache its address only after verifying the complete immutable routine.
void BindTileWrite() {
    int i;
    i = 1291; // $142c, including the preceding three bytes.
    if (cart[i] == 0x570b1809 && cart[i+1] == 0x08e640f0 &&
        cart[i+2] == 0x98060420 && cart[i+3] == 0x9c060218 &&
        cart[i+4] == 0xa57a1f2e && cart[i+5] == 0x48a57b57 &&
        cart[i+6] == 0x5f0737cb && cart[i+7] == 0x478103e6 &&
        cart[i+8] == 0x82a3e03e && cart[i+9] == 0xf002f84f &&
        cart[i+10] == 0x2002e641 && cart[i+11] == 0xe1027efa &&
        cart[i+12] == 0x6069e933) tileWritePC = 5167; // $142f.
}

int WriteTileAndReturn(int budget) {
    int prefix, dot, wait, cost, tileRow, stack, page;
    if (sp < 49152 || sp > 57341) return 0;
    prefix = 148;
    page = 152;
    if (lcd & 8) { prefix = 140; page = 156; }
    wait = 0;
    if (lcd & 128) {
        dot = (phase + prefix) % 70224;
        if (dot < 65664 && dot % 456 < 252) wait = (252 - dot % 456 + 31) / 32;
    }
    cost = prefix + wait * 32 + 68;
    if (cost > budget) return 0;

    // Preserve the argument slot and return address. The guest routine only
    // reads them, changes the register pairs, and advances SP by three bytes.
    d = a & 31;
    tileRow = e & 31;
    e = ((tileRow << 5) | (tileRow >> 3)) & 255;
    b = page + (tileRow >> 3);
    c = (tileRow & 7) * 32 + d;
    stack = sp - 49152;
    a = ram[stack + 2];
    Write8((b << 8) | c, a);
    hl = ram[stack] | (ram[stack + 1] << 8);
    sp += 3;
    pc = hl;
    zero = 1;
    subtract = 0;
    half = 1;
    carry = 0;
    return cost;
}
#endif

#if CGB_MBC5
int CopyVramLoop(int at, int limit) {
    int cost, from, to, rounds, span, index, word, value, dest, i, layer;
    if (Pair(0) <= 1 || limit < 80 || Read8(at + 6) != 42 ||
        Read8(at + 7) != 18 || Read8(at + 8) != 19 || Read8(at + 9) != 11 ||
        Read8(at + 10) != 120 || Read8(at + 11) != 177 ||
        Read8(at + 12) != 32 || Read8(at + 13) != 242) return 0;
    from = hl;
    to = Pair(1);
    if (from >= 32768 && (from < 49152 || from >= 57344)) return 0;
    if (to < 32768 || to >= 40960) return 0;
    cost = 80;
    rounds = limit / cost;
    if (rounds > 128) rounds = 128;
    if (rounds >= Pair(0)) rounds = Pair(0) - 1;
    if (rounds > 40960 - to) rounds = 40960 - to;
    if (from < 32768) span = (from & 16384) + 16384 - from;
    else span = 57344 - from;
    if (rounds > span) rounds = span;
    if (lcd & 128) {
        if (phase < 65664) {
            span = phase % 456;
            if (span < 252) return 0;
            span = 456 - span;
        } else span = 70224 - phase;
        span = (span + cost - 1) / cost;
        if (rounds > span) rounds = span;
    }
    index = from;
    if (from >= 16384 && from < 32768) index = (from & 16383) | (romBank << 14);
    layer = bank * 8192;
    dest = to - 32768;
    for (i = 0; i < rounds; i++) {
        if (from < 32768) {
            word = index + i;
            value = (cart[word >> 2] >> ((word & 3) << 3)) & 255;
        } else value = ram[from + i - 49152];
        if (video[layer + dest] != value) {
            video[layer + dest] = value;
            if (dest < 6144) tileVersion[bank * 384 + (dest >> 4)]++;
            repaintSlices = PAINT_SLICES;
        }
        dest++;
    }
    hl += rounds;
    SetPair(1, to + rounds);
    SetPair(0, Pair(0) - rounds);
    a = b;
    Alu(6, c);
    pc = at;
    return rounds * cost;
}

#endif

int StepFull(int budget) {
    int op, dst, src, value, pair, delta, at, rounds, limit, i, waitStart, waitCost;
#if CGB_MBC5
    int end;
#endif
    op = Fetch8();
    dst = (op >> 3) & 7;
    src = op & 7;
    pair = (op >> 4) & 3;
    at = pc - 1;
    limit = budget;
    if (ime && (interruptMask & 1) && (lcd & 128) && UntilVBlank() < limit)
        limit = UntilVBlank();
#if CGB_MBC5
    if (ime && (interruptMask & 2) && UntilLyc() < limit) limit = UntilLyc();
#endif
#if FLOODER_DIVISION
    if (colorMode && !eiDelay && op == 245) {
        value = SmallDivideLoop(at, limit);
        if (value) return value;
    }
#endif
#if DMG_WINDOW
    if (at == tileWritePC && tileWritePC && !eiDelay) {
        value = WriteTileAndReturn(limit);
        if (value) return value;
    }
#endif
    // The loop must stay in immutable ROM, and a fused group ends at the
    // same instruction and with the same registers as complete iterations.
    if (!eiDelay && at >= 0 && at <= 32749 && limit >= 36) {
#if CGB_MBC5
        if (op == 240 && Read8(pc) == 65 && Read8(pc + 1) == 203 &&
            Read8(pc + 2) == 79 && Read8(pc + 3) == 32 && Read8(pc + 4) == 250) {
            if ((lcd & 128) && phase < 65664 && phase % 456 < 252) {
                rounds = (252 - phase % 456 + 31) / 32;
                if (rounds > limit / 32) rounds = limit / 32;
                a = StatAt(phase + (rounds - 1) * 32);
                zero = 0;
                subtract = 0;
                half = 1;
                pc = at;
                return rounds * 32;
            }
            value = CopyVramLoop(at, limit);
            if (value) return value;
        }
        if (op == 242 && c == 68 && (lcd & 128) && b < 154 &&
            Read8(pc) == 184 && Read8(pc + 1) == 32 && Read8(pc + 2) == 252 &&
            phase / 456 != b) {
            delta = b * 456 - phase;
            if (delta <= 0) delta += 70224;
            rounds = (delta + 23) / 24;
            if (rounds > limit / 24) rounds = limit / 24;
            a = ((phase + (rounds - 1) * 24) % 70224) / 456;
            Alu(7, b);
            pc = at;
            return rounds * 24;
        }
        if (op == 123 && hl >= 49152 && hl < 57344 && Pair(0) > 1 && limit >= 52 &&
            Read8(pc) == 134 && Read8(pc + 1) == 95 && Read8(pc + 2) == 35 &&
            Read8(pc + 3) == 11 && Read8(pc + 4) == 120 && Read8(pc + 5) == 177 &&
            Read8(pc + 6) == 32 && Read8(pc + 7) == 247) {
            rounds = limit / 52;
            if (rounds > 256) rounds = 256;
            if (rounds >= Pair(0)) rounds = Pair(0) - 1;
            if (rounds > 57344 - hl) rounds = 57344 - hl;
            value = e;
            i = hl - 49152;
            end = i + rounds;
            for (; i < end; i++) value += ram[i];
            e = value & 255;
            hl += rounds;
            SetPair(0, Pair(0) - rounds);
            a = b;
            Alu(6, c);
            pc = at;
            return rounds * 52;
        }
        if (op == 122 && hl >= 32768 && hl < 57344 && Pair(0) > 1 &&
            Read8(pc) == 34 && Read8(pc + 1) == 11 && Read8(pc + 2) == 120 &&
            Read8(pc + 3) == 177 && Read8(pc + 4) == 32 && Read8(pc + 5) == 249 &&
            (hl < 40960 || hl >= 49152 || cartRamEnabled) && limit >= 40) {
            end = (hl & 57344) + 8192;
            rounds = limit / 40;
            if (rounds > 256) rounds = 256;
            if (rounds >= Pair(0)) rounds = Pair(0) - 1;
            if (rounds > end - hl) rounds = end - hl;
            if (hl >= 49152) {
                i = hl - 49152;
                end = i + rounds;
                for (; i < end; i++) ram[i] = d;
            } else {
                end = hl + rounds;
                for (i = hl; i < end; i++) Write8(i, d);
            }
            hl += rounds;
            SetPair(0, Pair(0) - rounds);
            a = b;
            Alu(6, c);
            pc = at;
            return rounds * 40;
        }
#endif
        if (op == 240 && Read8(pc) == 65 && Read8(pc + 1) == 230 &&
            Read8(pc + 2) == 2 && Read8(pc + 3) == 32 && Read8(pc + 4) == 250 &&
            (lcd & 128) && phase < 65664 && phase % 456 < 252) {
            rounds = (252 - phase % 456 + 31) / 32;
            if (rounds > limit / 32) rounds = limit / 32;
            a = 2;
            Alu(4, 2);
            pc = at;
            return rounds * 32;
        }
        if (op == 11 && limit >= 40 && Read8(pc) == 120 && Read8(pc + 1) == 177 &&
            Read8(pc + 2) == 200 && Read8(pc + 3) == 0 && Read8(pc + 4) == 24 &&
            Read8(pc + 5) == 249 && Pair(0) > 1) {
            rounds = limit / 40;
            if (rounds >= Pair(0)) rounds = Pair(0) - 1;
            SetPair(0, Pair(0) - rounds);
            a = b;
            Alu(6, c);
            pc = at;
            return rounds * 40;
        }
#if DMG_WINDOW
        // GBDK waits for LY to cross a line before changing LCDC.
        if (op == 240 && (lcd & 128) && Read8(pc) == 68 &&
            Read8(pc + 1) == 254 && Read8(pc + 4) == 250) {
            value = Read8(pc + 2);
            waitStart = Read8(pc + 3);
            delta = 0;
            if (waitStart == 56 && phase < value * 456) delta = value * 456 - phase;
            if (waitStart == 48 && phase >= value * 456) delta = 70224 - phase;
            if (delta > 0 && value > 0 && value < 154) {
                rounds = (delta + 31) / 32;
                if (rounds > limit / 32) rounds = limit / 32;
                a = (phase + (rounds - 1) * 32) / 456;
                Alu(7, value);
                pc = at;
                return rounds * 32;
            }
        }
#endif
        if ((op == 240 || (op == 250 && Read8(pc + 1) == 255)) &&
            (lcd & 128) && phase < 65664 && Read8(pc) == 68) {
            waitStart = pc + 1;
            waitCost = 36;
            if (op == 250) { waitStart++; waitCost = 40; }
            if (Read8(waitStart) == 254 && Read8(waitStart + 1) == 144 &&
                Read8(waitStart + 2) == 218 &&
                (Read8(waitStart + 3) | (Read8(waitStart + 4) << 8)) == at) {
                rounds = limit / waitCost;
                if (rounds > (65664 - phase) / waitCost) rounds = (65664 - phase) / waitCost;
                if (rounds > 0) {
                    a = (phase + (rounds - 1) * waitCost) / 456;
                    Alu(7, 144);
                    pc = at;
                    return rounds * waitCost;
                }
            }
        }
        if (op == 175 && limit >= 40 && hl >= 49152 && hl < 57344 && Pair(0) > 1 &&
            Read8(pc) == 34 && Read8(pc + 1) == 11 && Read8(pc + 2) == 120 &&
            Read8(pc + 3) == 177 && Read8(pc + 4) == 32 && Read8(pc + 5) == 249) {
            rounds = limit / 40;
            if (rounds >= Pair(0)) rounds = Pair(0) - 1;
            if (rounds > 57344 - hl) rounds = 57344 - hl;
            for (i = 0; i < rounds; i++) ram[hl - 49152 + i] = 0;
            hl += rounds;
            SetPair(0, Pair(0) - rounds);
            a = b;
            Alu(6, c);
            pc = at;
            return rounds * 40;
        }
        if (op == 126 && limit >= 68 && hl >= 49152 && hl < 57344 && Pair(0) > 1 &&
            Read8(pc) == 183 && Read8(pc + 1) == 40 && Read8(pc + 2) == 11 &&
            Read8(at + 15) == 35 && Read8(at + 16) == 19 && Read8(at + 17) == 11 &&
            Read8(at + 18) == 120 && Read8(at + 19) == 177 && Read8(at + 20) == 32 &&
            Read8(at + 21) == 234) {
            rounds = limit / 68;
            if (rounds >= Pair(0)) rounds = Pair(0) - 1;
            if (rounds > 57344 - hl) rounds = 57344 - hl;
            for (i = 0; i < rounds && !ram[hl - 49152 + i]; i++) value = i;
            if (i > 0) {
                hl += i;
                SetPair(1, Pair(1) + i);
                SetPair(0, Pair(0) - i);
                a = b;
                Alu(6, c);
                pc = at;
                return i * 68;
            }
        }
        if (op == 10 && limit >= 72 && hl >= 32768 && hl < 40960 && Pair(0) < 32768 &&
            Pair(1) > 1 && Read8(pc) == 119 && Read8(pc + 1) == 27 && Read8(pc + 2) == 122 &&
            Read8(pc + 3) == 179 && Read8(pc + 4) == 200 && Read8(pc + 5) == 3 &&
            Read8(pc + 6) == 35 && Read8(pc + 7) == 195 &&
            (Read8(pc + 8) | (Read8(pc + 9) << 8)) == at) {
            rounds = limit / 72;
            if (rounds > 128) rounds = 128;
            if (rounds >= Pair(1)) rounds = Pair(1) - 1;
            if (rounds > 32768 - Pair(0)) rounds = 32768 - Pair(0);
            if (rounds > 40960 - hl) rounds = 40960 - hl;
            value = Pair(0);
            for (i = 0; i < rounds; i++) Write8(hl + i, Read8(value + i));
            hl += rounds;
            SetPair(0, value + rounds);
            SetPair(1, Pair(1) - rounds);
            a = d;
            Alu(6, e);
            pc = at;
            return rounds * 72;
        }
    }
    if (op >= 64 && op < 128) {
        if (op == 118) { halted = 1; return 4; }
        SetReg(dst, Reg(src));
        if (dst == 6 || src == 6) return 8;
        return 4;
    }
    if (op >= 128 && op < 192) {
        Alu(dst, Reg(src));
        if (src == 6) return 8;
        return 4;
    }
    if (op < 64) {
        if (src == 4 || src == 5) {
            value = Reg(dst);
            subtract = src == 5;
            half = (value & 15) == (15 * (1 - subtract));
            value = (value + 1 - 2 * subtract) & 255;
            zero = value == 0;
            SetReg(dst, value);
            if (dst == 6) return 12;
            return 4;
        }
        if (src == 6) {
            SetReg(dst, Fetch8());
            if (dst == 6) return 12;
            return 8;
        }
        if ((op & 15) == 1) { SetPair(pair, Fetch16()); return 12; }
        if ((op & 15) == 3) { SetPair(pair, Pair(pair) + 1); return 8; }
        if ((op & 15) == 11) { SetPair(pair, Pair(pair) - 1); return 8; }
        if ((op & 15) == 9) {
            value = Pair(pair);
            half = (hl & 4095) + (value & 4095) > 4095;
            carry = hl + value > 65535;
            subtract = 0;
            hl = (hl + value) & 65535;
            return 8;
        }
        if (src == 2) {
            value = hl;
            if (pair < 2) value = Pair(pair);
            if (op & 8) a = Read8(value);
            else Write8(value, a);
            if (pair == 2) hl = (hl + 1) & 65535;
            if (pair == 3) hl = (hl - 1) & 65535;
            return 8;
        }
        if (op == 24 || (op >= 32 && (op & 7) == 0)) {
            delta = Fetch8();
            if (op != 24 && !Condition((op >> 3) & 3)) return 8;
            if (delta >= 128) delta -= 256;
            pc = (pc + delta) & 65535;
            return 12;
        }
        if (src == 7 && op < 32) { a = Rotate(dst, a); zero = 0; return 4; }
    }
    if (op >= 192 && src == 6) { Alu(dst, Fetch8()); return 8; }
    if (op >= 192 && src == 7) { Push(pc); pc = op & 56; return 16; }
    if (op >= 192 && (op & 15) == 1) {
        value = Pop();
        if (pair < 3) SetPair(pair, value);
        else { a = value >> 8; zero = (value >> 7) & 1; subtract = (value >> 6) & 1;
               half = (value >> 5) & 1; carry = (value >> 4) & 1; }
        return 12;
    }
    if (op >= 192 && (op & 15) == 5) {
        value = Pair(pair);
        if (pair == 3) value = (a << 8) | (zero << 7) | (subtract << 6) | (half << 5) | (carry << 4);
        Push(value);
        return 16;
    }
    if (op < 224 && op >= 192 && src == 0) {
        if (!Condition(dst & 3)) return 8;
        pc = Pop();
        return 20;
    }
    if (op >= 192 && op < 224 && (src == 2 || src == 4)) {
        value = Fetch16();
        if (!Condition(dst & 3)) return 12;
        if (src == 4) { Push(pc); pc = value; return 24; }
        pc = value;
        return 16;
    }
    switch (op) {
        case 0: return 4;
        case 8: value = Fetch16(); Write8(value, sp & 255); Write8((value + 1) & 65535, sp >> 8); return 20;
        case 39:
            value = 0;
            if (half || (!subtract && (a & 15) > 9)) value = 6;
            if (carry || (!subtract && a > 153)) { value |= 96; carry = 1; }
            if (subtract) a = (a - value) & 255;
            else a = (a + value) & 255;
            half = 0;
            zero = a == 0;
            return 4;
        case 47: a ^= 255; subtract = 1; half = 1; return 4;
        case 55: subtract = 0; half = 0; carry = 1; return 4;
        case 63: subtract = 0; half = 0; carry = !carry; return 4;
        case 195: pc = Fetch16(); return 16;
        case 201: pc = Pop(); return 16;
        case 203: return StepCB();
        case 205: value = Fetch16(); Push(pc); pc = value; return 24;
        case 217: pc = Pop(); ime = 1; return 16;
        case 224: Write8(65280 + Fetch8(), a); return 12;
        case 226: Write8(65280 + c, a); return 8;
        case 232:
        case 248:
            value = Fetch8();
            half = (sp & 15) + (value & 15) > 15;
            carry = (sp & 255) + value > 255;
            zero = 0;
            subtract = 0;
            if (value >= 128) value -= 256;
            if (op == 232) { sp = (sp + value) & 65535; return 16; }
            hl = (sp + value) & 65535;
            return 12;
        case 233: pc = hl; return 4;
        case 234: Write8(Fetch16(), a); return 16;
        case 240: a = Read8(65280 + Fetch8()); return 12;
        case 242: a = Read8(65280 + c); return 8;
        case 243: ime = 0; eiDelay = 0; return 4;
        case 249: sp = hl; return 8;
        case 250: a = Read8(Fetch16()); return 16;
        case 251: eiDelay = 2; return 4;
        default: failure = op + 1; return 4;
    }
}

void TickFull() {
    int remaining, steps, limit, cost, pending, bit;
    remaining = 70224;
#if DMG_WINDOW
    limit = 600;
#else
    limit = 320;
#if CGB_MBC5
    if (colorMode) limit = 300;
#else
    if (colorMode) limit = 600;
#endif
#endif
    for (steps = 0; steps < limit && remaining > 0 && !failure; steps++) {
#if CGB_MBC5
        if (dmaDebt) {
            cost = dmaDebt;
            if (cost > remaining) cost = remaining;
            dmaDebt -= cost;
            divider = (divider + cost) & 65535;
            if (lcd & 128) AdvanceLCD(cost);
            remaining -= cost;
            continue;
        }
#endif
        pending = interruptMask & interruptFlags;
        if (pending) halted = 0;
        if (pending && ime) {
            bit = 0;
            while (!(pending & (1 << bit))) bit++;
            interruptFlags &= 31 ^ (1 << bit);
            ime = 0;
            Push(pc);
            pc = 64 + bit * 8;
            cost = 20;
        } else if (halted) {
            cost = remaining;
            if ((interruptMask & 1) && (lcd & 128) && UntilVBlank() < cost) cost = UntilVBlank();
#if CGB_MBC5
            if ((interruptMask & 2) && UntilLyc() < cost) cost = UntilLyc();
#endif
        } else {
            cost = StepFull(remaining);
            if (eiDelay) {
                eiDelay--;
                if (!eiDelay) ime = 1;
            }
        }
        divider = (divider + cost) & 65535;
#if CGB_MBC5
        if (lcd & 128) AdvanceLCD(cost);
#else
        if (lcd & 128) {
            if (cost >= UntilVBlank()) interruptFlags |= 1;
            phase = (phase + cost) % 70224;
        }
#endif
        remaining -= cost;
    }
}

void Color(int index, int attr) {
    int offset, rgb, r, g, b;
    if (colorMode) {
        offset = (attr & 7) * 8 + index * 2;
        if (attr & 128) rgb = objColors[offset] | ((objColors[offset + 1] & 127) << 8);
        else rgb = colors[offset] | ((colors[offset + 1] & 127) << 8);
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
#if CGB_MBC5
    int palette;
#endif
#if DMG_WINDOW
    int maxRows;
#endif
    attr = key >> 10;
    tile = key & 1023;
#if CGB_MBC5
    palette = (attr & 7) * 8;
    if (colorMode && colors[palette] == colors[palette + 2] &&
        colors[palette] == colors[palette + 4] && colors[palette] == colors[palette + 6] &&
        colors[palette + 1] == colors[palette + 3] && colors[palette + 1] == colors[palette + 5] &&
        colors[palette + 1] == colors[palette + 7]) {
        Color(0, attr);
        FillRect(x, y, x + count * 8 - 1, y + stripeHeight - 1);
        return;
    }
#endif
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
#if DMG_WINDOW
    // Only the visible portion of the final tile in each layer is drawn.
    maxRows = oy + 144 - y;
    if (y < oy + splitY) maxRows = oy + splitY - y;
    if (maxRows > 8) maxRows = 8;
#endif
#if CGB_MBC5
    base += stripeOffset * stride;
    // Fill the backdrop once and draw only the colored runs over it.
    for (row = 0; row < stripeHeight; row++) {
        at = base + row * stride;
        if ((video[at] | video[at + 1]) == 255) continue;
        Color(0, attr);
        FillRect(x, y, x + count * 8 - 1, y + stripeHeight - 1);
        break;
    }
#endif
    // Merge adjacent identical rows before drawing their horizontal runs.
    for (row = 0; row < TILE_ROWS; row = end) {
        at = base + row * stride;
        lo = video[at];
        hi = video[at + 1];
        end = row + 1;
        at += stride;
        while (end < TILE_ROWS) {
            if (video[at] != lo || video[at + 1] != hi) break;
            end++;
            at += stride;
        }
        if ((lo == 0 || lo == 255) && (hi == 0 || hi == 255)) {
#if CGB_MBC5
            index = (lo & 1) | ((hi & 1) << 1);
            if (index) {
                Color(index, attr);
                FillRect(x, y + row, x + count * 8 - 1, y + end - 1);
            }
#else
            Color((lo & 1) | ((hi & 1) << 1), attr);
            FillRect(x, y + row, x + count * 8 - 1, y + end - 1);
#endif
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
#if CGB_MBC5
                if (last) {
                    Color(last, attr);
                    FillRect(x + start, y + row, x + bit - 1, y + end - 1);
                    for (dx = 8; dx < count * 8; dx += 8)
                        FillRect(x + dx + start, y + row, x + dx + bit - 1, y + end - 1);
                }
#else
                Color(last, attr);
                FillRect(x + start, y + row, x + bit - 1, y + end - 1);
                for (dx = 8; dx < count * 8; dx += 8)
                    FillRect(x + dx + start, y + row, x + dx + bit - 1, y + end - 1);
#endif
                start = bit;
                last = index;
            }
        }
    }
}

int CellKey(int map, int x, int y) {
    int offset, tile, attr;
#if CGB_MBC5
    offset = (map & 8191) + y * 32 + x;
#else
    offset = map + y * 32 + x;
#endif
    tile = video[offset];
    attr = 0;
    if (colorMode) attr = video[8192 + offset] & 111;
#if CGB_MBC5
    if (!(map & 8192) && tile < 128) tile += 256;
#else
    if (!(lcd & 16) && tile < 128) tile += 256;
#endif
    if (attr & 8) tile += 384;
    return (attr << 10) | tile;
}

#if DMG_WINDOW
void SetLayout(int background) {
    int next;
    bgMap = background;
    winMap = 6144;
    if (lcd & 64) winMap = 7168;
    splitY = 144;
    if ((lcd & 32) && windowX == 7 && windowY < 144) splitY = windowY;
    bgRows = (splitY + 7) / 8;
    screenRows = bgRows + (151 - splitY) / 8;
    next = splitY | ((lcd & 88) << 8);
    if (layout != next) {
        layout = next;
        layoutEpoch++;
        paintRow = 0;
        repaintSlices = PAINT_SLICES;
    }
}

int SourceRow(int row) {
    if (row < bgRows) return row;
    return row - bgRows;
}

int ScreenY(int row) {
    if (row < bgRows) return row * 8;
    return splitY + (row - bgRows) * 8;
}

int RowMap(int row) {
    if (row < bgRows) return bgMap;
    return winMap;
}
#endif

#if CGB_MBC5
int SelectStripe(int y) {
    int layout, end;
    layout = drawnLayout[y];
    stripeOffset = (y + layout) & 7;
    end = y + 8 - stripeOffset;
    if (end > 144) end = 144;
    stripeHeight = 1;
    while (y + stripeHeight < end && drawnLayout[y + stripeHeight] == layout)
        stripeHeight++;
    return layout;
}

int StripeMap(int layout) {
    int map;
    map = 6144;
    if (layout & 2048) map = 7168;
    if (layout & 4096) map |= 8192;
    return map;
}

void RestoreSprite(int x, int y, int height) {
    int firstX, lastX, row, col, layout, map, sourceY;
    if (x <= -8 || x >= 160 || y <= -height || y >= 144) return;
    firstX = 0;
    if (x > 0) firstX = x / 8;
    lastX = (x + 7) / 8;
    if (lastX > 19) lastX = 19;
    row = y;
    if (row < 0) row = 0;
    for (; row < y + height && row < 144; row += stripeHeight) {
        layout = SelectStripe(row);
        if (row + stripeHeight > y + height) stripeHeight = y + height - row;
        map = StripeMap(layout);
        sourceY = ((row + layout) & 255) >> 3;
        for (col = firstX; col <= lastX; col++)
            TileRun(ox + col * 8, oy + row, CellKey(map, col, sourceY), 1);
    }
}

#else
void RestoreSprite(int map, int x, int y) {
#if DMG_WINDOW
    int firstX, lastX, row, col, top;
#else
    int firstX, firstY, lastX, lastY, row, col;
#endif
    if (x <= -8 || x >= 160 || y <= -8 || y >= 144) return;
    firstX = 0;
#if DMG_WINDOW
    if (x > 0) firstX = x / 8;
    lastX = (x + 7) / 8;
    if (lastX > 19) lastX = 19;
    for (row = 0; row < screenRows; row++) {
        top = ScreenY(row);
        if (top > y + 7 || top + 7 < y) continue;
        for (col = firstX; col <= lastX; col++)
            TileRun(ox + col * 8, oy + top, CellKey(RowMap(row), col, SourceRow(row)), 1);
    }
#else
    firstY = 0;
    if (x > 0) firstX = x / 8;
    if (y > 0) firstY = y / 8;
    lastX = (x + 7) / 8;
    lastY = (y + 7) / 8;
    if (lastX > 19) lastX = 19;
    if (lastY > 17) lastY = 17;
    for (row = firstY; row <= lastY; row++)
        for (col = firstX; col <= lastX; col++)
            TileRun(ox + col * 8, oy + row * 8, CellKey(map, col, row), 1);
#endif
}

#endif
#if CGB_MBC5
void DrawSprite(int x, int y, int tile, int attr, int firstRow, int lastRow) {
#else
void DrawSprite(int x, int y, int tile, int attr) {
#endif
    int row, bit, at, base, lo, hi, step, shift, start, last, palette, shade, saved;
    if (x <= -8 || x >= 160 || y <= -8 || y >= 144) return;
    palette = obp0;
    if (attr & 16) palette = obp1;
    saved = bgp;
    bgp = palette;
    base = tile * 16;
    if (colorMode && (attr & 8)) base += 8192;
    step = -1;
    if (attr & 32) step = 1;
    for (row = 0; row < 8; row++) {
#if CGB_MBC5
        if (y + row < firstRow || y + row >= lastRow) continue;
#else
        if (y + row < 0 || y + row >= 144) continue;
#endif
        at = base + row * 2;
        if (attr & 64) at = base + (7 - row) * 2;
        lo = video[at];
        hi = video[at + 1];
        start = 0;
        last = 0;
        shift = 7;
        if (step == 1) shift = 0;
        for (bit = 0; bit <= 8; bit++) {
            shade = 0;
            if (bit < 8 && x + bit >= 0 && x + bit < 160)
                shade = ((lo >> shift) & 1) | (((hi >> shift) & 1) << 1);
            if (shade != last) {
                if (last) {
                    Color(last, 128 | (attr & 7));
                    FillRect(ox + x + start, oy + y + row, ox + x + bit - 1, oy + y + row);
                }
                start = bit;
                last = shade;
            }
            shift += step;
        }
    }
    bgp = saved;
}

#if CGB_MBC5
void PaintSprites(int firstRow, int lastRow, int dirty) {
    int index, height, tile, attr, x, y;
    if (dirty) {
        for (index = 0; index < 160; index += 4)
            if (paintedOam[index]) RestoreSprite(paintedOam[index + 1] - 8, paintedOam[index] - 16, paintedOam[index + 2]);
    }
    height = 8;
    if (lcd & 4) height = 16;
    for (index = 156; index >= 0; index -= 4) {
        if (dirty) paintedOam[index] = 0;
        if (!(lcd & 2) || !oam[index] || !oam[index + 1]) continue;
        x = oam[index + 1] - 8;
        y = oam[index] - 16;
        if (dirty) {
            paintedOam[index] = oam[index];
            paintedOam[index + 1] = oam[index + 1];
            paintedOam[index + 2] = height;
        }
        if (y >= lastRow || y + height <= firstRow) continue;
        tile = oam[index + 2];
        attr = oam[index + 3];
        if (height == 16) {
            tile &= 254;
            if (attr & 64) tile++;
            DrawSprite(x, y + 8, tile ^ 1, attr, firstRow, lastRow);
        }
        DrawSprite(x, y, tile, attr, firstRow, lastRow);
    }
    if (dirty) spritesDirty = 0;
}

#else
void PaintSprites(int map) {
    int index;
    for (index = 0; index < 160; index += 4)
        if (paintedOam[index]) RestoreSprite(map, paintedOam[index + 1] - 8, paintedOam[index] - 16);
    for (index = 156; index >= 0; index -= 4) {
        paintedOam[index] = 0;
        if ((lcd & 2) && oam[index] && oam[index + 1]) {
            paintedOam[index] = oam[index];
            paintedOam[index + 1] = oam[index + 1];
            DrawSprite(oam[index + 1] - 8, oam[index] - 16, oam[index + 2], oam[index + 3]);
        }
    }
    spritesDirty = 0;
}

#endif

void Status(int failed) {
    paintColor = -1;
    SetColorRGB(13, 35, 29);
    FillRect(0, 0, swWidth - 1, swHeight - 1);
    SetColorRGB(192, 217, 127);
    FillRect(0, 0, swWidth - 1, 14);
    if (failed) DrawStr(8, 3, "GB: unsupported cartridge");
    else {
        if (expanded) DrawStr(8, 3, "REUNION / GAME BOY");
        else if (colorMode) DrawStr(8, 3, "REUNION / PRISM RELAY");
        else DrawStr(8, 3, "REUNION / POCKET LAB");
        FillRect(0, swHeight - 14, swWidth - 1, swHeight - 1);
        if (expanded) DrawStr(8, swHeight - 11, "D-PAD / A / START");
        else if (colorMode) DrawStr(8, swHeight - 11, "GET 3 CELLS / REACH EXIT");
        else DrawStr(8, swHeight - 11, "D-PAD / MOVE");
    }
    Flush();
}

void main() {
    int file, count, i;
    expanded = 0;
    ox = (swWidth - 160) / 2;
    oy = (swHeight - 144) / 2;
    file = FileOpen("POCKET.GBR", 3);
    if (file >= 0) {
        count = FileReadInt(file, &cart[0], 8192);
        if (FileClose(file) < 0) count = 0;
    } else count = 0;
#if CGB_MBC5
    if (count != 32768 || Read8(327) != 27 || Read8(328) != 0 || Read8(329) != 2) {
#else
    if (count != 32768 || Read8(327) != 0 || Read8(328) != 0) {
#endif
        Status(1);
        return;
    }
    if (ox < 0 || oy < 0) {
        Status(1);
        return;
    }
    for (i = 0; i < PAINT_CELLS; i++) seen[i] = -1;
    colorMode = (Read8(323) & 128) != 0;
#if CGB_MBC5
    romBank = 1;
    LoadCartRam();
#endif
#if DMG_WINDOW
    BindTileWrite();
#endif
    Status(0);
    pc = 256;
    if (expanded && colorMode) {
        a = 17;
        d = 255;
        e = 86;
        hl = 13;
        zero = 1;
        windowX = 7;
    }
    p1 = 48;
    sp = 65534;
    obp0 = 255;
    obp1 = 255;
    bgp = 228;
    ready = 1;
    SetTimer(20, 1);
}

int PhysicalButtons() {
    int held, mask;
    held = GetKeyState();
    mask = 0;
    if (held & (1 << 17)) mask |= 1;
    if (held & (1 << 16)) mask |= 2;
    if (held & (1 << 18)) mask |= 4;
    if (held & (1 << 19)) mask |= 8;
    if (held & (1 << 20)) mask |= MAIN_BUTTON;
    if (held & (1 << 10)) mask |= 32;
    if (held & (1 << 21)) mask |= 128;
    return mask;
}

void EVENT_TIMEOUT() {
    int i, x, y, tile, n, updated, map, attr, offset, version, key, first, count, runKey, old;
#if DMG_WINDOW
    int sourceY, drawY;
#endif
    if (!ready) return;
    if (expanded) old = Joypad();
    buttons = pendingButtons;
    if (expanded && BUFFERED_INPUT) {
        latchedButtons |= pendingButtons;
        buttons = heldButtons;
    }
    pendingButtons = 0;
    if (expanded) {
        if (!BUFFERED_INPUT) buttons |= PhysicalButtons();
        if (old & (Joypad() ^ 255) & 15) interruptFlags |= 16;
        TickFull();
    } else {
        joypadWait = 0;
        for (i = 0; i < 160 && !failure && !joypadWait; i++) Step();
    }
    if (failure) {
        ResetTimer();
        Status(1);
        return;
    }
    if ((lcd & 128) == 0) return;
    // The firmware can change the current draw color between callbacks.
    if (expanded && (repaintSlices || spritesDirty)) paintColor = -1;
#if CGB_MBC5
    updated = 0;
    y = paintRow;
    offset = SelectStripe(y);
    map = StripeMap(offset);
    old = ((y + offset) & 255) >> 3;
    if (repaintSlices) {
        repaintSlices--;
        count = 0;
        for (x = 0; x < 20; x++) {
            n = y * 20 + x;
            key = CellKey(map, x, old);
            attr = key >> 10;
            tile = key & 1023;
            version = paletteVersion[attr & 7] + tileVersion[tile];
            if (seen[n] == key && seenVersion[n] == version) {
                if (count) TileRun(ox + first * 8, oy + y, runKey, count);
                count = 0;
                continue;
            }
            if (count && runKey != key) {
                TileRun(ox + first * 8, oy + y, runKey, count);
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
        if (count) TileRun(ox + first * 8, oy + y, runKey, count);
    }
    paintRow += stripeHeight;
    if (paintRow >= 144) paintRow = 0;
    if (expanded && spritesDirty) {
        PaintSprites(0, 144, 1);
        updated = 1;
    } else if (expanded && updated) PaintSprites(y, y + stripeHeight, 0);
    if (updated) Flush();
#else
    updated = 0;
    map = 6144;
    if (lcd & 8) map = 7168;
#if DMG_WINDOW
    SetLayout(map);
#else
    if (expanded && (lcd & 32) && windowX == 7 && windowY == 0) {
        map = 6144;
        if (lcd & 64) map = 7168;
    }
#endif
    if (repaintSlices) {
      repaintSlices--;
#if DMG_WINDOW
      for (y = paintRow; y < paintRow + 3 && y < screenRows; y++) {
        sourceY = SourceRow(y);
        drawY = ScreenY(y);
        map = RowMap(y);
#else
      for (y = paintRow; y < paintRow + 3; y++) {
#endif
        count = 0;
        for (x = 0; x < 20; x++) {
            n = y * 20 + x;
            offset = map + MAP_ROW * 32 + x;
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
#if DMG_WINDOW
            if (seen[n] == key && seenVersion[n] == version && seenLayout[n] == layoutEpoch) {
#else
            if (seen[n] == key && seenVersion[n] == version) {
#endif
                if (count) TileRun(ox + first * 8, oy + DRAW_Y, runKey, count);
                count = 0;
                continue;
            }
            if (count && runKey != key) {
                TileRun(ox + first * 8, oy + DRAW_Y, runKey, count);
                count = 0;
            }
            if (!count) {
                first = x;
                runKey = key;
            }
            count++;
            seen[n] = key;
            seenVersion[n] = version;
#if DMG_WINDOW
            seenLayout[n] = layoutEpoch;
#endif
            updated = 1;
        }
        if (count) TileRun(ox + first * 8, oy + DRAW_Y, runKey, count);
      }
    }
#if DMG_WINDOW
    paintRow += 3;
    if (paintRow >= screenRows) paintRow = 0;
#else
    paintRow = (paintRow + 3) % 18;
#endif
    if (expanded && (updated || spritesDirty)) {
        PaintSprites(map);
        updated = 1;
    }
    if (updated) Flush();
#endif
}

void EVENT_KEYPRESS() {
    int key;
    if (expanded) {
        if (BUFFERED_INPUT && swData == 255) {
            key = heldButtons & PhysicalButtons();
            // Kingston can report the old held mask after its release event.
            if (key == heldButtons) key = 0;
            heldButtons = key;
            return;
        }
        key = 0;
        if (swData == 17) key = 1;
        if (swData == 16) key = 2;
        if (swData == 18) key = 4;
        if (swData == 19) key = 8;
        if (swData == 20) key = MAIN_BUTTON;
        if (swData == 10) key = 32;
        if (swData == 21) key = 128;
        if (BUFFERED_INPUT) {
            if (!(heldButtons & key)) pendingButtons |= key;
            heldButtons |= key;
        } else pendingButtons |= key;
        return;
    }
    if (swData == 17) pendingButtons = 1;
    if (swData == 16) pendingButtons = 2;
    if (swData == 18) pendingButtons = 4;
    if (swData == 19) pendingButtons = 8;
}
