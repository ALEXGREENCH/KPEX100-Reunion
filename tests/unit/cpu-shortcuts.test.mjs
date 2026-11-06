import test from 'node:test';
import assert from 'node:assert/strict';
import { createARM } from '../../web/engine/cpu.js';

test('block shortcuts apply only inside ARM calls, after the watchdog accepts the block', async () => {
  const cpu = await createARM({ isolated: true });
  try {
    cpu.map(0x1000, 0x1000);
    cpu.write(0x1000, Uint8Array.of(0x3e, 0, 0, 0xeb, 0xfd, 1, 0, 0xea)); // BL 0x1100; B 0x1800
    cpu.write(0x1100, Uint8Array.of(5, 0, 0xa0, 0xe3, 0x1e, 0xff, 0x2f, 0xe1)); // MOV r0,5; BX lr
    let calls = 0;
    const remove = cpu.addBlockShortcut(0x1100, () => {
      calls++;
      cpu.regWrite('r0', 7);
      cpu.regWrite('pc', 0x1800);
    });
    assert.throws(() => cpu.addBlockShortcut(0x1100, () => {}), /already registered/);
    assert.throws(() => cpu.addBlockShortcut(1.5, () => {}), /Invalid block/);
    cpu.regWrite('r0', 0);
    cpu.regWrite('lr', 0x1800);
    cpu.runGuarded(0x1100, 0x1800, 100);
    assert.equal(cpu.regRead('r0'), 5);
    assert.equal(calls, 0);
    cpu.regWrite('r0', 0);
    cpu.runGuarded(0x1000, 0x1800, 2);
    assert.equal(cpu.regRead('r0'), 0);
    assert.equal(calls, 0);
    cpu.runGuarded(0x1000, 0x1800, 100);
    assert.equal(cpu.regRead('r0'), 7);
    assert.equal(calls, 1);
    // Native addresses above signed INT32 still identify a direct start.
    cpu.map(0xf0000000, 0x1000);
    cpu.write(0xf0000000, Uint8Array.of(5, 0, 0xa0, 0xe3, 0x1e, 0xff, 0x2f, 0xe1));
    cpu.addBlockShortcut(0xf0000000, () => {
      throw Error('Unexpected direct-start shortcut');
    });
    cpu.regWrite('lr', 0xf0000800);
    cpu.runGuarded(0xf0000000, 0xf0000800, 100);
    assert.equal(cpu.regRead('r0'), 5);
    remove();
    cpu.runGuarded(0x1000, 0x1800, 100);
    assert.equal(cpu.regRead('r0'), 5);
    assert.equal(calls, 1);
  } finally {
    cpu.close();
  }
});
