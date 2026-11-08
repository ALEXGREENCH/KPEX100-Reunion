import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GnexRuntime } from '../web/engine/gnex.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url));
const firmware = read('web/data/firmware/Kingston-2.12.rom');
const demo = read('web/data/games/demo-coil-runner.sgs');
const cartridge = read('demos/gg/coil-runner.gg');
const controls = { L: 16, R: 17, J: 20 };
const waitVBlank = cartridge.indexOf(Buffer.from([0xdb, 0xbf, 0xe6, 0x80, 0x28, 0xfa, 0xc9]));

test('Coil Runner clears three sectors with jumps, batteries, and a checkpoint', async () => {
  assert.equal(cartridge.length, 32768);
  assert.deepEqual(
    demo.subarray(-cartridge.length).map((byte) => byte ^ 0xa5),
    cartridge,
  );
  const game = await GnexRuntime.create(firmware, demo, { profile: 'kpex' });
  const base = game.sgs.variables.findIndex(([, count]) => count === 8192);
  const ram = game.varAddresses[base];
  const readVar = (index) => game.cpu.read32(game.varAddresses[base + index]) >>> 0;
  const pc = () => readVar(18);
  const peek = (offset) => game.cpu.read32(ram + (0x1000 + offset) * 4) & 255;
  const mode = () => peek(0);
  const level = () => peek(1);
  const position = () => [peek(4), peek(5)];
  const charge = () => peek(12);
  const steps = () => peek(19);
  const cell = (x, y) => game.cpu.read32(ram + (y * 32 + x) * 4) & 255;
  const tick = () => {
    game.event('TIMEOUT', 0);
    assert.equal(game.status, 'idle', game.error);
    assert.equal(game.timerStates[0].delay, 20);
  };
  const until = (condition, limit, message) => {
    for (let i = 0; i < limit && !condition(); i++) tick();
    assert.ok(condition(), message);
  };
  let held;
  const input = (code) => {
    if (held === code) return;
    if (held !== undefined) game.setKey(held, false);
    held = code;
    if (held !== undefined) game.setKey(held, true);
  };
  const drive = (action) => {
    input(controls[action]);
    let previous = steps();
    let physics = false;
    until(
      () => {
        const now = steps();
        if (now > previous && now === 5) physics = true;
        previous = now;
        return physics && pc() === waitVBlank;
      },
      25,
      `physics stalled on ${action} at ${position()}`,
    );
  };
  const walk = (actions) => {
    for (const action of actions) drive(action);
  };
  const initialized = (n) =>
    level() === n &&
    mode() === 0 &&
    peek(4) === 8 &&
    charge() === 2 &&
    steps() === 5 &&
    pc() === waitVBlank;
  const start = (n) => {
    input(21);
    until(() => peek(23) === 1, 20, 'Start did not arrive');
    input();
    until(() => initialized(n), 160, `sector ${n} did not load`);
  };

  try {
    assert.ok(waitVBlank >= 0);
    game.event('START');
    assert.deepEqual(game.vfs.diagnostics.files, ['coil.ggr']);
    assert.equal(game.vfs.diagnostics.openHandles, 0);
    until(() => initialized(1), 160, 'first sector did not load');
    walk('RR');
    assert.deepEqual([position(), charge(), cell(10, 15)], [[10, 15], 1, 0]);
    drive('J');
    assert.deepEqual([position(), peek(16), peek(17)], [[11, 14], 2, 0]);
    walk('.......');
    assert.deepEqual(position(), [17, 15]);
    walk('LL');
    assert.deepEqual([position(), peek(27), cell(15, 15)], [[15, 15], 1, 6]);
    walk('LL..');
    assert.deepEqual([position(), charge(), peek(26), peek(16)], [[15, 15], 1, 1, 0]);
    walk('RJRRRRRRRRR');
    assert.deepEqual([mode(), charge(), cell(24, 15)], [1, 0, 8]);

    start(2);
    let springApex = false;
    for (const action of 'RRRRRLLLRJRRRRRRRRRRRLRR') {
      drive(action);
      if (peek(17) === 1 && peek(5) === 10) springApex = true;
    }
    assert.ok(springApex);
    assert.deepEqual([mode(), charge(), peek(26)], [1, 0, 0]);

    start(3);
    walk('RRJRRRRJRRRRRRRRRRR');
    assert.deepEqual([mode(), charge(), peek(26)], [2, 0, 0]);
    start(1);
    assert.deepEqual([position(), charge(), peek(26), peek(27)], [[8, 15], 2, 0, 0]);
  } finally {
    game.close();
  }
});
