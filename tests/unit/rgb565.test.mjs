import test from 'node:test';
import assert from 'node:assert/strict';
import { rgb565ToRGBA } from '../../web/engine/rgb565.js';

test('all 65536 RGB565 colors preserve exact original GNEX channel scaling', () => {
  const source = new Uint8Array(65536 * 2);
  const expected = new Uint8ClampedArray(65536 * 4);
  for (let color = 0; color < 65536; color++) {
    source[color * 2] = color & 255;
    source[color * 2 + 1] = color >>> 8;
    expected[color * 4] = Math.floor(((color >>> 11) * 255) / 31);
    expected[color * 4 + 1] = Math.floor((((color >>> 5) & 63) * 255) / 63);
    expected[color * 4 + 2] = Math.floor(((color & 31) * 255) / 31);
    expected[color * 4 + 3] = 255;
  }
  assert.deepEqual(rgb565ToRGBA(source), expected);
});

test('little-endian pixels respect aligned and unaligned input views', () => {
  for (const offset of [1, 2]) {
    const storage = new Uint8Array(offset + 7).fill(0x77);
    storage.set([0x00, 0xf8, 0xe0, 0x07, 0x1f, 0x00], offset);
    const before = storage.slice();
    const source = storage.subarray(offset, offset + 6);
    assert.deepEqual([...rgb565ToRGBA(source)], [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
    assert.deepEqual(storage, before);
  }
});

test('frames own their storage across input changes, later frames and transfer', () => {
  const source = Uint8Array.of(0xff, 0xff);
  const first = rgb565ToRGBA(source);
  const transferred = structuredClone(first, { transfer: [first.buffer] });
  source.fill(0);
  const second = rgb565ToRGBA(source);
  assert.equal(first.byteLength, 0);
  assert.deepEqual([...transferred], [255, 255, 255, 255]);
  assert.deepEqual([...second], [0, 0, 0, 255]);
  assert.notEqual(second.buffer, transferred.buffer);
});

test('empty buffers are valid and partial pixels or non-byte arrays are rejected', () => {
  assert.equal(rgb565ToRGBA(new Uint8Array()).byteLength, 0);
  for (const source of [Uint8Array.of(0), new Uint16Array(2), [0, 0], null])
    assert.throws(() => rgb565ToRGBA(source), TypeError);
});
