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

test('bulk copies, mapped views and register batches resolve the current heap after WASM growth', async () => {
  const cpu = await createARM({ isolated: true });
  let allocation = 0;
  try {
    const pointer = cpu.mapAlias([0x1000], 0x1000);
    cpu.write(0x1000, Uint8Array.of(1, 127, 128, 255));
    const before = cpu.read(0x1000, 4);
    const view = cpu.uc.viewArrayFromMemory(pointer, 4);
    assert.deepEqual(view, before);
    const registers = cpu.createRegisterBatch(['r0', 'r2', 'sp']);
    assert.throws(() => cpu.createRegisterBatch(['q0']), /Unknown 32-bit ARM register/);
    assert.throws(() => registers.write(1), /Wrong number of ARM register values/);
    registers.write(0xff000001, 0x8d000002, 0x1000);
    assert.equal(cpu.regRead('r2'), 0x8d000002);
    const initialRegisters = registers.read();
    assert.deepEqual(initialRegisters, Uint32Array.of(0xff000001, 0x8d000002, 0x1000));
    allocation = cpu.uc._malloc(128 * 1024 * 1024);
    assert.ok(allocation);
    assert.equal(view.byteLength, 0, 'WASM growth detaches previously borrowed views');
    assert.equal(initialRegisters.byteLength, 0);
    assert.deepEqual(registers.read(), Uint32Array.of(0xff000001, 0x8d000002, 0x1000));
    cpu.regWrite('r0', 2);
    assert.deepEqual(registers.read(), Uint32Array.of(2, 0x8d000002, 0x1000));
    registers.write(9, 8, 0x2000);
    assert.equal(cpu.regRead('sp'), 0x2000);
    cpu.uc.writeArrayToMemory(Uint8Array.of(0, 255, 128, 1), allocation);
    assert.deepEqual(cpu.uc.readArrayFromMemory(allocation, 4), Uint8Array.of(0, 255, 128, 1));
    assert.deepEqual(cpu.read(0x1000, 4), before);
    cpu.uc.viewArrayFromMemory(pointer, 4)[1] = 42;
    assert.equal(cpu.read(0x1000, 4)[1], 42);
    assert.equal(before[1], 127);
    assert.throws(() => cpu.uc.viewArrayFromMemory(-1, 4), /WASM memory copy bounds/);
  } finally {
    if (allocation) cpu.uc._free(allocation);
    cpu.close();
  }
});
