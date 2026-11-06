import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parseLegacy } from '../web/engine/legacy.js';
import { parseMa1 } from '../web/engine/ma1.js';
import { GnexRuntime } from '../web/engine/gnex.js';

test('MA1 native references bind to unchanged original SGS and the inspection CLI', () => {
  const file = new URL('../web/data/games/hellfire-witop-v1.sgs', import.meta.url);
  const raw = fs.readFileSync(file);
  const reference = JSON.parse(
    fs.readFileSync(new URL('../validation/gvm-ma1-native-reference.json', import.meta.url)),
  );
  assert.equal(createHash('sha256').update(raw).digest('hex'), reference.sgsSha256);
  const sgs = parseLegacy(raw);
  let words = 0;
  for (let i = 0; i < 5; i++) {
    const resource = sgs.resources[i + 45].data;
    assert.equal(Buffer.from(resource).toString('hex'), reference.vectors[i].payloadHex);
    assert.equal(
      createHash('sha256').update(resource).digest('hex'),
      reference.vectors[i].payloadSha256,
    );
    words += parseMa1(resource).score.length;
  }
  assert.equal(words, 419);
  const result = spawnSync(
    process.execPath,
    ['tools/ma1-info.mjs', 'web/data/games/hellfire-witop-v1.sgs', '45'],
    { cwd: new URL('..', import.meta.url), encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.sourceSha256, reference.sgsSha256);
  assert.equal(report.payloadSha256, reference.vectors[0].payloadSha256);
  assert.equal(report.score.length, 361);
  const invalid = spawnSync(
    process.execPath,
    ['tools/ma1-info.mjs', 'web/data/games/hellfire-witop-v1.sgs', '40'],
    { cwd: new URL('..', import.meta.url), encoding: 'utf8' },
  );
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, '');
  assert.match(invalid.stderr, /Invalid raw GVM MA1/);
});

test('MA1 owns its bytes, preserves flags and respects the selected native sound device', () => {
  const calls = [],
    host = {
      profile: 'phone',
      audioDiagnostics: { requests: 0, ignoredNativeSubtypes: [] },
      _audio: (...args) => calls.push(args),
    };
  const raw = fs.readFileSync(new URL('../web/data/games/hellfire-witop-v1.sgs', import.meta.url));
  const data = Buffer.from(parseLegacy(raw).resources[45].data);
  data[1] |= 128;
  GnexRuntime.prototype._playAudio.call(host, data, 2);
  assert.deepEqual(calls[0].slice(2), ['audio/x-gvm-ma1', true, 2]);
  assert.deepEqual(calls[0][1], new Uint8Array(data));
  data[4] ^= 255;
  assert.notEqual(calls[0][1][4], data[4]);
  host.profile = 'kpex';
  GnexRuntime.prototype._playAudio.call(host, Uint8Array.of(1, 0), 0);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].slice(2), ['audio/x-gvm-ma1', false, 0]);
  host.nativeSoundType = 1;
  GnexRuntime.prototype._playAudio.call(host, Uint8Array.of(0, 0, 38));
  assert.equal(calls.length, 2);
  assert.deepEqual(host.audioDiagnostics.filteredNativeSubtypes, [0]);
  host.nativeSoundType = 0;
  data[1] = 0;
  GnexRuntime.prototype._playAudio.call(host, data);
  assert.equal(calls.length, 2);
  assert.deepEqual(host.audioDiagnostics.filteredNativeSubtypes, [0, 1]);
});

test('both unchanged Hellfire releases select MA1 and share all five original patches/scores', async () => {
  const catalog = JSON.parse(fs.readFileSync(new URL('../web/data/catalog.json', import.meta.url)));
  const rom = fs.readFileSync(new URL('../web/data/firmware/Kingston-2.12.rom', import.meta.url));
  const reference = JSON.parse(
    fs.readFileSync(new URL('../validation/gvm-ma1-native-reference.json', import.meta.url)),
  );
  const { LegacyRuntime } = await import('../web/engine/legacy.js');
  for (const id of ['hellfire', 'hellfire-witop-v1']) {
    const entry = catalog.games.find((g) => g.id === id),
      played = [];
    assert.equal(entry.runtime.nativeSoundType, 1);
    const raw = fs.readFileSync(new URL('../web/' + entry.url, import.meta.url));
    const Runtime = entry.format < 4 ? LegacyRuntime : GnexRuntime;
    const g = await Runtime.create(rom, raw, {
      ...entry.runtime,
      audio: { play: (bytes, mime) => played.push({ bytes, mime }) },
    });
    try {
      for (let i = 0; i < 5; i++)
        assert.equal(
          Buffer.from(g.sgs.resources[45 + i].data).toString('hex'),
          reference.vectors[i].payloadHex,
        );
      g.event('START');
      assert.equal(g.status, 'idle', g.error);
      assert.ok(played.length > 0);
      assert.ok(played.every((call) => call.mime === 'audio/x-gvm-ma1'));
      assert.ok(g.audioDiagnostics.filteredNativeSubtypes.includes(0));
      assert.deepEqual(g.audioDiagnostics.ignoredNativeSubtypes, []);
    } finally {
      g.close();
    }
  }
});

test('MA1 conversion CLI writes a valid owned WAV and refuses to overwrite it', () => {
  const tempRoot = fs.realpathSync(os.tmpdir()),
    directory = fs.mkdtempSync(path.join(tempRoot, 'reunion-ma1-'));
  const output = path.join(directory, 'sound.wav');
  const args = ['tools/render-ma1.mjs', 'web/data/games/hellfire-witop-v1.sgs', '46', output];
  const options = { cwd: new URL('..', import.meta.url), encoding: 'utf8' };
  try {
    const first = spawnSync(process.execPath, args, options);
    assert.equal(first.status, 0, first.stderr);
    const meta = JSON.parse(first.stdout),
      wave = fs.readFileSync(output);
    assert.equal(wave.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wave.readUInt32LE(24), 44100);
    assert.equal(wave.length, 44 + meta.frames * 2);
    assert.equal(createHash('sha256').update(wave).digest('hex'), meta.outputSha256);
    const second = spawnSync(process.execPath, args, options);
    assert.equal(second.status, 1);
    assert.match(second.stderr, /new file/);
    assert.deepEqual(fs.readFileSync(output), wave);
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), tempRoot);
    assert.equal(fs.lstatSync(directory).isSymbolicLink(), false);
    fs.rmSync(directory, { recursive: true });
  }
});
