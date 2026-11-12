import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GnexRuntime } from '../web/engine/gnex.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url));

test('Petris invalidates cached background rows and restores pixels under moving sprites', async () => {
  const game = await GnexRuntime.create(
    read('web/data/firmware/Kingston-2.12.rom'),
    read('web/data/games/demo-petris.sgs'),
    { profile: 'kpex' },
  );
  try {
    game.event('START');
    assert.equal(game.status, 'idle', game.error);
    const base = game.sgs.variables.findIndex(
      (v, i) => v[1] === 8193 && game.sgs.variables[i + 1]?.[1] === 8192,
    );
    assert(base >= 0);
    assert.equal(game.sgs.variables[base + 35][1], 144);
    const set = (slot, value, index = 0) =>
      game.cpu.write32(game.varAddresses[base + slot] + index * 4, value >>> 0);
    const vram = Buffer.alloc(16384);
    const pattern = (tile, planes) => {
      for (let row = 0; row < 8; row++) vram.writeUInt32LE(planes >>> 0, tile * 32 + row * 4);
    };
    const names = (value) => {
      for (let i = 0; i < 32 * 28; i++) vram.writeUInt16LE(value, 0x3800 + i * 2);
    };
    const scene = () => {
      game.cpu.write(game.varAddresses[base + 2], vram);
      set(28, 1); // A new VDP snapshot is ready.
      for (let i = 0; i < 4; i++) {
        game.event('TIMEOUT', 0);
        assert.equal(game.status, 'idle', game.error);
        assert.equal(game.cpu.read32(game.varAddresses[base + 13]), 0);
      }
    };
    const pixel = (x, y) => {
      const offset = ((y + 16) * 220 + x + 30) * 4;
      return [...game.framebufferRGBA.subarray(offset, offset + 3)];
    };
    const red = [255, 0, 0],
      green = [0, 255, 0],
      blue = [0, 0, 255],
      black = [0, 0, 0];
    // Hold the guest CPU in HALT with interrupts disabled. The shipped VDP,
    // snapshot scheduler and SGS renderer still execute through TIMEOUT.
    set(46, 0);
    set(47, 0);
    set(48, 0);
    set(50, 1);
    set(30, 192);
    set(31, 0);
    set(29, 0);
    set(21, 0x3800);
    set(4, 0, 0);
    set(4, 64, 1);
    set(4, 0x7e, 5);
    set(4, 0, 6);
    set(4, 0, 8);
    set(4, 0, 9);
    game.cpu.write(game.varAddresses[base + 35], Buffer.alloc(144 * 4));
    set(36, 0);
    for (let i = 0; i < 32; i++) set(3, 0, i);
    set(3, 0x00f, 1);
    set(3, 0xf00, 2);
    set(3, 0x0f0, 3);
    set(3, 0x0f0, 17);
    set(3, 0xf00, 18);
    pattern(1, 0xff);
    pattern(2, 0xff00);
    names(1);
    vram[0x3f00] = 208;
    scene();
    assert.deepEqual(pixel(16, 8), red);
    scene();
    assert.deepEqual(pixel(16, 8), red);
    // Palette changes must affect cached indices without rebuilding geometry.
    set(3, 0x0f0, 1);
    scene();
    assert.deepEqual(pixel(16, 8), green);
    set(3, 0x00f, 1);
    pattern(1, 0xffff);
    scene();
    assert.deepEqual(pixel(16, 8), green);
    pattern(1, 0xff);
    names(2);
    scene();
    assert.deepEqual(pixel(16, 8), blue);
    names(1 | 2048);
    scene();
    assert.deepEqual(pixel(16, 8), green);
    names(1);
    vram[0x3f00] = 31;
    vram[0x3f01] = 208;
    vram[0x3f80] = 64;
    vram[0x3f81] = 2;
    scene();
    assert.deepEqual(pixel(16, 8), blue);
    vram[0x3f80] = 80;
    scene();
    assert.deepEqual(pixel(16, 8), red);
    assert.deepEqual(pixel(32, 8), blue);
    names(1 | 4096);
    scene();
    assert.deepEqual(pixel(32, 8), red);
    names(1);
    scene();
    assert.deepEqual(pixel(32, 8), blue);
    vram[0x3f00] = 208;
    scene();
    assert.deepEqual(pixel(32, 8), red);
    pattern(3, 0x0f);
    names(3);
    scene();
    assert.deepEqual(pixel(0, 0), black);
    assert.deepEqual(pixel(7, 0), red);
    names(3 | 512);
    scene();
    assert.deepEqual(pixel(0, 0), red);
    assert.deepEqual(pixel(7, 0), black);
    for (let row = 0; row < 8; row++) vram.writeUInt32LE(row === 0 ? 0xff : 0xff00, 128 + row * 4);
    names(4);
    scene();
    assert.deepEqual(pixel(0, 0), red);
    assert.deepEqual(pixel(0, 7), blue);
    names(4 | 1024);
    scene();
    assert.deepEqual(pixel(0, 0), blue);
    assert.deepEqual(pixel(0, 7), red);
  } finally {
    game.close();
  }
});
