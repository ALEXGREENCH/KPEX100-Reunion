import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createARM } from '../web/engine/cpu.js';
import { LegacyRuntime } from '../web/engine/legacy.js';

const rom = fs.readFileSync(new URL('../web/data/firmware/Kingston-2.12.rom', import.meta.url));
const reference = JSON.parse(
  fs.readFileSync(new URL('../validation/gvm-legacy-chat-native-reference.json', import.meta.url)),
).isolatedReference;
const BASE = 0x21000000,
  TOP = 0x20b3ed28,
  STACK = 0x20b4062c;

// Synthetic containers only: no historical SGS is rewritten for conformance tests.
function program(version, code) {
  const header = version === 1 ? 52 : 100;
  const a = header + code.length + (code.length % 2),
    b = a + 36,
    c = b + 18;
  const out = new Uint8Array(c),
    view = new DataView(out.buffer);
  out[0] = version;
  view.setUint32(1, 0xffffffff, true);
  out[5] = 1;
  view.setUint16(6, 1, true);
  view.setUint16(8, 1, true);
  out.set(new TextEncoder().encode('Chat ABI'), 10);
  view.setUint16(28, header, true);
  [a, b, c, c].forEach((n, i) => view.setUint16(44 + i * 2, n, true));
  out.set(code, header);
  for (let i = 0; i < 9; i++) out.set([0, 1, 0, 0], a + i * 4);
  return out;
}

for (const version of [1, 2]) {
  test(`SGS v${version} LockChatMode matches the independent x86 stack and byte-state vectors`, async () => {
    assert.equal(reference.vectors.length, 99);
    for (const top of [0, 3, 63]) {
      const sentinels = Array.from({ length: top }, (_, i) => 0x2100 + i);
      const code = [...sentinels.flatMap((n) => [6, n >>> 8, n & 255]), 6, 0, 0, 0xba, 0xff];
      const raw = program(version, code);
      const g = await LegacyRuntime.create(rom, raw, { width: 120, height: 100 });
      try {
        assert.equal(g.legacyChatLockValue, 1, 'standalone native default is S_ON');
        for (const vector of reference.vectors.filter((row) => row.topBefore === top)) {
          const input = vector.inputSigned16 & 65535;
          g.cpu.write(
            BASE + g.sgs.headerSize + top * 3 + 1,
            Uint8Array.of(input >>> 8, input & 255),
          );
          g.cpu.write(STACK, new Uint8Array(130).fill(0xa5));
          g.legacyChatLockValue = vector.lockBefore;
          g.event('START');
          assert.equal(g.status, 'idle', g.error);
          assert.equal(g.diagnostics.legacyChatLockValue, vector.lockAfter);
          assert.equal(
            g.cpu.read32(TOP) | 0,
            vector.topAfter,
            'one operand consumed; no return value',
          );
          const expected = new Uint8Array(130).fill(0xa5),
            view = new DataView(expected.buffer);
          sentinels.forEach((n, i) => view.setUint16(i * 2, n, true));
          view.setUint16(top * 2, input, true);
          assert.deepEqual(
            g.cpu.read(STACK, expected.length),
            expected,
            'stack data and adjacent canary survive',
          );
        }
      } finally {
        g.close();
      }
    }
  });

  test(`SGS v${version} LockChatMode underflow is an error and preserves host state`, async () => {
    const g = await LegacyRuntime.create(rom, program(version, [0xba, 0xff]), {
      width: 120,
      height: 100,
    });
    try {
      g.event('START');
      assert.equal(g.status, 'error');
      assert.match(g.error, /Legacy stack bounds/);
      assert.equal(g.legacyChatLockValue, 1);
      assert.equal(g.cpu.read32(TOP) | 0, -1);
    } finally {
      g.close();
    }
  });

  test(`SGS v${version} unsupported SetChatMode is not silently skipped`, async () => {
    const g = await LegacyRuntime.create(rom, program(version, [5, 1, 0xbb, 0xff]), {
      width: 120,
      height: 100,
    });
    try {
      g.event('START');
      assert.equal(g.status, 'error');
      assert.match(g.error, /exception 15.*opcode0xbb/);
      assert.equal(g.legacyChatLockValue, 1);
      assert.equal(g.cpu.read32(TOP) | 0, 0, 'unsupported opcode did not consume its argument');
    } finally {
      g.close();
    }
  });
}

test('optional opcode monitor preserves the last opcode and error on native and fallback hooks', async () => {
  const raw = program(2, [6, 0, 7, 0xba, 5, 1, 0xbb, 0xff]);
  let reference;
  for (const mode of ['native', 'disabled', 'unavailable']) {
    let cpu;
    if (mode === 'unavailable') {
      cpu = await createARM();
      cpu.uc = Object.assign(Object.create(cpu.uc), { reunionWasmMemory: () => null });
    }
    let g;
    try {
      g = await LegacyRuntime.create(rom, raw, {
        cpu,
        width: 120,
        height: 100,
        nowMs: () => 0,
        fastOpcodeMonitor: mode !== 'disabled',
      });
      assert.equal(Boolean(g._legacyOpcodeMonitor), mode === 'native');
      assert.equal(g.legacyOpcode, undefined);
      g.event('START');
      assert.match(g.error, /exception 15.*opcode0xbb/);
      assert.equal(g.legacyChatLockValue, 7);
      assert.equal(g.legacyOpcode, 0xbb);
      const checkpoint = {
        diagnostics: g.diagnostics,
        arm: g.armInstructions,
        stack: g.cpu.read(STACK, 16),
        top: g.cpu.read32(TOP),
        frame: g.framebufferRGBA,
      };
      reference ??= checkpoint;
      assert.deepEqual(checkpoint, reference);
    } finally {
      if (g) g.close();
      else cpu?.close();
    }
  }
});
