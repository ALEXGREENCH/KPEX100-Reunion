import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LegacyRuntime } from '../web/engine/legacy.js';
import { TimerScheduler } from '../web/engine/timers.js';

const root = new URL('../web/', import.meta.url),
  catalog = JSON.parse(fs.readFileSync(new URL('data/catalog.json', root))),
  entry = catalog.games.find((game) => game.id === 'zola'),
  rom = fs.readFileSync(new URL('data/firmware/Kingston-2.12.rom', root)),
  raw = fs.readFileSync(new URL(entry.url, root)),
  plan = JSON.parse(fs.readFileSync(new URL('../validation/replay-zola.json', import.meta.url)));

async function replay({ controls = true, startData = 1, explicitStart } = {}) {
  let now = 0;
  const game = await LegacyRuntime.create(rom, raw, {
    ...entry.runtime,
    startData,
    nowMs: () => now,
    clock: () => new Date(2026, 0, 1, 12),
  });
  const timers = new TimerScheduler(),
    frames = [];
  const capture = () => frames.push({ time: now, rgba: Buffer.from(game.framebufferRGBA) });
  try {
    game.event('start', explicitStart);
    timers.sync(game.timerStates, now);
    capture();
    for (const [kind, value] of plan.actions) {
      if (kind === 'key') {
        if (controls || value === 20) {
          game.setKey(value, true);
          game.setKey(value, false);
        }
        timers.sync(game.timerStates, now);
      } else {
        for (let i = 0; i < value; i++) {
          const timer = timers.next();
          assert.ok(timer, 'the original game requested its timer');
          now = timer.at;
          game.event('TIMEOUT', timer.channel);
          timers.sync(game.timerStates, now, timer.channel);
        }
      }
      assert.equal(game.status, 'idle', game.error);
      capture();
    }
    return frames;
  } finally {
    game.close();
  }
}

test('Zola catalogue START mode reaches single-player combat and responds to controls', async () => {
  const actual = await replay(),
    control = await replay({ controls: false });
  assert.deepEqual(
    actual.map((frame) => frame.time),
    control.map((frame) => frame.time),
  );
  assert.deepEqual(actual[0].rgba, control[0].rgba);
  for (const index of [5, 7, 11]) {
    assert.notDeepEqual(
      actual[index].rgba,
      control[index].rgba,
      `input at ${actual[index].time}ms`,
    );
  }
});

test('an explicit START value overrides the catalogue default without changing other event data', async () => {
  const zero = await replay({ startData: 0 }),
    overridden = await replay({ explicitStart: 0 });
  assert.deepEqual(overridden, zero);
  assert.notDeepEqual((await replay()).at(-1).rgba, zero.at(-1).rgba);
});
