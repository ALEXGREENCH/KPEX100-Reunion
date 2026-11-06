import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto, createHash } from 'node:crypto';
import { Ma1Envelope, ma1Frequency, ma1Timeline, renderMa1 } from '../../web/engine/ma1-render.js';

const reference = JSON.parse(
  fs.readFileSync(new URL('../../validation/gvm-ma1-native-reference.json', import.meta.url)),
);
const originals = reference.vectors.slice(0, 5).map((row) => Buffer.from(row.payloadHex, 'hex'));
const base = {
  attackRate: 15,
  decayRate: 0,
  releaseRate: 15,
  sustainLevel: 0,
  sustained: true,
  sustainOn: false,
};

function tone(words = [0xac7f], multiple = 1) {
  const data = Buffer.alloc(86 + words.length * 2);
  data.writeUInt16LE(1, 0);
  data.writeUInt16LE(data.length - 2, 2);
  data.writeUInt16LE((multiple << 13) | 0x0bc3, 8); // carrier: EGT1,AR15,RR15
  data.writeUInt16LE(0xc000, 10);
  data.writeUInt16LE(36, 70);
  words.forEach((w, i) => data.writeUInt16LE(w, 86 + i * 2));
  return data;
}

test('MA1 envelope timings follow independent Yamaha attack/release values and EGT/SUS', () => {
  const rate = 10000;
  const attack = new Ma1Envelope({ ...base, attackRate: 13 }, rate);
  let ticks = 0;
  while (attack.level < 1 && ticks < 1000) {
    attack.tick();
    ticks++;
  }
  assert.ok(Math.abs(ticks - 93) <= 1, 'AR13 is9.30ms');
  const hold = new Ma1Envelope({ ...base, releaseRate: 14 }, rate);
  for (let i = 0; i < 100; i++) hold.tick();
  assert.equal(hold.level, 1);
  hold.off();
  ticks = 0;
  while (hold.level > 0 && ticks < 10000) {
    hold.tick();
    ticks++;
  }
  assert.ok(Math.abs(ticks - 89.4) <= 1, 'RR14 is8.94ms');
  for (const [patch, expected] of [
    [{ ...base, sustained: false }, 2860.7],
    [{ ...base, sustainOn: true }, 22885.6],
  ]) {
    const envelope = new Ma1Envelope(patch, rate);
    envelope.tick();
    envelope.off();
    ticks = 0;
    while (envelope.level > 0 && ticks < 30000) {
      envelope.tick();
      ticks++;
    }
    assert.ok(Math.abs(ticks - expected) <= 1);
  }
  for (const attackRate of [0, 1]) {
    const silent = new Ma1Envelope({ ...base, attackRate }, rate);
    for (let i = 0; i < 1000; i++) assert.equal(silent.tick(), 0);
    silent.off();
    assert.equal(silent.level, 0);
  }
});

test('MA1 nominal pitch, frequency multiples, PCM and total-level attenuation are measurable', async () => {
  assert.ok(Math.abs(ma1Frequency(1, 1) - 138.591315) < 0.00001);
  assert.equal(ma1Frequency(2, 11), 440);
  assert.ok(Math.abs(ma1Frequency(3, 15) - 1046.502261) < 0.00001);
  for (const args of [
    [0, 1],
    [4, 1],
    [1, 0],
    [1, 4],
    [1.5, 1],
  ])
    assert.throws(() => ma1Frequency(...args));
  const rms = [],
    frequencies = [];
  for (const multiple of [0, 1, 2]) {
    const input = tone([0xac7f], multiple),
      before = Buffer.from(input);
    const result = await renderMa1(input, { yieldTask: async () => {} });
    assert.deepEqual(input, before);
    assert.equal(result.truncated, false);
    const view = new DataView(result.wave.buffer),
      crossings = [];
    assert.equal(result.wave.length, 44 + result.frames * 2);
    assert.equal(view.getUint32(4, true), result.wave.length - 8);
    assert.equal(view.getUint16(22, true), 1);
    assert.equal(view.getUint32(24, true), 44100);
    let sum = 0;
    for (let i = 5000; i < 30000; i++) {
      const sample = view.getInt16(44 + i * 2, true);
      if (sample >= 0 && view.getInt16(42 + i * 2, true) < 0) crossings.push(i);
      sum += sample * sample;
    }
    frequencies.push(((crossings.length - 1) * 44100) / (crossings.at(-1) - crossings[0]));
    rms.push(Math.sqrt(sum / 25000));
  }
  for (const [i, expected] of [220, 440, 880].entries())
    assert.ok(Math.abs(frequencies[i] - expected) < 0.5);
  const attenuated = tone();
  attenuated.writeUInt16LE(0xc100, 10); // TL16 =12dB, with all other carrier fields unchanged
  const result = await renderMa1(attenuated, { yieldTask: async () => {} });
  const view = new DataView(result.wave.buffer);
  let sum = 0;
  for (let i = 5000; i < 30000; i++) sum += view.getInt16(44 + i * 2, true) ** 2;
  assert.ok(Math.abs(Math.sqrt(sum / 25000) / rms[1] - 10 ** (-12 / 20)) < 0.001);
});

test('MA1 score clock keeps simultaneous parts, finite gates, ties, rests and voice changes', () => {
  const input = tone([0xac01, 0xad7f, 0x308f]);
  const score = ma1Timeline(input);
  assert.equal(score.events[0].atFrame, 0);
  assert.equal(score.events[1].atFrame, 0);
  assert.equal(score.events[1].offFrame, Infinity);
  assert.equal(score.events[2].atFrame, Math.floor(((48 * 37 * 240000) / 8739 / 48000) * 44100));
  assert.equal(score.events[2].changeVoice, true);
  assert.equal(score.events[2].voice, 7);
  // A later rest cancels an earlier long gate; it must not pad the end to that old gate.
  const cut = ma1Timeline(tone([0xac5e, 0x3008]));
  assert.equal(cut.endFrame, Math.floor(((2 * 37 * 240000) / 8739 / 48000) * 44100));
});

test('all five original MA1s render distinct nonzero waves; bounds and cancellation remain enforced', async () => {
  const hashes = new Set();
  for (const input of originals) {
    const result = await renderMa1(input, { rate: 16000, yieldTask: async () => {} });
    assert.ok(result.frames > 1000 && result.frames < 16000 * 10);
    assert.ok(result.peak > 0.01 && Number.isFinite(result.peak));
    assert.equal(result.truncated, false);
    hashes.add(createHash('sha256').update(result.wave).digest('hex'));
  }
  assert.equal(hashes.size, 5);
  const limited = await renderMa1(originals[0], { maxSeconds: 0.01, rate: 8000 });
  assert.equal(limited.frames, 80);
  assert.equal(limited.truncated, true);
  for (const options of [
    { rate: 0 },
    { rate: NaN },
    { rate: 48001 },
    { maxSeconds: NaN },
    { maxSeconds: 181 },
  ])
    await assert.rejects(renderMa1(originals[0], options));
  const empty = tone([]);
  assert.equal((await renderMa1(empty)).frames, 0);
  await assert.rejects(renderMa1(originals[0], { cancelled: () => true }), { name: 'AbortError' });
  let cancelled = false,
    yields = 0;
  await assert.rejects(
    renderMa1(tone(), {
      cancelled: () => cancelled,
      yieldTask: async () => {
        cancelled = true;
      },
    }),
    { name: 'AbortError' },
  );
  cancelled = false;
  await assert.rejects(
    renderMa1(tone(), {
      maxSeconds: 0.01,
      cancelled: () => cancelled,
      yieldTask: async () => {
        cancelled = ++yields === 1;
      },
    }),
    { name: 'AbortError' },
  );
  assert.equal(yields, 1, 'short output can cancel during WAVE packing');
});

test('real audio worker routes MA1, owns cached output and suppresses cancelled jobs', async () => {
  const src = fs
    .readFileSync(new URL('../../web/smaf-worker.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '');
  const replies = [],
    waiters = new Map();
  let calls = 0;
  const sandbox = {
    crypto: webcrypto,
    Uint8Array,
    Map,
    Set,
    renderMa1: async (...args) => {
      calls++;
      return renderMa1(...args);
    },
    renderSmaf: async () => ({ wave: Uint8Array.of(1), frames: 1 }),
    postMessage: (message) => {
      replies.push(message);
      waiters.get(message.id)?.(message);
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  const request = (id, format) =>
    new Promise((resolve) => {
      waiters.set(id, resolve);
      sandbox.onmessage({ data: { id, bytes: originals[1], format } });
    });
  const first = await request(1, 'audio/x-gvm-ma1');
  assert.ok(first.frames > 1000);
  first.wave[0] = 0;
  assert.equal((await request(2, 'audio/x-gvm-ma1')).wave[0], 82);
  assert.equal(calls, 1);
  assert.deepEqual([...(await request(3, 'audio/x-smaf')).wave], [1]);
  void request(4, 'audio/x-gvm-ma1');
  sandbox.onmessage({ data: { id: 4, cancel: true } });
  await request(5, 'audio/x-gvm-ma1');
  assert.equal(
    replies.some((r) => r.id === 4),
    false,
  );
});
