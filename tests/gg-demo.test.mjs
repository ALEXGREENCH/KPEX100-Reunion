import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GnexRuntime } from '../web/engine/gnex.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url));
const firmware = read('web/data/firmware/Kingston-2.12.rom');
const demo = read('web/data/games/demo-prism-vault.sgs');
const cartridge = read('demos/gg/prism-vault.gg');

test('Prism Vault reads the standalone ROM and completes both gates, both shards, and restart', async () => {
  assert.equal(cartridge.length, 32768);
  assert.deepEqual(
    demo.subarray(-cartridge.length).map((byte) => byte ^ 0xa5),
    cartridge,
  );
  const game = await GnexRuntime.create(firmware, demo, { profile: 'kpex' });
  const ticks = (count) => {
    for (let i = 0; i < count; i++) {
      game.event('TIMEOUT', 0);
      assert.equal(game.status, 'idle', game.diagnostics.error);
      assert.equal(game.timerStates[0].delay, 20);
    }
  };
  const pixel = (col, row, dx = 3, dy = 0) => {
    const x = 30 + (col - 6) * 8 + dx;
    const y = 16 + (row - 3) * 8 + dy;
    const offset = (y * 220 + x) * 4;
    return game.framebufferRGBA.subarray(offset, offset + 4);
  };
  const tap = (code, count = 1) => {
    for (let i = 0; i < count; i++) {
      game.setKey(code, true);
      game.setKey(code, false);
      ticks(3);
    }
  };
  try {
    game.event('START');
    assert.deepEqual(game.vfs.diagnostics.files, ['vault.ggr']);
    assert.equal(game.vfs.diagnostics.operations, 3);
    assert.equal(game.vfs.diagnostics.openHandles, 0);
    assert.equal(game.vfs.diagnostics.readonlyFiles, 1);
    ticks(95);
    const initial = game.framebufferRGBA.slice();
    const ship = pixel(8, 8);
    const cyanClosed = pixel(12, 10);
    const amberOpen = pixel(18, 13);
    const exitClosed = pixel(22, 8);
    const meters = () => [23, 24].map((col) => pixel(col, 19, 3, 3));
    const empty = meters();
    assert.notDeepEqual(ship, pixel(9, 8));

    tap(17, 2);
    assert.deepEqual(pixel(10, 8), ship);
    assert.notDeepEqual(pixel(9, 8), ship);
    tap(16, 2);
    assert.deepEqual(game.framebufferRGBA, initial);

    tap(17, 3);
    tap(19, 2);
    tap(17);
    assert.deepEqual(pixel(11, 10), ship);
    assert.deepEqual(pixel(12, 10), cyanClosed);
    tap(20);
    assert.notDeepEqual(pixel(12, 10), cyanClosed);
    assert.notDeepEqual(pixel(18, 13), amberOpen);
    tap(17, 4);
    tap(18, 2);
    assert.deepEqual(pixel(15, 8), ship);
    const [filled, second] = meters();
    assert.notDeepEqual(filled, empty[0]);
    assert.deepEqual(second, empty[1]);

    tap(19, 5);
    tap(17, 2);
    tap(17);
    assert.deepEqual(pixel(17, 13), ship);
    assert.notDeepEqual(pixel(18, 13), ship);
    tap(20);
    assert.deepEqual(pixel(18, 13), amberOpen);
    tap(17, 5);
    tap(19, 2);
    assert.deepEqual(pixel(22, 15), ship);
    assert.deepEqual(meters(), [filled, filled]);
    assert.notDeepEqual(pixel(22, 8), exitClosed);
    tap(18, 7);
    ticks(12);
    assert.deepEqual(pixel(22, 8), ship);
    assert.notDeepEqual(pixel(22, 9), ship);
    const won = game.framebufferRGBA.slice();
    tap(16);
    assert.deepEqual(game.framebufferRGBA, won);

    tap(21);
    ticks(95);
    assert.deepEqual(game.framebufferRGBA, initial);
  } finally {
    game.close();
  }
});

test('Prism Vault rejects a malformed Game Gear header without leaving an open file or timer', async () => {
  const malformed = Buffer.from(demo);
  malformed[malformed.length - 16] ^= 1;
  const game = await GnexRuntime.create(firmware, malformed, { profile: 'kpex' });
  try {
    game.event('START');
    assert.equal(game.status, 'idle');
    assert.equal(game.vfs.diagnostics.operations, 3);
    assert.equal(game.vfs.diagnostics.openHandles, 0);
    assert.equal(game.timerStates[0].delay, null);
  } finally {
    game.close();
  }
});
