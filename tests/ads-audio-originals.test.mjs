import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { AdsRuntime } from '../web/engine/ads.js';
import { initSmaf, renderSmaf } from '../web/engine/smaf.js';

const read = (path) => readFileSync(new URL(path, import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function recordAudio(id) {
  const original = read(`../web/data/games/anycall/${id}.mbin`);
  const requests = [];
  const game = await AdsRuntime.create(original, {
    id,
    audio: {
      play: (bytes, mime, loop) => requests.push({ bytes, mime, loop }),
      stop: () => requests.push({ stop: true }),
    },
  });
  return { original, requests, game };
}

function press(game, key) {
  game.setKey(key, true);
  game.setKey(key, false);
}

function advance(game, ticks) {
  for (let i = 0; i < ticks; i++) game.tick();
}

test('Mobile GoStop key 5 sends the original SMAF effect and decodes to PCM', async () => {
  const replay = JSON.parse(read('../validation/anycall-mobile-gostop.json'));
  const { original, requests, game } = await recordAudio(replay.game);
  try {
    assert.equal(hash(original), replay.mbinSha256);
    for (const { key, ticks } of replay.commonSequence) {
      if (key !== null) press(game, key);
      advance(game, ticks);
    }
    const before = requests.length;
    press(game, 5);
    const effects = requests.slice(before);
    assert.equal(effects.length, 1);
    const { bytes, mime, loop } = effects[0];
    assert.equal(mime, 'audio/x-smaf');
    assert.equal(loop, false);
    // The original guest points into the MBIN at this offset and size.
    assert.deepEqual(Buffer.from(bytes), original.subarray(36909, 37291));
    assert.equal(hash(bytes), '0e0678c30ff10f07f7695ba6bb83e4c2e72cb79720337b9d0eda8a1aacf8c0e2');

    await initSmaf({ wasmBinary: read('../web/engine/vendor/smaf.wasm') });
    const pcm = await renderSmaf(bytes, { maxSeconds: 2, yieldTask: async () => {} });
    assert.equal(pcm.rate, 44100);
    assert.equal(pcm.frames, 66149);
    assert.equal(pcm.truncated, false);
    assert.ok(pcm.peak > 0.29);
    assert.ok(pcm.wave.subarray(44).some((byte) => byte !== 0));
  } finally {
    game.close();
  }
});

test('Mr. Ramen coalesces adjacent requests for the original timer clip', async () => {
  const { original, requests, game } = await recordAudio('mr-ramen');
  try {
    advance(game, 220);
    for (const key of [19, 19, 19, 19, 19, 1]) {
      press(game, key);
      advance(game, 20);
    }
    press(game, 5);
    const before = requests.length;
    const clip = {
      bytes: Uint8Array.from(original.subarray(45801, 50178)),
      mime: 'audio/x-smaf',
      loop: false,
    };

    // The guest stops and requests this clip in each of 14 adjacent timer events.
    advance(game, 14);
    assert.deepEqual(requests.slice(before), [clip]);
    // One timer event without a request separates this burst from the next.
    advance(game, 1);
    assert.deepEqual(requests.slice(before), [clip]);
    advance(game, 1);
    assert.deepEqual(requests.slice(before), [clip, clip]);
  } finally {
    game.close();
  }
});
