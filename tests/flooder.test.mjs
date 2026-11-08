import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GnexRuntime } from '../web/engine/gnex.js';

const data = (path) => readFileSync(new URL(`../web/data/${path}`, import.meta.url));

test('Flooder preserves short taps and draws the resulting CGB cursor and flood', async () => {
  const game = await GnexRuntime.create(
    data('firmware/Kingston-2.12.rom'),
    data('games/demo-flooder.sgs'),
    { profile: 'kpex' },
  );
  const cart = game.sgs.variables.findIndex(
    ([, size], index) => size === 8192 && game.sgs.variables[index + 1]?.[1] === 16384,
  );
  const variable = (slot, offset = 0) =>
    game.cpu.read32(game.varAddresses[cart + slot] + offset * 4) >>> 0;
  const oam = (offset) => variable(45, offset);
  const boardHead = () => variable(1, 8192 + 6144 + 3 * 32 + 5) & 7;
  const frame = () => createHash('sha256').update(game.framebufferRGBA).digest('hex');
  const ticks = (count) => {
    for (let i = 0; i < count; i++) {
      game.event('TIMEOUT', 0);
      assert.equal(game.status, 'idle', game.diagnostics.error);
      assert.equal(game.timerStates[0].delay, 20);
    }
  };
  const tap = (key) => {
    game.setKey(key, true);
    game.setKey(key, false);
  };
  try {
    assert.ok(cart >= 0);
    game.event('START');
    assert.deepEqual(game.vfs.diagnostics.files, ['flooder.gbc']);
    ticks(45);
    assert.equal(frame(), 'f6ecd0ec3989e423956554e831d6ccf10cce54ff795403f44a92b40e5b9b277b');
    tap(21);
    ticks(226);
    assert.deepEqual([oam(0), oam(34), boardHead()], [60, 8, 0]);
    assert.equal(frame(), 'd82cce5cce3986bcaf0f371f8428c117cbc76692d1202edeb6bc89cbf539d7df');

    tap(19);
    ticks(5);
    assert.equal(oam(0), 76);
    assert.equal(frame(), 'e10502986b440681552f71a7c5a4bdb89acb8b4d64d6eff3aed478c4d2e13f22');

    tap(20);
    ticks(16);
    assert.deepEqual([oam(34), boardHead()], [7, 1]);
    assert.equal(frame(), '49bb543d929f36c27b9f3a757a9b403fe2567b041319e4a62729026752fb6988');
  } finally {
    game.close();
  }
});
