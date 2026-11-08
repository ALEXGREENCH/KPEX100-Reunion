import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { TimerScheduler } from '../../web/engine/timers.js';
import { hasNominalClock } from '../../web/engine/firmware-clock.js';

const source = fs
  .readFileSync(new URL('../../web/worker.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?$/gm, '');

function harness({ deferredFetch = false, firmwareChannel = false } = {}) {
  let now = 1000;
  const fetched = [],
    pending = new Map(),
    created = [],
    disks = [],
    messages = [],
    scheduled = [];
  const sandbox = {
    TimerScheduler,
    hasNominalClock,
    performance: { now: () => now },
    fetch(url) {
      fetched.push(url);
      const response = (bytes) => ({
        ok: true,
        arrayBuffer: async () => Uint8Array.from(bytes).buffer,
      });
      return deferredFetch
        ? new Promise((resolve) => pending.set(url, (bytes) => resolve(response(bytes))))
        : Promise.resolve(response([1, 2, 3]));
    },
    createDisk(files, rom) {
      const disk = Uint8Array.of(files.length, rom[0]);
      disks.push({ files, rom, disk });
      return disk;
    },
    FirmwareMachine: {
      async create(rom, options) {
        const guest = {
          instructions: 0,
          status: 'paused',
          width: 1,
          height: 1,
          framebufferRGBA: Uint8ClampedArray.of(0, 0, 0, 255),
          lcd_pixel_writes: 0,
          nominalCpuHz: 200000,
          rom_info: {
            sha256: [
              null,
              '743d0b9a377dc6a3f0a80b7816cee575ad2f8249643876367c4bfaac54ddd19a',
              '4c3a8b1ca0282e23ae7696857a919842732e71d0bbccb093c41a0746435b40c2',
            ][rom[0]],
          },
          keys: [],
          budgets: [],
          runOptions: [],
          key(key, pressed) {
            this.keys.push({ key, pressed, at: this.instructions });
          },
          run(budget, options) {
            this.budgets.push(budget);
            this.runOptions.push(options);
            this.instructions += budget;
            now += budget / 10000;
          },
          runWithNominalClock(budget) {
            this.run(budget, { snapshot: false });
            return this.clockDurationMs ?? (budget * 1000) / this.nominalCpuHz;
          },
          snapshot() {
            return { instructions: this.instructions, status: this.status };
          },
          async loadState(bytes) {
            this.stateBytes = bytes;
          },
          close() {
            this.closed = true;
          },
        };
        created.push({ rom, options, guest });
        return guest;
      },
    },
    postMessage(message, transfer = []) {
      messages.push(structuredClone(message, { transfer }));
    },
    setTimeout(_callback, delay) {
      scheduled.push(delay);
    },
  };
  if (firmwareChannel)
    sandbox.MessageChannel = class {
      port1 = {};
      port2 = { postMessage: () => scheduled.push(this.port1.onmessage) };
    };
  vm.createContext(sandbox);
  vm.runInContext(source + '\nglobalThis.control = { command, tick };', sandbox);
  return {
    ...sandbox.control,
    fetched,
    created,
    disks,
    messages,
    scheduled,
    elapse(ms) {
      now += ms;
    },
    reply(url, bytes) {
      assert.ok(pending.has(url), 'Download started: ' + url);
      pending.get(url)(bytes);
    },
    boot(sessionId = 1) {
      return sandbox.control.command({ type: 'boot', sessionId, romUrl: 'rom', diskGames: [] });
    },
  };
}

test('firmware yields through queued tasks with periodic timer pacing and stops on pause', async () => {
  const h = harness({ firmwareChannel: true });
  await h.boot();
  h.tick();
  assert.equal(h.scheduled.at(-1), h.tick);
  h.scheduled.at(-1)();
  assert.equal(h.scheduled.at(-1), h.tick);
  h.scheduled.at(-1)();
  assert.equal(h.scheduled.at(-1), 1);

  h.tick();
  assert.equal(h.scheduled.at(-1), h.tick);
  await h.command({ type: 'pause', sessionId: 1 });
  const before = h.created[0].guest.instructions;
  h.scheduled.at(-1)();
  assert.equal(h.created[0].guest.instructions, before);
  assert.equal(h.scheduled.at(-1), 25);
});

test('nominal clock pacing caps each supported slice and skips work before its deadline', async () => {
  const h = harness({ firmwareChannel: true });
  await h.boot();
  await h.command({ type: 'firmwareClock', sessionId: 1, enabled: true });
  const g = h.created[0].guest;
  h.tick();
  assert.equal(g.instructions, 4000);
  assert.equal(h.scheduled.at(-1), 20);
  h.tick();
  assert.equal(g.instructions, 4000);
  await h.command({ type: 'firmwareClock', sessionId: 1, enabled: false });
  h.tick();
  assert.ok(g.instructions > 8000);
});

test('nominal pacing carries timer rounding forward and bounds catch-up after a stall', async () => {
  const h = harness({ firmwareChannel: true });
  await h.boot();
  await h.command({ type: 'firmwareClock', sessionId: 1, enabled: true });
  const g = h.created[0].guest;
  g.clockDurationMs = 2.6;
  h.tick();
  assert.equal(h.scheduled.at(-1), 3);
  h.elapse(3);
  h.tick();
  assert.equal(h.scheduled.at(-1), 2, 'Rounding the first timeout must not slow every slice');
  h.elapse(2000);
  for (let i = 0; i < 12; i++) h.tick();
  assert.equal(typeof h.scheduled.at(-1), 'number', 'The worker returns to timed waits');
  assert.ok(h.scheduled.at(-1) > 1);
});

test('the firmware switch accepts a measured Cenix ROM and rejects an unknown hash', async () => {
  for (const [romByte, budget] of [
    [2, 4000],
    [3, 100000],
  ]) {
    const h = harness({ deferredFetch: true });
    const boot = h.command({
      type: 'boot',
      sessionId: 1,
      romUrl: 'rom',
      diskGames: [],
      firmwareClock: true,
    });
    h.reply('rom', [romByte]);
    await boot;
    h.tick();
    assert.deepEqual(h.created[0].guest.budgets, [budget]);
  }
});

test('cold boot fetches ROM and all supplied local/hosted games concurrently and adopts only its new disk', async () => {
  const h = harness({ deferredFetch: true });
  const loading = h.command({
    type: 'boot',
    sessionId: 1,
    romUrl: 'blob:rom',
    diskGames: [
      { id: 'hellfire', url: 'data/hellfire.sgs' },
      { id: 'local-game', url: 'blob:local-game' },
    ],
  });
  assert.deepEqual(h.fetched, ['blob:rom', 'data/hellfire.sgs', 'blob:local-game']);
  assert.equal(h.created.length, 0, 'No machine or disk is allocated before its inputs arrive');
  h.reply('data/hellfire.sgs', [10, 11]);
  h.reply('blob:local-game', [20, 21, 22]);
  h.reply('blob:rom', [30, 31]);
  await loading;
  assert.deepEqual(
    Array.from(h.disks[0].files, (file) => file.name),
    ['HELLFIRE.SGS', 'R0000001.SGS'],
  );
  assert.deepEqual(Array.from(h.disks[0].files[1].data), [20, 21, 22]);
  assert.equal(h.created[0].options.diskImage, h.disks[0].disk);
  assert.equal(h.created[0].options.adoptDiskImage, true);
  assert.equal(h.created[0].options.traceInstructions, false);
  await h.command({ type: 'reset', sessionId: 1 });
  assert.equal(h.fetched.length, 3, 'Reset must reuse the downloaded originals');
  assert.equal(h.disks.length, 2, 'Reset builds fresh writable media');
  assert.notEqual(h.disks[0].disk, h.disks[1].disk);
});

test('quickstate fetches concurrently with its ROM and never builds or downloads a game disk', async () => {
  const h = harness({ deferredFetch: true });
  const loading = h.command({
    type: 'loadState',
    sessionId: 2,
    romUrl: 'rom',
    stateUrl: 'blob:state',
  });
  assert.deepEqual(h.fetched, ['rom', 'blob:state']);
  h.reply('blob:state', [90, 91]);
  h.reply('rom', [30, 31]);
  await loading;
  assert.equal(h.disks.length, 0);
  assert.equal(h.created[0].options.diskImage, undefined);
  assert.equal(h.created[0].options.adoptDiskImage, false);
  assert.deepEqual(Array.from(h.created[0].guest.stateBytes), [90, 91]);
  assert.equal(h.created[0].guest.keys.length, 10);
  assert.ok(h.created[0].guest.keys.every((event) => !event.pressed));
  await h.command({ type: 'reset', sessionId: 1 });
  assert.equal(h.created.length, 1, 'An old session reset must not replace the loaded state');
});

test('firmware pause releases both physically held keys and stretched short taps', async () => {
  const h = harness();
  await h.boot();
  const g = h.created[0].guest;
  await h.command({ type: 'key', sessionId: 1, key: 'left', pressed: true });
  await h.command({ type: 'key', sessionId: 1, key: 'right', pressed: true });
  await h.command({ type: 'key', sessionId: 1, key: 'right', pressed: false });
  await h.command({ type: 'pause', sessionId: 1 });
  assert.deepEqual(
    g.keys
      .filter((event) => !event.pressed)
      .map((event) => event.key)
      .sort(),
    ['left', 'right'],
  );
  const releases = g.keys.length;
  await h.command({ type: 'resume', sessionId: 1 });
  h.tick();
  assert.equal(g.keys.length, releases, 'Pause must clear deferred release bookkeeping');
});

test('firmware slices stop at pending key releases and a new load resets adaptive work size', async () => {
  const h = harness();
  await h.boot();
  const g = h.created[0].guest;
  await h.command({ type: 'key', sessionId: 1, key: 'a', pressed: true });
  await h.command({ type: 'key', sessionId: 1, key: 'a', pressed: false });
  g.instructions = 7000000 - 50;
  h.tick();
  assert.equal(g.budgets[0], 50);
  assert.equal(g.runOptions[0].snapshot, false);
  assert.deepEqual(g.keys.at(-1), { key: 'a', pressed: false, at: 7000000 });
  for (let i = 0; i < 4; i++) h.tick();
  await h.boot(2);
  h.tick();
  assert.equal(h.created[1].guest.budgets[0], 100000);
});

test('firmware sends changed LCD pixels while idle ticks stay quiet and forced frames still work', async () => {
  const h = harness();
  const frames = () => h.messages.filter((message) => message.type === 'frame');
  await h.boot();
  const g = h.created[0].guest;
  assert.equal(frames().length, 1, 'A fresh load must present its initial screen');
  for (let i = 0; i < 5; i++) h.tick();
  assert.equal(frames().length, 1, 'CPU activity without LCD writes must not resend pixels');
  g.framebufferRGBA[0] = 99;
  g.lcd_pixel_writes++;
  h.tick();
  assert.equal(frames().length, 2);
  assert.equal(frames().at(-1).pixels[0], 99);
  h.tick();
  assert.equal(frames().length, 2);
  await h.command({ type: 'step', sessionId: 1 });
  assert.equal(g.runOptions.at(-1).snapshot, false);
  assert.equal(frames().length, 3, 'Manual steps must force a frame even without LCD writes');
  await h.boot(2);
  assert.equal(frames().length, 4, 'A replacement machine must not inherit display suppression');
});
