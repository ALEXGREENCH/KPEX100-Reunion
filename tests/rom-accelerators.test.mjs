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
const registers = [...Array.from({ length: 16 }, (_, i) => 'r' + i), 'cpsr', 'spsr'];

async function machine(accelerated, enabled = () => true) {
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
      onSkippedInstructions: (count) => {
        result.instructions += count;
      },
    });
  return result;
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
  if (guarded) cpu.runGuarded(ENTRY, STOP, budget);
  else cpu.run(ENTRY, STOP, 5_000_000);
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
