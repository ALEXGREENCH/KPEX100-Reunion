import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GnexRuntime } from '../web/engine/gnex.js';

const data = (path) => readFileSync(new URL(`../web/data/${path}`, import.meta.url));

test('2048 draws its partial DMG window on the title and board and moves a tile', async () => {
  const game = await GnexRuntime.create(
    data('firmware/Kingston-2.12.rom'),
    data('games/demo-2048.sgs'),
    { profile: 'kpex' },
  );
  const rgb = (x, y) => {
    const offset = (y * 220 + x) * 4;
    return [...game.framebufferRGBA.subarray(offset, offset + 3)];
  };
  const ticks = (count) => {
    for (let i = 0; i < count; i++) game.event('TIMEOUT', 0);
    assert.equal(game.status, 'idle', game.diagnostics.error);
  };
  const tap = (key) => {
    game.setKey(key, true);
    game.setKey(key, false);
  };
  const light = [197, 218, 123];
  const ink = [16, 56, 41];

  try {
    game.event('START');
    assert.deepEqual(game.vfs.diagnostics.files, ['2048.gbr']);
    ticks(90);
    assert.deepEqual(rgb(166, 59), ink); // Title artwork above the window.
    assert.deepEqual(rgb(79, 112), ink); // PRESS START inside the window.
    assert.deepEqual(rgb(32, 146), light);

    tap(21);
    ticks(76);
    assert.deepEqual(rgb(166, 59), light);
    assert.deepEqual(rgb(32, 146), ink); // SCORE below the 5 × 5 board.
    assert.deepEqual(rgb(151, 112), light);
    tap(17);
    ticks(106);
    assert.deepEqual(rgb(151, 112), [123, 165, 82]);
    assert.deepEqual(rgb(32, 146), ink);
  } finally {
    game.close();
  }
});
