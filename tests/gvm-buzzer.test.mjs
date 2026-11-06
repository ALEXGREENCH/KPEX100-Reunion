import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LegacyRuntime, parseLegacy } from '../web/engine/legacy.js';
import { GnexRuntime } from '../web/engine/gnex.js';

test('original WI-TOP sound resources match native fixtures and reach the phone audio adapter unchanged', async () => {
  const raw = fs.readFileSync(new URL('../web/data/games/hellfire-witop-v1.sgs', import.meta.url));
  const rom = fs.readFileSync(new URL('../web/data/firmware/Kingston-2.12.rom', import.meta.url));
  const reference = JSON.parse(
    fs.readFileSync(new URL('../validation/gvm-buzzer-native-reference.json', import.meta.url)),
  );
  const sgs = parseLegacy(raw),
    played = [];
  for (let i = 0; i < 5; i++)
    assert.equal(
      Buffer.from(sgs.resources[40 + i].data).toString('hex'),
      reference.vectors[i].payloadHex,
    );
  const g = await LegacyRuntime.create(rom, raw, {
    profile: 'phone',
    width: 120,
    height: 100,
    audio: { play: (bytes, mime, loop, channel) => played.push({ bytes, mime, loop, channel }) },
  });
  try {
    g.event('START');
    for (let i = 0; i < 40; i++) g.event('TIMEOUT', 0);
    g.setKey(20, true);
    g.setKey(20, false);
    for (let i = 0; i < 40; i++) g.event('TIMEOUT', 0);
    assert.equal(g.status, 'idle', g.error);
    assert.ok(played.length > 0);
    for (const call of played) {
      assert.equal(call.mime, 'audio/x-gvm-buzzer');
      assert.ok(sgs.resources.some((r) => Buffer.from(r.data).equals(Buffer.from(call.bytes))));
    }
    assert.ok(!g.audioDiagnostics.ignoredNativeSubtypes.includes(0));
    assert.ok(
      g.audioDiagnostics.ignoredNativeSubtypes.includes(1),
      'MA1 remains a separate unsupported format',
    );
  } finally {
    g.close();
  }
});

test('phone buzzer copies its payload and preserves loop/channel; K-PEX subtype routing stays unchanged', () => {
  const calls = [],
    host = {
      profile: 'phone',
      audioDiagnostics: { requests: 0, ignoredNativeSubtypes: [] },
      _audio: (...args) => calls.push(args),
    };
  const payload = Uint8Array.of(0, 128, 1, 5, 38, 0);
  GnexRuntime.prototype._playAudio.call(host, payload, 3);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(0, 1), ['play']);
  assert.deepEqual(calls[0].slice(2), ['audio/x-gvm-buzzer', true, 3]);
  assert.deepEqual(calls[0][1], payload);
  payload[2] = 20;
  assert.equal(calls[0][1][2], 1);
  host.profile = 'kpex';
  GnexRuntime.prototype._playAudio.call(host, Uint8Array.of(0, 0, 38, 0));
  assert.equal(calls.length, 1);
  assert.deepEqual(host.audioDiagnostics.ignoredNativeSubtypes, [0]);
});
