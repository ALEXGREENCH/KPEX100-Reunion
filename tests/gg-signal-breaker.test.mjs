import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GnexRuntime } from '../web/engine/gnex.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url));
const firmware = read('web/data/firmware/Kingston-2.12.rom');
const demo = read('web/data/games/demo-signal-breaker.sgs');
const cartridge = read('demos/gg/signal-breaker.gg');

test('Signal Breaker serves, loses a ball, clears all eight nodes, and restarts', async () => {
  assert.equal(cartridge.length, 32768);
  assert.deepEqual(
    demo.subarray(-cartridge.length).map((byte) => byte ^ 0xa5),
    cartridge,
  );
  const game = await GnexRuntime.create(firmware, demo, { profile: 'kpex' });
  const ram = game.varAddresses[game.sgs.variables.findIndex(([, count]) => count === 8192)];
  const peek = (address) => game.cpu.read32(ram + (address & 8191) * 4) & 255;
  const paddle = () => peek(0xd000);
  const mode = () => peek(0xd001);
  const ball = () => [peek(0xd004), peek(0xd005)];
  const falling = () => peek(0xd009) === 1;
  const lives = () => peek(0xd00d);
  const hits = () => peek(0xd00e);
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
  const tap = (code, count = 1) => {
    game.setKey(code, true);
    ticks(count);
    game.setKey(code, false);
  };
  const steer = (target) => {
    const key = paddle() > target ? 16 : 17;
    game.setKey(key, true);
    until(() => paddle() === target, 50, `paddle did not reach ${target}`);
    game.setKey(key, false);
  };
  const tileIsLit = (x, y) => {
    const frame = game.framebufferRGBA;
    const offset = ((16 + (y - 3) * 8 + 3) * 220 + 30 + (x - 6) * 8 + 3) * 4;
    return frame.subarray(offset, offset + 3).some((channel) => channel > 100);
  };
  const nodes = [
    [9, 7],
    [12, 7],
    [18, 7],
    [22, 7],
    [11, 8],
    [15, 8],
    [19, 8],
    [23, 8],
  ];
  try {
    game.event('START');
    assert.deepEqual(game.vfs.diagnostics.files, ['breaker.ggr']);
    assert.equal(game.vfs.diagnostics.operations, 3);
    assert.equal(game.vfs.diagnostics.openHandles, 0);
    ticks(90);
    const initial = game.framebufferRGBA.slice();
    assert.equal(paddle(), 15);
    assert.deepEqual(ball(), [16, 17]);
    assert.ok(nodes.every(([x, y]) => tileIsLit(x, y)));

    steer(13);
    ticks(2);
    assert.deepEqual(ball(), [14, 17]);
    assert.ok(tileIsLit(14, 17));
    assert.equal(tileIsLit(16, 17), false);
    steer(15);
    ticks(2);
    assert.deepEqual(game.framebufferRGBA, initial);

    tap(20);
    until(() => hits() === 1, 75, 'first serve missed the first node');
    assert.equal(tileIsLit(23, 8), false);
    until(() => lives() === 2, 100, 'a missed ball did not cost a life');
    assert.equal(mode(), 0);
    assert.deepEqual(ball(), [16, 17]);
    tap(21);
    ticks(95);
    assert.deepEqual(game.framebufferRGBA, initial);

    tap(20);
    until(() => hits() === 1, 75, 'second serve missed the first node');
    for (const target of [12, 11, 22, 12, 18, 8, 15, 17, 8, 22, 11, 10, 14, 9, 18]) {
      steer(target);
      until(falling, 150, 'ball did not come back down');
      until(() => !falling(), 120, 'paddle did not send the ball back up');
      assert.equal(lives(), 3);
    }
    until(() => mode() === 2, 150, 'last node did not finish the game');
    assert.equal(hits(), 8);
    ticks(8);
    assert.ok(nodes.every(([x, y]) => !tileIsLit(x, y)));
    tap(21);
    ticks(95);
    assert.deepEqual(game.framebufferRGBA, initial);

    game.setKey(20, true);
    game.setKey(17, true);
    game.setKey(20, false);
    ticks(14);
    assert.equal(mode(), 1);
    assert.ok(paddle() > 15, 'releasing A dropped the still-held Right input');
    game.setKey(17, false);
    const releasedAt = paddle();
    ticks(14);
    assert.equal(paddle(), releasedAt, 'Right remained active after release');
  } finally {
    game.close();
  }
});
