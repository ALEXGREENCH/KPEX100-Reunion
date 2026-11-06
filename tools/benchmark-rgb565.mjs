/** Host display conversion only; this does not measure browser FPS or ARM work. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { rgb565ToRGBA } from '../web/engine/rgb565.js';

const output = process.argv[2];
if (!output || fs.existsSync(output))
  throw Error('Usage: node tools/benchmark-rgb565.mjs NEW_OUTPUT.json');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
function original(source) {
  const rgba = new Uint8ClampedArray(source.length * 2);
  for (let i = 0, j = 0; i < source.length; i += 2, j += 4) {
    const c = source[i] | (source[i + 1] << 8);
    rgba[j] = Math.floor(((c >>> 11) * 255) / 31);
    rgba[j + 1] = Math.floor((((c >>> 5) & 63) * 255) / 63);
    rgba[j + 2] = Math.floor(((c & 31) * 255) / 31);
    rgba[j + 3] = 255;
  }
  return rgba;
}
const report = {
  schema: 1,
  utc: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  scope:
    'Independent host RGB565-to-RGBA conversion including new output allocation. Original GNEX floor scaling, alternating measured order, 5 rounds of300frames after20warmups per method/size. Both paths must produce the same bytes. Not a browser FPS or whole-game speed claim.',
  sourceSha256: sha(fs.readFileSync(new URL('../web/engine/rgb565.js', import.meta.url))),
  framesPerRound: 300,
  rounds: 5,
  sizes: [],
};
const cold = performance.now();
rgb565ToRGBA(Uint8Array.of(0, 0));
report.firstCallIncludingTableMs = performance.now() - cold;
for (const [width, height] of [
  [160, 128],
  [176, 220],
  [320, 240],
]) {
  const source = Uint8Array.from(
    { length: width * height * 2 },
    (_, i) => (i * 37 + (i >>> 3)) & 255,
  );
  const expected = original(source);
  assert.deepEqual(rgb565ToRGBA(source), expected);
  const samples = { original: [], lookup: [] };
  for (let i = 0; i < 20; i++) {
    original(source);
    rgb565ToRGBA(source);
  }
  const measure = (fn) => {
    let last,
      checksum = 0;
    const start = performance.now();
    for (let frame = 0; frame < report.framesPerRound; frame++) {
      last = fn(source);
      checksum = (checksum + last[(frame * 97) % last.length]) >>> 0;
    }
    const ms = performance.now() - start;
    assert.deepEqual(last, expected);
    return { ms, checksum, lastRgbaSha256: sha(last) };
  };
  for (let round = 0; round < report.rounds; round++)
    for (const name of round % 2 ? ['lookup', 'original'] : ['original', 'lookup'])
      samples[name].push(measure(name === 'original' ? original : rgb565ToRGBA));
  assert.equal(new Set([...samples.original, ...samples.lookup].map((r) => r.checksum)).size, 1);
  const before = median(samples.original.map((r) => r.ms));
  const after = median(samples.lookup.map((r) => r.ms));
  report.sizes.push({
    width,
    height,
    samples,
    medianOriginalMs: before,
    medianLookupMs: after,
    speedup: before / after,
  });
}
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(
  JSON.stringify(report.sizes.map(({ width, height, speedup }) => ({ width, height, speedup }))),
);
