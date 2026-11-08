import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GnexRuntime } from '../web/engine/gnex.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url));

function viewportHash(game, rows) {
  const frame = game.framebufferRGBA;
  const pixels = new Uint8Array(160 * rows * 3);
  let destination = 0;
  for (let y = 16; y < 16 + rows; y++) {
    for (let x = 30; x < 190; x++) {
      const offset = (y * game.width + x) * 4;
      for (let c = 0; c < 3; c++) pixels[destination++] = frame[offset + c] >> 3;
    }
  }
  return createHash('sha256').update(pixels).digest('hex');
}

test('K32 draws its CGB title and HUD, then steers, shoots and uses a bomb', async () => {
  const game = await GnexRuntime.create(
    read('web/data/firmware/Kingston-2.12.rom'),
    read('web/data/games/demo-k32-super-rocket.sgs'),
    { profile: 'kpex' },
  );
  const base = game.sgs.variables.findIndex(
    ([, count], i) => count === 8192 && game.sgs.variables[i + 1]?.[1] === 16384,
  );
  const guest = (index, offset = 0) =>
    game.cpu.read32(game.varAddresses[base + index] + offset * 4);
  const shipX = () => guest(45, 1);
  const projectiles = () => [guest(45, 18), guest(45, 22), guest(45, 26)];
  const bombCountTile = () => guest(1, 0x1c65);
  let callbacks = 0;
  const advanceTo = (target) => {
    while (callbacks < target) {
      game.event('TIMEOUT', 0);
      callbacks++;
      assert.equal(game.status, 'idle', game.diagnostics.error);
      assert.equal(guest(22), 0, `guest opcode failure at callback ${callbacks}`);
    }
  };
  const hold = (key, duration) => {
    game.setKey(key, true);
    advanceTo(callbacks + duration);
    game.setKey(key, false);
  };
  const { play, right, select, esc } = { play: 21, right: 17, select: 20, esc: 10 };

  try {
    assert.ok(base >= 0);
    game.event('START');
    assert.deepEqual(
      Buffer.from(game.vfs.files.get('k32.gbc')),
      read('demos/gb/k32-super-rocket/K32.GBC'),
    );
    advanceTo(155);
    assert.equal(
      viewportHash(game, 144),
      '95d3bc768ee58a4a61a8d1ffa58bc1e4db55e853ea4818704123ade3df5e917b',
    );
    hold(play, 8);
    advanceTo(246);
    assert.equal(
      viewportHash(game, 144),
      '54b29aa65fb02a604dd97c4e9f3c1ea4f120fd990413c5b5a03e764baf4bc957',
    );
    hold(play, 8);
    advanceTo(399);
    assert.equal(guest(62), 72, 'intro reaches the lower story page');
    hold(play, 8);
    advanceTo(485);

    // These RGB555 HUD pixels match PyBoy 2.6.0 frame 492.
    assert.equal(
      viewportHash(game, 40),
      '1ebdf6cc80949c55f51462a88e8e6f829c2af40c93eddfc85da45248d88a1e8f',
    );
    assert.equal(shipX(), 16);
    assert.deepEqual(projectiles(), [0, 0, 0]);
    hold(right, 25);
    assert.ok(shipX() > 16);
    advanceTo(525);
    hold(select, 25);
    assert.ok(projectiles().includes(1), 'A creates a shot');
    advanceTo(573);

    const bombs = bombCountTile();
    game.setKey(esc, true);
    const deadline = callbacks + 50;
    while (callbacks < deadline && !projectiles().includes(3)) advanceTo(callbacks + 1);
    game.setKey(esc, false);
    assert.ok(projectiles().includes(3), 'B creates a bomb');
    advanceTo(callbacks + 16);
    assert.equal(bombCountTile(), bombs - 1);
  } finally {
    game.close();
  }
});
