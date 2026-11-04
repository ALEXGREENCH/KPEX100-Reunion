import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { SgsFile } from '../web/engine/sgs.js';
import { initSmaf, renderSmaf } from '../web/engine/smaf.js';

test('SMAF WASM decodes original phone music to bounded stereo PCM', async () => {
  await initSmaf({
    wasmBinary: fs.readFileSync(new URL('../web/engine/vendor/smaf.wasm', import.meta.url)),
  });
  const game = new SgsFile(
    fs.readFileSync(new URL('../web/data/games/gnex27_sketcher_.2inch.sgs', import.meta.url)),
  );
  const resource = game.resources.find(
    (r) => new TextDecoder().decode(r.data.subarray(2, 6)) === 'MMMD',
  );
  const input = resource.data.subarray(2);
  const result = await renderSmaf(input, { maxSeconds: 30, yieldTask: async () => {} });
  // Independently rendered with the native C++ command-line program at 44.1kHz.
  assert.equal(result.frames, 453176);
  assert.ok(result.peak > 0.719 && result.peak < 0.721);
  assert.equal(result.truncated, false);
  assert.equal(new TextDecoder().decode(result.wave.subarray(0, 4)), 'RIFF');
  assert.equal(result.wave.length, 44 + result.frames * 4);
  await assert.rejects(renderSmaf(input, { cancelled: () => true }), { name: 'AbortError' });
  const limited = await renderSmaf(input, { maxSeconds: 0.1, yieldTask: async () => {} });
  assert.equal(limited.frames, 4410);
  assert.equal(limited.truncated, true);
  await assert.rejects(renderSmaf(new Uint8Array(20)), /no playable track/);
});

test('Independence Day original MMMG/SEQU music plays without an MTR or ATR chunk', async () => {
  await initSmaf({
    wasmBinary: fs.readFileSync(new URL('../web/engine/vendor/smaf.wasm', import.meta.url)),
  });
  const game = new SgsFile(
    fs.readFileSync(new URL('../web/data/games/gnex26_independence_day_3d.sgs', import.meta.url)),
  );
  const input = game.resources[27].data.subarray(2);
  assert.equal(
    createHash('sha256').update(input).digest('hex'),
    '4b1500609263b8aa3bb4e145f83dd7cac02557334525109291ce5529ee24ebf6',
  );
  assert.equal(Buffer.from(input.subarray(91, 95)).toString(), 'MMMG');
  assert.equal(Buffer.from(input.subarray(304, 308)).toString(), 'SEQU');
  const result = await renderSmaf(input, { maxSeconds: 60, yieldTask: async () => {} });
  assert.equal(result.truncated, false);
  assert.ok(result.frames > 35 * result.rate && result.frames < 40 * result.rate);
  assert.ok(result.peak > 0.1 && result.peak <= 1);
  // A corrupt VOIC length must not be interpreted as a scan into another chunk.
  const malformed = input.slice();
  malformed.set([255, 255, 255, 255], 105);
  await assert.rejects(renderSmaf(malformed), /no playable track/);
});

test('Independence sampled effects use their distinct Mwa ADPCM waves, not one FM tone', async () => {
  await initSmaf({
    wasmBinary: fs.readFileSync(new URL('../web/engine/vendor/smaf.wasm', import.meta.url)),
  });
  const game = new SgsFile(
    fs.readFileSync(new URL('../web/data/games/gnex26_independence_day_3d.sgs', import.meta.url)),
  );
  const sequences = new Set(),
    decoded = new Set();
  for (let index = 29; index <= 33; index++) {
    const input = game.resources[index].data.subarray(2),
      bytes = Buffer.from(input);
    const seq = bytes.indexOf('Mtsq'),
      wave = bytes.indexOf(Buffer.from([77, 119, 97, 1]));
    sequences.add(bytes.subarray(seq + 8, seq + 8 + bytes.readUInt32BE(seq + 4)).toString('hex'));
    assert.deepEqual([...input.subarray(wave + 8, wave + 11)], [0x20, 0x1f, 0x40]);
    const result = await renderSmaf(input, { maxSeconds: 30, yieldTask: async () => {} });
    assert.equal(result.truncated, false);
    assert.ok(result.peak > 0.1 && result.peak < 1);
    decoded.add(createHash('sha256').update(result.wave.subarray(44)).digest('hex'));
    // These sample payloads last less than one second, despite the long gate
    // in their shared sequence. They must stop naturally, not sustain a tone.
    const pcm = new DataView(result.wave.buffer, result.wave.byteOffset + 44);
    let lastLoudFrame = 0;
    for (let p = 0; p < pcm.byteLength; p += 2)
      if (Math.abs(pcm.getInt16(p, true)) > 32) lastLoudFrame = Math.floor(p / 4);
    assert.ok(lastLoudFrame > result.rate * 0.1 && lastLoudFrame < result.rate * 1.1);
  }
  assert.equal(sequences.size, 1, 'the original effects share the same event sequence');
  assert.equal(decoded.size, 5, 'each original sampled effect produces different PCM');
});
