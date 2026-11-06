import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { LegacyRuntime } from '../web/engine/legacy.js';
import { TimerScheduler } from '../web/engine/timers.js';

const raw = fs.readFileSync(new URL('../web/data/games/hellfire-witop-v1.sgs', import.meta.url));
const rom = fs.readFileSync(new URL('../web/data/firmware/Kingston-2.12.rom', import.meta.url));
const hash = (b) => createHash('sha256').update(b).digest('hex');
async function session(fastExecution = true) {
  let now = 0;
  const timers = new TimerScheduler();
  const g = await LegacyRuntime.create(rom, raw, {
    width: 120,
    height: 100,
    fastExecution,
    nowMs: () => now,
    clock: () => new Date(Date.UTC(2026, 0, 1, 12) + now),
  });
  assert.equal(g.fastVmExecution, fastExecution);
  const calls = { exact: 0, guarded: 0 };
  for (const [method, counter] of [
    ['run', 'exact'],
    ['runGuarded', 'guarded'],
  ]) {
    const original = g.cpu[method].bind(g.cpu);
    g.cpu[method] = (...args) => {
      calls[counter]++;
      return original(...args);
    };
  }
  const key = (value, down) => {
    g.setKey(value, down);
    assert.equal(g.status, 'idle', g.error);
    timers.sync(g.timerStates, now);
  };
  const tick = (count) => {
    for (let i = 0; i < count; i++) {
      const t = timers.next();
      assert.ok(t, 'original game keeps its explicit timer armed');
      now = t.at;
      g.event('TIMEOUT', t.channel);
      assert.equal(g.status, 'idle', g.error);
      timers.sync(g.timerStates, now, t.channel);
    }
  };
  g.event('START');
  assert.equal(g.status, 'idle', g.error);
  assert.equal(g.legacyChatLockValue, 0);
  assert.equal(g.timerStates[0].delay, 300);
  timers.sync(g.timerStates, now);
  tick(40);
  key(20, true);
  key(20, false);
  tick(8);
  return {
    g,
    key,
    tick,
    calls,
    get now() {
      return now;
    },
  };
}

test('unmodified WI-TOP Hellfire reaches combat and responds to its original five keys', async () => {
  assert.equal(hash(raw), '37a3310b683e47b90e070e8772ac3ad267be172d11799f1168a2350fe448eec8');
  const results = [];
  for (const key of [null, 1, 7, 4, 5, 3]) {
    const s = await session();
    try {
      const scalar = (i) =>
        new DataView(s.g.cpu.read(s.g.varAddresses[i], 2).buffer).getInt16(0, true);
      const before = [scalar(30), scalar(31)];
      if (key !== null) s.key(key, true);
      s.tick(10);
      if (key !== null) s.key(key, false);
      results.push({
        key,
        before,
        after: [scalar(30), scalar(31)],
        frame: hash(s.g.framebufferRGBA),
      });
      assert.equal(s.g.framebufferRGBA.length, 120 * 100 * 4);
    } finally {
      s.g.close();
    }
  }
  const baseline = results[0];
  for (const row of results.slice(1)) {
    assert.deepEqual(row.before, baseline.before);
    assert.notEqual(
      row.frame,
      baseline.frame,
      'same elapsed time, different real guest input: ' + row.key,
    );
  }
  for (const [key, axis, delta] of [
    [1, 1, -6],
    [7, 1, 6],
    [4, 0, -6],
    [5, 0, 6],
  ]) {
    const row = results.find((r) => r.key === key);
    assert.equal(row.after[axis] - baseline.after[axis], delta);
    assert.equal(row.after[1 - axis], baseline.after[1 - axis]);
  }
});

test('WI-TOP Hellfire preserves frames, variables and timers across exact and guarded ten-minute runs', async () => {
  const results = [];
  for (const fast of [false, true]) {
    const s = await session(fast),
      trail = createHash('sha256');
    let seed = 12345,
      held = null;
    try {
      for (let tick = 0; tick < 2000; tick++) {
        if (tick % 3 === 0) {
          if (held !== null) s.key(held, false);
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          held = [1, 7, 4, 5, 3, 20][seed % 6];
          s.key(held, true);
        }
        s.tick(1);
        trail.update(s.g.framebufferRGBA);
      }
      if (held !== null) s.key(held, false);
      results.push({
        trail: trail.digest('hex'),
        frame: hash(s.g.framebufferRGBA),
        variables: s.g.sgs.variables.map((v, i) =>
          hash(s.g.cpu.read(s.g.varAddresses[i], v[1] * 2)),
        ),
        timers: s.g.timerStates,
        now: s.now,
        events: s.g.eventCount,
        lock: s.g.legacyChatLockValue,
      });
      assert.ok(s.now >= 600000);
      assert.equal(s.g.status, 'idle');
      assert.equal(s.calls.guarded > 0, fast, 'both execution routes must actually be exercised');
      assert.ok(s.calls.exact > 0 || s.calls.guarded > 0);
    } finally {
      s.g.close();
    }
  }
  assert.deepEqual(results[1], results[0]);
});
