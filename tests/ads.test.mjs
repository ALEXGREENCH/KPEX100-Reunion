import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { AdsRuntime } from '../web/engine/ads.js';

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const catalog = json('../web/data/catalog.json');
const evidence = json('../validation/anycall-merry-ramen-udon.json');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

for (const record of evidence.games) {
  test(`ADS: ${record.game} matches archived controls on ARM/WASM`, async () => {
    const entry = catalog.games.find(({ id }) => id === record.game);
    const bytes = readFileSync(new URL('../web/' + entry.url, import.meta.url));
    assert.equal(entry.engine, 'ads');
    assert.equal(entry.sha256, record.mbinSha256);
    const baseline = record.captures.find(({ file }) => file === '05-no-input.png');
    for (const [key, expected] of [
      [null, baseline],
      ...record.inputs.map(({ key, capture }) => [key, capture]),
    ]) {
      const game = await AdsRuntime.create(bytes, { id: entry.id });
      try {
        for (const { key, ticks } of record.commonSequence) {
          if (key !== null) {
            game.setKey(key, true);
            game.setKey(key, false);
          }
          for (let i = 0; i < ticks; i++) game.tick();
        }
        if (key !== null) {
          game.setKey(key, true);
          game.setKey(key, false);
        }
        for (let i = 0; i < record.pairedTimerEvents; i++) game.tick();
        assert.equal(game.presentations, expected.presentation, expected.file);
        assert.equal(hash(game.readIndexedFrame()), expected.indexedSha256, expected.file);
        assert.equal(game.framebuffer.data.length, 120 * 128 * 4);
      } finally {
        game.close();
      }
    }
  });
}
