import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GnexRuntime } from '../web/engine/gnex.js';
import { VirtualFileSystem } from '../web/engine/vfs.js';
const root = new URL('../web/', import.meta.url),
  rom = fs.readFileSync(new URL('data/firmware/Kingston-2.12.rom', root));
const profiles = JSON.parse(
  fs.readFileSync(new URL('../validation/phone-profiles.json', import.meta.url)),
).profiles;
const catalog = JSON.parse(fs.readFileSync(new URL('data/catalog.json', root)));
async function game(id, extra = {}) {
  const a = catalog.games.find((x) => x.id === id);
  return GnexRuntime.create(rom, fs.readFileSync(new URL(a.url, root)), {
    ...a.runtime,
    ...profiles[id],
    ...(a.format === 36
      ? { swerve: { binary: fs.readFileSync(new URL('engine/vendor/swerve/swv21brew.mod', root)) } }
      : {}),
    clock: () => new Date(2026, 0, 1, 12, 0, 0),
    ...extra,
  });
}
test('phone script identity profile executes the original authorization branch and intro', async () => {
  let time = 0;
  const g = await game('gnex1_1zimae', { nowMs: () => time });
  try {
    g.event('START');
    assert.equal(g.status, 'idle', g.error);
    for (let i = 0; i < 100; i++) {
      time += g.timerMs;
      g.event('TIMEOUT');
    }
    assert.equal(g.status, 'idle', g.error);
    assert.equal(g.eventCount, 101);
    assert.equal(g.syscalls['0x00000002'], 1);
    assert.ok(g.syscalls['0x000000a4'] >= 1);
    assert.ok(!g.syscalls['0x000000e1']);
    assert.equal(g._read(0x20b41274), g.width);
    assert.equal(g.framebufferRGBA.length, g.width * g.height * 4);
  } finally {
    g.close();
  }
});
test('Dungeon Fighter time benchmark and equal-sized media retention pass the former crashes', async () => {
  let time = 0;
  const g = await game('gnex36_dungeon_fighter', { nowMs: () => time });
  try {
    g.event('START');
    for (let i = 0; i < 20; i++) {
      time += g.timerMs;
      g.event('TIMEOUT');
    }
    assert.equal(g.status, 'idle', g.error);
    assert.equal(g.eventCount, 21);
    assert.ok(g.syscalls['0x00000005'] > 20);
    assert.ok(g.syscalls['0x0000009e'] > 200);
    assert.ok(g._read(0x21000000 + g.sgs.c + 2611 * 12 + 8) !== 0);
  } finally {
    g.close();
  }
});
test('Fist of Fury initializes with the SDK large UserNV read and missing-save EOF behavior', async () => {
  const g = await game('gnex3_fist_of_fury2');
  try {
    g.event('START');
    assert.equal(g.status, 'idle', g.error);
    assert.ok(g.syscalls['0x00000093'] >= 1);
    assert.equal(g.vfs.userNV.length, 0);
  } finally {
    g.close();
  }
});
test('NV data and file creation dates survive persistence without the obsolete 64-byte cap', () => {
  const v = new VirtualFileSystem(null, { clock: () => new Date('2020-01-02T03:04:05Z') });
  v.userNV = Uint8Array.from({ length: 320 }, (_, i) => i & 255);
  v.open('save.dat', 2);
  const w = new VirtualFileSystem(null, { saveData: v.serialize() });
  assert.deepEqual(w.userNV, v.userNV);
  assert.equal(w.created.get('save.dat'), Date.parse('2020-01-02T03:04:05Z'));
  assert.throws(() => w.restore({ version: 1, userNV: '?!' }), /base64/);
  assert.equal(w.userNV.length, 320);
});
test('phone MallocInt reserves every INT32 before adjacent resource allocation', async () => {
  const g = await game('gnex26_independence_day_3d');
  try {
    const stop = 0x23fff000;
    g.cpu.regWrite('r0', 15);
    g.cpu.regWrite('lr', stop);
    g.cpu.run(0x2000f8dc + 0x494c0, stop, 10000);
    assert.equal(g.cpu.regRead('pc'), stop);
    const encoded = g.cpu.regRead('r0'),
      p = g.vfs.intPointer(g, encoded, 60);
    const pattern = Uint8Array.from({ length: 60 }, (_, i) => i + 1);
    g.cpu.write(p, pattern);
    const next = g._allocate(5);
    g.cpu.write(next, Uint8Array.of(1, 2, 3, 4, 0));
    assert.ok(next >= p + 60);
    assert.deepEqual(g.cpu.read(p, 60), pattern);
    assert.equal(g._read(0x20b41e20), 15);
  } finally {
    g.close();
  }
});
test('phone SDK release reaches the original guest once per held button', async () => {
  const g = await game('gnex3_fist_of_fury2');
  try {
    g.event('START');
    g.setKey(17, true);
    g.setKey(5, true);
    const before = g.eventCount;
    g.setKey(5, false);
    assert.equal(g.status, 'idle', g.error);
    assert.equal(g.eventCount, before + 1);
    assert.equal(g._read(g.varAddresses[0]), 0xff);
    assert.ok(g.heldKeys.has(17));
    g.setKey(5, false);
    assert.equal(g.eventCount, before + 1);
    g.close();
    g.setKey(17, false);
    assert.equal(g.eventCount, before + 1);
  } finally {
    g.close();
  }
});
test('SDK old v1/v2 VM filters release before calling the original guest', async () => {
  const { LegacyRuntime } = await import('../web/engine/legacy.js');
  const a = catalog.games.find((x) => x.id === 'gnex16_bubble_bubble');
  const g = await LegacyRuntime.create(rom, fs.readFileSync(new URL(a.url, root)), a.runtime);
  try {
    g.event('START');
    g.setKey(1, true);
    assert.equal(g.status, 'idle', g.error);
    const before = g.eventCount;
    g.setKey(1, false);
    assert.equal(g.eventCount, before);
    assert.equal(g.heldKeys.size, 0);
  } finally {
    g.close();
  }
});
