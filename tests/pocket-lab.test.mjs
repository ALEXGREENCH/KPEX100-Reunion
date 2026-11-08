import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GnexRuntime } from '../web/engine/gnex.js';

const data = (path) => readFileSync(new URL(`../web/data/${path}`, import.meta.url));
const rom = data('firmware/Kingston-2.12.rom');
const sgs = data('games/demo-pocket-lab.sgs');

test('Pocket Lab reads its cartridge via GNEX VFS and moves the DMG tile on all four directions', async () => {
  const game = await GnexRuntime.create(rom, sgs);
  const ticks = (count) => {
    for (let i = 0; i < count; i++) game.event('TIMEOUT', 0);
    assert.equal(game.status, 'idle');
  };
  const robot = (x, y) => {
    const frame = game.framebufferRGBA;
    const offset = ((16 + y * 8 + 3) * 220 + 30 + x * 8 + 1) * 4;
    return frame.slice(offset, offset + 4);
  };
  try {
    game.event('START');
    assert.deepEqual(game.vfs.diagnostics.files, ['cart.gb']);
    assert.equal(game.vfs.diagnostics.operations, 3);
    assert.equal(game.vfs.diagnostics.openHandles, 0);
    assert.equal(game.vfs.diagnostics.readonlyFiles, 1);
    ticks(55);
    const original = game.framebufferRGBA.slice();
    const center = robot(10, 9);
    assert.notDeepEqual(center, robot(11, 9));
    for (const [key, x, y] of [
      [17, 11, 9],
      [18, 11, 8],
      [16, 10, 8],
      [19, 10, 9],
    ]) {
      game.setKey(key, true);
      game.setKey(key, false);
      ticks(12);
      assert.deepEqual(robot(x, y), center);
    }
    assert.deepEqual(game.framebufferRGBA, original);
  } finally {
    game.close();
  }
});

test('Pocket Lab stops at the error screen if the VFS cartridge is missing', async () => {
  const game = await GnexRuntime.create(rom, sgs.subarray(0, sgs.readUInt32LE(120)));
  try {
    game.event('START');
    assert.equal(game.status, 'idle');
    assert.equal(game.timerStates[0].delay, null);
    assert.equal(game.vfs.diagnostics.operations, 1);
    assert.ok(game.framebuffer);
  } finally {
    game.close();
  }
});
