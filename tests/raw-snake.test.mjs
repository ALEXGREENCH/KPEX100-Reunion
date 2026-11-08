import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GnexRuntime } from '../web/engine/gnex.js';

const data = (path) => readFileSync(new URL(`../web/data/${path}`, import.meta.url));

test('Raw Snake runs the original cartridge through title, sprite movement and a joypad interrupt', async () => {
  const game = await GnexRuntime.create(
    data('firmware/Kingston-2.12.rom'),
    data('games/demo-raw-snake.sgs'),
    { profile: 'kpex' },
  );
  const wramSlot = game.sgs.variables.findIndex(
    ([, size], index) => size === 8192 && game.sgs.variables[index - 1]?.[1] === 16384,
  );
  const wram = (offset) => game.cpu.read32(game.varAddresses[wramSlot] + offset * 4) >>> 0;
  const frame = () => createHash('sha256').update(game.framebufferRGBA).digest('hex').slice(0, 16);
  const tick = (count) => {
    for (let i = 0; i < count; i++) game.event('TIMEOUT', 0);
    assert.equal(game.status, 'idle', game.diagnostics.error);
    assert.equal(game.timerStates[0].delay, 20);
  };
  try {
    assert.ok(wramSlot >= 0);
    game.event('START');
    assert.equal(game.sgs.xorMask, 0xa5);
    assert.deepEqual(game.vfs.diagnostics.files, ['snake.gbr']);
    tick(50);
    assert.equal(frame(), 'aa49d4169b3e7fbd');
    game.setKey(21, true);
    tick(3);
    game.setKey(21, false);
    tick(70);
    assert.equal(frame(), 'ff8409babd74af08');
    assert.deepEqual([wram(2), wram(3), wram(4), wram(5)], [0, 8, 96, 88]);
    game.setKey(18, true);
    tick(2);
    game.setKey(18, false);
    tick(15);
    assert.deepEqual([wram(2), wram(3), wram(4), wram(5)], [248, 0, 80, 96]);
    assert.equal(frame(), '440d870d0ad6d226');
  } finally {
    game.close();
  }
});
