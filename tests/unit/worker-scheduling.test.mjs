import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { TimerScheduler } from '../../web/engine/timers.js';

// Execute the actual worker with a deterministic clock and guest. No wall-clock
// thresholds or ARM execution speed are involved in these scheduling checks.
const source = fs
  .readFileSync(new URL('../../web/worker.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?$/gm, '');

function harness(onEvent = () => {}) {
  let now = 1000;
  const messages = [],
    tasks = [],
    events = [],
    keys = [];
  const guest = {
    status: 'idle',
    timerStates: [],
    eventCount: 0,
    width: 1,
    height: 1,
    framebufferRGBA: new Uint8ClampedArray([10, 20, 30, 255]),
    event(name, channel = 0) {
      events.push({ name, channel, at: now });
      this.eventCount++;
      onEvent(this, name, channel, (milliseconds) => (now += milliseconds));
    },
    setKey(code, pressed) {
      keys.push([code, pressed]);
      this.event('KEYPRESS');
    },
    tick() {
      this.event('TIMEOUT');
    },
    releaseKeys() {},
  };
  const Runtime = { create: async () => guest };
  const sandbox = {
    GnexRuntime: Runtime,
    LegacyRuntime: Runtime,
    AdsRuntime: Runtime,
    detectVersion: () => 4,
    TimerScheduler,
    performance: { now: () => now },
    fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }),
    postMessage(message, transfer = []) {
      messages.push(structuredClone(message, { transfer }));
    },
    setTimeout(callback, delay) {
      tasks.push({ callback, delay });
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(
    source +
      '\nglobalThis.control = { command, tick, deadline: (n) => timers.deadlines.get(n)?.at };',
    sandbox,
  );
  return {
    guest,
    messages,
    tasks,
    events,
    keys,
    ...sandbox.control,
    now: () => now,
    advance(milliseconds) {
      now += milliseconds;
    },
    load(engine, gameId) {
      if (engine === 'ads') {
        guest.framebuffer = {
          takePixels: () => new Uint8ClampedArray(guest.framebufferRGBA),
        };
      }
      return sandbox.control.command({
        type: 'loadGame',
        engine,
        gameId,
        sessionId: 1,
        romUrl: 'rom',
        gameUrl: 'game',
      });
    },
  };
}

test('ADS routes additional presses and releases only for their confirmed games', async () => {
  for (const [id, key, code] of [
    ['mr-ramen', 'hash', 15],
    ['bubble-monk', 'hash', 15],
    ['omok', 'f1', 20],
    ['omok', 'f2', 14],
    ['udon-time', 'hash', null],
    ['udon-time', 'f1', null],
    ['udon-time', 'f2', null],
  ]) {
    const h = harness();
    await h.load('ads', id);
    await h.command({ type: 'key', key, pressed: true, sessionId: 1 });
    await h.command({ type: 'key', key, pressed: false, sessionId: 1 });
    assert.deepEqual(
      h.keys,
      code === null
        ? []
        : [
            [code, true],
            [code, false],
          ],
    );
  }
});

test('ADS timer retains its phase after wake-up jitter and rebases after a missed period', async () => {
  const h = harness();
  const interval = 1000 / 60;
  await h.load('ads');
  h.tick();
  assert.equal(h.tasks.at(-1).delay, 17, 'Wake after the fractional deadline');

  h.advance(17);
  h.tick();
  assert.equal(h.events.length, 1);
  assert.ok(Math.abs(h.deadline(0) - (1000 + 2 * interval)) < 1e-9);

  h.advance(200);
  h.tick();
  assert.equal(h.events.length, 2, 'A late wake must run a single guest timer');
  assert.ok(Math.abs(h.deadline(0) - (h.now() + interval)) < 1e-9);

  await h.command({ type: 'pause', sessionId: 1 });
  h.advance(50);
  await h.command({ type: 'step', sessionId: 1 });
  assert.equal(h.events.length, 3);
  assert.ok(Math.abs(h.deadline(0) - (h.now() + interval)) < 1e-9);
});

test('ADS keeps consecutive refresh slots when one frame takes longer to render', async () => {
  let updates = 0;
  const h = harness((guest, name, channel, spend) => {
    if (name !== 'TIMEOUT') return;
    const color = ++updates;
    guest.framebuffer = { takePixels: () => Uint8ClampedArray.of(color, 0, 0, 255) };
    if (color === 1) spend(8);
  });
  const frames = () => h.messages.filter((message) => message.type === 'frame');
  await h.load('ads');

  h.advance(17);
  h.tick();
  assert.equal(frames().length, 2);
  assert.equal(h.now(), 1025);
  h.advance(9);
  h.tick();
  assert.deepEqual(
    frames()
      .slice(1)
      .map((frame) => frame.pixels[0]),
    [1, 2],
  );
});

test('worker anchors new START/key timers before guest work and retains untouched deadlines', async () => {
  const h = harness((guest, name, channel, spend) => {
    if (name === 'START') {
      guest.timerStates = [{ channel: 0, delay: 20, repeat: true, revision: 1 }];
      spend(75);
    } else if (name === 'KEYPRESS') {
      guest.timerStates.push({ channel: 1, delay: 80, repeat: false, revision: 1 });
      spend(13);
    }
  });
  await h.load();
  assert.equal(h.now(), 1075);
  assert.equal(h.deadline(0), 1020, 'START execution must consume its timer interval');
  await h.command({ type: 'key', sessionId: 1, key: 'a', pressed: true });
  assert.equal(h.now(), 1088);
  assert.equal(h.deadline(0), 1020, 'Key input must not restart untouched timers');
  assert.equal(h.deadline(1), 1155, 'New key timers must not wait for guest work plus their delay');
});

test('a timer armed late in a long START receives its full requested interval', async () => {
  const h = harness((guest, name, channel, spend) => {
    if (name !== 'START') return;
    const armedAt = spend(80);
    guest.timerStates = [{ channel: 0, delay: 50, repeat: true, revision: 1, armedAt }];
    spend(20);
  });
  await h.load();
  assert.equal(h.now(), 1100);
  assert.equal(h.deadline(0), 1130, 'SetTimer time must override the START-entry fallback');
});

test('slow worker timer callbacks stay single-dispatch and preserve pause, step and resume', async () => {
  const h = harness((guest, name, channel, spend) => {
    if (name === 'START')
      guest.timerStates = [{ channel: 0, delay: 20, repeat: true, revision: 1 }];
    else if (name === 'TIMEOUT') spend(80);
  });
  await h.load();
  h.advance(20);
  h.tick();
  assert.equal(h.events.length, 2, 'An overdue guest must run only one timer callback per tick');
  assert.equal(h.now(), 1100);
  assert.equal(h.deadline(0), 1040, 'Guest CPU time must not be added to the repeating delay');
  assert.equal(h.tasks.at(-1).delay, 1, 'An overdue callback must still yield to worker commands');

  await h.command({ type: 'pause', sessionId: 1 });
  h.advance(1000);
  h.tick();
  assert.equal(h.events.length, 2, 'Paused ticks must not dispatch overdue callbacks');
  await h.command({ type: 'step', sessionId: 1 });
  assert.equal(h.events.length, 3);
  assert.equal(h.deadline(0), 2120);
  assert.equal(h.messages.at(-1).running, false);
  h.advance(500);
  await h.command({ type: 'resume', sessionId: 1 });
  assert.equal(h.deadline(0), 2620, 'Resume shifts deadlines only by time spent paused');
  h.tick();
  assert.equal(h.events.length, 4, 'Resume also dispatches at most one overdue callback per tick');
  assert.equal(h.deadline(0), 2700);
});

test('worker transfers an independent frame without detaching the guest framebuffer', async () => {
  const h = harness();
  await h.load();
  const frame = h.messages.find((message) => message.type === 'frame');
  assert.deepEqual([...frame.pixels], [10, 20, 30, 255]);
  assert.equal(h.guest.framebufferRGBA.byteLength, 4);
  h.guest.framebufferRGBA[0] = 99;
  assert.equal(frame.pixels[0], 10, 'Transferred pixels must not alias live guest memory');
});

test('the worker sends a game frame only after presentation, or when requested', async () => {
  const h = harness();
  const frames = () => h.messages.filter((message) => message.type === 'frame');
  h.guest.framebuffer = { data: h.guest.framebufferRGBA };
  await h.load();
  h.advance(20);
  await h.command({ type: 'key', sessionId: 1, key: 'a', pressed: true });
  assert.equal(frames().length, 1);

  h.guest.framebufferRGBA = Uint8ClampedArray.of(99, 20, 30, 255);
  h.guest.framebuffer = { data: h.guest.framebufferRGBA };
  await h.command({ type: 'key', sessionId: 1, key: 'a', pressed: false });
  assert.equal(frames().length, 2);
  assert.equal(frames().at(-1).pixels[0], 99);

  await h.command({ type: 'step', sessionId: 1 });
  assert.equal(frames().length, 3, 'a forced frame is emitted even without a new image');
});

test('throttled key frames flush at the display deadline without another guest timer', async () => {
  const h = harness((guest, name) => {
    if (name === 'KEYPRESS') guest.framebufferRGBA[0]++;
  });
  const frames = () => h.messages.filter((message) => message.type === 'frame');
  await h.load();
  assert.equal(frames().length, 1);
  await h.command({ type: 'key', sessionId: 1, key: 'a', pressed: true });
  await h.command({ type: 'key', sessionId: 1, key: 'left', pressed: true });
  assert.equal(h.guest.timerStates.length, 0);
  assert.equal(frames().length, 1, 'Key events must still obey the display cap');
  h.advance(16);
  h.tick();
  assert.equal(frames().length, 1, 'Pending pixels must wait for the 60 Hz deadline');
  h.advance(1);
  h.tick();
  assert.equal(frames().length, 2);
  assert.equal(frames().at(-1).pixels[0], 12, 'Display the newest of the throttled key frames');
  h.advance(100);
  h.tick();
  assert.equal(frames().length, 2, 'Idle ticks must not resend an unchanged framebuffer');
});
