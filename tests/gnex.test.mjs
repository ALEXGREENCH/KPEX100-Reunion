import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { GnexRuntime } from '../web/engine/gnex.js';
const source = new URL('../web/', import.meta.url);
const catalog = JSON.parse(fs.readFileSync(new URL('data/catalog.json', source)));
const rom = fs.readFileSync(new URL('data/firmware/Kingston-2.12.rom', source));
const goldens = JSON.parse(fs.readFileSync(new URL('native-goldens.json', import.meta.url)));
const game = (name) =>
  fs.readFileSync(
    new URL(
      catalog.games.find((g) => g.sourceName === name && g.compatibility === 'verified').url,
      source,
    ),
  );
const hash = (g) => {
  const rgba = g.framebufferRGBA,
    rgb = new Uint8Array(220 * 176 * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) rgb.set(rgba.subarray(i, i + 3), j);
  return crypto.createHash('sha256').update(rgb).digest('hex');
};

test('four browser games match native desktop pixels, event counts and syscalls', async () => {
  for (const expected of goldens) {
    const g = await GnexRuntime.create(rom, game(expected.name));
    try {
      g.event('START');
      assert.equal(g.status, 'idle', g.error);
      assert.equal(hash(g), expected.title, expected.name + ' title');
      for (let i = 0; i < 5; i++) g.event('TIMEOUT');
      const key = expected.name === 'hell_fire.sgs' ? 21 : 20;
      g.setKey(key, true);
      g.setKey(key, false);
      for (let i = 0; i < 40; i++) {
        if (i % 10 === 0) {
          const c = i % 20 ? 17 : 16;
          g.setKey(c, true);
          g.setKey(c, false);
        }
        if (g.timerMs) g.event('TIMEOUT');
        assert.equal(g.status, 'idle', g.error);
      }
      assert.equal(hash(g), expected.final, expected.name + ' gameplay');
      assert.equal(g.eventCount, expected.events);
      assert.deepEqual(
        Object.fromEntries(Object.entries(g.syscalls).map(([n, v]) => [String(Number(n)), v])),
        expected.syscalls,
      );
    } finally {
      g.close();
    }
  }
});
test('native Exit and event instruction budget are respected', async () => {
  const g = await GnexRuntime.create(rom, game('kpetris_beta.sgs'));
  g.event('START');
  for (let i = 0; i < 3; i++) {
    g.setKey(19, true);
    g.setKey(19, false);
  }
  g.setKey(20, true);
  assert.equal(g.status, 'exited');
  assert.equal(g.timerMs, null);
  g.close();
  const short = await GnexRuntime.create(rom, game('kpetris_beta.sgs'));
  short.event('START', 0, 1);
  assert.equal(short.status, 'error');
  assert.match(short.error, /exceeded/);
  short.close();
});
test('wrong ROM cannot use native fixed addresses', async () => {
  const corrupted = Uint8Array.from(rom);
  corrupted[0x40000] ^= 1;
  await assert.rejects(GnexRuntime.create(corrupted, game('hell_fire.sgs')), /unmodified Kingston/);
});
