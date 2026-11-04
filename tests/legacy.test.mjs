import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LegacyRuntime, parseLegacy } from '../web/engine/legacy.js';
import { detectVersion } from '../web/engine/sgs.js';
const root = new URL('../web/', import.meta.url),
  rom = fs.readFileSync(new URL('data/firmware/Kingston-2.12.rom', root));
const catalog = JSON.parse(fs.readFileSync(new URL('data/catalog.json', root))),
  profiles = JSON.parse(
    fs.readFileSync(new URL('../validation/legacy-profiles.json', import.meta.url)),
  ).profiles;
const game = (id) => fs.readFileSync(new URL('data/games/' + id + '.sgs', root));
const create = (id) =>
  LegacyRuntime.create(rom, game(id), { width: 176, height: 220, ...profiles[id] });

test('all ten original legacy containers have consistent native 16-bit layouts', () => {
  const games = catalog.games.filter((g) => [1, 2].includes(g.format));
  assert.equal(games.length, 10);
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
