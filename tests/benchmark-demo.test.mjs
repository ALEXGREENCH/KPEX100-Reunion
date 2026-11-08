import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GnexRuntime } from '../web/engine/gnex.js';
import { decodeKorean } from '../web/engine/sgs.js';

const data = (path) => readFileSync(new URL(`../web/data/${path}`, import.meta.url));
const rom = data('firmware/Kingston-2.12.rom');
const sgs = data('games/demo-gnex-benchmark.sgs');

test('GNEX Bench measures three bounded phases, reports exact work and can restart', async () => {
  let now = 0;
  const game = await GnexRuntime.create(rom, sgs, { profile: 'kpex', nowMs: () => now });
  const drawn = [];
  const syscall = game._syscall.bind(game);
  game._syscall = (id) => {
    if (id === 0x55) {
      const args = game._args(3);
      drawn.push(decodeKorean(game.resourceBytes(args[2])));
      // Keep the native DrawStr handler's original stack and rendering.
      args.forEach((arg) => game._push(arg));
    }
    return syscall(id);
  };
  try {
    assert.equal(game.sgs.xorMask, 0xa5);
    game.event('START');
    assert.equal(drawn.at(-1), '1 / TIMER');
    for (const interval of [20, 40, 60]) {
      for (let i = 0; i < 24; i++) {
        const { delay, repeat } = game.timerStates[0];
        assert.equal(delay, 20);
        assert.equal(repeat, false);
        now += interval;
        game.event('TIMEOUT', 0);
        assert.equal(game.status, 'idle', game.error);
      }
    }
    assert.deepEqual(drawn.slice(-8), [
      'GNEX BENCH / 1',
      'IDLE    480 ms',
      'CPU     960 ms',
      'LCD     1440 ms',
      'ITER/s  204800',
      'RECT/s  6400',
      'CHECK F57A',
      'OK / REPEAT',
    ]);
    assert.equal(game.timerStates[0].delay, null);
    const calls = game.diagnostics.syscalls;
    assert.equal(calls['0x00000095'], 72); // SetTimer
    assert.equal(calls['0x0000009b'], 3); // GetTick
    assert.equal(calls['0x0000009c'], 3); // ResetTick
    assert.equal(calls['0x00000046'], 9216 + 8); // Work rectangles plus four headers
    assert.equal(calls['0x0000005f'], 24 + 4); // Work batches plus four headers
    game.setKey(20, true);
    game.setKey(20, false);
    assert.equal(game.timerStates[0].delay, 20);
    assert.equal(drawn.at(-1), '1 / TIMER');
  } finally {
    game.close();
  }
});

test('GNEX Bench leaves the timer stopped on a small LCD', async () => {
  const game = await GnexRuntime.create(rom, sgs, { profile: 'kpex', width: 96, height: 96 });
  try {
    game.event('START');
    game.setKey(20, true);
    game.setKey(20, false);
    assert.equal(game.status, 'idle', game.error);
    assert.equal(game.timerStates[0].delay, null);
  } finally {
    game.close();
  }
});
