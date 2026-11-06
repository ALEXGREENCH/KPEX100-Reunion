import test from 'node:test';
import assert from 'node:assert/strict';
import { createARM } from '../../web/engine/cpu.js';

test('bulk ARM reads preserve arbitrary byte alignment and never alias guest or transfer storage', async () => {
  const cpu = await createARM();
  try {
    cpu.map(0x100000, 0x20000);
    const bytes = Uint8Array.from({ length: 0x20000 }, (_, i) => (i * 37 + 11) & 255);
    cpu.write(0x100000, bytes);
    const bulk = cpu.uc.readArrayFromMemory;
    assert.equal(typeof bulk, 'function');
    for (const [offset, size] of [
      [0, 0],
      [1, 1],
      [2, 3],
      [3, 7],
      [0, 77440],
      [47, 120001],
    ]) {
      const fast = cpu.read(0x100000 + offset, size);
      assert.deepEqual(fast, bytes.slice(offset, offset + size));
      cpu.uc.readArrayFromMemory = undefined;
      try {
        assert.deepEqual(cpu.read(0x100000 + offset, size), fast);
      } finally {
        cpu.uc.readArrayFromMemory = bulk;
      }
    }
    const snapshot = cpu.read(0x100000, 77440);
    cpu.write(0x100000, new Uint8Array(77440));
    cpu.read(0x100000, 77440);
    assert.deepEqual(snapshot, bytes.slice(0, 77440));
    snapshot[0] ^= 255;
    assert.equal(cpu.read(0x100000, 1)[0], 0);
    assert.throws(() => cpu.read(0xdead0000, 10), /Unicorn/);
    for (const [p, n] of [
      [-1, 1],
      [1, -1],
      [1, 0.5],
      [Number.MAX_SAFE_INTEGER, 1],
    ])
      assert.throws(() => bulk(p, n), /WASM memory copy bounds/);
  } finally {
    cpu.close();
  }
});

test('bulk copies resolve the current heap after a large WASM allocation', async () => {
  const cpu = await createARM({ isolated: true });
  let allocation = 0;
  try {
    cpu.map(0x1000, 0x1000);
    cpu.write(0x1000, Uint8Array.of(1, 127, 128, 255));
    const before = cpu.read(0x1000, 4);
    allocation = cpu.uc._malloc(128 * 1024 * 1024);
    assert.ok(allocation);
    cpu.uc.writeArrayToMemory(Uint8Array.of(0, 255, 128, 1), allocation);
    assert.deepEqual(cpu.uc.readArrayFromMemory(allocation, 4), Uint8Array.of(0, 255, 128, 1));
    assert.deepEqual(cpu.read(0x1000, 4), before);
  } finally {
    if (allocation) cpu.uc._free(allocation);
    cpu.close();
  }
});
