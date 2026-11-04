import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { SwerveMachine } from '../web/engine/m3g-native.js';
import { HELPERS } from '../web/engine/m3g-api.js';
import { SgsFile } from '../web/engine/sgs.js';
import { VirtualFileSystem } from '../web/engine/vfs.js';
import { GnexRuntime } from '../web/engine/gnex.js';
const binary = fs.readFileSync(
  new URL('../web/engine/vendor/swerve/swv21brew.mod', import.meta.url),
);
test('Original Swerve ARM engine creates RGB565 buffer and renders a green clear', async () => {
  assert.equal(
    crypto.createHash('sha256').update(binary).digest('hex'),
    '1e76412e158bc3948bf6ad173b181368e0f0d554d6b0e1488a29402d96b0cdab',
  );
  const m = await SwerveMachine.create(binary, HELPERS);
  try {
    const gfx = m.createObject(8),
      bg = m.createObject(4),
      pixels = m.alloc(12 * 8 * 2),
      out = m.alloc(16),
      call = (offset, ...args) => m.call(0x4000000 + offset, ...args);
    assert.equal(call(0x2fdd4, gfx, 12, 8, 24, pixels), 0);
    [0x2fa18, 0x2f9d0, 0x2f9e8, 0x2fa00].forEach((offset, i) => call(offset, gfx, out + i * 4));
    assert.deepEqual(
      Array.from({ length: 4 }, (_, i) => m.cpu.read32(out + i * 4)),
      [12, 8, 24, pixels],
    );
    call(0x2dd80, bg, 0xff00ff00);
    assert.equal(call(0x2f898, gfx, bg), 0);
    const frame = m.cpu.read(pixels, 192);
    for (let i = 0; i < frame.length; i += 2) {
      assert.equal(frame[i], 0xe0);
      assert.equal(frame[i + 1], 7);
    }
  } finally {
    m.close();
  }
});
test('Original Swerve loader parses the unmodified appended gnex.m3g world', async () => {
  const sgs = new SgsFile(
    fs.readFileSync(new URL('../web/data/games/gnex26_independence_day_3d.sgs', import.meta.url)),
  );
  const files = new VirtualFileSystem(sgs),
    data = files.files.get('gnex.m3g');
  assert.equal(data.length, 6002);
  const m = await SwerveMachine.create(binary, HELPERS);
  try {
    const loader = m.createObject(14),
      bytes = m.alloc(data.length),
      out = m.alloc(4);
    m.cpu.write(bytes, data);
    assert.equal(m.method(loader, 3, data.length, bytes), 0);
    m.method(loader, 5, out);
    assert.equal(m.cpu.read32(out), 1);
    assert.equal(m.method(loader, 6, 0, out), 0);
    const world = m.cpu.read32(out);
    m.method(loader, 1);
    m.free(bytes);
    const inner = m.cpu.read32(world + 4),
      vt = m.cpu.read32(inner);
    assert.equal(m.call((vt + m.cpu.read32(vt + 4)) >>> 0, inner), 22);
    m.call(0x4030360, world, out);
    assert.ok(m.cpu.read32(out) > 0);
  } finally {
    m.close();
  }
});
test('Native transformPoints counts float components and preserves homogeneous coordinates', async () => {
  const m = await SwerveMachine.create(binary, HELPERS);
  try {
    const transform = m.createObject(26),
      values = Float32Array.of(1.25, -2.5, 3, 1, 0, 4, 8, 1),
      p = m.alloc(values.byteLength),
      source = new Uint8Array(values.buffer);
    m.cpu.write(p, source);
    assert.equal(m.call(0x403be9c, transform, 8, p), 0);
    assert.deepEqual(m.cpu.read(p, source.length), source);
    assert.notEqual(m.call(0x403be9c, transform, 7, p), 0);
  } finally {
    m.close();
  }
});
test('Native engine initialization and uninitialization execute the BREW lifecycle', async () => {
  const m = await SwerveMachine.create(binary, HELPERS);
  try {
    m.uninitialize();
    assert.equal(m.engine, 0);
    assert.equal(m.initialize(), 0);
    assert.ok(m.engine);
    const bg = m.createObject(4);
    assert.ok(bg);
    m.method(bg, 1);
    m.uninitialize();
    assert.equal(m.engine, 0);
  } finally {
    m.close();
  }
  m.close();
  assert.equal(m.cpu, null);
  assert.equal(m.traps.size, 0);
});
test('Unmodified Independence SGS calls the isolated native renderer through the GNEX ABI', async () => {
  const rom = fs.readFileSync(new URL('../web/data/firmware/Kingston-2.12.rom', import.meta.url));
  const sgs = fs.readFileSync(
    new URL('../web/data/games/gnex26_independence_day_3d.sgs', import.meta.url),
  );
  let tick = 0;
  const r = await GnexRuntime.create(rom, sgs, {
    profile: 'phone',
    width: 176,
    height: 220,
    nowMs: () => tick,
    swerve: { binary },
  });
  try {
    r.event('START');
    assert.equal(r.status, 'idle', r.error);
    for (let i = 0; i < 5; i++) {
      tick += 500;
      r.event('TIMEOUT');
      assert.equal(r.status, 'idle', r.error);
    }
    for (const id of ['312', '29d', '248'])
      assert.ok(
        r.swerve.log.some((call) => call.id === id),
        'Real call ' + id,
      );
    const loader = r.swerve.log.find((call) => call.id === '312');
    assert.ok(loader.result >>> 31, 'Loader returns an encoded GNEX root array');
    assert.equal(r.vfs.intPointer(r, loader.result, 4) > 0, true);
    const values = new Set();
    for (let i = 0; i < r.framebufferRGBA.length; i += 4)
      values.add(
        (r.framebufferRGBA[i] << 16) | (r.framebufferRGBA[i + 1] << 8) | r.framebufferRGBA[i + 2],
      );
    assert.ok(values.size > 10, 'Original animated logo contains real rendered geometry');
  } finally {
    r.close();
  }
});
