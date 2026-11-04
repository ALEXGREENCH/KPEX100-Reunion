import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { SgsFile, SgsError } from '../web/engine/sgs.js';
import { VirtualFileSystem } from '../web/engine/vfs.js';
import { extractMp3 } from '../web/engine/gnex.js';
const source = new URL('../web/', import.meta.url),
  catalog = JSON.parse(fs.readFileSync(new URL('data/catalog.json', source)));
const game = (name) =>
  fs.readFileSync(
    new URL(
      catalog.games.find((g) => g.sourceName === name && g.compatibility === 'verified').url,
      source,
    ),
  );

test('all four original v4 containers have valid entry points and bounded resources', () => {
  for (const name of ['hell_fire.sgs', 'kpetris_beta.sgs', 'ikaria.sgs', 'Godori.sgs']) {
    const s = new SgsFile(game(name));
    assert.equal(s.version, 4);
    assert.equal(s.xorMask, 165);
    assert.ok(s.entries.START >= 128);
    assert.ok(s.resources.length > 0);
    assert.equal(s.resources.at(-1).offset + s.resources.at(-1).data.length, s.declaredSize);
    const wrapped = new Uint8Array(s.body.length + 32);
    wrapped[0] = 32;
    wrapped.set(s.body, 32);
    assert.equal(new SgsFile(wrapped).title, s.title);
  }
});
test('malformed, legacy and truncated containers fail explicitly', () => {
  for (const raw of [
    new Uint8Array(),
    new Uint8Array(20),
    Uint8Array.of(1, ...new Uint8Array(127)),
  ])
    assert.throws(() => new SgsFile(raw), SgsError);
  const s = new SgsFile(game('kpetris_beta.sgs')),
    bad = s.body.slice();
  new DataView(bad.buffer).setUint32(72, 0xffffffff, true);
  assert.throws(() => new SgsFile(bad), /section offsets/);
  const wrapped = new Uint8Array(128);
  wrapped[0] = 32;
  assert.throws(() => new SgsFile(wrapped), /body header/);
});
test('all 23 Godori MP3 sound resources have at least two complete MPEG frames', () => {
  const s = new SgsFile(game('Godori.sgs'));
  const manifest = JSON.parse(
    fs.readFileSync(new URL('mp3-goldens.json', import.meta.url)),
  ).streams;
  for (const entry of manifest) {
    const stream = extractMp3(s.resources[entry.index].data);
    assert.equal(stream.length, entry.bytes);
    assert.equal(crypto.createHash('sha256').update(stream).digest('hex'), entry.sha256);
  }
  assert.equal(manifest.length, 23);
  assert.throws(() => extractMp3(new Uint8Array(400)), /No complete/);
});
