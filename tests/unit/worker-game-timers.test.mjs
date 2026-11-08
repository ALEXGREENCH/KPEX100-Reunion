import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { TimerScheduler } from '../../web/engine/timers.js';

const source = readFileSync(new URL('../../web/worker.js', import.meta.url), 'utf8').replace(
  /^import .*;\r?$/gm,
  '',
);

function gameHarness({ startDelay = null } = {}) {
  let now = 1000,
    nextHandle = 0;
  const pending = new Map(),
    messages = [],
    events = [];
  const guest = {
    width: 1,
    height: 1,
    profile: 'kpex',
    status: 'idle',
    timerStates: [],
    framebuffer: { data: Uint8ClampedArray.of(0, 0, 0, 255) },
    draw(color) {
      this.framebuffer = { data: Uint8ClampedArray.of(color, color, color, 255) };
    },
    arm(delay) {
      this.timerStates = [
        {
          channel: 0,
          delay,
          repeat: true,
          revision: (this.timerStates[0]?.revision ?? 0) + 1,
          armedAt: now,
        },
      ];
    },
    event(name, channel) {
      events.push({ name, channel, at: now });
      if (name === 'START' && startDelay !== null) this.arm(startDelay);
      if (name === 'TIMEOUT') this.onTimer?.();
    },
    setKey(code, pressed) {
      events.push({ name: 'key', code, pressed, at: now });
      this.onKey?.(code, pressed);
    },
  };
  const sandbox = {
    TimerScheduler,
    GnexRuntime: { create: async () => guest },
    FirmwareMachine: {
      create: async () => ({
        status: 'paused',
        instructions: 0,
        lcd_pixel_writes: 0,
        framebufferRGBA: Uint8ClampedArray.of(0, 0, 0, 255),
        run(budget) {
          this.instructions += budget;
        },
      }),
    },
    createDisk: () => new Uint8Array(0),
    detectVersion: () => 4,
    performance: { now: () => now },
    fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }),
    postMessage: (message) => messages.push(message),
    setTimeout(callback, delay) {
      const id = ++nextHandle;
      pending.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(source + '\nglobalThis.drain = () => queue;', sandbox);
  const command = async (message) => {
    sandbox.onmessage({ data: message });
    await sandbox.drain();
    assert.ok(pending.size <= 1, 'one wakeup at a time');
  };
  return {
    guest,
    messages,
    events,
    command,
    load: () => command({ type: 'loadGame', romUrl: 'firmware', gameUrl: 'game', sessionId: 1 }),
    deadline: () => vm.runInContext('timers.next()?.at ?? null', sandbox),
    scheduledAt: () => pending.values().next().value?.at ?? null,
    elapse(ms) {
      now += ms;
    },
    wake(at) {
      assert.ok(pending.size === 1);
      const [id, task] = pending.entries().next().value;
      assert.ok(at >= now && at >= task.at, 'wake must reach its scheduled time');
      now = at;
      pending.delete(id);
      task.callback();
      assert.ok(pending.size <= 1, 'one wakeup after each dispatch');
    },
  };
}

test('idle direct games wake for status and paused games wait for a command', async () => {
  const h = gameHarness();
  await h.load();
  h.wake(1025);
  assert.equal(h.scheduledAt(), 1250);
  h.wake(1250);
  assert.equal(h.scheduledAt(), 1500);
  assert.deepEqual(
    h.events.map((x) => x.name),
    ['START'],
  );
  await h.command({ type: 'pause' });
  assert.equal(h.scheduledAt(), null);
  assert.equal(h.messages.filter((x) => x.type === 'audio').at(-1).action, 'pause');
  h.elapse(1000);
  await h.command({ type: 'resume' });
  assert.equal(h.scheduledAt(), 2500);
  assert.equal(h.messages.filter((x) => x.type === 'audio').at(-1).action, 'resume');
});

test('repeating timers retain phase after a short wake delay and rebase after stalls', async () => {
  const h = gameHarness({ startDelay: 20 });
  await h.load();
  assert.equal(h.scheduledAt(), 1012);
  h.wake(1012);
  assert.deepEqual(
    h.events.map((x) => x.name),
    ['START'],
  );
  h.wake(1027);
  assert.equal(h.deadline(), 1040);
  h.wake(1080);
  assert.equal(h.deadline(), 1100);
  assert.deepEqual(
    h.events.filter((x) => x.name === 'TIMEOUT').map((x) => x.at),
    [1027, 1080],
  );

  h.guest.onTimer = () => h.elapse(12);
  h.wake(1108);
  assert.equal(h.deadline(), 1128, 'a callback crossing its next slot rebases');
  h.guest.onTimer = () => {
    h.elapse(5);
    h.guest.arm(50);
  };
  h.wake(1130);
  assert.equal(h.deadline(), 1185, 'new guest timer uses its arm time');
});

test('a key rearms an idle game immediately and pause shifts the guest deadline', async () => {
  const h = gameHarness();
  await h.load();
  h.wake(1025);
  h.guest.onKey = (code, pressed) => {
    assert.equal(code, 0x10);
    if (pressed) h.guest.arm(20);
  };
  h.elapse(25);
  await h.command({ type: 'key', key: 'left', pressed: true });
  assert.equal(h.deadline(), 1070);
  assert.equal(h.scheduledAt(), 1062);
  h.elapse(10);
  await h.command({ type: 'pause' });
  assert.equal(h.scheduledAt(), null);
  h.elapse(100);
  await h.command({ type: 'resume' });
  assert.equal(h.deadline(), 1170);
  h.wake(1169);
  assert.ok(!h.events.some((x) => x.name === 'TIMEOUT'));
  h.wake(1170);
  assert.equal(h.events.at(-1).channel, 0);
});

test('a pending key frame is presented even after pausing a timerless game', async () => {
  const h = gameHarness();
  await h.load();
  assert.equal(h.messages.filter((x) => x.type === 'frame').length, 1);
  h.guest.onKey = () => h.guest.draw(85);
  h.elapse(5);
  await h.command({ type: 'key', key: 'left', pressed: true });
  await h.command({ type: 'pause' });
  assert.equal(h.scheduledAt(), 1009);
  h.wake(1017);
  const frames = h.messages.filter((x) => x.type === 'frame');
  assert.equal(frames.length, 2);
  assert.deepEqual([...frames[1].pixels], [85, 85, 85, 255]);
  assert.equal(h.scheduledAt(), null);
});

test('switching from a paused direct game wakes the firmware loop', async () => {
  const h = gameHarness();
  await h.load();
  await h.command({ type: 'pause' });
  assert.equal(h.scheduledAt(), null);
  await h.command({ type: 'boot', sessionId: 2, romUrl: 'firmware', diskGames: [] });
  assert.equal(h.scheduledAt(), 1001);
  h.wake(1001);
  assert.equal(h.scheduledAt(), 1002);
});
