import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { AdsRuntime } from '../web/engine/ads.js';

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const catalog = json('../web/data/catalog.json');
const evidence = json('../validation/anycall-merry-ramen-udon.json');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function replay(record, run) {
  const entry = catalog.games.find(({ id }) => id === record.game);
  assert.ok(entry, record.game);
  assert.equal(entry.engine, 'ads');
  assert.equal(entry.sha256, record.mbinSha256);
  const bytes = readFileSync(new URL('../web/' + entry.url, import.meta.url));
  const game = await AdsRuntime.create(bytes, { id: entry.id });
  try {
    run(game);
  } finally {
    game.close();
  }
}

function press(game, key) {
  if (key === null) return;
  game.setKey(key, true);
  game.setKey(key, false);
}

function advance(game, ticks) {
  for (let i = 0; i < ticks; i++) game.tick();
}

function assertCapture(game, expected, [width, height]) {
  assert.equal(game.presentations, expected.presentation, expected.file);
  assert.equal(hash(game.readIndexedFrame()), expected.indexedSha256, expected.file);
  assert.deepEqual([game.width, game.height], [width, height], expected.file);
  assert.equal(game.framebuffer.data.length, width * height * 4, expected.file);
}

for (const record of evidence.games) {
  test(`ADS: ${record.game} matches archived controls on ARM/WASM`, async () => {
    const baseline = record.captures.find(({ file }) => file === '05-no-input.png');
    for (const [key, expected] of [
      [null, baseline],
      ...record.inputs.map(({ key, capture }) => [key, capture]),
    ]) {
      await replay(record, (game) => {
        for (const { key, ticks } of record.commonSequence) {
          press(game, key);
          advance(game, ticks);
        }
        press(game, key);
        advance(game, record.pairedTimerEvents);
        assertCapture(game, expected, record.size);
      });
    }
  });
}

const pairedReplays = [
  json('../validation/anycall-119-rescue.json'),
  json('../validation/anycall-pocket-billiards.json'),
  ...json('../validation/anycall-intromobile-replays.json').games,
];

for (const record of pairedReplays) {
  test(`ADS: ${record.game} matches all archived captures on ARM/WASM`, async () => {
    const { captures, commonSequence, gameplayInput, size } = record;
    const [baseline, active] = captures.slice(commonSequence.length);
    assert.equal(captures.length, commonSequence.length + 2);
    assert.equal(baseline.file, '05-no-input.png');
    assert.equal(active.file, '06-input.png');
    assert.notEqual(baseline.indexedSha256, active.indexedSha256);
    for (const expected of [baseline, active]) {
      await replay(record, (game) => {
        for (const [index, { key, ticks }] of commonSequence.entries()) {
          press(game, key);
          advance(game, ticks);
          if (expected === baseline) assertCapture(game, captures[index], size);
        }
        for (let tick = 0; tick < gameplayInput.ticks; tick++) {
          if (expected === active && gameplayInput.inputTicks.includes(tick))
            press(game, gameplayInput.key);
          game.tick();
        }
        assertCapture(game, expected, size);
      });
    }
  });
}

test('ADS: jumping-baby matches all archived captures on ARM/WASM', async () => {
  // This older manifest lacks the timeline. Follow the three branches in
  // tools/replay-anycall-jumping-baby.py for controls, no input, and jumping.
  const record = {
    ...json('../validation/anycall-jumping-baby-replay.json'),
    game: 'jumping-baby',
  };
  const [title, menu, controls, stage, baseline, jump] = record.captures;
  assert.equal(record.captures.length, 6);
  assert.notEqual(baseline.indexedSha256, jump.indexedSha256);
  for (const expected of [controls, baseline, jump]) {
    await replay(record, (game) => {
      advance(game, 5);
      if (expected === baseline) assertCapture(game, title, record.size);
      press(game, 14);
      advance(game, 30);
      if (expected === baseline) assertCapture(game, menu, record.size);
      if (expected === controls) {
        for (let i = 0; i < 2; i++) {
          press(game, 13);
          game.tick();
        }
        press(game, 19);
        advance(game, 5);
      } else {
        press(game, 19);
        advance(game, 40);
        if (expected === baseline) assertCapture(game, stage, record.size);
        for (let i = 0; i < 10; i++) {
          if (expected === jump) press(game, 7);
          game.tick();
        }
      }
      assertCapture(game, expected, record.size);
    });
  }
});

test('ADS: mobile-gostop matches the independent idle and keypad replays on ARM/WASM', async () => {
  const record = json('../validation/anycall-mobile-gostop.json');
  const { branches, commonSequence, size, timerIntervals } = record;
  assert.deepEqual(
    branches.map(({ key }) => key),
    [null, 1, 5, 7],
  );
  const idle = [];
  for (const { key, checkpoints } of branches) {
    assert.equal(checkpoints.length, timerIntervals.length);
    await replay(record, (game) => {
      for (const step of commonSequence) {
        press(game, step.key);
        advance(game, step.ticks);
        assertCapture(game, step.capture, size);
      }
      press(game, key);
      for (const [index, ticks] of timerIntervals.entries()) {
        advance(game, ticks);
        const expected = checkpoints[index];
        assertCapture(game, expected, size);
        const frame = game.readIndexedFrame();
        if (key === null) {
          idle.push(frame);
        } else {
          const changed = frame.reduce((count, pixel, i) => count + (pixel !== idle[index][i]), 0);
          assert.ok(changed > 0, expected.file);
          assert.equal(changed, expected.changedPixels, expected.file);
        }
      }
    });
  }
});
