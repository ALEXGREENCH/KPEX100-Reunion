import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GnexRuntime } from '../web/engine/gnex.js';
import { SgsFile } from '../web/engine/sgs.js';

const data = (path) => readFileSync(new URL(`../web/data/${path}`, import.meta.url));
const rom = data('firmware/Kingston-2.12.rom');
const sgs = data('games/demo-orbital-courier.sgs');
const neon = data('games/demo-neon-ranger.sgs');
const lan = data('games/demo-lan-master.sgs');
const NES_HEADER_LENGTH = 16;
const NROM_128_PRG_LENGTH = 16384;
const CHR_LENGTH = 8192;
const CART_LENGTH = NES_HEADER_LENGTH + NROM_128_PRG_LENGTH + CHR_LENGTH;

test('Orbital Courier boots its iNES file, blocks debris, links three beacons, and restarts', async () => {
  const game = await GnexRuntime.create(rom, sgs, { profile: 'kpex' });
  const ticks = (count) => {
    for (let i = 0; i < count; i++) {
      game.event('TIMEOUT', 0);
      assert.equal(game.status, 'idle', game.diagnostics.error);
    }
  };
  const pixel = (col, row, dx = 3, dy = 0) => {
    const x = 6 + (col - 3) * 8 + dx;
    const y = 8 + (row - 5) * 8 + dy;
    return Array.from(game.framebufferRGBA.subarray((y * 220 + x) * 4, (y * 220 + x) * 4 + 4));
  };
  const tap = (code, count = 1) => {
    for (let i = 0; i < count; i++) {
      game.setKey(code, true);
      game.setKey(code, false);
      ticks(3);
    }
  };
  try {
    game.event('START');
    assert.equal(game.sgs.xorMask, 0xa5);
    assert.deepEqual(game.vfs.diagnostics.files, ['orbital.nes']);
    assert.equal(game.vfs.diagnostics.operations, 3);
    assert.equal(game.vfs.diagnostics.openHandles, 0);
    assert.equal(game.vfs.diagnostics.readonlyFiles, 1);
    const loading = game.framebufferRGBA.slice();
    ticks(20);
    assert.deepEqual(game.framebufferRGBA, loading);
    ticks(55);
    const initialFrame = game.framebufferRGBA.slice();
    const ship = [213, 218, 230, 255];
    const meters = () => [23, 25, 27].map((col) => pixel(col, 23, 3, 3));
    const empty = meters();
    assert.deepEqual(pixel(6, 15), ship);
    assert.notDeepEqual(pixel(7, 15), ship);

    tap(17);
    assert.deepEqual(pixel(7, 15), ship);
    tap(16);
    assert.deepEqual(game.framebufferRGBA, initialFrame);
    tap(17, 3);
    ticks(12);
    assert.deepEqual(pixel(9, 15), ship);
    const first = meters();
    assert.notDeepEqual(first[0], empty[0]);
    assert.deepEqual(first.slice(1), empty.slice(1));

    tap(17, 3);
    assert.deepEqual(pixel(12, 15), ship);
    tap(17);
    assert.deepEqual(pixel(12, 15), ship);
    assert.notDeepEqual(pixel(13, 15), ship);
    for (const [key, count, x, y] of [
      [18, 3, 12, 12],
      [17, 4, 16, 12],
      [19, 3, 16, 15],
      [19, 3, 16, 18],
      [17, 6, 22, 18],
      [18, 3, 22, 15],
    ]) {
      tap(key, count);
      assert.deepEqual(pixel(x, y), ship);
    }
    ticks(12);
    assert.deepEqual(meters(), [first[0], first[0], first[0]]);
    tap(17);
    assert.deepEqual(pixel(22, 15), ship);
    assert.notDeepEqual(pixel(23, 15), ship);
    tap(20);
    ticks(75);
    assert.deepEqual(game.framebufferRGBA, initialFrame);
  } finally {
    game.close();
  }
});

test('Orbital Courier closes an unsupported mapper cartridge without starting a timer', async () => {
  const incompatible = Buffer.from(sgs);
  const cart = new SgsFile(incompatible).body.subarray(-CART_LENGTH);
  assert.equal(Buffer.from(cart.subarray(0, 4)).toString(), 'NES\x1a');
  assert.equal(cart[6] & 0x10, 0);
  incompatible[incompatible.length - CART_LENGTH + 6] ^= 0x10;
  const game = await GnexRuntime.create(rom, incompatible, { profile: 'kpex' });
  try {
    game.event('START');
    assert.equal(game.status, 'idle');
    assert.equal(game.vfs.diagnostics.operations, 3);
    assert.equal(game.vfs.diagnostics.openHandles, 0);
    assert.equal(game.timerStates[0].delay, null);
  } finally {
    game.close();
  }
});

test('Neon Ranger boots the unmodified independent cartridge, walks, jumps and lands', async () => {
  const cartridge = readFileSync(new URL('../demos/nes/neon-ranger/NEON.NES', import.meta.url));
  assert.deepEqual(
    neon.subarray(-cartridge.length).map((byte) => byte ^ 0xa5),
    cartridge,
  );
  const game = await GnexRuntime.create(rom, neon, { profile: 'kpex' });
  const ticks = (count) => {
    for (let i = 0; i < count; i++) {
      game.event('TIMEOUT', 0);
      assert.equal(game.status, 'idle', game.diagnostics.error);
      assert.equal(game.timerStates[0].delay, 20);
    }
  };
  const changedBounds = (before, after) => {
    const bounds = [220, 176, -1, -1];
    for (let i = 0; i < 220 * 176; i++) {
      const p = i * 4;
      if (
        before[p] === after[p] &&
        before[p + 1] === after[p + 1] &&
        before[p + 2] === after[p + 2]
      )
        continue;
      const x = i % 220;
      const y = Math.floor(i / 220);
      bounds[0] = Math.min(bounds[0], x);
      bounds[1] = Math.min(bounds[1], y);
      bounds[2] = Math.max(bounds[2], x);
      bounds[3] = Math.max(bounds[3], y);
    }
    return bounds;
  };
  try {
    game.event('START');
    assert.deepEqual(game.vfs.diagnostics.files, ['neon.nes']);
    assert.equal(game.vfs.diagnostics.operations, 3);
    assert.equal(game.vfs.diagnostics.openHandles, 0);
    ticks(130);
    const start = game.framebufferRGBA.slice();

    game.setKey(17, true);
    ticks(20);
    game.setKey(17, false);
    ticks(2);
    const walk = game.framebufferRGBA.slice();
    assert.deepEqual(changedBounds(start, walk), [105, 124, 129, 135]);

    game.setKey(20, true);
    ticks(5);
    const jump = game.framebufferRGBA.slice();
    assert.deepEqual(changedBounds(walk, jump), [120, 112, 130, 135]);
    game.setKey(20, false);
    ticks(45);
    assert.deepEqual(game.framebufferRGBA, walk);
  } finally {
    game.close();
  }
});

test('Lan Master keeps short presses through its three controller reports', async () => {
  const cart = readFileSync(new URL('../demos/nes/lan-master/LAN.NES', import.meta.url));
  assert.deepEqual(
    lan.subarray(-cart.length).map((byte) => byte ^ 0xa5),
    cart,
  );
  const game = await GnexRuntime.create(rom, lan, { profile: 'kpex' });
  const frameHash = () => createHash('sha256').update(game.framebufferRGBA).digest('hex');
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
    game.event('START');
    assert.deepEqual(game.vfs.diagnostics.files, ['lan.nes']);
    assert.equal(game.vfs.diagnostics.openHandles, 0);
    assert.equal(game.vfs.diagnostics.operations, 3);
    ticks(155);
    game.setKey(21, true);
    ticks(3);
    game.setKey(21, false);
    ticks(265);
    assert.equal(frameHash(), '75dcdcded97e5688725d6b252153693b5fd389521354695275c644e5e2c187e2');

    tap(17);
    ticks(24);
    assert.equal(frameHash(), '450c0c310f5384878bf7545a6ee8f75bdae3d51d0db6032278b55e4941b274e0');
    tap(20);
    ticks(20);
    assert.equal(frameHash(), '46c481098306b1214b173a2554fd63a383dd87bc268a35979ae03ff0b0a8dc23');

    game.setKey(20, true);
    ticks(16);
    game.setKey(20, true);
    ticks(16);
    game.setKey(20, false);
    ticks(20);
    assert.equal(frameHash(), '4911146b32ee7f635f2bfacfea4117991ea141acc3f613023da5bf86747a9f8e');
    tap(20);
    ticks(20);
    assert.equal(frameHash(), 'e9dd3fb1a5633dff8236088f5d6ebd2692a8ea2d2a631cb6d38d2dd03a57a395');
  } finally {
    game.close();
  }
});
