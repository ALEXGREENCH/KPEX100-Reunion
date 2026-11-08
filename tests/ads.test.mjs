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
  if (expected.eventCount !== undefined)
    assert.equal(game.eventCount, expected.eventCount, expected.file);
  assert.equal(hash(game.readIndexedFrame()), expected.indexedSha256, expected.file);
  assert.deepEqual([game.width, game.height], [width, height], expected.file);
  assert.equal(game.framebuffer.data.length, width * height * 4, expected.file);
}

test('ADS can transfer its RGBA buffer and regenerate the same frame on request', async () => {
  for (const file of ['anycall-bubble-monk-2.json', 'anycall-pocket-billiards.json']) {
    const record = json('../validation/' + file);
    await replay(record, (game) => {
      advance(game, 100);
      const frame = game.framebuffer;
      const indices = game.readIndexedFrame();
      const indexedHash = hash(indices);
      const original = frame.data;
      const expected = hash(original);
      assert.equal(original.length, record.size[0] * record.size[1] * 4);
      const rgba = new Uint8Array(original.length);
      for (let i = 0; i < indices.length; i++) {
        const color = indices[i];
        rgba[i * 4] = ((color >>> 5) * 255) / 7;
        rgba[i * 4 + 1] = (((color >>> 2) & 7) * 255) / 7;
        rgba[i * 4 + 2] = (color & 3) * 85;
        rgba[i * 4 + 3] = 255;
      }
      assert.equal(expected, hash(rgba));
      const pixels = frame.takePixels();
      assert.equal(pixels, original);
      const transferred = structuredClone(pixels, { transfer: [pixels.buffer] });
      assert.equal(pixels.byteLength, 0);
      assert.equal(hash(transferred), expected);
      assert.equal(hash(game.readIndexedFrame()), indexedHash);
      const repaint = frame.takePixels();
      assert.notEqual(repaint.buffer, transferred.buffer);
      assert.equal(hash(repaint), expected);
    });
  }
});

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

for (const [gameId, keys] of [
  ['mobile-gostop', [1, 5, 7]],
  ['cheombangjichuk-othello', [19]],
  ['couple-bowling', [11, 19]],
  ['hysteric-girl', [11, 19]],
  ['dalma-lets-play', [11, 19]],
  ['independence-day-anycall', [11, 19]],
]) {
  test(`ADS: ${gameId} matches the independent idle and keypad replays on ARM/WASM`, async () => {
    const record = json(`../validation/anycall-${gameId}.json`);
    const { branches, commonSequence, size, timerIntervals } = record;
    assert.deepEqual(
      branches.map(({ key }) => key),
      [null, ...keys],
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
            const changed = frame.reduce(
              (count, pixel, i) => count + (pixel !== idle[index][i]),
              0,
            );
            if (ticks > 0) assert.ok(changed > 0, expected.file);
            assert.equal(changed, expected.changedPixels, expected.file);
          }
        }
      });
    }
  });
}

test('ADS: bubble-monk-2 matches keypad and direction pairs through long play', async () => {
  const record = json('../validation/anycall-bubble-monk-2.json');
  const { branches, commonSequence, directionPairs, inputTicks, longPlay, size } = record;
  assert.deepEqual(
    branches.map(({ key }) => key),
    [null, 1, 2, 3, 4, 5, 6, 10, 11, 12, 13, 19],
  );
  assert.deepEqual(directionPairs, [
    [10, 4],
    [11, 6],
    [12, 2],
    [13, 5],
  ]);
  assert.equal(longPlay.key, 12);
  assert.deepEqual(
    longPlay.checkpoints.map(({ ticks }) => ticks),
    [1450, 1800],
  );
  const paired = new Map();
  for (const { key, capture } of branches) {
    await replay(record, (game) => {
      for (const step of commonSequence) {
        press(game, step.key);
        advance(game, step.ticks);
        assertCapture(game, step.capture, size);
      }
      for (let tick = 0; tick < inputTicks; tick++) {
        press(game, key);
        game.tick();
      }
      assertCapture(game, capture, size);
      const frame = game.readIndexedFrame();
      paired.set(key, frame);
      const idle = paired.get(null);
      const changed = frame.reduce((count, pixel, i) => count + (pixel !== idle[i]), 0);
      assert.equal(changed, capture.changedPixels, capture.file);
      if (key !== null) assert.ok(changed > 0, capture.file);

      if (key === longPlay.key) {
        const { tapEvery, keyCycle, checkpoints } = longPlay;
        let ticks = 0;
        for (const checkpoint of checkpoints) {
          for (; ticks < checkpoint.ticks; ticks++) {
            if (ticks % tapEvery === 0) press(game, keyCycle[(ticks / tapEvery) % keyCycle.length]);
            game.tick();
          }
          assertCapture(game, checkpoint.capture, size);
        }
      }
    });
  }
  for (const [direction, number] of directionPairs) {
    assert.deepEqual(paired.get(direction), paired.get(number), `${direction} and ${number}`);
  }
});

test('ADS: mobile-gostop continues through three later-round transitions', async () => {
  const record = json('../validation/anycall-mobile-gostop.json');
  const inputs = [1, 2, 3, 4, 5, 6, 7, 19];
  // Indexed frames from a separate Python Unicorn run, before and after
  // the first round transition and after two more calls at the same site.
  const checkpoints = new Map([
    [1900, 'd8cb8859bda0e365872d08615f805c9d50c701ed7fd48e72ac0c0479e56cfacb'],
    [2080, '8f20c4e086834211fde61b862f63284457e40560074dfa71d3a17615d29ec9aa'],
    [5320, 'c82252144899da184b407af4cce72f6c07d0c2fac24d45ef90a7d1c20ad48a78'],
  ]);
  await replay(record, (game) => {
    for (const { key, ticks } of record.commonSequence) {
      press(game, key);
      advance(game, ticks);
    }
    press(game, 5);
    advance(game, 80);
    for (let turn = 0; turn < 28; turn++) {
      press(game, inputs[turn % inputs.length]);
      advance(game, 180);
      const expected = checkpoints.get(game.presentations);
      if (expected) {
        assert.equal(hash(game.readIndexedFrame()), expected, `presentation ${game.presentations}`);
        checkpoints.delete(game.presentations);
      }
    }
    assert.equal(checkpoints.size, 0);
    assert.equal(game.eventCount, 5355);
  });
});

test('ADS: couple-bowling continues through two late score updates', async () => {
  const record = json('../validation/anycall-couple-bowling.json');
  const inputs = [19, 11, 19, 10, 19, 19, 13, 19, 19, 12, 19, 19];
  // Independent Unicorn captures after each session score write and after another shot.
  const checkpoints = new Map([
    [38, [3970, '126c6b9ea175c2ece3e77017b8b50c7eec2f6887f56ac31c8a7e82dc76d6d186']],
    [42, [4350, '6f5872c59c99bbc8b4bb1f5489bf70ddb4e2f9cf6a32049539be7a2ea16c07ef']],
    [43, [4460, '81fe20c825e90ea53c557f63a39e48cfe05fb8ab6971560348f1b3c154a9fb80']],
  ]);
  await replay(record, (game) => {
    for (const { key, ticks } of record.commonSequence) {
      press(game, key);
      advance(game, ticks);
    }
    for (let turn = 0; turn < 44; turn++) {
      press(game, inputs[turn % inputs.length]);
      advance(game, 80 + (turn % 4) * 10);
      const checkpoint = checkpoints.get(turn);
      if (!checkpoint) continue;
      const [presentation, expected] = checkpoint;
      assert.equal(game.presentations, presentation, `turn ${turn}`);
      assert.equal(hash(game.readIndexedFrame()), expected, `turn ${turn}`);
    }
    assert.equal(game.eventCount, 4514);
  });
});
