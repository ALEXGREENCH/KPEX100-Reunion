import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { initCpu } from '../web/engine/cpu.js';
import { createDisk } from '../web/engine/disk.js';
import { FirmwareMachine } from '../web/engine/firmware.js';
import { loadInstructionMonitor } from '../web/engine/instruction-monitor.js';

const asset = (path) => readFileSync(new URL(`../web/data/${path}`, import.meta.url));
const rom = asset('firmware/Kingston-2.12.rom');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('WASM instruction monitor sends firmware boundaries and unusual instructions to the device hook', async () => {
  const module = await loadInstructionMonitor();
  assert.ok(module instanceof WebAssembly.Module);
  const memory = new WebAssembly.Memory({ initial: 1 });
  const seen = [];
  const monitor = new WebAssembly.Instance(module, {
    unicorn: { memory, slow: (address, size) => seen.push([address >>> 0, size]) },
  }).exports;
  monitor.rom.value = 0x1000;
  monitor.sdram.value = 0x2000;
  monitor.end.value = 1000n;
  const code = new DataView(memory.buffer);
  code.setUint32(0x1000, 0xe1a00000, true);
  code.setUint32(0x1004, 0xee110f10, true);
  code.setUint32(0x2000, 0xe1a00000, true);
  code.setUint32(0x2004, 0xee110f10, true);

  const execute = (address, { flags = 5, size = 4, count = 0n } = {}) => {
    monitor.flags.value = flags;
    monitor.counter.value = count;
    monitor.hook(0, BigInt(address), size, 0);
  };
  for (const address of [0x70000000, 0x20000000, 0x21000000]) {
    execute(address);
    assert.equal(monitor.counter.value, 1n);
  }
  execute(0x70000004, { size: 2 });
  assert.equal(monitor.counter.value, 1n);
  assert.deepEqual(seen, []);

  for (const [address, options] of [
    [0x70000000, { flags: 0 }],
    [0x70000000, { flags: 7 }],
    [0x70000000, { count: 255n }],
    [0x70000000, { count: 1000n }],
    [0x20000000, { flags: 1 }],
    [0x70000004, {}],
    [0x21000004, {}],
    [0x70000002, {}],
    [0xffff0000, {}],
    [0x200279b0, {}],
    [0x20072c64, {}],
  ]) {
    execute(address, options);
    assert.equal(monitor.counter.value, options.count ?? 0n);
    assert.deepEqual(seen.pop(), [address, 4]);
  }
});

function checkpoint(machine) {
  return {
    snapshot: machine.snapshot(),
    sdram: sha256(machine.readMemory(0x20000000, 0x100000)),
    lcd: sha256(machine.framebufferRGBA),
    mmio: machine.mmio,
    timers: machine.timer_counts,
    timerLast: machine.timer_last,
    pending: machine.pending,
    timerPending: machine.timer_pending,
    cp15: machine.cp15,
    deferred: machine._deferred_writes,
  };
}

test('native instruction filtering preserves Kingston boot and restored nominal-speed input', async () => {
  const diskImage = createDisk([], rom);
  const options = { diskImage, adoptDiskImage: true, traceInstructions: false };
  const reference = await FirmwareMachine.create(rom, {
    ...options,
    fastInstructionMonitor: false,
  });
  const fast = await FirmwareMachine.create(rom, options);
  try {
    assert.equal(reference._instructionMonitor, null);
    assert.ok(fast._instructionMonitor);
    for (const budget of [1, 254, 1, 1, 1_000_000, 10_000_000]) {
      reference.run(budget, { snapshot: false });
      fast.run(budget, { snapshot: false });
      assert.equal(fast._instructionMonitor.counter.value, BigInt(fast.instructions));
      assert.deepEqual(checkpoint(fast), checkpoint(reference));
    }
    const observe = (machine) => {
      const counts = [];
      const hook = machine.cpu.onCode(() => counts.push(machine.instructions));
      machine.run(4, { snapshot: false });
      machine.cpu.removeHook(hook);
      return counts;
    };
    const countBeforeTrace = fast._instructionMonitor.counter.value;
    assert.deepEqual(observe(fast), observe(reference));
    assert.equal(fast._instructionMonitor.counter.value, countBeforeTrace);

    const state = asset('states/Kingston-2.12-HellFire-gameplay.reunion-state');
    await reference.loadState(state);
    await fast.loadState(state);
    for (const [budget, pressed] of [
      [1_000_000, true],
      [2_000_000, true],
      [1_000_000, false],
    ]) {
      reference.key('right', pressed);
      fast.key('right', pressed);
      assert.equal(fast.runWithNominalClock(budget), reference.runWithNominalClock(budget));
      assert.equal(fast._instructionMonitor.counter.value, BigInt(fast.instructions));
      assert.deepEqual(checkpoint(fast), checkpoint(reference));
    }
    const monitorBeforeReset = fast._instructionMonitor;
    reference.reset();
    fast.reset();
    assert.ok(fast._instructionMonitor);
    assert.notEqual(fast._instructionMonitor, monitorBeforeReset);
    reference.run(257, { snapshot: false });
    fast.run(257, { snapshot: false });
    assert.equal(fast._instructionMonitor.counter.value, BigInt(fast.instructions));
    assert.deepEqual(checkpoint(fast), checkpoint(reference));
  } finally {
    reference.close();
    fast.close();
  }
});

test('other firmware and instruction tracing keep the original JavaScript hook', async () => {
  for (const [source, traceInstructions] of [
    [asset('firmware/Cenix-2.21.rom'), false],
    [rom, true],
  ]) {
    const machine = await FirmwareMachine.create(source, { traceInstructions });
    try {
      assert.equal(machine._instructionMonitor, null);
      machine.run(257, { snapshot: false });
      assert.equal(machine.instructions, 257);
      assert.equal(machine.trace.length, traceInstructions ? 257 : 0);
    } finally {
      machine.close();
    }
  }
});

test('optional monitor link and registration failures retain the original hook', async () => {
  const core = await initCpu();
  for (const overrides of [
    { reunionWasmMemory: () => null },
    { _uc_hook_add: () => core.ERR_ARG },
  ]) {
    const cpuModule = Object.assign(Object.create(core), overrides);
    const machine = await FirmwareMachine.create(rom, { cpuModule, traceInstructions: false });
    try {
      assert.equal(machine._instructionMonitor, null);
      machine.run(257, { snapshot: false });
      assert.equal(machine.instructions, 257);
      assert.equal(machine.status, 'paused');
    } finally {
      machine.close();
    }
  }
});
