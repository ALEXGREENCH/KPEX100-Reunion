import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { GnexRuntime } from '../web/engine/gnex.js';
import { TimerScheduler } from '../web/engine/timers.js';

const web = new URL('../web/', import.meta.url),
  validation = new URL('../validation/', import.meta.url),
  catalog = JSON.parse(fs.readFileSync(new URL('data/catalog.json', web))),
  evidence = JSON.parse(fs.readFileSync(new URL('s60-library-gameplay.json', validation))),
  rom = fs.readFileSync(new URL('data/firmware/Kingston-2.12.rom', web));
const hash = (body) => createHash('sha256').update(body).digest('hex');

async function replay(entry, filename, reviewedTraceIndex) {
  const plan = JSON.parse(fs.readFileSync(new URL(filename, validation)));
  let now = 0;
  const epoch = new Date(2026, 0, 1, 12).getTime(),
    game = await GnexRuntime.create(rom, fs.readFileSync(new URL(entry.url, web)), {
      ...entry.runtime,
      ...plan.runtime,
      nowMs: () => now,
      clock: () => new Date(epoch + (plan.advanceClock ? now : 0)),
    }),
    timers = new TimerScheduler();
  let reviewed;
  const capture = (index) => {
    assert.equal(game.status, 'idle', entry.id + ': ' + game.error);
    if (index === reviewedTraceIndex)
      reviewed = { timeMs: now, events: game.eventCount, rgbaSha256: hash(game.framebufferRGBA) };
  };
  try {
    game.event('START');
    timers.sync(game.timerStates, now);
    capture(0);
    for (let index = 0; index < plan.actions.length; index++) {
      const [kind, value] = plan.actions[index];
      if (kind === 'advance') {
        const until = now + value;
        let count = 0;
        while (game.status === 'idle') {
          const timer = timers.next();
          if (!timer || timer.at > until) break;
          assert.ok(++count <= 10000, 'Bounded timer delivery');
          now = timer.at;
          game.event('TIMEOUT', timer.channel);
          timers.sync(game.timerStates, now, timer.channel);
        }
        now = until;
      } else {
        assert.ok(['key', 'hold', 'release'].includes(kind));
        game.setKey(value, kind !== 'release');
        if (kind === 'key') game.setKey(value, false);
        timers.sync(game.timerStates, now);
      }
      capture(index + 1);
    }
    assert.ok(reviewed, 'Recorded checkpoint reached');
    assert.equal(game.heldKeys.size, 0, 'No test key remains held');
    return reviewed;
  } finally {
    game.close();
  }
}

for (const proof of Object.values(evidence.games))
  test(`${proof.id}: unchanged SGS reaches the recorded input/control scene`, async () => {
    const entry = catalog.games.find((game) => game.id === proof.id),
      raw = fs.readFileSync(new URL(entry.url, web));
    assert.equal(hash(raw), proof.sgsSha256);
    const expected = proof.controlProof[proof.reviewedTraceIndex],
      input = await replay(entry, proof.replay, proof.reviewedTraceIndex),
      control = await replay(entry, proof.controlReplay, proof.reviewedTraceIndex);
    assert.equal(input.timeMs, control.timeMs);
    assert.equal(input.timeMs, expected.timeMs);
    assert.equal(input.events, expected.inputEvents);
    assert.equal(control.events, expected.controlEvents);
    assert.equal(input.rgbaSha256, expected.inputRgbaSha256);
    assert.equal(control.rgbaSha256, expected.controlRgbaSha256);
    assert.notEqual(input.rgbaSha256, control.rgbaSha256);
    assert.ok(expected.differingPixels > 0);
  });
