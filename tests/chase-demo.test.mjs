import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GnexRuntime } from '../web/engine/gnex.js';
import { SgsFile } from '../web/engine/sgs.js';

const read = (path) => readFileSync(new URL(path, import.meta.url));

test('Chase starts the original maze, collects a gem and pauses on Play', async () => {
  const cart = read('../demos/nes/chase/CHASE.NES');
  const sgs = read('../web/data/games/demo-chase.sgs');
  assert.equal(
    createHash('sha256').update(cart).digest('hex'),
    'e32a445436b916835547c9716d8f461bcbbf3f3edd87f68116bbc7eb2108e3c0',
  );
  const script = new SgsFile(sgs);
  assert.equal(script.xorMask, 0xa5);
  assert.deepEqual(script.body.subarray(-cart.length), cart);

  const firmware = read('../web/data/firmware/Kingston-2.12.rom');
  const game = await GnexRuntime.create(firmware, sgs, { profile: 'kpex' });
  const readWord = (variable, index) => game._read(game.varAddresses[variable] + index * 4);
  // The guest alternates metasprite priority. Find each character by its
  // upper-left tile and palette instead of assuming fixed OAM slots.
  const sprite = (tile, palette) => {
    for (let i = 0; i < 256; i += 4) {
      const y = readWord(24, i);
      if (y < 239 && readWord(24, i + 1) === tile && (readWord(24, i + 2) & 3) === palette) {
        return [readWord(24, i + 3), y + 1];
      }
    }
  };
  const player = () => sprite(73, 0);
  const enemy = () => sprite(77, 1);
  // $2051 in the guest nametable is the units digit of the collected count.
  const gemCount = () => readWord(22, 0x51) - 0x10;
  const tick = () => {
    game.event('TIMEOUT', 0);
    assert.equal(game.status, 'idle', game.diagnostics.error);
    assert.equal(game.timerStates[0].delay, 20);
  };
  const ticks = (count) => {
    for (let i = 0; i < count; i++) tick();
  };
  const until = (check, limit, failure) => {
    for (let i = 0; i < limit && !check(); i++) tick();
    assert.ok(check(), failure);
  };
  const tap = (key) => {
    game.setKey(key, true);
    game.setKey(key, false);
  };

  try {
    game.event('START');
    assert.deepEqual(game.vfs.diagnostics.files, ['chase.nes']);
    assert.equal(game.vfs.diagnostics.operations, 3);
    assert.equal(game.vfs.diagnostics.openHandles, 0);
    ticks(220);
    assert.equal(player(), undefined);

    tap(21);
    until(
      () => {
        const rival = enemy();
        return player()?.[0] === 80 && rival && (rival[0] !== 160 || rival[1] !== 144);
      },
      390,
      'level one and its moving enemy',
    );
    assert.deepEqual(player(), [80, 80]);
    assert.equal(gemCount(), 0);
    const board = game.framebufferRGBA.slice();

    tap(17);
    until(() => gemCount() === 1, 140, 'collect the first gem');
    assert.deepEqual(player(), [96, 80]);
    assert.notDeepEqual(game.framebufferRGBA, board);

    tap(21);
    ticks(45);
    const pausedEnemy = enemy();
    const pausedBoard = game.framebufferRGBA.slice();
    tap(17);
    ticks(45);
    assert.deepEqual(player(), [96, 80]);
    assert.deepEqual(enemy(), pausedEnemy);
    assert.deepEqual(game.framebufferRGBA, pausedBoard);

    tap(21);
    until(() => enemy()?.join() !== pausedEnemy?.join(), 55, 'resume enemy movement');
  } finally {
    game.close();
  }
});
