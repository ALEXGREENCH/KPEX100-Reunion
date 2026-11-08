import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GnexRuntime } from '../web/engine/gnex.js';

const rom = fs.readFileSync(new URL('../web/data/firmware/Kingston-2.12.rom', import.meta.url));
const call = (id) => [146, id];
const push = (value) => [5, value];

// Original ARM executes these small, authored SGS event handlers. No historical
// game file or saved framebuffer is needed to exercise Save/Flush/Restore order.
function script(start, timeout = [255], keypress = [255]) {
  const code = [...start, ...timeout, ...keypress];
  const a = 128 + code.length * 2;
  const b = a + 10 * 8;
  const c = b + 10 * 4;
  const body = new Uint8Array(c);
  const view = new DataView(body.buffer);
  body[0] = 4;
  view.setUint32(28, 128, true);
  view.setUint32(36, 128 + start.length * 2, true);
  view.setUint32(40, 128 + (start.length + timeout.length) * 2, true);
  [a, b, c, c].forEach((value, i) => view.setUint32(72 + i * 4, value, true));
  view.setUint32(120, c, true);
  code.forEach((value, i) => view.setUint16(128 + i * 2, value, true));
  for (let i = 0; i < 10; i++) {
    view.setUint16(a + i * 8, 1, true);
    view.setUint16(a + i * 8 + 2, 1, true);
  }
  return body;
}

function pixel(game, x, y) {
  const i = (y * game.width + x) * 4;
  return [...game.framebufferRGBA.subarray(i, i + 4)];
}

test('Flush presents before RestoreLCD and persists through later unflushed events', async () => {
  const g = await GnexRuntime.create(
    rom,
    script([...call(0x3a), ...call(0x51), ...call(0x3b), ...call(0x5f), ...call(0x52), 255]),
    { width: 64, height: 64 },
  );
  try {
    g.event('START');
    assert.equal(g.status, 'idle', g.error);
    assert.equal(
      g.cpu.read32(g.cpu.read32(0x20b41260)),
      0xffffffff,
      'backbuffer restored to white',
    );
    assert.deepEqual(pixel(g, 0, 0), [0, 0, 0, 255], 'presented screen remains black');
    g.event('KEYPRESS', 20);
    g.event('TIMEOUT');
    assert.deepEqual(
      pixel(g, 63, 63),
      [0, 0, 0, 255],
      'no implicit presentation on an empty event',
    );
  } finally {
    g.close();
  }
});

test('FlushPartial presents its endpoint rectangle and retains pixels outside it', async () => {
  const g = await GnexRuntime.create(
    rom,
    script(
      [...call(0x3a), ...call(0x51), ...call(0x5f), 255],
      [...call(0x3b), ...[1, 2, 3, 4].flatMap(push), ...call(0x60), ...call(0x52), 255],
      [...call(0x3b), 255],
    ),
    { width: 64, height: 64 },
  );
  try {
    g.event('START');
    g.event('TIMEOUT');
    assert.equal(g.status, 'idle', g.error);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const color = x >= 1 && x <= 3 && y >= 2 && y <= 4 ? 0 : 255;
        assert.deepEqual(pixel(g, x, y), [color, color, color, 255], `pixel ${x},${y}`);
      }
    }
    const frame = g.framebuffer;
    const presented = g.framebufferRGBA.slice();
    g.event('KEYPRESS', 20);
    assert.equal(g.status, 'idle', g.error);
    assert.deepEqual(g.framebufferRGBA, presented, 'unflushed drawing stays in the backbuffer');
    assert.equal(g.framebuffer, frame, 'unflushed drawing keeps the presented image');
  } finally {
    g.close();
  }
});

test('first partial flush normalizes and clips endpoints; offscreen updates preserve the screen', async () => {
  const g = await GnexRuntime.create(
    rom,
    script(
      [...call(0x3a), ...[66, 66, 63, 63].flatMap(push), ...call(0x60), ...call(0x3b), 255],
      [255],
      [...call(0x3a), ...[70, 70, 90, 90].flatMap(push), ...call(0x60), 255],
    ),
    { width: 64, height: 64 },
  );
  try {
    const initial = g.framebufferRGBA.slice();
    g.event('START');
    assert.equal(g.status, 'idle', g.error);
    const expected = initial.slice();
    expected.set([255, 255, 255, 255], (64 * 64 - 1) * 4);
    assert.deepEqual(g.framebufferRGBA, expected, 'only the clipped inclusive corner is presented');
    const frame = g.framebuffer;
    g.event('KEYPRESS', 20);
    assert.equal(g.status, 'idle', g.error);
    assert.deepEqual(g.framebufferRGBA, expected, 'fully offscreen partial flush has no effect');
    assert.equal(g.framebuffer, frame, 'fully offscreen partial flush reuses the image');
  } finally {
    g.close();
  }
});

test('drawing without Flush does not present a frame', async () => {
  const g = await GnexRuntime.create(rom, script([...call(0x3a), 255]), { width: 64, height: 64 });
  try {
    const initial = g.framebufferRGBA.slice();
    g.event('START');
    assert.equal(g.status, 'idle', g.error);
    assert.equal(g.cpu.read32(g.cpu.read32(0x20b41260)), 0xffffffff);
    assert.deepEqual(g.framebufferRGBA, initial);
  } finally {
    g.close();
  }
});
