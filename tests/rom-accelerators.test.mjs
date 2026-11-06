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

async function machine(accelerated, enabled = () => true, minRectanglePixels = 0) {
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
      onSkippedInstructions: (count) => {
        result.instructions += count;
      },
    });
  return result;
}

function callHelper(cpu, entry, guarded, budget) {
  // Enter as a real ARM call, not a direct emu_start at the helper itself.
  // BL helper; LDR pc,[pc,#-4]; STOP literal.
  const code = new Uint8Array(12),
    view = new DataView(code.buffer);
  view.setUint32(0, 0xeb000000 | (((entry - CALLER - 8) >> 2) & 0xffffff), true);
  view.setUint32(4, 0xe51ff004, true);
  view.setUint32(8, STOP, true);
  cpu.write(CALLER, code);
  if (guarded) cpu.runGuarded(CALLER, STOP, budget);
  else cpu.run(CALLER, STOP, 5_000_000);
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
  },
  budget = null,
) {
  const { cpu } = machine;
  const start = buffer + alignment,
    span = stride * Math.max(height, y2 + 1) * 2 + 16;
  cpu.write(buffer - 8, new Uint8Array(span + 8).fill(0xa7));
  cpu.write32(0x20b41260, start);
  cpu.write32(0x20b4126c, (stride << 16) | 1);
  cpu.write32(0x20b41270, stride * height * 2);
  for (let i = 0; i < 15; i++) cpu.regWrite('r' + i, 0x10100000 + i * 0x101);
  cpu.regWrite('cpsr', flags);
  cpu.regWrite('sp', 0x23fe0000);
  cpu.regWrite('lr', STOP);
  for (const [i, value] of [x1, y1, x2, y2].entries()) cpu.regWrite('r' + i, value);
  cpu.write32(0x23fe0000, color);
  cpu.write32(0x23fe0004, 0); // opaque mode; original prologue selects the verified kernel
  machine.instructions = 0;
  callHelper(cpu, 0x2004f998, budget !== null, budget);
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
