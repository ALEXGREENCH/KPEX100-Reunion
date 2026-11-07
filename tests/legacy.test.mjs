import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { LegacyRuntime, parseLegacy } from '../web/engine/legacy.js';
import { detectVersion } from '../web/engine/sgs.js';
import { TimerScheduler } from '../web/engine/timers.js';
const root = new URL('../web/', import.meta.url),
  rom = fs.readFileSync(new URL('data/firmware/Kingston-2.12.rom', root));
const catalog = JSON.parse(fs.readFileSync(new URL('data/catalog.json', root))),
  profiles = JSON.parse(
    fs.readFileSync(new URL('../validation/legacy-profiles.json', import.meta.url)),
  ).profiles;
const game = (id) => fs.readFileSync(new URL('data/games/' + id + '.sgs', root));
const create = (id) =>
  LegacyRuntime.create(rom, game(id), {
    width: 176,
    height: 220,
    ...(profiles[id] || catalog.games.find((item) => item.id === id)?.runtime),
  });

test('all catalogue legacy containers have consistent native 16-bit layouts', () => {
  const games = catalog.games.filter((g) => [1, 2].includes(g.format));
  assert.equal(games.length, 35);
  for (const g of games) {
    const raw = game(g.id),
      s = parseLegacy(raw);
    assert.equal(s.version, detectVersion(raw));
    assert.ok(s.variables.length >= 9);
    assert.ok(s.entries.START);
    assert.ok(s.resources.length);
  }
  const broken = new Uint8Array(game(games[0].id));
  const s = parseLegacy(broken);
  broken[s.wrapperBytes + 44] = 0;
  broken[s.wrapperBytes + 45] = 0;
  assert.throws(() => parseLegacy(broken), /layout/);
});

test('legacy hardware timers start only when requested by original SGS', async () => {
  const g = await create('gnex25_ys3_the_oath_in_felghana');
  try {
    assert.equal(g.event('START').status, 'idle');
    assert.ok(g.timerStates.every((t) => t.delay === null));
    // Original YS3 starts in its speed settings dialog and requests CLR.
    g.setKey(13, true);
    g.setKey(13, false);
    g.event('KEYPRESS', 20);
    g.event('KEYPRESS', 20);
    assert.equal(g.status, 'idle');
    assert.ok(g.timerStates.some((t) => t.delay !== null));
    for (let i = 0; i < 5; i++)
      for (const t of g.timerStates) if (t.delay !== null) g.event('TIMEOUT', t.channel);
    assert.equal(g.status, 'idle');
  } finally {
    g.close();
  }
});

test('old Exit is honored and virtual handset identity permits original authentication', async () => {
  const id = 'gnex13_mu_-_fairy';
  const bad = await LegacyRuntime.create(rom, game(id), {
    deviceUserId: 'BAD',
    width: 128,
    height: 160,
  });
  try {
    assert.equal(bad.event('START').status, 'exited');
    const n = bad.eventCount;
    bad.event('KEYPRESS', 20);
    assert.equal(bad.eventCount, n);
  } finally {
    bad.close();
  }
  const good = await create(id);
  try {
    assert.equal(good.event('START').status, 'idle');
    assert.equal(good.timerStates[0].delay, 50);
    assert.equal(good.cpu.read32(0x20b41274), 128);
    assert.equal(good.cpu.read32(0x20b41278), 160);
  } finally {
    good.close();
  }
});

test('all legacy original START handlers and armed timer channels execute without guest errors', async () => {
  for (const item of catalog.games.filter((g) => [1, 2].includes(g.format))) {
    const g = await create(item.id);
    try {
      assert.equal(g.event('START').status, 'idle', item.id + ': ' + g.error);
      for (let i = 0; i < 3; i++)
        for (const t of g.timerStates) if (t.delay !== null) g.event('TIMEOUT', t.channel);
      assert.equal(g.status, 'idle', item.id + ': ' + g.error);
      assert.equal(g.framebufferRGBA.length, g.width * g.height * 4);
    } finally {
      g.close();
    }
  }
});

test('v1 and v2 native physical flushes publish actual pixels in the phone display', async () => {
  for (const id of ['gnex21_eska2', 'gnex16_bubble_bubble']) {
    const g = await create(id);
    let expected,
      presentations = 0;
    const present = g._presentLCD.bind(g);
    g._presentLCD = (...args) => {
      const source = g.cpu.read32(0x20b41260);
      expected = g.cpu.read(source, g.width * g.height * 2).slice();
      presentations++;
      present(...args);
    };
    try {
      g.event('START');
      for (let i = 0; i < 3; i++) {
        for (const timer of g.timerStates) {
          if (timer.delay !== null) g.event('TIMEOUT', timer.channel);
        }
      }
      assert.equal(g.status, 'idle', id + ': ' + g.error);
      assert.ok(presentations > 0, id + ' must reach the native physical screen callback');
      const rgba = new Uint8ClampedArray(g.width * g.height * 4);
      for (let i = 0, j = 0; i < expected.length; i += 2, j += 4) {
        const color = expected[i] | (expected[i + 1] << 8);
        rgba[j] = Math.floor(((color >>> 11) * 255) / 31);
        rgba[j + 1] = Math.floor((((color >>> 5) & 63) * 255) / 63);
        rgba[j + 2] = Math.floor(((color & 31) * 255) / 31);
        rgba[j + 3] = 255;
      }
      assert.ok(
        rgba.some((value, i) => i % 4 !== 3 && value !== 0),
        id + ' contains visible graphics',
      );
      assert.deepEqual(
        g.framebufferRGBA,
        rgba,
        id + ' displays the last submitted native RGB565 image',
      );
    } finally {
      g.close();
    }
  }
});

test('legacy explicit instruction budgets cannot disable the execution limit', async () => {
  const g = await create('gnex25_ys3_the_oath_in_felghana');
  try {
    for (const budget of [0, -1, null, NaN, Infinity, 0.5, 100_000_001])
      assert.throws(() => g.event('START', 0, budget), /Invalid instruction budget/);
    g.event('START', 0, 1);
    assert.equal(g.status, 'error');
    assert.match(g.error, /instruction budget/);
  } finally {
    g.close();
  }
});

test('Fortress Tournament loads the map with its timer budget and responds to movement and fire', async () => {
  const entry = catalog.games.find((item) => item.id === 'fortress-tournament-lg-sd1000');
  const { actions } = JSON.parse(
    fs.readFileSync(new URL('../validation/replay-fortress-tournament.json', import.meta.url)),
  );
  for (const budget of [20_000_000, entry.runtime.timeoutWorkBudget]) {
    let now = 0;
    const g = await LegacyRuntime.create(rom, game(entry.id), {
      ...entry.runtime,
      timeoutWorkBudget: budget,
      nowMs: () => now,
      clock: () => new Date(2026, 0, 1, 12),
    });
    const timers = new TimerScheduler(),
      frames = [];
    try {
      g.event('START');
      timers.sync(g.timerStates, now);
      for (const [kind, value] of actions) {
        if (kind === 'key') {
          g.setKey(value, true);
          g.setKey(value, false);
          timers.sync(g.timerStates, now);
        } else {
          const until = now + value;
          for (let timer = timers.next(); timer && timer.at <= until; timer = timers.next()) {
            now = timer.at;
            g.event('TIMEOUT', timer.channel);
            if (g.status !== 'idle') break;
            timers.sync(g.timerStates, now, timer.channel);
          }
          now = until;
        }
        frames.push(createHash('sha256').update(g.framebufferRGBA).digest('hex'));
        if (g.status !== 'idle') break;
      }
      if (budget === 20_000_000) {
        assert.equal(frames.length, 7);
        assert.match(g.error, /block work budget/);
        continue;
      }
      assert.equal(g.status, 'idle', g.error);
      assert.equal(g.heldKeys.size, 0);
      assert.equal(frames[6], 'd361a8ad84911cd5069ba3181ab62923913e2a61265fb181466b8e2b9ba803f4');
      assert.equal(frames[8], '8204d590405483f012fefc1f240fda86afc57a74286f7725e2048ee6443597ff');
      assert.equal(frames[11], 'ebf2d56b3751b69c4f2dd4da45f42e01a16c79bee6d444059a51f4c07e1f88de');
    } finally {
      g.close();
    }
  }
});

test('legacy user NV storage uses exact original byte driver and persists per application', async () => {
  const id = 'gnex25_ys3_the_oath_in_felghana',
    g = await create(id);
  let saved;
  try {
    g.vfs.onSave = (value) => (saved = value);
    const p = 0x23300000,
      original = Uint8Array.of(1, 0, 255, 127, 0, 128, 255, 255);
    g.cpu.write(p, original);
    const call = (f) => {
      g.cpu.regWrite('r0', p);
      g.cpu.regWrite('r1', 8);
      g.cpu.regWrite('sp', 0x23ff0000);
      g.cpu.regWrite('lr', 0x23fff000);
      g.cpu.run(0x2000f8dc + f, 0x23fff000, 100000);
    };
    call(0x420f8);
    g.cpu.write(p, new Uint8Array(8));
    call(0x42058);
    assert.deepEqual(g.cpu.read(p, 8), original);
    assert.ok(saved.includes('usernv.bin'));
  } finally {
    g.close();
  }
  const restored = await LegacyRuntime.create(rom, game(id), { saveData: saved });
  try {
    assert.deepEqual([...restored.vfs.files.get('usernv.bin')], [1, 0, 255, 127, 0, 128, 255, 255]);
  } finally {
    restored.close();
  }
});
