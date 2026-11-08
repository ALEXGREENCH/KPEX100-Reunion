import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GnexRuntime } from '../web/engine/gnex.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url));
const firmware = read('web/data/firmware/Kingston-2.12.rom');
const demo = read('web/data/games/demo-pulse-relay.sgs');
const cartridge = read('demos/gg/pulse-relay.gg');
const laneKeys = { 4: 16, 8: 17, 1: 18, 2: 19 };
const secondChart = [2, 4, 8, 1, 4, 2, 8, 2, 1, 8, 4, 1, 2, 8, 8, 4, 2, 1, 4, 8, 1, 1, 4, 2];

test('Pulse Relay selects a chart, scores timed inputs, loses, clears and retries', async () => {
  assert.equal(cartridge.length, 32768);
  assert.deepEqual(
    demo.subarray(-cartridge.length).map((byte) => byte ^ 0xa5),
    cartridge,
  );
  const game = await GnexRuntime.create(firmware, demo, { profile: 'kpex' });
  const ram = game.varAddresses[game.sgs.variables.findIndex(([, count]) => count === 8192)];
  const peek = (offset) => game.cpu.read32(ram + (0x1000 + offset) * 4) & 255;
  const state = () => peek(0);
  const deck = () => peek(1);
  const note = () => peek(4);
  const row = () => peek(5);
  const expected = () => peek(8);
  const speed = () => peek(10);
  const pressed = () => peek(11);
  const energy = () => peek(13);
  const hits = () => peek(15) * 10 + peek(14);
  const chain = () => peek(17) * 10 + peek(16);
  const section = () => peek(18);
  const tick = () => {
    game.event('TIMEOUT', 0);
    assert.equal(game.status, 'idle', game.error);
    assert.equal(game.timerStates[0].delay, 20);
  };
  const until = (condition, limit, message) => {
    for (let i = 0; i < limit && !condition(); i++) tick();
    assert.ok(condition(), message);
  };
  const tap = (code) => {
    game.setKey(code, true);
    tick();
    game.setKey(code, false);
    tick();
  };
  const atLine = () => until(() => row() === 15, 65, 'note failed to reach the timing line');
  const colored = (x, y) => {
    const offset = ((16 + (y - 3) * 8 + 3) * 220 + 30 + (x - 6) * 8 + 3) * 4;
    return game.framebufferRGBA.subarray(offset, offset + 3).some((channel) => channel > 175);
  };
  try {
    game.event('START');
    assert.deepEqual(game.vfs.diagnostics.files, ['pulse.ggr']);
    assert.equal(game.vfs.diagnostics.openHandles, 0);
    until(() => deck() === 1 && colored(8, 3), 160, 'initial board did not render');
    for (let i = 0; i < 12; i++) tick();
    const title = game.framebufferRGBA.slice();
    tap(17);
    assert.equal(deck(), 2);
    tap(20);
    assert.deepEqual([state(), note(), expected(), energy()], [1, 0, 2, 4]);
    tap(16);
    assert.deepEqual([note(), hits(), energy()], [0, 0, 4], 'early input counted');

    for (const [index, button] of secondChart.entries()) {
      if (index === 14) continue;
      assert.deepEqual([note(), expected()], [index, button]);
      assert.equal(section(), Math.floor(index / 8) + 1);
      assert.equal(speed(), [7, 5, 4][Math.floor(index / 8)]);
      atLine();
      if (index === 1) {
        tap(17);
        assert.deepEqual([note(), hits(), chain(), energy()], [2, 1, 0, 3]);
      } else if (index === 13) {
        game.setKey(17, true);
        until(() => note() === 15, 85, 'holding Right was counted twice');
        assert.equal(pressed(), 8);
        assert.deepEqual([hits(), chain(), energy()], [13, 0, 2]);
        game.setKey(17, false);
        tick();
      } else {
        tap(laneKeys[button]);
        assert.equal(note(), index + 1);
      }
    }
    assert.deepEqual([state(), hits(), chain(), energy()], [2, 22, 9, 2]);
    for (let i = 0; i < 4; i++) tick();
    const cleared = game.framebufferRGBA.slice();
    assert.notDeepEqual(cleared, title);

    tap(20);
    assert.deepEqual([state(), deck(), note(), hits(), energy()], [1, 2, 0, 0, 4]);
    until(() => state() === 3, 310, 'four timed-out notes did not end the run');
    assert.deepEqual([hits(), energy()], [0, 0]);
    assert.notDeepEqual(game.framebufferRGBA, cleared);
    tap(21);
    until(
      () => state() === 0 && game.framebufferRGBA.every((x, i) => x === title[i]),
      180,
      'Start did not return to deck selection',
    );
  } finally {
    game.close();
  }
});
