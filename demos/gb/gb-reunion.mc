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
int expanded, sp, carry, half, subtract, ime, eiDelay, halted, interruptMask, interruptFlags;
int phase, divider, oam[160], highRam[127], obp0, obp1, spritesDirty, paintedOam[160];

int Joypad() {
    int bits;
    bits = 15;
    if (!(p1 & 16)) bits &= 15 ^ (buttons & 15);
    if (!(p1 & 32)) bits &= 15 ^ ((buttons >> 4) & 15);
    return 192 | p1 | bits;
}

int Read8(int addr) {
    if (addr < 32768) return (cart[addr >> 2] >> ((addr & 3) * 8)) & 255;
    if (addr < 40960) return video[bank * 8192 + addr - 32768];
    if (addr >= 49152 && addr < 57344) return ram[addr - 49152];
    if (addr == 65280) return Joypad();
    if (expanded) {
        if (addr >= 57344 && addr < 65024) return ram[addr - 57344];
        if (addr >= 65024 && addr < 65184) return oam[addr - 65024];
        if (addr >= 65408 && addr < 65535) return highRam[addr - 65408];
        if (addr == 65535) return interruptMask;
        if (addr == 65284) return divider >> 8;
        if (addr == 65295) return 224 | interruptFlags;
        if (addr == 65344) return lcd;
        if (addr == 65348 && (lcd & 128)) return phase / 456;
        if (addr == 65348) return 0;
        if (addr == 65351) return bgp;
        if (addr == 65352) return obp0;
        if (addr == 65353) return obp1;
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
        if (addr == 65352 && obp0 != value) { obp0 = value; spritesDirty = 1; }
        if (addr == 65353 && obp1 != value) { obp1 = value; spritesDirty = 1; }
    }
    if (addr == 65280) {
        index = Joypad();
        p1 = value & 48;
        if (expanded && (index & (Joypad() ^ 255) & 15)) interruptFlags |= 16;
    }
    if (addr == 65344 && lcd != value) {
        if ((lcd ^ value) & 128) phase = 0;
        lcd = value;
        repaintSlices = 6;
        spritesDirty = 1;
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

int StepFull(int budget) {
    int op, dst, src, value, pair, delta, at, rounds, limit, i, waitStart, waitCost;
    op = Fetch8();
    dst = (op >> 3) & 7;
    src = op & 7;
    pair = (op >> 4) & 3;
    at = pc - 1;
    limit = budget;
    if (ime && (interruptMask & 1) && (lcd & 128) && UntilVBlank() < limit)
        limit = UntilVBlank();
    // The loop must stay in immutable ROM, and a fused group ends at the
    // same instruction and with the same registers as complete iterations.
    if (!eiDelay && at >= 0 && at <= 32749 && limit >= 36) {
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
    int remaining, steps, cost, pending, bit;
    remaining = 70224;
    for (steps = 0; steps < 320 && remaining > 0 && !failure; steps++) {
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
        } else {
            cost = StepFull(remaining);
            if (eiDelay) {
                eiDelay--;
                if (!eiDelay) ime = 1;
            }
        }
        divider = (divider + cost) & 65535;
        if (lcd & 128) {
            if (cost >= UntilVBlank()) interruptFlags |= 1;
            phase = (phase + cost) % 70224;
        }
        remaining -= cost;
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

int CellKey(int map, int x, int y) {
    int offset, tile, attr;
    offset = map + y * 32 + x;
    tile = video[offset];
    attr = 0;
    if (colorMode) attr = video[8192 + offset] & 111;
    if (!(lcd & 16) && tile < 128) tile += 256;
    if (attr & 8) tile += 384;
    return (attr << 10) | tile;
}

void RestoreSprite(int map, int x, int y) {
    int firstX, firstY, lastX, lastY, row, col;
    if (x <= -8 || x >= 160 || y <= -8 || y >= 144) return;
    firstX = 0;
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
}

void DrawSprite(int x, int y, int tile, int attr) {
    int row, bit, at, lo, hi, step, shift, start, last, palette, shade, saved;
    if (x <= -8 || x >= 160 || y <= -8 || y >= 144) return;
    palette = obp0;
    if (attr & 16) palette = obp1;
    saved = bgp;
    bgp = palette;
    step = -1;
    if (attr & 32) step = 1;
    for (row = 0; row < 8; row++) {
        if (y + row < 0 || y + row >= 144) continue;
        at = tile * 16 + row * 2;
        if (attr & 64) at = tile * 16 + (7 - row) * 2;
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
                    Color(last, 0);
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
    sp = 65534;
    obp0 = 255;
    obp1 = 255;
    bgp = 228;
    ready = 1;
    SetTimer(20, 1);
}

void EVENT_TIMEOUT() {
    int i, x, y, tile, n, updated, map, attr, offset, version, key, first, count, runKey, old, held;
    if (!ready) return;
    if (expanded) old = Joypad();
    buttons = pendingButtons;
    pendingButtons = 0;
    if (expanded) {
        held = GetKeyState();
        if (held & (1 << 17)) buttons |= 1;
        if (held & (1 << 16)) buttons |= 2;
        if (held & (1 << 18)) buttons |= 4;
        if (held & (1 << 19)) buttons |= 8;
        if (held & (1 << 20)) buttons |= 16;
        if (held & (1 << 10)) buttons |= 32;
        if (held & (1 << 21)) buttons |= 128;
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
    updated = 0;
    map = 6144;
    if (lcd & 8) map = 7168;
    if (repaintSlices) {
      repaintSlices--;
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
    }
    paintRow = (paintRow + 3) % 18;
    if (expanded && (updated || spritesDirty)) {
        PaintSprites(map);
        updated = 1;
    }
    if (updated) Flush();
}

void EVENT_KEYPRESS() {
    if (expanded) {
        if (swData == 17) pendingButtons |= 1;
        if (swData == 16) pendingButtons |= 2;
        if (swData == 18) pendingButtons |= 4;
        if (swData == 19) pendingButtons |= 8;
        if (swData == 20) pendingButtons |= 16;
        if (swData == 10) pendingButtons |= 32;
        if (swData == 21) pendingButtons |= 128;
        return;
    }
    if (swData == 17) pendingButtons = 1;
    if (swData == 16) pendingButtons = 2;
    if (swData == 18) pendingButtons = 4;
    if (swData == 19) pendingButtons = 8;
}
