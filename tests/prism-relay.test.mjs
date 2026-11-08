import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GnexRuntime } from '../web/engine/gnex.js';

const data = (path) => readFileSync(new URL(`../web/data/${path}`, import.meta.url));

test('Prism Relay renders both CGB tile banks and unlocks the exit after three cells', async () => {
  const rom = data('firmware/Kingston-2.12.rom');
  const sgs = data('games/demo-prism-relay.sgs');
  const game = await GnexRuntime.create(rom, sgs, { profile: 'kpex' });
  const ticks = (count) => {
    for (let i = 0; i < count; i++) game.event('TIMEOUT', 0);
    assert.equal(game.status, 'idle');
    assert.notEqual(game.timerStates[0].delay, null);
  };
  const pixel = (tileX, tileY, x, y) => {
    const offset = ((16 + tileY * 8 + y) * 220 + 30 + tileX * 8 + x) * 4;
    return game.framebufferRGBA.slice(offset, offset + 4);
  };
  const move = (directions) => {
    const keys = { R: 17, L: 16, U: 18, D: 19 };
    for (const direction of directions) {
      game.setKey(keys[direction], true);
      game.setKey(keys[direction], false);
      ticks(8);
    }
  };
  try {
    game.event('START');
    assert.equal(game.sgs.xorMask, 0xa5);
    assert.deepEqual(game.vfs.diagnostics.files, ['prism.gbc']);
    assert.equal(game.vfs.diagnostics.operations, 3);
    ticks(90);

    // The same asymmetric trace is in VRAM bank 1, flipped by bank 1 map attributes.
    const trace = pixel(0, 0, 0, 0);
    const blank = pixel(0, 0, 7, 0);
    assert.notDeepEqual(trace, blank);
    assert.deepEqual(pixel(0, 17, 0, 7), trace);
    assert.deepEqual(pixel(0, 17, 0, 0), blank);
    assert.deepEqual(pixel(19, 0, 0, 0), blank);
    assert.notDeepEqual(pixel(19, 0, 7, 0), trace);
    assert.notDeepEqual(pixel(19, 0, 7, 0), blank);
    assert.deepEqual(pixel(19, 17, 0, 0), pixel(19, 0, 7, 0));

    move('RRRURRRRRRDDRRRU');
    const robot = pixel(15, 9, 1, 3);
    assert.notDeepEqual(robot, pixel(14, 9, 1, 3));
    const door = pixel(16, 9, 0, 0);
    const message = pixel(7, 1, 1, 1);
    move('R');
    assert.deepEqual(pixel(15, 9, 1, 3), robot);
    assert.deepEqual(pixel(16, 9, 0, 0), door);

    const cells = [
      [15, 5],
      [10, 12],
      [5, 5],
    ];
    const charged = cells.map(([x, y]) => pixel(x, y, 3, 3));
    move('UUUULLLLLDDDDDDDLLLLLUUUUUUURURRRRRRRRRDDDDD');
    cells.forEach(([x, y], index) => assert.notDeepEqual(pixel(x, y, 3, 3), charged[index]));
    assert.deepEqual(pixel(15, 9, 1, 3), robot);
    assert.deepEqual(pixel(7, 1, 1, 1), message);
    move('R');
    assert.notDeepEqual(pixel(15, 9, 1, 3), robot);
    assert.notDeepEqual(pixel(16, 9, 0, 0), door);
    assert.notDeepEqual(pixel(7, 1, 1, 1), message);
    const won = game.framebufferRGBA.slice();
    move('L');
    assert.deepEqual(game.framebufferRGBA, won);
  } finally {
    game.close();
  }
});
