import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GnexRuntime } from '../web/engine/gnex.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url));
const firmware = read('web/data/firmware/Kingston-2.12.rom');
const demo = read('web/data/games/demo-freight-shift.sgs');
const cartridge = read('demos/gg/freight-shift.gg');
const directions = { U: [18, 1], D: [19, 2], L: [16, 4], R: [17, 8] };
const routes = [
  'RUDR',
  'URUDDUR',
  'RUULLDULUDDDLLUUUURRDDRRRDDLL',
  'UULDLDLLUURURLDDLDRURRUUDRRUULL',
];

test('Freight Shift pushes crates, restores undo history, and clears all four rooms', async () => {
  assert.equal(cartridge.length, 32768);
  assert.deepEqual(
    demo.subarray(-cartridge.length).map((byte) => byte ^ 0xa5),
    cartridge,
  );
  const game = await GnexRuntime.create(firmware, demo, { profile: 'kpex' });
  const ram = game.varAddresses[game.sgs.variables.findIndex(([, count]) => count === 8192)];
  const peek = (offset) => game.cpu.read32(ram + (0x1000 + offset) * 4) & 255;
  const mode = () => peek(0);
  const level = () => peek(1);
  const player = () => peek(4);
  const left = () => peek(5);
  const moves = () => peek(8) * 100 + peek(7) * 10 + peek(6);
  const history = () => peek(10);
  const board = () => Array.from({ length: 56 }, (_, i) => peek(0x100 + i));
  const ticks = (count) => {
    for (let i = 0; i < count; i++) {
      game.event('TIMEOUT', 0);
      assert.equal(game.status, 'idle', game.error);
      assert.equal(game.timerStates[0].delay, 20);
    }
  };
  const until = (condition, limit, message) => {
    for (let i = 0; i < limit && !condition(); i++) ticks(1);
    assert.ok(condition(), message);
  };
  const tap = (code, bit, slot = 11) => {
    game.setKey(code, true);
    until(() => peek(slot) === bit, 35, `key ${code} was not read`);
    game.setKey(code, false);
    until(() => peek(slot) === 0, 140, `key ${code} was not released`);
    ticks(2);
  };
  const walk = (route) => {
    for (const step of route) tap(...directions[step]);
  };
  const undo = () => tap(20, 16);
  const start = () => tap(21, 1, 12);

  try {
    game.event('START');
    assert.deepEqual(game.vfs.diagnostics.files, ['freight.ggr']);
    assert.equal(game.vfs.diagnostics.openHandles, 0);
    ticks(130);
    assert.deepEqual([mode(), level(), player(), left(), moves()], [0, 1, 26, 2, 0]);
    const initialBoard = board();
    const initialFrame = game.framebufferRGBA.slice();

    walk('DRU');
    assert.deepEqual([player(), left(), moves(), history()], [35, 2, 2, 2]);
    assert.equal(board()[27], 3);
    undo();
    undo();
    assert.deepEqual(board(), initialBoard);
    assert.deepEqual(game.framebufferRGBA, initialFrame);
    walk('R');
    assert.deepEqual([player(), left(), moves(), board()[28]], [27, 2, 1, 3]);
    assert.notDeepEqual(game.framebufferRGBA, initialFrame);
    undo();
    assert.deepEqual(board(), initialBoard);
    assert.deepEqual(game.framebufferRGBA, initialFrame);

    for (const [i, route] of routes.entries()) {
      assert.deepEqual([mode(), level(), moves()], [0, i + 1, 0]);
      walk(route);
      assert.deepEqual([mode(), left(), moves()], [i === 3 ? 2 : 1, 0, route.length]);
      assert.ok(board().every((cell) => cell !== 2 && cell !== 3 && cell !== 6));
      if (i === 0) {
        const cleared = game.framebufferRGBA.slice();
        undo();
        assert.deepEqual([mode(), left(), moves()], [0, 1, 3]);
        walk('R');
        assert.deepEqual(game.framebufferRGBA, cleared);
      }
      start();
    }
    ticks(50);
    assert.deepEqual(board(), initialBoard);
    assert.deepEqual(game.framebufferRGBA, initialFrame);

    walk('LR'.repeat(20));
    assert.deepEqual([moves(), history()], [40, 32]);
    for (let i = 0; i < 33; i++) undo();
    assert.deepEqual([player(), moves(), history()], [26, 8, 0]);
    start();
    ticks(50);
    assert.deepEqual([moves(), history()], [0, 0]);
    assert.deepEqual(game.framebufferRGBA, initialFrame);
  } finally {
    game.close();
  }
});
