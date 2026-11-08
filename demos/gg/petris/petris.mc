%{
#DEFINE PLAYERVER 4
#DEFINE LCDCLASS 255
#DEFINE IMAGETYPE 255
#DEFINE AUDIOTYPE 255
#DEFINE APPTYPE 1
#DEFINE APPCPID 100
#DEFINE APPID 1180
#DEFINE APPVER 256
#DEFINE APPNAME "Petris"
#DEFINE VALIDCOUNT 255
#DEFINE VALIDTERM 255
%}

// Fixed-ROM Game Gear with the Z80 and Mode 4 features used by Petris.
int rom[8193], ram[8192], vram[4096], cram[32], vdpRegs[11];
int a, b, c, d, e, hl, sp, pc, failed;
int access, address, latch, commandLow, cramLow, vblank, vdpRead, table;
int pad, pending, ox, oy, ready, stepsLeft;

int videoDirty, videoScrollChanged;

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

    }
    if (reg <= 9 && commandLow != previous) videoDirty = 1;
    if (reg == 8 && commandLow != previous) videoScrollChanged = 1;
}

void VdpData(int value) {
    int word, shift, old, offset;
    latch = 0;
    vdpRead = value;
    if (access == 3) {
        if (address & 1) {
            offset = (address & 62) >> 1;
            old = cram[offset];
            cram[offset] = cramLow | ((value & 15) << 8);
            if (old != cram[offset]) videoDirty = 1;
        } else cramLow = value;
    } else {
        old = VramByte(address);
        if (old != value) {
            word = address >> 2;
            shift = (address & 3) * 8;
            vram[word] += (value - old) << shift;
            videoDirty = 1;
        }
    }
    address = (address + 1) & 16383;
}

// Game Gear NTSC timing prototype. Events are applied at line boundaries.
int vdpLine, vdpClock, vdpHintCounter, vdpHint, vdpFrame;
int vdpScrollX[144], vdpScrollY;

int GameGearInput(int port) {
    int area, value;
    if (port <= 6) {
        if (!port) {
            pending &= 127;
            return 192 ^ (pad & 128);
        }
        if (port == 1) return 127;
        if (port == 3 || port == 5 || port == 6) return 0;
        return 255;
    }
    area = port & 193;
    if (area == 64) {
        if (vdpLine > 218) return vdpLine - 6;
        return vdpLine;
    }
    if (area == 65) return ((vdpClock * 3) >> 2) & 255;
    if (area == 128) {
        value = vdpRead;
        vdpRead = VramByte(address);
        address = (address + 1) & 16383;
        latch = 0;
        return value;
    }
    if (area == 129) {
        value = vblank | 31;
        vblank = 0;
        vdpHint = 0;
        latch = 0;
        return value;
    }
    if (area == 192 && port >= 192) {
        pending &= 128;
        return 255 ^ (pad & 63);
    }
    return 255;
}

void GameGearOutput(int port, int value) {
    int area;
    if (port < 7) return;
    area = port & 193;
    if (area == 128) VdpData(value);
    if (area == 129) VdpControl(value);
}

void ResetVideo() {
    vdpRegs[0] = 54;
    vdpRegs[1] = 128;
    vdpRegs[2] = 255;
    vdpRegs[3] = 255;
    vdpRegs[4] = 255;
    vdpRegs[5] = 255;
    vdpRegs[6] = 251;
    vdpRegs[10] = 255;
    table = 14336;
    vdpHintCounter = 255;
}

int VideoInterrupt() {
    return (vdpHint && (vdpRegs[0] & 16)) || ((vblank & 128) && (vdpRegs[1] & 32));
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

// Z80 integer core. Flags and timings follow the Zilog Z80 CPU User Manual.
// This prototype is exercised on the Petris 1.1 beta instruction trace.
int flags, alternateAF, alternateBC, alternateDE, alternateHL;
int ix, iy, interruptPage, refresh, iff1, iff2, eiDelay, interruptMode, halted;
int lastInstruction;

int M1() {
    refresh = (refresh & 128) | ((refresh + 1) & 127);
    return Fetch();
}

int SignedByte(int value) {
    return value - ((value & 128) << 1);
}

int SZ53(int value) {
    return (value & 168) | ((!value) << 6);
}

int Parity(int value) {
    value ^= value >> 4;
    return (0x9669 >> (value & 15) & 1) << 2;
}

int Index(int prefix) {
    if (prefix == 1) return ix;
    if (prefix == 2) return iy;
    return hl;
}

void SetIndex(int prefix, int value) {
    value &= 65535;
    if (prefix == 1) ix = value;
    else if (prefix == 2) iy = value;
    else hl = value;
}

int Pair(int slot, int prefix) {
    if (slot == 0) return (b << 8) | c;
    if (slot == 1) return (d << 8) | e;
    if (slot == 2) return Index(prefix);
    return sp;
}

void SetPair(int slot, int prefix, int value) {
    value &= 65535;
    if (slot == 0) { b = value >> 8; c = value & 255; }
    else if (slot == 1) { d = value >> 8; e = value & 255; }
    else if (slot == 2) SetIndex(prefix, value);
    else sp = value;
}

int Register(int slot, int prefix, int addr) {
    if (slot == 0) return b;
    if (slot == 1) return c;
    if (slot == 2) return d;
    if (slot == 3) return e;
    if (slot == 4) return Index(prefix) >> 8;
    if (slot == 5) return Index(prefix) & 255;
    if (slot == 6) return Read(addr);
    return a;
}

void SetRegister(int slot, int prefix, int addr, int value) {
    if (slot == 0) b = value;
    else if (slot == 1) c = value;
    else if (slot == 2) d = value;
    else if (slot == 3) e = value;
    else if (slot == 4) SetIndex(prefix, (Index(prefix) & 255) | (value << 8));
    else if (slot == 5) SetIndex(prefix, (Index(prefix) & 65280) | value);
    else if (slot == 6) Write(addr, value);
    else a = value;
}

int ReadWord(int addr) {
    int lo;
    lo = Read(addr);
    return lo | (Read((addr + 1) & 65535) << 8);
}

void WriteWord(int addr, int value) {
    Write(addr, value & 255);
    Write((addr + 1) & 65535, value >> 8);
}

int Condition(int slot) {
    int mask;
    mask = 64;
    if (slot & 2) mask = 1;
    if (slot & 4) mask = 4;
    if (slot >= 6) mask = 128;
    return ((flags & mask) != 0) == (slot & 1);
}

void Alu(int kind, int value) {
    int result, raw, cin, common;
    cin = 0;
    if (kind == 1 || kind == 3) cin = flags & 1;
    if (kind < 4 || kind == 7) {
        if (kind < 2) {
            raw = a + value + cin;
            result = raw & 255;
            common = ((a ^ value ^ result) & 16) | ((~(a ^ value) & (a ^ result) & 128) >> 5);
            flags = SZ53(result) | common | (raw > 255);
        } else {
            raw = a - value - cin;
            result = raw & 255;
            common = ((a ^ value ^ result) & 16) | (((a ^ value) & (a ^ result) & 128) >> 5);
            flags = SZ53(result) | common | 2 | (raw < 0);
            if (kind == 7) flags = (flags & 215) | (value & 40);
        }
        if (kind != 7) a = result;
        return;
    }
    if (kind == 4) a &= value;
    else if (kind == 5) a ^= value;
    else a |= value;
    flags = SZ53(a) | Parity(a) | ((kind == 4) << 4);
}

int AddIndex(int left, int value) {
    int sum;
    sum = left + value;
    flags = (flags & 196) | ((sum >> 8) & 40) | (((left ^ value ^ sum) >> 8) & 16) | (sum > 65535);
    return sum & 65535;
}

void AdcSbcHL(int value, int sub) {
    int raw, result, overflow, cin;
    cin = flags & 1;
    if (sub) {
        raw = hl - value - cin;
        overflow = ((hl ^ value) & (hl ^ raw) & 32768) >> 13;
    } else {
        raw = hl + value + cin;
        overflow = (~(hl ^ value) & (hl ^ raw) & 32768) >> 13;
    }
    result = raw & 65535;
    flags = ((result >> 8) & 168) | ((!result) << 6) | (((hl ^ value ^ result) >> 8) & 16) |
            overflow | (sub << 1) | (raw < 0 || raw > 65535);
    hl = result;
}

int Shift(int kind, int value) {
    int out, cin, result;
    cin = flags & 1;
    if ((kind & 1) == 0) {
        out = value >> 7;
        result = (value << 1) & 255;
        if (kind == 0) result |= out;
        if (kind == 2) result |= cin;
        if (kind == 6) result |= 1;
    } else {
        out = value & 1;
        result = value >> 1;
        if (kind == 1) result |= out << 7;
        if (kind == 3) result |= cin << 7;
        if (kind == 5) result |= value & 128;
    }
    flags = SZ53(result) | Parity(result) | out;
    return result;
}

int BitOperation(int op, int addr, int indexed) {
    int group, bit, slot, value, result, undocumented;
    group = op >> 6;
    bit = (op >> 3) & 7;
    slot = op & 7;
    if (indexed) value = Read(addr);
    else value = Register(slot, 0, addr);
    if (group == 1) {
        result = value & (1 << bit);
        undocumented = value;
        if (indexed) undocumented = addr >> 8;
        flags = (flags & 1) | 16 | (undocumented & 40) | ((!result) * 68) | (result & 128);
    } else {
        if (!group) result = Shift(bit, value);
        else if (group == 2) result = value & (255 ^ (1 << bit));
        else result = value | (1 << bit);
        if (indexed) Write(addr, result);
        if (!indexed || slot != 6) SetRegister(slot, 0, addr, result);
    }
    if (indexed) {
        if (group == 1) return 20;
        return 23;
    }
    if (slot != 6) return 8;
    if (group == 1) return 12;
    return 15;
}

int BlockOperation(int op) {
    int kind, direction, value, counter, sum, change, again;
    kind = op & 3;
    direction = 1;
    if (op & 8) direction = -1;
    if (kind == 0) {
        value = Read(hl);
        Write(Pair(1, 0), value);
        hl = (hl + direction) & 65535;
        SetPair(1, 0, Pair(1, 0) + direction);
        counter = (Pair(0, 0) - 1) & 65535;
        SetPair(0, 0, counter);
        sum = a + value;
        flags = (flags & 193) | (sum & 8) | ((sum & 2) << 4) | ((counter != 0) << 2);
        again = counter != 0;
    } else if (kind == 1) {
        value = Read(hl);
        hl = (hl + direction) & 65535;
        counter = (Pair(0, 0) - 1) & 65535;
        SetPair(0, 0, counter);
        sum = (a - value) & 255;
        change = (a ^ value ^ sum) & 16;
        value = (sum - (change != 0)) & 255;
        flags = (flags & 1) | (sum & 128) | ((!sum) << 6) | change | (value & 8) |
                ((value & 2) << 4) | ((counter != 0) << 2) | 2;
        again = counter != 0 && sum != 0;
    } else {
        if (kind == 2) {
            value = GameGearInput(c);
            Write(hl, value);
            sum = value + ((c + direction) & 255);
        } else {
            value = Read(hl);
            GameGearOutput(c, value);
            sum = value + ((hl + direction) & 255);
        }
        hl = (hl + direction) & 65535;
        b = (b - 1) & 255;
        flags = SZ53(b) | (sum > 255 ? 17 : 0) | Parity((sum & 7) ^ b) | ((value & 128) >> 6);
        again = b != 0;
    }
    if ((op & 16) && again) {
        pc = (pc - 2) & 65535;
        return 21;
    }
    return 16;
}

int Extended(int op) {
    int y, z, slot, value, addr, saved;
    if ((op & 228) == 160) return BlockOperation(op);
    if ((op & 192) != 64) { failed = 1; return 8; }
    y = (op >> 3) & 7;
    z = op & 7;
    slot = y >> 1;
    if (z == 0) {
        value = GameGearInput(c);
        if (y != 6) SetRegister(y, 0, hl, value);
        flags = (flags & 1) | SZ53(value) | Parity(value);
        return 12;
    }
    if (z == 1) {
        value = 0;
        if (y != 6) value = Register(y, 0, hl);
        GameGearOutput(c, value);
        return 12;
    }
    if (z == 2) { AdcSbcHL(Pair(slot, 0), !(y & 1)); return 15; }
    if (z == 3) {
        addr = Word();
        if (y & 1) SetPair(slot, 0, ReadWord(addr));
        else WriteWord(addr, Pair(slot, 0));
        return 20;
    }
    if (z == 4) {
        value = a; a = 0; Alu(2, value); return 8;
    }
    if (z == 5) { pc = Pop(); iff1 = iff2; return 14; }
    if (z == 6) {
        interruptMode = 0;
        if (y == 2 || y == 6) interruptMode = 1;
        if (y == 3 || y == 7) interruptMode = 2;
        return 8;
    }
    if (y == 0) { interruptPage = a; return 9; }
    if (y == 1) { refresh = a; return 9; }
    if (y == 2 || y == 3) {
        if (y == 2) a = interruptPage;
        else a = refresh;
        flags = (flags & 1) | SZ53(a) | (iff2 << 2);
        return 9;
    }
    if (y == 4 || y == 5) {
        value = Read(hl);
        saved = a & 15;
        if (y == 4) { a = (a & 240) | (value & 15); value = (saved << 4) | (value >> 4); }
        else { a = (a & 240) | (value >> 4); value = ((value << 4) & 240) | saved; }
        Write(hl, value);
        flags = (flags & 1) | SZ53(a) | Parity(a);
        return 18;
    }
    failed = 1;
    return 8;
}

int BaseOperation(int op, int prefix) {
    int x, y, z, slot, odd, addr, value, source, dest, shift, condition;
    x = op >> 6;
    y = (op >> 3) & 7;
    z = op & 7;
    slot = y >> 1;
    odd = y & 1;
    if (!x) {
        if (!z) {
            if (!y) return 4;
            if (y == 1) {
                value = (a << 8) | flags;
                a = alternateAF >> 8; flags = alternateAF & 255; alternateAF = value;
                return 4;
            }
            if (y == 2) {
                b = (b - 1) & 255;
                Relative(b != 0);
                if (b) return 13;
                return 8;
            }
            condition = y == 3 || Condition(y - 4);
            Relative(condition);
            if (condition) return 12;
            return 7;
        }
        if (z == 1) {
            if (!odd) { SetPair(slot, prefix, Word()); return 10; }
            SetIndex(prefix, AddIndex(Index(prefix), Pair(slot, prefix)));
            return 11;
        }
        if (z == 2) {
            if (slot <= 1) {
                addr = Pair(slot, 0);
                if (odd) a = Read(addr);
                else Write(addr, a);
                return 7;
            }
            addr = Word();
            if (slot == 2) {
                if (odd) SetIndex(prefix, ReadWord(addr));
                else WriteWord(addr, Index(prefix));
                return 16;
            }
            if (odd) a = Read(addr);
            else Write(addr, a);
            return 13;
        }
        if (z == 3) { SetPair(slot, prefix, Pair(slot, prefix) + 1 - 2 * odd); return 6; }
        if (z <= 6) {
            addr = hl;
            if (y == 6 && prefix) addr = (Index(prefix) + SignedByte(Fetch())) & 65535;
            if (z == 6) {
                SetRegister(y, prefix, addr, Fetch());
                if (y != 6) return 7;
                if (prefix) return 15;
                return 10;
            }
            value = Register(y, prefix, addr);
            source = (value + 9 - 2 * z) & 255;
            flags = (flags & 1) | SZ53(source) | ((value ^ source) & 16);
            if (z == 5) flags |= 2;
            if ((z == 4 && value == 127) || (z == 5 && value == 128)) flags |= 4;
            SetRegister(y, prefix, addr, source);
            if (y != 6) return 4;
            if (prefix) return 19;
            return 11;
        }
        if (y <= 3) {
            value = flags;
            a = Shift(y, a);
            flags = (value & 196) | (flags & 1) | (a & 40);
        } else if (y == 4) {
            value = flags;
            source = a;
            shift = 0;
            if ((value & 16) || (!(value & 2) && (a & 15) > 9)) shift |= 6;
            dest = (value & 1) || (!(value & 2) && a > 153);
            if (dest) shift |= 96;
            if (value & 2) a = (a - shift) & 255;
            else a = (a + shift) & 255;
            flags = SZ53(a) | Parity(a) | ((source ^ a) & 16) | (value & 2) | dest;
        } else if (y == 5) { a ^= 255; flags = (flags & 197) | (a & 40) | 18; }
        else if (y == 6) flags = (flags & 196) | (a & 40) | 1;
        else flags = (flags & 196) | (a & 40) | ((flags & 1) << 4) | ((flags ^ 1) & 1);
        return 4;
    }
    if (x == 1) {
        if (op == 118) { halted = 1; return 4; }
        addr = hl;
        source = prefix;
        if (y == 6 || z == 6) {
            if (prefix) addr = (Index(prefix) + SignedByte(Fetch())) & 65535;
            source = 0;
        }
        SetRegister(y, source, addr, Register(z, source, addr));
        if (y != 6 && z != 6) return 4;
        if (prefix) return 15;
        return 7;
    }
    if (x == 2) {
        addr = hl;
        if (z == 6 && prefix) addr = (Index(prefix) + SignedByte(Fetch())) & 65535;
        Alu(y, Register(z, prefix, addr));
        if (z != 6) return 4;
        if (prefix) return 15;
        return 7;
    }
    if (z == 0) {
        if (Condition(y)) { pc = Pop(); return 11; }
        return 5;
    }
    if (z == 1) {
        if (!odd) {
            value = Pop();
            if (slot == 3) { a = value >> 8; flags = value & 255; }
            else SetPair(slot, prefix, value);
            return 10;
        }
        if (slot == 0) { pc = Pop(); return 10; }
        if (slot == 1) {
            value = Pair(0, 0); SetPair(0, 0, alternateBC); alternateBC = value;
            value = Pair(1, 0); SetPair(1, 0, alternateDE); alternateDE = value;
            value = hl; hl = alternateHL; alternateHL = value;
            return 4;
        }
        if (slot == 2) { pc = Index(prefix); return 4; }
        sp = Index(prefix);
        return 6;
    }
    if (z == 2) { Jump(Condition(y)); return 10; }
    if (z == 3) {
        if (!y) { Jump(1); return 10; }
        if (y == 2) { GameGearOutput(Fetch(), a); return 11; }
        if (y == 3) { a = GameGearInput(Fetch()); return 11; }
        if (y == 4) { value = ReadWord(sp); WriteWord(sp, Index(prefix)); SetIndex(prefix, value); return 19; }
        if (y == 5) { value = hl; hl = Pair(1, 0); SetPair(1, 0, value); return 4; }
        if (y == 6) { iff1 = 0; iff2 = 0; eiDelay = 0; return 4; }
        if (y == 7) { iff1 = 1; iff2 = 1; eiDelay = 2; return 4; }
        failed = 1;
        return 4;
    }
    if (z == 4) {
        addr = Word();
        if (Condition(y)) { Push(pc); pc = addr; return 17; }
        return 10;
    }
    if (z == 5) {
        if (!odd) {
            if (slot == 3) Push((a << 8) | flags);
            else Push(Pair(slot, prefix));
            return 11;
        }
        if (!slot) { addr = Word(); Push(pc); pc = addr; return 17; }
        failed = 1;
        return 4;
    }
    if (z == 6) { Alu(y, Fetch()); return 7; }
    Push(pc); pc = y << 3;
    return 11;
}

int Z80Step() {
    int op, prefix, prefixCycles, addr;
    prefix = 0;
    prefixCycles = 0;
    lastInstruction = pc;
    op = M1();
    while (op == 221 || op == 253) {
        prefix = 1;
        if (op == 253) prefix = 2;
        prefixCycles += 4;
        if (prefixCycles > 32) { failed = 1; return prefixCycles; }
        op = M1();
    }
    if (op == 203) {
        if (!prefix) return BitOperation(M1(), hl, 0);
        addr = (Index(prefix) + SignedByte(Fetch())) & 65535;
        return BitOperation(Fetch(), addr, 1) + prefixCycles - 4;
    }
    if (op == 237) return Extended(M1()) + prefixCycles;
    return BaseOperation(op, prefix) + prefixCycles;
}

int Z80Interrupt() {
    int addr;
    halted = 0;
    iff1 = 0;
    iff2 = 0;
    refresh = (refresh & 128) | ((refresh + 1) & 127);
    Push(pc);
    if (interruptMode == 2) {
        addr = (interruptPage << 8) | 255;
        pc = ReadWord(addr);
        return 19;
    }
    pc = 56;
    return 13;
}
// Petris divides tile coordinates using ADD HL,BC / JR C with BC = -23.
// Fold only complete, taken iterations before the next VDP line boundary.
int FoldPetrisRemainder() {
    int rounds, limit, prior;
    if (pc != 0x638a || eiDelay || b != 255 || c != 233 ||
        Rom(0x638a) != 9 || Rom(0x638b) != 56 || Rom(0x638c) != 253) return 0;
    rounds = hl / 23;
    limit = 262 - vdpLine;
    if (iff1 && (vdpRegs[0] & 16)) limit = 1;
    if (iff1 && (vdpRegs[1] & 32) && vdpLine < 193 && limit > 193 - vdpLine)
        limit = 193 - vdpLine;
    limit = (limit * 228 - vdpClock) / 23;
    if (rounds > limit) rounds = limit;
    if (rounds < 2) return 0;
    prior = hl - (rounds - 1) * 23;
    hl = prior - 23;
    flags = (flags & 196) | ((hl >> 8) & 40) | (((prior ^ 65513 ^ hl) >> 8) & 16) | 1;
    refresh = (refresh & 128) | ((refresh + rounds * 2) & 127);
    lastInstruction = 0x638b;
    return rounds * 23;
}
// 192-line Game Gear Mode 4. A VBlank snapshot is composed offscreen.
// The LCD crop covers VDP columns 48..207 and lines 24..167.
image ggImage;
int ggImageVram[4096], ggImageRegs[11], ggImageScrollX[144];
int ggImageScrollY, ggImageTable, ggImageRow, ggImageFrame, ggImageReady;
int ggImageHeader[28], ggImageWords[40], ggImageSpread[256], ggImageFlip[256];
int ggImageSpriteTop[64], ggImageSpriteLeft[64], ggImageSpritePattern[64];
int ggImageSpriteCount, ggImageSpriteZoom, ggImageSpriteHeight, ggImageSpriteWidth;

int GgInitImage() {
    int i, p0, p1, size;
    for (i = 0; i < 256; i++) {
        p0 = i & 15;
        p1 = i >> 4;
        ggImageSpread[i] =
            (p0 >> 3) | ((p0 & 4) << 6) | ((p0 & 2) << 15) | ((p0 & 1) << 24) |
            ((p1 >> 3) << 1) | ((p1 & 4) << 7) | ((p1 & 2) << 16) | ((p1 & 1) << 25);
        ggImageFlip[i] =
            (p0 & 1) | ((p0 & 2) << 7) | ((p0 & 4) << 14) | ((p0 & 8) << 21) |
            ((p1 & 1) << 1) | ((p1 & 2) << 8) | ((p1 & 4) << 15) | ((p1 & 8) << 22);
    }
    ggImageRow = 144;
    size = SetMediaSize(ggImage, 23152);
    ggImageReady = size && GetMediaSize(ggImage) >= 23152;
    return ggImageReady;
}

int GgImageByte(int offset) {
    return (ggImageVram[offset >> 2] >> ((offset & 3) * 8)) & 255;
}

void GgImageHeaderByte(int offset, int value) {
    ggImageHeader[offset >> 2] |= value << ((offset & 3) * 8);
}

int ggImageBackdropColor;

void GgQueueFrame() {
    int i, color, sat, shift, bank, top, info, pattern;
    if (!ggImageReady || ggImageRow < 144 || !videoDirty) return;
    if (!(vdpRegs[1] & 64) && !(ggImageRegs[1] & 64) && ggImageFrame &&
        (ggImageRegs[7] & 15) == (vdpRegs[7] & 15) &&
        ggImageBackdropColor == cram[16 | (vdpRegs[7] & 15)]) return;
    videoDirty = 0;
    ggImageBackdropColor = cram[16 | (vdpRegs[7] & 15)];
    MemCpyInt(&ggImageVram[0], &vram[0], 4096);
    MemCpyInt(&ggImageRegs[0], &vdpRegs[0], 11);
    MemCpyInt(&ggImageScrollX[0], &vdpScrollX[0], 144);
    ggImageScrollY = vdpScrollY;
    ggImageTable = table;

    // The first 32 colors are CRAM. 35 RGB entries make the header 112 bytes.
    MemSetInt(&ggImageHeader[0], 0, 112);
    ggImageHeader[0] = 0x0090a00c;
    ggImageHeader[1] = 0x00230000;
    for (i = 0; i < 32; i++) {
        color = cram[i];
        GgImageHeaderByte(7 + i * 3, (color & 15) * 17);
        GgImageHeaderByte(8 + i * 3, ((color >> 4) & 15) * 17);
        GgImageHeaderByte(9 + i * 3, ((color >> 8) & 15) * 17);
    }
    MemCpyIntToMedia(ggImage, 0, &ggImageHeader[0], 28);

    ggImageSpriteZoom = ggImageRegs[1] & 1;
    ggImageSpriteWidth = 8 << ggImageSpriteZoom;
    ggImageSpriteHeight = ggImageSpriteWidth;
    if (ggImageRegs[1] & 2) ggImageSpriteHeight <<= 1;
    ggImageSpriteCount = 0;
    sat = (ggImageRegs[5] & 126) << 7;
    shift = ggImageRegs[0] & 8;
    bank = (ggImageRegs[6] & 4) << 9;
    for (i = 0; i < 64; i++) {
        top = GgImageByte(sat + i);
        if (top == 208) break;
        top++;
        if (top > 240) top -= 256;
        if (top >= 168 || top + ggImageSpriteHeight <= 24) continue;
        info = sat + 128 + i * 2;
        pattern = GgImageByte(info + 1);
        if (ggImageRegs[1] & 2) pattern &= 254;
        ggImageSpriteTop[ggImageSpriteCount] = top;
        ggImageSpriteLeft[ggImageSpriteCount] = GgImageByte(info) - 48 - shift;
        ggImageSpritePattern[ggImageSpriteCount] = bank + pattern * 8;
        ggImageSpriteCount++;
    }
    ggImageRow = 0;
}

int GgImagePixels(int planes, int flipped) {
    int lo, hi;
    lo = (planes & 15) | ((planes >> 4) & 240);
    hi = ((planes >> 16) & 15) | ((planes >> 20) & 240);
    if (flipped) return ggImageFlip[lo] | (ggImageFlip[hi] << 2);
    return ggImageSpread[lo] | (ggImageSpread[hi] << 2);
}

// A new word starts on its first byte. The following span fills the remainder.
void GgImageSpan(int x, int word, int count) {
    int index, shift, rest;
    index = x >> 2;
    shift = (x & 3) * 8;
    if (count < 4) word &= (1 << (count * 8)) - 1;
    if (!shift) ggImageWords[index] = word;
    else {
        ggImageWords[index] |= word << shift;
        rest = shift + count * 8 - 32;
        if (rest > 0)
            ggImageWords[index + 1] = (word >> (32 - shift)) & ((1 << rest) - 1);
    }
}

int ggTileCacheValid[128], ggTileCachePlanes[128], ggTileCacheFlip[128];
int ggTileCacheFirst[128], ggTileCacheSecond[128];

void GgImageAlignedTile(int name, int row, int dest) {
    int palette, planes, flip, bucket, first, second;
    palette = ((name >> 7) & 48) * 0x01010101;
    if (name & 1024) row = 7 - row;
    planes = ggImageVram[(name & 511) * 8 + row];
    if (!planes) {
        ggImageWords[dest] = palette;
        ggImageWords[dest + 1] = palette;
        return;
    }
    flip = name & 512;
    bucket = (planes ^ (planes >> 7) ^ (planes >> 16) ^ (planes >> 23) ^ (flip >> 4)) & 127;
    if (ggTileCacheValid[bucket] && ggTileCachePlanes[bucket] == planes && ggTileCacheFlip[bucket] == flip) {
        first = ggTileCacheFirst[bucket];
        second = ggTileCacheSecond[bucket];
    } else {
        if (flip) {
            first = GgImagePixels(planes, 1);
            second = GgImagePixels(planes >> 4, 1);
        } else {
            first = GgImagePixels(planes >> 4, 0);
            second = GgImagePixels(planes, 0);
        }
        ggTileCacheValid[bucket] = 1;
        ggTileCachePlanes[bucket] = planes;
        ggTileCacheFlip[bucket] = flip;
        ggTileCacheFirst[bucket] = first;
        ggTileCacheSecond[bucket] = second;
    }
    ggImageWords[dest] = palette | first;
    ggImageWords[dest + 1] = palette | second;
}

// The Petris playfield and its menus keep the window tile-aligned.
void GgImageAlignedBackground(int y) {
    int row, map, dest, names;
    row = y & 7;
    map = (ggImageTable >> 2) + ((y + 24) >> 3) * 16 + 3;
    for (dest = 0; dest < 40; dest += 4) {
        names = ggImageVram[map];
        GgImageAlignedTile(names & 65535, row, dest);
        GgImageAlignedTile((names >> 16) & 65535, row, dest + 2);
        map++;
    }
}

void GgImageBackground(int y) {
    int line, scrollX, scrollY, mapX, mapY, x, end, name, pattern, flags;
    int row, planes, palette, lockRight, first, second, skip, count;
    line = y + 24;
    scrollX = ggImageScrollX[y];
    scrollY = line + ggImageScrollY;
    if (scrollY >= 224) scrollY -= 224;
    lockRight = ggImageRegs[0] & 128;
    x = 0;
    while (x < 160) {
        mapY = scrollY;
        if (lockRight && x >= 144) mapY = line;
        mapX = (x + 48 - scrollX) & 255;
        end = x + 8 - (mapX & 7);
        if (lockRight && x < 144 && end > 144) end = 144;
        if (end > 160) end = 160;
        name = ggImageTable + (mapY >> 3) * 64 + (mapX >> 3) * 2;
        flags = GgImageByte(name + 1);
        pattern = GgImageByte(name) | ((flags & 1) << 8);
        row = mapY & 7;
        if (flags & 4) row = 7 - row;
        planes = ggImageVram[pattern * 8 + row];
        // Bits 0..4 carry the palette index. Bit 5 marks BG priority.
        palette = ((flags & 24) << 1) * 0x01010101;
        if (flags & 2) {
            first = palette | GgImagePixels(planes, 1);
            second = palette | GgImagePixels(planes >> 4, 1);
        } else {
            first = palette | GgImagePixels(planes >> 4, 0);
            second = palette | GgImagePixels(planes, 0);
        }
        if (!(x & 3) && end - x == 8) {
            ggImageWords[x >> 2] = first;
            ggImageWords[(x >> 2) + 1] = second;
            x = end;
            continue;
        }
        skip = mapX & 7;
        if (skip < 4) {
            count = 4 - skip;
            if (count > end - x) count = end - x;
            GgImageSpan(x, first >> (skip * 8), count);
            x += count;
            skip = 4;
        }
        if (x < end) GgImageSpan(x, second >> ((skip - 4) * 8), end - x);
        x = end;
    }
}

void GgImageSprites(int y) {
    int i, count, row, left, right, planes, first, second, x;
    int slot, shift, bg, offset, color;
    count = 0;
    for (i = 0; i < ggImageSpriteCount && count < 8; i++) {
        row = y + 24 - ggImageSpriteTop[i];
        if (row < 0 || row >= ggImageSpriteHeight) continue;
        count++;
        left = ggImageSpriteLeft[i];
        right = left + ggImageSpriteWidth;
        if (right <= 0 || left >= 160) continue;
        planes = ggImageVram[ggImageSpritePattern[i] + (row >> ggImageSpriteZoom)];
        if (!planes) continue;
        first = GgImagePixels(planes >> 4, 0);
        second = GgImagePixels(planes, 0);
        x = left;
        if (x < 0) x = 0;
        if (right > 160) right = 160;
        for (; x < right; x++) {
            slot = x >> 2;
            shift = (x & 3) * 8;
            bg = (ggImageWords[slot] >> shift) & 255;
            if (bg & 64) continue;
            offset = (x - left) >> ggImageSpriteZoom;
            color = first;
            if (offset >= 4) color = second;
            color = (color >> ((offset & 3) * 8)) & 15;
            if (!color) continue;
            // Earlier opaque SAT pixels win before checking BG priority.
            if (!(bg & 32) || !(bg & 15)) bg = 16 | color;
            ggImageWords[slot] = (ggImageWords[slot] & ((255 << shift) ^ -1)) | ((bg | 64) << shift);
        }
    }
}

void GgComposeImageLine(int y) {
    int i, backdrop;
    if (ggImageRegs[1] & 64) {
        if (ggImageScrollX[y] || ggImageScrollY) GgImageBackground(y);
        else GgImageAlignedBackground(y);
        GgImageSprites(y);
        for (i = 0; i < 40; i++) ggImageWords[i] &= 0x1f1f1f1f;
        return;
    }
    backdrop = (16 | (ggImageRegs[7] & 15)) * 0x01010101;
    MemSetInt(&ggImageWords[0], backdrop, 160);
}

void GgPaintImage(int rows) {
    int end;
    if (ggImageRow >= 144 || rows <= 0) return;
    end = ggImageRow + rows;
    if (end > 144) end = 144;
    for (; ggImageRow < end; ggImageRow++) {
        GgComposeImageLine(ggImageRow);
        MemCpyIntToMedia(ggImage, 112 + ggImageRow * 160, &ggImageWords[0], 40);
    }
    if (ggImageRow == 144) {
        CopyImage(ox, oy, ggImage);
        Flush();
        ggImageFrame++;
    }
}


// Steps ending in HALT and the verified ROM folds can span multiple lines.
void AdvanceVideo(int cycles) {
    int lines, end, activeEnd, updates, scrollFirst, scrollLast, i;
    vdpClock += cycles;
    if (vdpClock < 228) return;
    lines = 1;
    if (vdpClock >= 456) lines = vdpClock / 228;
    vdpClock -= lines * 228;
    end = vdpLine + lines;
    if (vdpLine < 192) {
        activeEnd = end;
        if (activeEnd > 192) activeEnd = 192;
        updates = activeEnd - vdpLine;
        if (updates <= vdpHintCounter) vdpHintCounter -= updates;
        else {
            vdpHint = 1;
            updates -= vdpHintCounter + 1;
            vdpHintCounter = vdpRegs[10] - updates % (vdpRegs[10] + 1);
        }
    }
    if (end >= 193) vdpHintCounter = vdpRegs[10];
    if (videoScrollChanged && end >= 24 && vdpLine < 167) {
        scrollFirst = vdpLine + 1;
        if (scrollFirst < 24) scrollFirst = 24;
        scrollLast = end;
        if (scrollLast > 167) scrollLast = 167;
        for (i = scrollFirst - 24; i <= scrollLast - 24; i++) {
            if (vdpScrollX[i] != vdpRegs[8]) {
                vdpScrollX[i] = vdpRegs[8];
                videoDirty = 1;
            }
        }
    }
    if (vdpLine < 193 && end >= 193) {
        vblank |= 128;
        GgQueueFrame();
    }
    if (end >= 262) {
        end -= 262;
        vdpFrame++;
        if (vdpScrollY != vdpRegs[9]) {
            vdpScrollY = vdpRegs[9];
            videoDirty = 1;
        }
    }
    vdpLine = end;
}

int petClearSignature[5] = {211, 190, 13, 32, 251};
int petClearFold;

void CheckPetrisClear() {
    int i;
    petClearFold = 1;
    for (i = 0; i < 5; i++)
        if (Rom(0x6441 + i) != petClearSignature[i]) petClearFold = 0;
}

// OUT (BE),A / DEC C / JR NZ clears VRAM between video snapshots.
int FoldPetrisClear() {
    int rounds, limit, stop, i, shift, prior;
    if (!petClearFold || pc != 0x6441 || a || eiDelay || access == 3) return 0;
    rounds = (c - 1) & 255;
    limit = 262 - vdpLine;
    if (iff1 && (vdpRegs[0] & 16)) limit = 1;
    if (vdpLine < 193 && limit > 193 - vdpLine)
        limit = 193 - vdpLine;
    limit = (limit * 228 - vdpClock) / 27;
    if (rounds > limit) rounds = limit;
    limit = 16384 - address;
    if (rounds > limit) rounds = limit;
    if (rounds < 2) return 0;
    stop = address + rounds;
    i = address;
    while (i < stop && (i & 3)) {
        shift = (i & 3) * 8;
        vram[i >> 2] &= (255 << shift) ^ -1;
        i++;
    }
    limit = (stop - i) & -4;
    if (limit) MemSetInt(&vram[i >> 2], 0, limit);
    i += limit;
    while (i < stop) {
        shift = (i & 3) * 8;
        vram[i >> 2] &= (255 << shift) ^ -1;
        i++;
    }
    address = stop & 16383;
    vdpRead = 0;
    latch = 0;
    videoDirty = 1;
    c = (c - rounds) & 255;
    prior = (c + 1) & 255;
    flags = (flags & 1) | SZ53(c) | ((prior ^ c) & 16) | 2;
    if (prior == 128) flags |= 4;
    refresh = (refresh & 128) | ((refresh + rounds * 3) & 127);
    lastInstruction = 0x6444;
    return rounds * 27;
}

int petUploadSignature[33] = {253, 126, 0, 211, 190, 0, 24, 0, 253, 126, 1, 211, 190, 0, 24, 0, 253, 126, 2, 211, 190, 0, 24, 0, 253, 126, 3, 211, 190, 221, 37, 32, 157};
int petUploadFold;

void CheckPetrisUpload() {
    int i;
    petUploadFold = 1;
    for (i = 0; i < 33; i++)
        if (Rom(0x64e4 + i) != petUploadSignature[i]) petUploadFold = 0;
}

// Emit one complete, aligned four-plane pattern row.
int FoldPetrisUpload() {
    int old, next, cycles, word, slot;
    if (!petUploadFold || pc != 0x64e4 || eiDelay || iy < 49152 || iy > 65532 ||
        (address & 3) || access == 3) return 0;
    old = ix >> 8;
    next = (old - 1) & 255;
    cycles = 188;
    if (!next) cycles = 183;
    if ((vdpLine == 192 || vdpLine == 261 || (iff1 && (vdpRegs[0] & 16))) &&
        vdpClock + cycles > 228) return 0;
    a = Read(iy + 3);
    word = Read(iy) | (Read(iy + 1) << 8) | (Read(iy + 2) << 16) | (a << 24);
    slot = address >> 2;
    if (vram[slot] != word) {
        vram[slot] = word;
        videoDirty = 1;
    }
    address = (address + 4) & 16383;
    vdpRead = a;
    latch = 0;
    ix = (ix & 255) | (next << 8);
    flags = (flags & 1) | SZ53(next) | ((old ^ next) & 16) | 2;
    if (old == 128) flags |= 4;
    refresh = (refresh & 128) | ((refresh + 21) & 127);
    lastInstruction = 0x6503;
    pc = 0x64a2;
    if (!next) pc = 0x6505;
    return cycles;
}

int petTileFold;

// One iteration of the ROM's two-plane tile to VDP conversion.
// Keep stack writes, flags, refresh and cycles visible to the guest.
int FoldPetrisTile() {
    int index, palette, cycles, m1, stack, slot, value, cin, next;
    if (!petTileFold || pc != 0x64a9 || eiDelay || iy < 49152 || iy > 65532 ||
        sp < 49154 || iy < sp || !(ix & 255)) return 0;
    index = ((b & 1) << 1) | (c & 1);
    cycles = 215;
    m1 = 30;
    palette = e;
    if (index == 1) { cycles = 247; m1 = 36; palette = e >> 4; }
    if (index == 2) { cycles = 247; m1 = 34; palette = d; }
    if (index == 3) { cycles = 256; m1 = 37; palette = d >> 4; }
    if ((ix & 255) == 1) cycles -= 5;
    if (vdpLine >= 260 && vdpClock + cycles > (262 - vdpLine) * 228) return 0;
    if (iff1 && ((vdpRegs[0] & 16) ||
        ((vdpRegs[1] & 32) && vdpLine >= 191 && vdpLine <= 192)) &&
        vdpClock + cycles > 228) return 0;

    stack = sp - 2;
    WriteWord(stack, (d << 8) | e);
    b >>= 1;
    c >>= 1;
    a = palette & 15;
    cin = 0;
    for (slot = iy; slot < iy + 4; slot++) {
        value = Read(slot);
        next = a & 1;
        a = (a >> 1) | (cin << 7);
        Write(slot, (value >> 1) | (next << 7));
        cin = value & 1;
    }
    value = ix & 255;
    next = value - 1;
    ix--;
    flags = cin | SZ53(next) | ((value ^ next) & 16) | 2;
    if (value == 128) flags |= 4;
    refresh = (refresh & 128) | ((refresh + m1) & 127);
    lastInstruction = 0x64e2;
    pc = 0x64a9;
    if (!next) pc = 0x64e4;
    return cycles;
}

int petTileSignature[59] = {175, 203, 56, 23, 203, 57, 23, 213, 60, 61, 32, 3, 123, 24, 17, 61, 32, 3, 123, 24, 7, 61, 32, 3, 122, 24, 5, 122, 31, 31, 31, 31, 230, 15, 31, 253, 203, 0, 30, 31, 253, 203, 1, 30, 31, 253, 203, 2, 30, 31, 253, 203, 3, 30, 209, 221, 45, 32, 197};

void CheckPetrisTile() {
    int index;
    petTileFold = 1;
    for (index = 0; index < 59; index++) {
        if (Rom(0x64a9 + index) != petTileSignature[index]) petTileFold = 0;
    }
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
    else DrawStr(35, 65, "PETRIS / LOADING");
    Flush();
}

void main() {
    int file, bytes, region;
    Status(0);
    bytes = 0;
    file = FileOpen("PETRIS.GGR", 3);
    if (file >= 0) {
        bytes = FileReadInt(file, &rom[0], 8193);
        if (FileClose(file) < 0) bytes = 0;
    }
    region = Rom(32767);
    if (swWidth < 160 || swHeight < 144 || bytes != 32768 ||
        Rom(32752) != 84 || Rom(32753) != 77 || Rom(32754) != 82 || Rom(32755) != 32 ||
        Rom(32756) != 83 || Rom(32757) != 69 || Rom(32758) != 71 || Rom(32759) != 65 ||
        region != 122) {
        Status(1);
        return;
    }
    ox = (swWidth - 160) / 2;
    oy = (swHeight - 144) / 2;
    ResetVideo();
    CheckPetrisTile();
    CheckPetrisClear();
    CheckPetrisUpload();
    videoDirty = 1;
    if (!GgInitImage()) { Status(1); return; }
    ready = 1;
    SetTimer(20, 1);
}

void EVENT_TIMEOUT() {
    int i, held, cycles, frameStart, rows;
    if (!ready) return;
    held = GetKeyState();
    // Preserve short taps across callbacks until the cartridge polls that port.
    pad = pending;
    if (held & (1 << 10)) pad |= 32;
    for (i = 16; i <= 21; i++) if (held & (1 << i)) pad |= Key(i);
    frameStart = vdpFrame;
    for (stepsLeft = 320; stepsLeft > 0 && !failed && frameStart == vdpFrame; stepsLeft--) {
        if (iff1 && !eiDelay && VideoInterrupt()) cycles = Z80Interrupt();
        else if (halted) {
            cycles = 262 - vdpLine;
            if (iff1 && (vdpRegs[0] & 16) && vdpLine < 192) {
                if (vdpHintCounter < 192 - vdpLine) cycles = vdpHintCounter + 1;
            }
            if (iff1 && (vdpRegs[1] & 32) && vdpLine < 193 && cycles > 193 - vdpLine)
                cycles = 193 - vdpLine;
            cycles = (cycles * 228 + 3 - vdpClock) >> 2;
            refresh = (refresh & 128) | ((refresh + cycles) & 127);
            cycles <<= 2;
        } else {
            cycles = FoldPetrisRemainder();
            if (!cycles) cycles = FoldPetrisTile();
            if (!cycles) cycles = FoldPetrisClear();
            if (!cycles) cycles = FoldPetrisUpload();
            if (!cycles) cycles = Z80Step();
        }
        if (eiDelay) eiDelay--;
        AdvanceVideo(cycles);
    }
    if (failed) {
        ResetTimer();
        Status(1);
        return;
    }
    rows = 12;
    if (stepsLeft > 160) rows = 24;
    if (stepsLeft > 240 && ggImageSpriteCount <= 8) rows = 36;
    GgPaintImage(rows);
}

void EVENT_KEYPRESS() {
    pending |= Key(swData);
}
