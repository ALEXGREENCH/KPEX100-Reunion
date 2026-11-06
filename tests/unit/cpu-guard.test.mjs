import test from 'node:test';
import assert from 'node:assert/strict';
import { createARM } from '../../web/engine/cpu.js';

test('block watchdog stops endless ARM and Thumb code and permits later exact execution', async () => {
  const cpu = await createARM({ isolated: true });
  try {
    cpu.map(0x1000, 0x1000);
    // ARM: ADD r0,r0,#1; B back. Thumb: ADDS r0,#1; B back.
    cpu.write(0x1000, Uint8Array.of(1, 0, 128, 226, 253, 255, 255, 234));
    cpu.write(0x1100, Uint8Array.of(1, 48, 253, 231));
    let blocks = 0;
    cpu.setBlockObserver(() => blocks++);
    for (const [start, cpsr] of [
      [0x1000, 0x10],
      [0x1101, 0x30],
    ]) {
      cpu.regWrite('cpsr', cpsr);
      cpu.regWrite('r0', 0);
      const before = blocks;
      cpu.runGuarded(start, 0x1800, 20);
      assert.ok(cpu.regRead('r0') > 0 && cpu.regRead('r0') <= 20);
      assert.ok(blocks > before && blocks - before <= 20);
      assert.notEqual(cpu.regRead('pc'), 0x1800);
      assert.equal(cpu.blockBudget, null);
      assert.equal(cpu.runStop, undefined);
      assert.equal(cpu.runCounted, undefined);
    }
    cpu.regWrite('cpsr', 0x10);
    cpu.regWrite('r0', 0);
    cpu.run(0x1000, 0x1800, 1);
    assert.equal(cpu.regRead('r0'), 1);
    assert.equal(cpu.regRead('pc'), 0x1004);
    assert.throws(() => cpu.runGuarded(0x1000, 0x1800, 0), /budget/);
    assert.throws(() => cpu.runGuarded(0x1000, 0x1800, Infinity), /budget/);
  } finally {
    cpu.close();
  }
});

test('guard state is cleared after a guest exception', async () => {
  const cpu = await createARM({ isolated: true });
  try {
    cpu.map(0x1000, 0x1000);
    // LDR r0,[r1] with an unmapped r1, followed by a finite valid program.
    cpu.write(0x1000, Uint8Array.of(0, 0, 145, 229));
    cpu.regWrite('r1', 0x3000);
    assert.throws(() => cpu.runGuarded(0x1000, 0x1800, 100));
    assert.equal(cpu.blockBudget, null);
    assert.equal(cpu.runStop, undefined);
    assert.equal(cpu.runCounted, undefined);
    cpu.write(0x1100, Uint8Array.of(7, 0, 160, 227, 30, 255, 47, 225));
    cpu.regWrite('lr', 0x1800);
    cpu.runGuarded(0x1100, 0x1800, 100);
    assert.equal(cpu.regRead('pc'), 0x1800);
    assert.equal(cpu.regRead('r0'), 7);
  } finally {
    cpu.close();
  }
});
