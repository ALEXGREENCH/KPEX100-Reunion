int HasMaskLoop() {
    // Complete immutable mask loop at A8A2, then decsp4, oam_spr and popa.
    return rom[2604] == 0xd68d00a9 && rom[2605] == 0xb060c906 &&
        rom[2606] == 0xc1262031 && rom[2607] == 0x03a0f8a9 &&
        rom[2608] == 0xd5ad2091 && rom[2609] == 0x20918806 &&
        rom[2610] == 0x9188ffa9 && rom[2611] == 0x8800a920 &&
        rom[2612] == 0xd6ad2091 && rom[2613] == 0x82a52006 &&
        rom[2614] == 0x6d1808a9 && rom[2615] == 0xd58d06d5 &&
        rom[2616] == 0x1804a906 && rom[2617] == 0x4c06d66d &&
        rom[2618] == 0x25ada8a2 &&
        rom[4173] == 0x20a56021 && rom[4174] == 0x8504e938 &&
        rom[4175] == 0x60019020 && rom[4176] == 0xa56021c6 &&
        rom[173] == 0x0220aa60 && rom[174] == 0x02029dc2 &&
        rom[175] == 0x9dc20220 && rom[176] == 0x02200201 &&
        rom[177] == 0x02009dc2 && rom[178] == 0x9dc20220 &&
        rom[179] == 0x188a0203 && rom[180] == 0x85600469 &&
        rom[4228] == 0x00a06068 && rom[4229] == 0x20e620b1 &&
        rom[4230] == 0xe66001f0 && rom[4231] == 0xa0486021;
}

int WriteMaskSprites() {
    int offset, softStack;
    if (!maskLoop || a || ram[0x6d5] != 15) return 0;
    softStack = ram[0x20] | (ram[0x21] << 8);
    if (softStack < 0x704 || softStack > 0x800) return 0;
    for (offset = 0; offset < 96; offset += 4) {
        ram[0x200 + offset] = 15 + offset * 2;
        ram[0x201 + offset] = 255;
        ram[0x202 + offset] = 0;
        ram[0x203 + offset] = 248;
    }
    // The loop leaves the last oam_spr arguments and return words in RAM.
    ram[softStack - 4] = 0;
    ram[softStack - 3] = 255;
    ram[softStack - 2] = 199;
    ram[softStack - 1] = 248;
    ram[0x100 + sp] = 0xa8;
    ram[0x100 + ((sp - 1) & 255)] = 0xc7;
    ram[0x100 + ((sp - 2) & 255)] = 0x82;
    ram[0x100 + ((sp - 3) & 255)] = 0xba;
    ram[0x6d5] = 207;
    ram[0x6d6] = 96;
    a = 96;
    x = 92;
    y = 0;
    carry = 1;
    nz = 0;
    overflow = 0;
    pc = 0xa8da;
    return 1;
}

int ClearStartupVideo() {
    int i;
    // Zooming Secretary's cc65 startup fills the full PPU address space
    // with zero. CHR is read-only, so only the writable tables can change.
    if (a || x || ctrl || mask || painted || vramAddr != 8192 ||
        CpuRead(0x803b) != 0xa0 || CpuRead(0x803c) != 0x40 ||
        CpuRead(0x803d) != 0x8d || CpuRead(0x803e) != 0x07 ||
        CpuRead(0x803f) != 0x20 || CpuRead(0x8040) != 0xc8 ||
        CpuRead(0x8041) != 0xd0 || CpuRead(0x8042) != 0xfa ||
        CpuRead(0x8043) != 0xe8 || CpuRead(0x8044) != 0xd0 ||
        CpuRead(0x8045) != 0xf5) return 0;
    for (i = 0; i < 2048; i++) if (names[i]) {
        names[i] = 0;
        backgroundEpoch++;
    }
    for (i = 0; i < 32; i++) if (palettes[i]) {
        palettes[i] = 0;
        paletteEpoch++;
        backgroundEpoch++;
    }
    y = 0;
    nz = 0;
    pc = 0x8046;
    return 1;
}

int HasOfficeRoutines() {
    // Immutable neslib serial poll and oam_hide_rest routines.
    return rom[285] == 0x8c01a060 &&
        rom[286] == 0x8c884016 &&
        rom[287] == 0x08a04016 &&
        rom[288] == 0x294016ad &&
        rom[289] == 0x01f01801 &&
        rom[290] == 0x88187638 &&
        rom[291] == 0x60e8f2d0 &&
        rom[196] == 0xa9aa608a &&
        rom[197] == 0x02009df0 &&
        rom[198] == 0xe8e8e8e8 &&
        rom[199] == 0xa960f7d0;
}

void ReturnFromSubroutine() {
    int low;
    low = Pull();
    pc = ((low | (Pull() << 8)) + 1) & 65535;
}

int ReadPadReport() {
    int buffer, report;
    if (!officeIo) return 0;
    // Preserve the existing controller latch and consume one full report.
    buffer = (0x18 + x) & 255;
    CpuWrite(0x4016, 1);
    CpuWrite(0x4016, 0);
    report = shift;
    shift = 255;
    carry = ram[buffer] >> 7;
    ram[buffer] = report;
    a = report >> 7;
    x = (x + 1) & 255;
    y = 0;
    nz = x;
    ReturnFromSubroutine();
    return 1;
}

int WriteSprite() {
    int softStack;
    if (!maskLoop || (a & 3)) return 0;
    softStack = ram[0x20] | (ram[0x21] << 8);
    if (softStack < 0x700 || softStack > 0x7fc) return 0;
    x = a;
    ram[0x202 + x] = ram[softStack];
    ram[0x201 + x] = ram[softStack + 1];
    ram[0x200 + x] = ram[softStack + 2];
    ram[0x203 + x] = ram[softStack + 3];
    softStack += 4;
    ram[0x20] = softStack & 255;
    ram[0x21] = softStack >> 8;
    // The final popa call leaves its return address below the current SP.
    ram[0x100 + sp] = 0x82;
    ram[0x100 + ((sp - 1) & 255)] = 0xba;
    y = 0;
    carry = 0;
    Add(4);
    ReturnFromSubroutine();
    return 1;
}

int HideSpriteTail() {
    int offset;
    if (!officeIo || (a & 3)) return 0;
    for (offset = a; offset < 256; offset += 4) ram[0x200 + offset] = 240;
    a = 240;
    x = 0;
    nz = 0;
    ReturnFromSubroutine();
    return 1;
}
