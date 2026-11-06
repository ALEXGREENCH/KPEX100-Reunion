import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { buzzerEvents, renderBuzzer } from '../../web/engine/buzzer.js';

const reference = JSON.parse(
  fs.readFileSync(new URL('../../validation/gvm-buzzer-native-reference.json', import.meta.url)),
);
test('buzzer events match native SDK traces for original resources, all notes, rests and byte durations', () => {
  assert.equal(reference.vectors.length, 8);
  for (const row of reference.vectors) {
    const actual = buzzerEvents(Buffer.from(row.payloadHex, 'hex'));
    assert.deepEqual(actual.events, row.events, row.name);
    assert.equal(actual.durationMs, row.durationMs, row.name);
  }
});

test('buzzer PCM retains native theme timing and measured pitch, including silence for rests', async () => {
  const input = Buffer.from(reference.vectors[0].payloadHex, 'hex'),
    before = Buffer.from(input);
  const result = await renderBuzzer(input, { yieldTask: async () => {} });
  assert.equal(result.frames, 84672); // Native 16 notes *40ticks *3ms at44.1kHz.
  assert.equal(result.truncated, false);
  const v = new DataView(result.wave.buffer);
  assert.equal(Buffer.from(result.wave.subarray(0, 4)).toString(), 'RIFF');
  assert.equal(v.getUint32(4, true), result.wave.length - 8);
  assert.equal(v.getUint16(22, true), 1);
  assert.equal(v.getUint32(24, true), 44100);
  assert.equal(v.getUint32(40, true), result.frames * 2);
  for (const event of reference.vectors[0].events) {
    const start = Math.floor(event.atMs * 44.1),
      end = Math.floor((event.atMs + event.durationMs) * 44.1),
      rising = [];
    for (let i = start + 1; i < end; i++)
      if (v.getInt16(44 + (i - 1) * 2, true) < 0 && v.getInt16(44 + i * 2, true) > 0)
        rising.push(i);
    const measured = ((rising.length - 1) * 44100) / (rising.at(-1) - rising[0]);
    assert.ok(Math.abs(measured - event.frequency) < 1, event.frequency + 'Hz');
  }
  const rest = await renderBuzzer(Uint8Array.of(0, 0, 37, 50, 38, 0));
  assert.equal(rest.frames, 6615);
  assert.ok(rest.wave.subarray(44).every((b) => b === 0));
  assert.deepEqual(input, before);
});

test('buzzer rendering bounds output, supports empty/looped streams and remains cancellable', async () => {
  const input = Buffer.from(reference.vectors[0].payloadHex, 'hex');
  const limited = await renderBuzzer(input, { rate: 22050, maxSeconds: 0.1 });
  assert.equal(limited.frames, 2205);
  assert.equal(limited.truncated, true);
  const looped = Buffer.from(input);
  looped[1] = 128;
  assert.deepEqual(buzzerEvents(looped), buzzerEvents(input));
  assert.equal((await renderBuzzer(Uint8Array.of(0, 0, 38))).frames, 0);
  await assert.rejects(renderBuzzer(input, { cancelled: () => true }), { name: 'AbortError' });
  let cancel = false;
  await assert.rejects(
    renderBuzzer(input, {
      cancelled: () => cancel,
      yieldTask: async () => {
        cancel = true;
      },
    }),
    { name: 'AbortError' },
  );
  for (const bytes of [[], [0, 0], [0, 0, 1], [0, 0, 1, 2], [1, 0, 38]])
    assert.throws(() => buzzerEvents(Uint8Array.from(bytes)));
  for (const options of [{ rate: 0 }, { rate: Infinity }, { maxSeconds: NaN }, { maxSeconds: 181 }])
    await assert.rejects(renderBuzzer(input, options), /bounds/);
});

test('audio worker separates cached formats and suppresses cancelled queued replies', async () => {
  const src = fs
    .readFileSync(new URL('../../web/smaf-worker.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '');
  const replies = [],
    waiters = new Map();
  let smafCalls = 0;
  const sandbox = {
    crypto: webcrypto,
    Uint8Array,
    Map,
    Set,
    renderBuzzer,
    renderSmaf: async () => {
      smafCalls++;
      return { wave: Uint8Array.of(7, 8), frames: 1, truncated: false };
    },
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
      sandbox.onmessage({ data: { id, bytes: Uint8Array.of(0, 0, 0, 1, 38), format } });
    });
  assert.deepEqual([...(await request(1, 'audio/x-smaf')).wave], [7, 8]);
  const buzzer = await request(2, 'audio/x-gvm-buzzer');
  assert.equal(Buffer.from(buzzer.wave.subarray(0, 4)).toString(), 'RIFF');
  buzzer.wave[0] = 0;
  assert.equal(
    (await request(3, 'audio/x-gvm-buzzer')).wave[0],
    82,
    'reply does not mutate cached PCM',
  );
  void request(4, 'audio/x-gvm-buzzer');
  sandbox.onmessage({ data: { id: 4, cancel: true } });
  await request(5, 'audio/x-smaf');
  assert.equal(
    replies.some((r) => r.id === 4),
    false,
  );
  assert.equal(smafCalls, 1);
  assert.match((await request(6, 'wrong')).error, /Unsupported/);
});
