import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GnexRuntime } from '../web/engine/gnex.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url));
const firmware = read('web/data/firmware/Kingston-2.12.rom');
const cartridge = read('demos/gb/geometrix/GEOM.GBC');
const demo = read('web/data/games/demo-geometrix.sgs');

function variables(game) {
  const base = game.sgs.variables.findIndex(
    ([, n], i) => n === 8192 && game.sgs.variables[i + 1]?.[1] === 16384,
  );
  const sram = game.sgs.variables.findIndex(([, n], i) => i > base && n === 2048) - base;
  assert.ok(base >= 0 && sram > 0);
  return {
    sram,
    value: (i, offset = 0) => game.cpu.read32(game.varAddresses[base + i] + 4 * offset) >>> 0,
  };
}

function visibleCells(game) {
  const frame = game.framebufferRGBA;
  let visible = 0;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      let colored = 0;
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const i = ((16 + row * 16 + y) * 220 + 46 + col * 16 + x) * 4;
          const r = frame[i];
          const g = frame[i + 1];
          const b = frame[i + 2];
          if (Math.max(r, g, b) - Math.min(r, g, b) > 48) colored++;
        }
      }
      if (colored >= 60) visible++;
    }
  }
  return visible;
}

test('Geometrix draws the full GDMA board, swaps and rotates, and resumes from the raster pause', async () => {
  const game = await GnexRuntime.create(firmware, demo, { profile: 'kpex' });
  const { sram, value } = variables(game);
  let ticks = 0;
  const tick = () => {
    game.event('TIMEOUT', 0);
    ticks++;
    assert.equal(game.status, 'idle', game.diagnostics.error);
    assert.equal(value(22), 0);
  };
  const until = (condition, limit, message) => {
    for (let i = 0; i < limit && !condition(); i++) tick();
    assert.ok(condition(), `${message} at t${ticks}`);
  };
  const tap = (key) => {
    game.setKey(key, true);
    game.setKey(key, false);
  };
  const orientation = () => value(2, 0x7cb);
  const column = () => value(2, 0x7cc);
  const row = () => value(2, 0x7cd);
  const shape = (i) => value(2, 0x5a1 + i);
  const fullyDrawn = () => value(19) === 0x8a && visibleCells(game) === 64;
  const rasterCount = () => new Set(Array.from({ length: 144 }, (_, y) => value(sram + 9, y))).size;
  const settle = (frames) => {
    for (let i = 0; i < frames; i++) tick();
  };

  try {
    game.event('START');
    assert.deepEqual(Buffer.from(game.vfs.files.get('geom.gbc')), cartridge);
    until(() => ticks === 155, 155, 'title');
    const save = Buffer.from(game.vfs.files.get('geom.sav'));
    assert.equal(save.length, 8192);
    assert.equal(save.subarray(0, 16).toString('ascii'), 'ANTONIO 02112015');
    tap(21);
    until(fullyDrawn, 195, 'all 64 cells appear within the launch budget');
    settle(20);

    const previous = column();
    tap(17);
    until(() => column() === previous + 1, 110, 'Right moves the cursor');
    settle(20);

    const a = row() * 8 + column();
    const b = a + (orientation() ? 1 : 8);
    const [first, second] = [shape(a), shape(b)];
    assert.notEqual(first, second);
    tap(20);
    until(() => shape(a) === second && shape(b) === first, 125, 'Select swaps two figures');
    settle(25);

    const direction = orientation();
    tap(10);
    until(() => orientation() === (direction ^ 1), 125, 'Esc rotates the cursor');
    settle(25);
    tap(21);
    until(
      () => value(sram + 6) === 64 && rasterCount() === 2 && visibleCells(game) < 48,
      150,
      'Play draws the pause panel',
    );
    tap(21);
    until(
      () => value(sram + 6) === 0 && rasterCount() === 1 && fullyDrawn(),
      150,
      'Play restores the field',
    );
  } finally {
    game.close();
  }
});

test('Geometrix reloads all eight KiB of a cartridge save, including the high-score bytes', async () => {
  const original = Buffer.alloc(8192);
  original.write('ANTONIO 02112015', 'ascii');
  original.set([0x34, 0x12], 16);
  original[70] = 0x46;
  const game = await GnexRuntime.create(firmware, demo, {
    profile: 'kpex',
    saveData: { version: 1, files: { 'geom.sav': original.toString('base64') } },
  });
  try {
    game.event('START');
    assert.equal(game.status, 'idle', game.diagnostics.error);
    const { sram, value } = variables(game);
    const loaded = Buffer.alloc(8192);
    for (let i = 0; i < 2048; i++) loaded.writeUInt32LE(value(sram, i), i * 4);
    assert.deepEqual(loaded, original);
  } finally {
    game.close();
  }
});
