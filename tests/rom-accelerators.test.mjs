import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createARM } from '../web/engine/cpu.js';
import { installRomAccelerators } from '../web/engine/rom-accelerators.js';

const rom = fs.readFileSync(new URL('../web/data/firmware/Kingston-2.12.rom', import.meta.url));
const romHash = createHash('sha256').update(rom).digest('hex');
const ENTRY = 0x2005067c;
const STOP = 0x23fff000;
const BUFFER = 0x23010000;
const CALLER = 0x200ff000;
const registers = [...Array.from({ length: 16 }, (_, i) => 'r' + i), 'cpsr', 'spsr'];

async function machine(
  accelerated,
  enabled = () => true,
  minRectanglePixels = 0,
  minPaletteRowPixels = 32,
) {
  const cpu = await createARM();
  cpu.map(0x20000000, 0x4000000);
  cpu.write(0x20010000, rom.subarray(0x724));
  const result = { cpu, instructions: 0 };
  cpu.setBlockObserver((address, size) => {
    result.instructions += Math.ceil(size / 4);
  });
  if (accelerated)
    result.accelerator = installRomAccelerators(cpu, {
      romHash,
      enabled,
      minRectanglePixels,
      minPaletteRowPixels,
      onSkippedInstructions: (count) => {
        result.instructions += count;
      },
    });
  return result;
}

function callHelper(cpu, entry, guarded, budget, stop = STOP) {
  // Enter as a real ARM call, not a direct emu_start at the helper itself.
  // BL helper; LDR pc,[pc,#-4]; STOP literal.
  const code = new Uint8Array(12),
    view = new DataView(code.buffer);
  view.setUint32(0, 0xeb000000 | (((entry - CALLER - 8) >> 2) & 0xffffff), true);
  view.setUint32(4, 0xe51ff004, true);
  view.setUint32(8, STOP, true);
  cpu.write(CALLER, code);
  if (guarded) cpu.runGuarded(CALLER, stop, budget);
  else cpu.run(CALLER, stop, 5_000_000);
}

function execute(
  machine,
  { length, color, alignment = 0, buffer = BUFFER, flags = 0xf8000013 },
  guarded = false,
  budget = 10_000_000,
) {
  const { cpu } = machine;
  const start = buffer + alignment;
  const observed = Math.max(length + 16, 32);
  cpu.write(buffer - 8, new Uint8Array(observed).fill(0xa7));
  cpu.regWrite('cpsr', flags);
  for (let i = 0; i < 15; i++) cpu.regWrite('r' + i, (0x10010000 + i * 0x10101) >>> 0);
  cpu.regWrite('sp', 0x23fe0000);
  cpu.regWrite('lr', STOP);
  cpu.regWrite('r0', color);
  cpu.write32(0x20b41260, start);
  cpu.write32(0x20b41270, length);
  machine.instructions = 0;
  callHelper(cpu, ENTRY, guarded, budget);
  return {
    registers: Object.fromEntries(registers.map((reg) => [reg, cpu.regRead(reg)])),
    bytes: cpu.read(buffer - 8, observed),
    instructions: machine.instructions,
  };
}

test('RGB565 shortcut matches original ARM registers, CPSR, bytes and virtual clock', async () => {
  const native = await machine(false);
  const fast = await machine(true);
  try {
    const cases = [
      { length: 0, color: 0xffff1234 },
      { length: 1, color: 0x12345678 },
      { length: 2, color: 0x8000 },
      { length: 7, color: 0xffff1234, alignment: 2 },
      { length: 256, color: 0xabcdef01, flags: 0x18000013 },
      { length: 220 * 176 * 2, color: 0, flags: 0x98000013 },
      { length: 176 * 220 * 2 + 1, color: 0xf81f, alignment: 2, flags: 0x28000013 },
    ];
    for (const input of cases) {
      assert.deepEqual(execute(fast, input), execute(native, input), JSON.stringify(input));
      assert.deepEqual(
        execute(fast, input, true),
        execute(native, input, true),
        'guarded ' + JSON.stringify(input),
      );
    }
    assert.equal(fast.accelerator.stats.fills, cases.length * 2);
  } finally {
    native.cpu.close();
    fast.cpu.close();
  }
});

test('unaligned or unusual buffers and disabled events retain original execution', async () => {
  const native = await machine(false);
  let enabled = true;
  const fast = await machine(true, () => enabled);
  try {
    for (const input of [
      { length: 9, color: 0x1234, alignment: 1 },
      { length: 100, color: 0xabcdef01, buffer: 0x22010000 },
      { length: 524290, color: 0x9988 },
    ])
      assert.deepEqual(execute(fast, input), execute(native, input));
    assert.equal(fast.accelerator.stats.fills, 0);
    assert.equal(fast.accelerator.stats.fallbacks, 3);
    enabled = false;
    const input = { length: 220 * 176 * 2, color: 0x001f };
    assert.deepEqual(execute(fast, input), execute(native, input));
    assert.equal(fast.accelerator.stats.fills, 0);
  } finally {
    native.cpu.close();
    fast.cpu.close();
  }
});

test('ROM shortcut rejects a different hash or changed mapped instructions', async () => {
  const { cpu } = await machine(false);
  try {
    assert.throws(
      () => installRomAccelerators(cpu, { romHash: '0'.repeat(64) }),
      /verified Kingston/,
    );
    cpu.write32(ENTRY, 0xe1a00000);
    assert.throws(() => installRomAccelerators(cpu, { romHash }), /does not match/);
    cpu.write32(ENTRY, 0xe59f122c);
    cpu.write32(0x2004f9c4, 0xe1a00000);
    assert.throws(
      () => installRomAccelerators(cpu, { romHash }),
      /rectangle kernel does not match/,
    );
  } finally {
    cpu.close();
  }
});

test('insufficient block budget falls back at the same original ARM boundary', async () => {
  const native = await machine(false);
  const fast = await machine(true);
  try {
    const input = { length: 220 * 176 * 2, color: 0x07e0 };
    for (const budget of [1, 18, 19, 50, 1001]) {
      assert.deepEqual(
        execute(fast, input, true, budget),
        execute(native, input, true, budget),
        'budget=' + budget,
      );
    }
    assert.equal(fast.accelerator.stats.fills, 0);
  } finally {
    native.cpu.close();
    fast.cpu.close();
  }
});

test('RGB565 color search preserves native results, registers, stack and clock', async () => {
  const native = await machine(false);
  const fast = await machine(true);
  const stack = 0x23fe0000;
  function executeColor(machine, rgb, entries) {
    const { cpu } = machine;
    const palette = new Uint8Array(280);
    const view = new DataView(palette.buffer);
    for (const [index, value] of entries) view.setUint16(index * 2, value, true);
    cpu.write(BUFFER, palette);
    cpu.write32(0x20b41bc4, BUFFER);
    cpu.write(stack - 128, new Uint8Array(128).fill(0xa7));
    cpu.regWrite('cpsr', 0x98000013);
    for (let i = 0; i < 15; i++) cpu.regWrite('r' + i, (0x10010000 + i * 0x10101) >>> 0);
    cpu.regWrite('sp', stack);
    rgb.forEach((value, index) => cpu.regWrite('r' + index, value));
    machine.instructions = 0;
    callHelper(cpu, 0x20055af0, true, 100_000);
    return {
      registers: registers.map((reg) => cpu.regRead(reg)),
      color: cpu.read(0x20b41bc8, 4),
      stack: cpu.read(stack - 128, 128),
      instructions: machine.instructions,
    };
  }
  try {
    const colors = [
      [[0, 0, 0], []],
      [[135, 67, 248], [[16, 0x821f]]],
      [
        [135, 67, 248],
        [
          [55, 0x821f],
          [139, 0x821f],
        ],
      ],
      [
        [11, 252, 255],
        [
          [16, 0x07ff],
          [17, 0x07ff],
          [139, 0xffff],
        ],
      ],
      [
        [255, 3, 203],
        [
          [0, 0x1234],
          [138, 0xc11a],
          [139, 0xf819],
        ],
      ],
    ];
    for (const [rgb, entries] of colors)
      assert.deepEqual(executeColor(fast, rgb, entries), executeColor(native, rgb, entries));
    assert.equal(fast.accelerator.stats.colorSearches, 3);
  } finally {
    native.cpu.close();
    fast.cpu.close();
  }
});

function rectangle(
  machine,
  {
    x1 = 3,
    y1 = 2,
    x2 = 123,
    y2 = 70,
    stride = 220,
    height = 176,
    color = 0xabcd1234,
    alignment = 0,
    buffer = BUFFER,
    flags = 0xf8000013,
    mode = 0,
    stop = STOP,
    entry = 0x2004f998,
    rgb = [0xf0, 0x28, 0x12],
  },
  budget = null,
) {
  const { cpu } = machine;
  const start = buffer + alignment,
    span = stride * Math.max(height, y2 + 1) * 2 + 16;
  const background = new Uint8Array(span + 8).fill(0xa7);
  if (mode !== 0) {
    for (let i = 0; i < background.length; i++) background[i] = (i * 29 + (i >>> 9) * 71) & 255;
    const blendMasks = 0x100000 + (0x21f4ed90 - 0x21c00000);
    cpu.write(0x21f4ed90, rom.subarray(blendMasks, blendMasks + 32));
  }
  cpu.write(buffer - 8, background);
  cpu.write32(0x20b41260, start);
  cpu.write32(0x20b4126c, (stride << 16) | 1);
  cpu.write32(0x20b41270, stride * height * 2);
  cpu.write32(0x20b41274, stride);
  for (let i = 0; i < 15; i++) cpu.regWrite('r' + i, 0x10100000 + i * 0x101);
  cpu.regWrite('cpsr', flags);
  cpu.regWrite('sp', 0x23fe0000);
  cpu.regWrite('lr', STOP);
  for (const [i, value] of [x1, y1, x2, y2].entries()) cpu.regWrite('r' + i, value);
  if (entry === 0x2005058c) {
    rgb.forEach((value, index) => cpu.write32(0x23fe0000 + index * 4, value));
  } else {
    cpu.write32(0x23fe0000, color);
    cpu.write32(0x23fe0004, mode);
  }
  machine.instructions = 0;
  callHelper(cpu, entry, budget !== null, budget, stop);
  return {
    registers: Object.fromEntries(registers.map((r) => [r, cpu.regRead(r)])),
    bytes: cpu.read(buffer - 8, span + 8),
    stack: cpu.read(0x23fe0000 - 36, 44),
    instructions: machine.instructions,
  };
}

test('opaque RGB565 rectangles preserve exact ARM registers, flags, stack, padding and clock', async () => {
  const native = await machine(false),
    fast = await machine(true);
  try {
    for (const input of [
      {},
      { x1: 0, y1: 0, x2: 0, y2: 0, stride: 1, height: 1 },
      { x1: 0, y1: 0, x2: 219, y2: 175, color: 0xffff },
      { x1: 17, y1: 14, x2: 17, y2: 150, color: 0x07e0 },
      { x1: 3, y1: 45, x2: 219, y2: 45, color: 0xf800, flags: 0x18000013 },
      { x1: 0, y1: 0, x2: 511, y2: 3, stride: 512, height: 4, color: 0x1f },
    ]) {
      assert.deepEqual(rectangle(fast, input), rectangle(native, input), JSON.stringify(input));
      assert.deepEqual(rectangle(fast, input, 10_000_000), rectangle(native, input, 10_000_000));
    }
    assert.equal(fast.accelerator.stats.rectangles, 12);
  } finally {
    native.cpu.close();
    fast.cpu.close();
  }
});

test('rectangle fallbacks retain original boundary for empty, unusual and budget-limited calls', async () => {
  const native = await machine(false),
    fast = await machine(true);
  try {
    for (const input of [
      { x1: 10, x2: 9 },
      { y1: 4, y2: 3 },
      { alignment: 1 },
      { buffer: 0x22010000 },
      { stride: 513, height: 2, x1: 0, y1: 0, x2: 512, y2: 1 },
    ])
      assert.deepEqual(rectangle(fast, input), rectangle(native, input));
    for (const budget of [1, 18, 40, 100, 1001, 10000])
      assert.deepEqual(
        rectangle(fast, {}, budget),
        rectangle(native, {}, budget),
        'budget=' + budget,
      );
    assert.equal(fast.accelerator.stats.rectangles, 0);
    const boundary = rectangle(native, {}).instructions * 2;
    for (let budget = boundary - 6; budget <= boundary + 6; budget++)
      assert.deepEqual(
        rectangle(fast, {}, budget),
        rectangle(native, {}, budget),
        'boundary=' + budget,
      );
  } finally {
    native.cpu.close();
    fast.cpu.close();
  }
});

test('blended RGB565 rectangles preserve pixels, ARM state and instruction budget boundaries', async () => {
  const native = await machine(false),
    fast = await machine(false);
  try {
    fast.accelerator = installRomAccelerators(fast.cpu, {
      romHash,
      minBlendRectanglePixels: 256,
      onSkippedInstructions: (count) => {
        fast.instructions += count;
      },
    });
    const cases = [
      { mode: 1 },
      { mode: 2, x1: 0, y1: 0, x2: 219, y2: 175, color: 0xffff },
      { mode: 3, x1: 29, y1: 6, x2: 41, y2: 66, color: 0x12345678, flags: 0x18000013 },
      { mode: 1, x1: 0, y1: 1, x2: 511, y2: 3, stride: 512, height: 4, color: 0x07e0 },
    ];
    for (const input of cases)
      assert.deepEqual(
        rectangle(fast, input, 10_000_000),
        rectangle(native, input, 10_000_000),
        JSON.stringify(input),
      );
    assert.equal(fast.accelerator.stats.blendedRectangles, cases.length);
    const before = fast.accelerator.stats.blendedRectangles;
    for (const input of [
      { mode: 4 },
      { mode: 1, x1: 0, y1: 0, x2: 219, y2: 0 },
      { mode: 1, x1: 5, x2: 12, y1: 3, y2: 7 },
      { mode: 1, x1: 1, x2: 13, y1: 0, y2: 20, buffer: 0x23fe0000 - 60 },
      { mode: 2, buffer: 0x22010000 },
      { mode: 3, stop: 0x2004fa20 },
    ])
      assert.deepEqual(
        rectangle(fast, input, 10_000_000),
        rectangle(native, input, 10_000_000),
        JSON.stringify(input),
      );
    assert.deepEqual(rectangle(fast, cases[0]), rectangle(native, cases[0]));
    assert.equal(fast.accelerator.stats.blendedRectangles, before);
    const shape = { mode: 2, x1: 2, x2: 41, y1: 2, y2: 10, color: 0xf81f };
    const full = rectangle(native, shape, 1_000_000).instructions * 2;
    for (const budget of [
      1,
      16,
      38,
      100,
      1000,
      full - 12,
      full - 4,
      full - 2,
      full,
      full + 2,
      full + 12,
      full + 256,
    ])
      assert.deepEqual(
        rectangle(fast, shape, budget),
        rectangle(native, shape, budget),
        'budget ' + budget,
      );
    assert.equal(fast.accelerator.stats.blendedRectangles, before + 1);
  } finally {
    native.cpu.close();
    fast.cpu.close();
  }
});

test('solid RGB rectangle kernels keep native pixels, registers, stack and exact watchdog edges', async () => {
  const native = await machine(false),
    fast = await machine(false);
  try {
    fast.accelerator = installRomAccelerators(fast.cpu, {
      romHash,
      minSolidRectanglePixels: 256,
      onSkippedInstructions: (count) => {
        fast.instructions += count;
      },
    });
    const rgb = 0x2005058c,
      packed = 0x200505f4;
    assert.deepEqual(
      rectangle(fast, { entry: rgb }, 10_000_000),
      rectangle(native, { entry: rgb }, 10_000_000),
    );
    assert.equal(fast.accelerator.stats.solidRectangles, 0);
    fast.accelerator.enableSolidRectangles();
    fast.accelerator.enableSolidRectangles();
    const cases = [
      { entry: rgb },
      { entry: packed, x1: 0, y1: 0, x2: 219, y2: 175, color: 0xffff },
      {
        entry: rgb,
        x1: 29,
        y1: 6,
        x2: 41,
        y2: 66,
        rgb: [0x12345678, 0xa4, 0xff12],
        flags: 0x18000013,
      },
      { entry: packed, x1: 0, y1: 1, x2: 511, y2: 3, stride: 512, height: 4, color: 0x07e0 },
    ];
    for (const input of cases)
      assert.deepEqual(
        rectangle(fast, input, 10_000_000),
        rectangle(native, input, 10_000_000),
        JSON.stringify(input),
      );
    assert.equal(fast.accelerator.stats.solidRectangles, cases.length);
    const before = fast.accelerator.stats.solidRectangles;
    for (const input of [
      { entry: packed, x1: 0, y1: 0, x2: 219, y2: 0 },
      { entry: rgb, x1: 5, x2: 12, y1: 3, y2: 7 },
      { entry: rgb, x1: 9, x2: 5 },
      { entry: packed, x1: 1, x2: 13, y1: 0, y2: 20, buffer: 0x23fe0000 - 38 },
      { entry: rgb, buffer: 0x22010000 },
      { entry: packed, stop: 0x20050610 },
    ])
      assert.deepEqual(
        rectangle(fast, input, 10_000_000),
        rectangle(native, input, 10_000_000),
        JSON.stringify(input),
      );
    assert.deepEqual(rectangle(fast, cases[0]), rectangle(native, cases[0]));
    assert.equal(fast.accelerator.stats.solidRectangles, before);
    const shape = { entry: packed, x1: 2, x2: 41, y1: 2, y2: 10, color: 0xf81f };
    const full = rectangle(native, shape, 1_000_000).instructions * 2;
    for (const budget of [
      1,
      16,
      38,
      100,
      1000,
      full - 12,
      full - 4,
      full - 2,
      full,
      full + 2,
      full + 12,
      full + 256,
    ])
      assert.deepEqual(
        rectangle(fast, shape, budget),
        rectangle(native, shape, budget),
        'budget ' + budget,
      );
    assert.equal(fast.accelerator.stats.solidRectangles, before + 1);
  } finally {
    native.cpu.close();
    fast.cpu.close();
  }
});

test('production rectangle threshold leaves tiny fills native and batches large ones', async () => {
  const native = await machine(false),
    fast = await machine(true, () => true, 4096);
  try {
    const small = { x1: 0, y1: 0, x2: 2, y2: 2 };
    assert.deepEqual(rectangle(fast, small), rectangle(native, small));
    assert.equal(fast.accelerator.stats.rectangles, 0);
    assert.equal(fast.accelerator.stats.rectangleSmall, 1);
    assert.deepEqual(rectangle(fast, {}), rectangle(native, {}));
    assert.equal(fast.accelerator.stats.rectangles, 1);
  } finally {
    native.cpu.close();
    fast.cpu.close();
  }
});
const PALETTE_ROW = 0x2004e4c4;
const PALETTE_END = 0x2004e74c;
const PALETTE_STACK = 0x23fe0000;
const PALETTE_INPUT = 0x21010000;
const PALETTE_COLORS = 0x21020000;

function paletteRow(
  machine,
  {
    bits = 4,
    offset = 0,
    count = 64,
    transparent = 0x100,
    mode = 0,
    scale = 0,
    step = 1,
    fill = null,
    source = PALETTE_INPUT,
    palette = PALETTE_COLORS,
    destination = BUFFER + 2048,
    flags = 0xf8000013,
    height = 0,
    firstRow = 0,
    stride = 220,
    paddingBytes = 0,
    paddingBits = 0,
    stopInside = false,
    stopAt = null,
  } = {},
  budget = null,
) {
  const { cpu } = machine;
  cpu.write(BUFFER, new Uint8Array(65536).fill(0xa7));
  cpu.write(PALETTE_STACK, new Uint8Array(256).fill(0xc3));
  const input = Uint8Array.from(
    { length: 32768 },
    (_, i) => fill ?? ((i * 53 + 11) ^ (i * 7)) & 255,
  );
  cpu.write(source, input);
  cpu.write(
    palette,
    Uint8Array.from({ length: 512 }, (_, i) => (i * 71 + 13) & 255),
  );
  for (let i = 0; i < 15; i++) cpu.regWrite('r' + i, 0x10100000 + i * 0x101);
  cpu.regWrite('cpsr', flags);
  cpu.regWrite('sp', PALETTE_STACK);
  cpu.regWrite('r1', offset);
  cpu.regWrite('r2', source);
  cpu.regWrite('r3', scale);
  cpu.regWrite('r4', 1);
  cpu.regWrite('r5', palette);
  cpu.regWrite('r6', count);
  cpu.regWrite('r9', mode);
  for (const [offset, value] of [
    [0x0c, destination],
    [0x10, (1 << bits) - 1],
    [0x14, bits],
    [0x18, 8 - bits],
    [0x1c, transparent],
    [0x2c, step],
    [0x30, 0x21030000],
  ])
    cpu.write32(PALETTE_STACK + offset, value);
  // Only needed by unsupported doubled rows; a valid original image stride.
  cpu.write(0x2103025e, Uint8Array.of(stride & 255, (stride >>> 8) & 255));
  cpu.write(0x2103004e, Uint8Array.of(height & 255, (height >>> 8) & 255));
  if (height) {
    cpu.write32(PALETTE_STACK, firstRow);
    cpu.write32(PALETTE_STACK + 4, paddingBits);
    cpu.write32(PALETTE_STACK + 8, paddingBytes);
    // The original epilogue restores eight callee-saved registers and PC.
    for (let i = 0; i < 9; i++)
      cpu.write32(PALETTE_STACK + 0x34 + i * 4, i === 8 ? STOP : 0x10203040 + i * 0x101);
  }
  const code = new Uint8Array(4);
  new DataView(code.buffer).setUint32(
    0,
    0xeb000000 | (((PALETTE_ROW - CALLER - 8) >> 2) & 0xffffff),
    true,
  );
  cpu.write(CALLER, code);
  machine.instructions = 0;
  const end = stopAt ?? (height ? (stopInside ? 0x2004e7b4 : STOP) : PALETTE_END);
  if (budget === null) cpu.run(CALLER, end, 5_000_000);
  else cpu.runGuarded(CALLER, end, budget);
  return {
    registers: Object.fromEntries(registers.map((r) => [r, cpu.regRead(r)])),
    destination: cpu.read(BUFFER, 65536),
    source: cpu.read(source, 32768),
    palette: cpu.read(palette, 512),
    stack: cpu.read(PALETTE_STACK, 256),
    instructions: machine.instructions,
  };
}

test('packed palette rows preserve native ARM pixels, all registers, flags, stack and clock', async () => {
  const native = await machine(false),
    fast = await machine(true, () => true, 0, 0);
  try {
    const cases = [];
    for (const bits of [1, 2, 4, 8])
      for (let offset = 0; offset < 8; offset += bits)
        for (const transparent of [0, (1 << bits) - 1, 0xffffffff])
          cases.push({ bits, offset, transparent, count: offset % 3 === 0 ? 220 : 33 });
    cases.push({ bits: 1, fill: 0, transparent: 0, count: 512 });
    cases.push({ bits: 8, fill: 255, transparent: 255, count: 32, flags: 0x18000013 });
    cases.push({ bits: 8, count: 511, transparent: 0xffffffff, flags: 0x98000013 });
    cases.push({ count: 0 });
    for (const input of cases) {
      assert.deepEqual(paletteRow(fast, input), paletteRow(native, input), JSON.stringify(input));
      assert.deepEqual(
        paletteRow(fast, input, 1_000_000),
        paletteRow(native, input, 1_000_000),
        'guarded ' + JSON.stringify(input),
      );
    }
    assert.equal(fast.accelerator.stats.paletteRows, (cases.length - 1) * 2);
  } finally {
    native.cpu.close();
    fast.cpu.close();
  }
});

test('palette row guards retain original behavior for small, overlapping and nonstandard draws', async () => {
  const native = await machine(false),
    fast = await machine(true);
  try {
    for (const input of [
      { count: 0 },
      { count: 1 },
      { count: 31 },
      { mode: 1 },
      { scale: 1 },
      { step: 0xffffffff },
      { source: BUFFER + 2048 },
      { palette: BUFFER + 2048 },
      { bits: 3 },
      { offset: 1 },
    ])
      assert.deepEqual(paletteRow(fast, input), paletteRow(native, input), JSON.stringify(input));
    assert.equal(fast.accelerator.stats.paletteRows, 0);
    for (const budget of [1, 10, 30, 100, 1000, 2000])
      assert.deepEqual(
        paletteRow(fast, {}, budget),
        paletteRow(native, {}, budget),
        'budget ' + budget,
      );
    assert.equal(fast.accelerator.stats.paletteRows, 0);
  } finally {
    native.cpu.close();
    fast.cpu.close();
  }
});

test('modified palette row instructions are rejected before installing shortcuts', async () => {
  const { cpu } = await machine(false);
  try {
    cpu.write32(PALETTE_ROW, 0xe1a00000);
    assert.throws(
      () => installRomAccelerators(cpu, { romHash }),
      /palette row kernel does not match/,
    );
  } finally {
    cpu.close();
  }
});

test('multiple native image rows preserve padding, clipping offsets, stack, registers and virtual clock', async () => {
  const native = await machine(false),
    fast = await machine(true);
  try {
    const cases = [
      { bits: 1, offset: 3, count: 39, height: 7, paddingBits: 2, paddingBytes: 3 },
      { bits: 2, offset: 6, count: 33, height: 9, firstRow: 2, paddingBits: 2, paddingBytes: 5 },
      { bits: 4, offset: 4, count: 220, height: 32, stride: 240, paddingBits: 4 },
      { bits: 8, count: 512, height: 4, stride: 512, transparent: 0xffffffff },
      { bits: 8, count: 32, height: 512, stride: 32, transparent: 1 },
      { bits: 4, count: 64, height: 4, fill: 0, transparent: 0 },
      { bits: 8, count: 64, height: 4, fill: 255, transparent: 255, flags: 0x18000013 },
    ];
    for (const input of cases) {
      assert.deepEqual(paletteRow(fast, input), paletteRow(native, input), JSON.stringify(input));
      assert.deepEqual(
        paletteRow(fast, input, 10_000_000),
        paletteRow(native, input, 10_000_000),
        'guarded ' + JSON.stringify(input),
      );
    }
    assert.equal(fast.accelerator.stats.paletteBatches, cases.length * 2);
    for (const budget of [1, 100, 1000, 5000, 10000])
      assert.deepEqual(
        paletteRow(fast, { height: 8, paddingBytes: 2 }, budget),
        paletteRow(native, { height: 8, paddingBytes: 2 }, budget),
        'budget ' + budget,
      );
    for (const input of [
      { height: 4, stopInside: true, paddingBytes: 3 },
      { height: 4, stopAt: 0x2004e4e0 },
      { height: 4, paddingBits: 1 }, // Native packed-row reset differs from a linear bit stream.
      { height: 4, stride: 32 }, // Overlapping output rows remain row-by-row.
      { height: 4, paddingBytes: -1 },
    ])
      assert.deepEqual(
        paletteRow(fast, input),
        paletteRow(native, input),
        'fallback ' + JSON.stringify(input),
      );
  } finally {
    native.cpu.close();
    fast.cpu.close();
  }
});

test('production palette threshold leaves short rows native and batches wide images', async () => {
  const native = await machine(false),
    fast = await machine(false);
  try {
    fast.accelerator = installRomAccelerators(fast.cpu, {
      romHash,
      onSkippedInstructions: (count) => {
        fast.instructions += count;
      },
    });
    assert.deepEqual(
      paletteRow(fast, { count: 64, height: 4 }),
      paletteRow(native, { count: 64, height: 4 }),
    );
    assert.equal(fast.accelerator.stats.paletteRows, 0);
    assert.deepEqual(
      paletteRow(fast, { count: 128, height: 4 }),
      paletteRow(native, { count: 128, height: 4 }),
    );
    assert.equal(fast.accelerator.stats.paletteRows, 4);
    assert.equal(fast.accelerator.stats.paletteBatches, 1);
  } finally {
    native.cpu.close();
    fast.cpu.close();
  }
});

test('production palette batching accelerates tall narrow images at the exact pixel threshold', async () => {
  const native = await machine(false),
    fast = await machine(false);
  try {
    fast.accelerator = installRomAccelerators(fast.cpu, {
      romHash,
      onSkippedInstructions: (count) => {
        fast.instructions += count;
      },
    });
    for (const input of [
      { count: 31, height: 256, stride: 32 },
      { count: 32, height: 127, stride: 32 },
      { count: 127, height: 33, firstRow: 1, stride: 128 },
      { count: 32, height: 128, stride: 31 },
      { count: 32, height: 128, stride: 32, stopInside: true },
      { count: 32, height: 128, stride: 32, mode: 1 },
    ])
      assert.deepEqual(paletteRow(fast, input), paletteRow(native, input), JSON.stringify(input));
    assert.equal(fast.accelerator.stats.paletteRows, 0);
    for (const input of [
      { count: 32, height: 128, stride: 32 },
      { count: 64, height: 65, firstRow: 1, stride: 64, bits: 1, offset: 3, paddingBits: 5 },
      { count: 127, height: 33, stride: 128, bits: 8, transparent: 0xffffffff },
      { count: 64, height: 64, stride: 64, fill: 0, transparent: 0 },
    ]) {
      const before = fast.accelerator.stats.paletteBatches;
      assert.deepEqual(paletteRow(fast, input), paletteRow(native, input), JSON.stringify(input));
      assert.deepEqual(
        paletteRow(fast, input, 10_000_000),
        paletteRow(native, input, 10_000_000),
        'guarded ' + JSON.stringify(input),
      );
      assert.equal(fast.accelerator.stats.paletteBatches, before + 2);
    }
    for (const budget of [1, 1000, 10000])
      assert.deepEqual(
        paletteRow(fast, { count: 32, height: 128, stride: 32 }, budget),
        paletteRow(native, { count: 32, height: 128, stride: 32 }, budget),
        'budget ' + budget,
      );
  } finally {
    native.cpu.close();
    fast.cpu.close();
  }
});

const COPY_ENTRY = 0x200967fc;
const COPY_SRC = 0x22003000;
const COPY_DST = 0x23010000;
const COPY_SP = 0x23fe0000;

function copyAligned(
  machine,
  {
    length = 4096,
    src = COPY_SRC,
    dst = COPY_DST,
    sp = COPY_SP,
    flags = 0xd8000013,
    budget = 10_000_000,
    counted = false,
  } = {},
) {
  const { cpu } = machine;
  const observed = Math.max(length + 16, 32);
  const stack = new Uint8Array(32).fill(0x4d);
  const input = Uint8Array.from({ length: observed }, (_, i) => (i * 17 + 97) & 255);
  cpu.write(dst - 8, new Uint8Array(observed).fill(0xa7));
  cpu.write(src - 8, input);
  cpu.write(sp - 16, stack);
  cpu.regWrite('cpsr', flags);
  for (let i = 0; i < 15; i++) cpu.regWrite('r' + i, (0x10010000 + i * 0x10101) >>> 0);
  cpu.regWrite('r0', dst);
  cpu.regWrite('r1', src);
  cpu.regWrite('r2', length);
  cpu.regWrite('sp', sp);
  cpu.regWrite('lr', STOP);
  machine.instructions = 0;
  let error = null;
  try {
    callHelper(cpu, COPY_ENTRY, !counted, budget);
  } catch (e) {
    error = e.message;
  }
  return {
    error,
    registers: Object.fromEntries(registers.map((reg) => [reg, cpu.regRead(reg)])),
    dest: cpu.read(dst - 8, observed),
    src: cpu.read(src - 8, observed),
    stack: cpu.read(sp - 16, stack.length),
    instructions: machine.instructions,
  };
}

test('Guarded aligned bulk copies match exact bytes, ARM state and clock', async () => {
  const native = await machine(false),
    fast = await machine(true);
  try {
    for (const length of [4096, 4097, 4111, 4112, 4127, 4128, 77440, 155648]) {
      assert.deepEqual(
        copyAligned(fast, { length }),
        copyAligned(native, { length }),
        String(length),
      );
    }
    assert.equal(fast.accelerator.stats.bulkCopies, 8);
    const reference = copyAligned(native);
    assert.equal(reference.registers.r15, STOP);
    const boundary = reference.instructions * 2;
    for (const budget of [
      1,
      12,
      1000,
      ...Array.from({ length: 139 }, (_, i) => boundary - 68 + i),
    ]) {
      assert.deepEqual(
        copyAligned(fast, { budget }),
        copyAligned(native, { budget }),
        'budget ' + budget,
      );
    }
    assert.ok(fast.accelerator.stats.bulkCopies > 8);
  } finally {
    native.cpu.close();
    fast.cpu.close();
  }
});

test('Short, counted, unaligned and overlapping copies use the ARM routine', async () => {
  const native = await machine(false),
    fast = await machine(true);
  try {
    for (const options of [
      { length: 4095 },
      { counted: true },
      { src: COPY_SRC + 1 },
      { dst: COPY_DST + 3 },
      { src: COPY_DST - 1024 },
      { src: COPY_SP - 4096 },
      { dst: COPY_SP - 4096 },
    ]) {
      assert.deepEqual(
        copyAligned(fast, options),
        copyAligned(native, options),
        JSON.stringify(options),
      );
    }
    assert.equal(fast.accelerator.stats.bulkCopies, 0);
  } finally {
    native.cpu.close();
    fast.cpu.close();
  }
});

test('small transparent palette images resume the final native row without changing CPU state', async () => {
  const native = await machine(false),
    fast = await machine(false);
  try {
    fast.accelerator = installRomAccelerators(fast.cpu, {
      romHash,
      minPaletteContinuationPixels: 192,
      onSkippedInstructions: (count) => {
        fast.instructions += count;
      },
    });
    const shapes = [
      {
        bits: 1,
        offset: 3,
        count: 18,
        height: 13,
        paddingBytes: 3,
        paddingBits: 1,
        transparent: 0,
      },
      {
        bits: 2,
        offset: 6,
        count: 33,
        height: 9,
        firstRow: 2,
        paddingBits: 2,
        paddingBytes: 5,
        transparent: 3,
      },
      { bits: 4, offset: 4, count: 64, height: 4, paddingBits: 4, transparent: 15 },
      { bits: 8, count: 99, height: 4, stride: 101, transparent: 255 },
      { bits: 8, count: 64, height: 5, fill: 255, transparent: 255, flags: 0x18000013 },
    ];
    for (const shape of shapes) {
      const expected = paletteRow(native, shape, 1_000_000);
      assert.deepEqual(paletteRow(fast, shape, 1_000_000), expected, JSON.stringify(shape));
    }
    assert.equal(fast.accelerator.stats.paletteContinuations, shapes.length);
    const shape = shapes[2];
    const full = paletteRow(native, shape, 1_000_000).instructions * 2;
    const reserve = shape.height * (62 + 52 * shape.count) + 128 + 8;
    for (const budget of [
      1,
      6,
      10,
      14,
      100,
      full - 20,
      full - 4,
      full - 2,
      full,
      full + 2,
      reserve - 2,
      reserve,
      reserve + 2,
    ]) {
      assert.deepEqual(
        paletteRow(fast, shape, budget),
        paletteRow(native, shape, budget),
        'budget ' + budget,
      );
    }
    assert.equal(fast.accelerator.stats.paletteContinuations, shapes.length + 1);
    const before = fast.accelerator.stats.paletteContinuations;
    for (const shape of [
      { ...shapes[2], source: BUFFER + 2048 },
      { ...shapes[2], palette: BUFFER + 2048 },
      { ...shapes[2], count: 31 },
      { ...shapes[2], paddingBits: 1 },
      { ...shapes[2], stopAt: 0x2004e4e0 },
      { ...shapes[2], stride: 32 },
    ]) {
      assert.deepEqual(
        paletteRow(fast, shape, 1_000_000),
        paletteRow(native, shape, 1_000_000),
        JSON.stringify(shape),
      );
    }
    assert.deepEqual(paletteRow(fast, shapes[2]), paletteRow(native, shapes[2]));
    assert.equal(fast.accelerator.stats.paletteContinuations, before);
  } finally {
    native.cpu.close();
    fast.cpu.close();
  }
});
