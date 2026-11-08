import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GnexRuntime } from '../web/engine/gnex.js';
import { SgsFile } from '../web/engine/sgs.js';

const read = (path) => readFileSync(new URL(path, import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('Zooming Secretary displays the office and walks in both directions', async () => {
  const cart = read('../demos/nes/zooming-secretary/ZOOM.NES');
  const bytes = read('../web/data/games/demo-zooming-secretary.sgs');
  const firmware = read('../web/data/firmware/Kingston-2.12.rom');
  assert.equal(hash(cart), '315adee10052367298959d55256e9f2621381da9f7c839f50832e13516b61770');
  const script = new SgsFile(bytes);
  assert.equal(script.xorMask, 0xa5);
  assert.deepEqual(script.body.subarray(-cart.length), cart);
  const game = await GnexRuntime.create(firmware, bytes, { profile: 'kpex' });

  const base = script.variables.findIndex(
    (entry, i) => entry[1] === 10245 && script.variables[i + 1]?.[1] === 2048,
  );
  assert.ok(base >= 0, 'NROM ROM and RAM arrays');
  const guest = (variable, offset = 0) =>
    game.cpu.read32(game.varAddresses[base + variable] + offset * 4) >>> 0;
  // The first 24 OAM entries mask the right border. The secretary follows.
  const player = () => [guest(4, 99), guest(4, 96)];
  // The original game increments ring_cnt on every office frame.
  const officeFrame = () => guest(1, 0x6ec) | (guest(1, 0x6ed) << 8);
  const tick = () => {
    game.event('TIMEOUT', 0);
    assert.equal(game.status, 'idle', game.diagnostics.error);
    assert.equal(guest(41), 0, '6502 opcode failure');
  };
  const ticks = (count) => {
    for (let i = 0; i < count; i++) tick();
  };
  const until = (check, limit, failure) => {
    for (let i = 0; i < limit && !check(); i++) tick();
    assert.ok(check(), failure);
  };
  const hold = (key, count) => {
    game.setKey(key, true);
    ticks(count);
    game.setKey(key, false);
  };

  try {
    game.event('START');
    assert.deepEqual(game.vfs.diagnostics.files, ['zoom.nes']);
    assert.equal(game.vfs.diagnostics.operations, 3);
    assert.equal(game.vfs.diagnostics.openHandles, 0);
    assert.equal(game.timerStates[0].delay, 20);
    until(() => guest(45) === 1, 130, 'first complete title repaint');
    ticks(10);
    assert.equal(
      hash(game.framebufferRGBA),
      'd2958966ade415e66c5918e8bd049ac028db629e2a42efde6af12bf57e6704ee',
    );

    hold(21, 16);
    until(
      () => officeFrame() === 12 && guest(12) === 0x8315,
      480,
      'Day 1 office at its frame wait',
    );
    assert.deepEqual(player(), [120, 151]);
    // This includes the full office, ladders, cabinets, floor, and legible HUD.
    assert.equal(
      hash(game.framebufferRGBA),
      '874c6b9fc1262c62a501b12bfbd98bba146a77df43cefe031fb6489b522ce610',
    );

    hold(17, 40);
    ticks(4);
    const right = player();
    assert.equal(right[1], 151);
    assert.ok(right[0] >= 133, 'secretary walks right');
    hold(16, 40);
    ticks(4);
    const left = player();
    assert.equal(left[1], 151);
    assert.ok(left[0] < right[0], 'secretary walks back left');
  } finally {
    game.close();
  }
});
