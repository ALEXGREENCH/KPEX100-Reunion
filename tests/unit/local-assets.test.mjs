import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  assetCatalog,
  identifyAsset,
  SWERVE,
  MAX_ASSET_BYTES,
  sha256,
} from '../../web/local-assets.js';
const source = JSON.parse(fs.readFileSync(new URL('../../web/data/catalog.json', import.meta.url)));

// These tests use synthetic payloads and catalogue identities; no historical binaries.
test('an empty public build exposes metadata without claiming originals are present', () => {
  const catalog = assetCatalog(source);
  assert.equal(catalog.games.length, source.games.length);
  assert.equal(catalog.firmwares.length, source.firmwares.length);
  assert.ok(
    Object.values(catalog)
      .flat()
      .every((entry) => !entry.available),
  );
  const partial = assetCatalog(source, ['hellfire', 'kingston-2.12']);
  assert.equal(partial.games.find((entry) => entry.id === 'hellfire').available, true);
  assert.equal(partial.games.filter((entry) => entry.available).length, 1);
});

test('renamed known SGS retains every tested profile and stable save identity', () => {
  const catalog = assetCatalog(source);
  for (const known of source.games) {
    const found = identifyAsset(catalog, 'renamed.bin', new Uint8Array(128), known.sha256);
    assert.equal(found.kind, 'games');
    assert.equal(found.entry.id, known.id);
    assert.deepEqual(found.entry.runtime, known.runtime);
    assert.equal(found.entry.startHint, known.startHint);
    assert.equal(found.entry.platform, known.platform);
  }
});

test('Kingston interpreter, Swerve, and quickstates are recognized by bytes identity', () => {
  const catalog = assetCatalog(source);
  for (const [kind, originals] of [
    ['firmwares', source.firmwares],
    ['states', source.states],
    ['swerve', [SWERVE]],
  ]) {
    for (const known of originals) {
      const found = identifyAsset(catalog, 'renamed.dat', new Uint8Array(128), known.sha256);
      assert.equal(found.kind, kind);
      assert.equal(found.entry.id, known.id);
    }
  }
});

test('unknown SGS stays unverified and cannot inherit a recognized game filename profile', () => {
  const raw = new Uint8Array(128);
  raw[0] = 4;
  const found = identifyAsset(assetCatalog(source), 'hellfire.sgs', raw, 'a'.repeat(64));
  assert.equal(found.kind, 'games');
  assert.equal(found.entry.id, 'local-' + 'a'.repeat(64));
  assert.equal(found.entry.compatibility, 'research');
  assert.equal(found.entry.platform, 'mobile');
  assert.deepEqual(found.entry.runtime, { profile: 'phone', width: 176, height: 220 });
  raw[0] = 4 ^ 165;
  assert.equal(
    identifyAsset(assetCatalog(source), 'new.sgs', raw, 'a'.repeat(64)).entry.platform,
    'kpex',
  );
});

test('unknown native modules/states and malformed upload headers are rejected', () => {
  const catalog = assetCatalog(source),
    raw = new Uint8Array(128);
  for (const name of ['swv21brew.mod', 'bad.reunion-state', 'bad.sgs', 'file.txt'])
    assert.throws(() => identifyAsset(catalog, name, raw, '0'.repeat(64)));
  assert.throws(() => identifyAsset(catalog, 'empty.rom', new Uint8Array(), '0'.repeat(64)));
  assert.throws(() =>
    identifyAsset(catalog, 'large.rom', { byteLength: MAX_ASSET_BYTES + 1 }, '0'.repeat(64)),
  );
});

test('upload digest uses the actual byte view, including offset and length', async () => {
  const bytes = new TextEncoder().encode('xabcx');
  assert.equal(
    await sha256(bytes.subarray(1, 4)),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});
