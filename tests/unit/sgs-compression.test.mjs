import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { SgsFile, SgsError } from '../../web/engine/sgs.js';

function compressedScript() {
  const media = 168;
  const resource = new Uint8Array(256).fill(42);
  const zlib = deflateSync(resource.subarray(18));
  const raw = new Uint8Array(media + 18 + zlib.length + 1);
  raw[0] = 4;
  raw[26] = 2;
  const header = new DataView(raw.buffer);
  for (const [offset, value] of [
    [28, 128],
    [72, 144],
    [76, 152],
    [80, 156],
    [84, media],
    [108, media + resource.length],
    [120, raw.length],
    [160, resource.length],
  ])
    header.setUint32(offset, value, true);
  header.setUint16(146, 1, true);
  raw.set(resource.subarray(0, 18), media);
  raw.set(zlib, media + 18);
  raw[raw.length - 1] = 0xff;
  return { raw, resource };
}

test('GNEX v4 type 2 retains original bytes and expands resources before parsing', async () => {
  const { raw, resource } = compressedScript();
  const wrapper = new Uint8Array(32 + raw.length);
  wrapper[0] = 32;
  wrapper.set(
    raw.map((x) => x ^ 165),
    32,
  );
  const before = wrapper.slice();
  const file = await SgsFile.open(wrapper);
  assert.equal(file.xorMask, 165);
  assert.equal(file.wrapperBytes, 32);
  assert.equal(file.declaredSize, 168 + resource.length);
  assert.deepEqual(file.resource(0).data, resource);
  assert.deepEqual(wrapper, before);
});

test('GNEX v4 type 2 rejects forged sizes, invalid trailers and corrupt deflate', async () => {
  const { raw } = compressedScript();
  for (const expandedSize of [0xc00001, 280, 425]) {
    const copy = raw.slice();
    new DataView(copy.buffer).setUint32(108, expandedSize, true);
    await assert.rejects(SgsFile.open(copy), SgsError);
  }
  await assert.rejects(SgsFile.open(raw.subarray(0, -1)), /compression layout/);
  const corrupt = raw.slice();
  corrupt[corrupt.length - 2] ^= 1; // Damage the zlib Adler-32.
  await assert.rejects(SgsFile.open(corrupt), /zlib stream/);
});
