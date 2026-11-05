import test from 'node:test';
import assert from 'node:assert/strict';
import { libraryEntries, libraryCounts } from '../../web/library.js';
import { assetCatalog, identifyAsset } from '../../web/local-assets.js';

function collection() {
  return assetCatalog(
    {
      games: [
        { id: 'game', sha256: '1'.repeat(64), compatibility: 'verified' },
        { id: 'utility', sha256: '2'.repeat(64), compatibility: 'utility' },
        {
          id: 'tutorial',
          sha256: '3'.repeat(64),
          applicationType: 'sample',
          compatibility: 'sample',
        },
      ],
      firmwares: [{ id: 'rom' }],
    },
    ['game'],
  );
}

test('samples have their own display group while unavailable apps remain in their categories', () => {
  const catalog = collection();
  assert.deepEqual(
    libraryEntries(catalog, 'games').map((entry) => entry.id),
    ['game', 'utility'],
  );
  assert.deepEqual(
    libraryEntries(catalog, 'samples').map((entry) => entry.id),
    ['tutorial'],
  );
  assert.equal(libraryEntries(catalog, 'firmwares'), catalog.firmwares);
  assert.equal(catalog.games.length, 3);
  assert.deepEqual(libraryCounts(catalog), {
    games: { available: 1, total: 2 },
    samples: { available: 0, total: 1 },
    firmwares: { available: 0, total: 1 },
  });
});

test('importing a renamed known sample preserves its category; an unknown SGS remains an app', () => {
  const catalog = collection();
  const raw = new Uint8Array(128);
  raw[0] = 4;
  const known = identifyAsset(catalog, 'renamed.sgs', raw, '3'.repeat(64));
  assert.equal(known.kind, 'games');
  Object.assign(
    catalog.games.find((entry) => entry.id === known.entry.id),
    known.entry,
    {
      available: true,
      local: true,
    },
  );
  const unknown = identifyAsset(catalog, 'local.sgs', raw, '4'.repeat(64));
  catalog.games.push({ ...unknown.entry, available: true, local: true });
  assert.deepEqual(libraryCounts(catalog), {
    games: { available: 2, total: 3 },
    samples: { available: 1, total: 1 },
    firmwares: { available: 0, total: 1 },
  });
  assert.equal(libraryEntries(catalog, 'samples')[0].id, 'tutorial');
});
