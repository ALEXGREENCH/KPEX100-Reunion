import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LegacyRuntime, parseLegacy } from '../web/engine/legacy.js';

const project = fileURLToPath(new URL('../', import.meta.url)),
  tool = path.join(project, 'tools/replay-sgs.mjs'),
  rom = path.join(project, 'web/data/firmware/Kingston-2.12.rom');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const run = (...args) =>
  spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8', timeout: 30000 });
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reunion-file-replay-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(directory)), fs.realpathSync(os.tmpdir()));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}

for (const [filename, format, runtime] of [
  ['hellfire.sgs', 4, { profile: 'kpex', width: 220, height: 176 }],
  ['bubble-bobble-lg-sd1020.sgs', 2, { profile: 'phone', width: 128, height: 128 }],
  ['gnex26_independence_day_3d.sgs', 36, { profile: 'phone', width: 176, height: 220 }],
]) {
  test(`CLI --file replays renamed SGS ${format} with an explicit profile and source digest`, (t) => {
    const original = path.join(project, 'web/data/games', filename);
    if (
      !fs.existsSync(rom) ||
      !fs.existsSync(original) ||
      (format === 36 &&
        !fs.existsSync(path.join(project, 'web/engine/vendor/swerve/swv21brew.mod')))
    ) {
      t.skip('Original ROM/game/Swerve assets are needed for this integration test');
      return;
    }
    const directory = temporary(t),
      nested = path.join(directory, 'input'),
      output = path.join(directory, 'frames'),
      actions = path.join(directory, 'actions.json');
    fs.mkdirSync(nested);
    const raw = fs.readFileSync(original),
      renamed = path.join(nested, 'uncatalogued game (copy).sgs');
    fs.writeFileSync(renamed, raw);
    fs.writeFileSync(actions, JSON.stringify({ runtime, actions: [['key', 20]] }));
    const result = run('--file', renamed, actions, output);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const id = 'local-uncatalogued_game__copy_',
      report = JSON.parse(fs.readFileSync(path.join(output, id + '.json'), 'utf8'));
    assert.equal(report.id, id);
    assert.deepEqual(report.runtime, runtime);
    assert.deepEqual(report.source, {
      kind: 'file',
      filename: path.basename(renamed),
      format,
      bytes: raw.length,
      sha256: sha256(raw),
    });
    assert.equal(report.trace.length, 2);
    assert.ok(report.trace.every((frame) => frame.status === 'idle'));
    for (const frame of report.trace) {
      assert.equal(path.basename(frame.filename), frame.filename);
      assert.ok(frame.filename.startsWith(id + '-'));
      const image = fs.readFileSync(path.join(output, frame.filename));
      assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      assert.equal(image.readUInt32BE(16), runtime.width);
      assert.equal(image.readUInt32BE(20), runtime.height);
    }
    assert.equal(sha256(fs.readFileSync(renamed)), sha256(raw), 'Input SGS stays unmodified');
    assert.deepEqual(fs.readdirSync(nested), [path.basename(renamed)]);
    assert.equal(fs.readdirSync(output).length, report.trace.length + 1);
  });
}

test('CLI --file rejects nonregular, oversized, unknown and damaged input before output creation', (t) => {
  const directory = temporary(t),
    actions = path.join(directory, 'actions.json');
  fs.writeFileSync(actions, '[]');
  const oversized = path.join(directory, 'oversized.sgs'),
    fd = fs.openSync(oversized, 'wx');
  try {
    fs.ftruncateSync(fd, 12 * 1024 * 1024 + 33);
  } finally {
    fs.closeSync(fd);
  }
  const unknown = path.join(directory, 'unknown.sgs'),
    damaged = path.join(directory, 'damaged.sgs');
  fs.writeFileSync(unknown, Buffer.alloc(128, 0xff));
  const badHeader = Buffer.alloc(128);
  badHeader[0] = 4;
  fs.writeFileSync(damaged, badHeader);
  for (const [input, expected] of [
    [directory, /regular SGS file/],
    [oversized, /12 MiB \+ 32 byte limit/],
    [unknown, /Unsupported SGS version/],
    [damaged, /section offsets/],
  ]) {
    const output = path.join(directory, 'must-not-exist'),
      result = run('--file', input, actions, output);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(result.stderr, expected);
    assert.equal(fs.existsSync(output), false);
  }
  assert.equal(run('--file', unknown, actions).status, 1, '--file requires an output directory');
});

test('oversized unwrapped legacy bodies fail before runtime initialization or output creation', (t) => {
  // Raw input allows 32 bytes for an optional wrapper, but an unwrapped body
  // still has only the 12 MiB guest region. Keep the v2 layout otherwise valid.
  const raw = new Uint8Array(12 * 1024 * 1024 + 1),
    count = Math.ceil((raw.length - 100) / (0xffff + 4)),
    end = 100 + count * 4,
    view = new DataView(raw.buffer);
  raw[0] = 2;
  [100, 100, 100, end].forEach((value, i) => view.setUint16(44 + i * 2, value, true));
  let remaining = raw.length - end;
  for (let i = 0; i < count; i++) {
    const length = Math.min(0xffff, remaining);
    view.setUint16(100 + i * 4 + 2, length, true);
    remaining -= length;
  }
  assert.equal(parseLegacy(raw).body.length, raw.length);
  assert.throws(() => new LegacyRuntime(null, raw, {}), /SGS exceeds 12 MiB guest content region/);
  const directory = temporary(t),
    input = path.join(directory, 'oversized-body.sgs'),
    actions = path.join(directory, 'actions.json'),
    output = path.join(directory, 'must-not-exist');
  fs.writeFileSync(input, raw);
  fs.writeFileSync(actions, '[]');
  const result = run('--file', input, actions, output);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stderr, /SGS exceeds 12 MiB guest content region/);
  assert.equal(fs.existsSync(output), false);
});

test('CLI advance dispatches only due timers and retains time between deadlines', (t) => {
  const directory = temporary(t),
    actions = path.join(directory, 'actions.json'),
    output = path.join(directory, 'advance');
  fs.writeFileSync(
    actions,
    JSON.stringify({
      actions: [
        ['advance', 150],
        ['advance', 50],
        ['advance', 0],
      ],
    }),
  );
  let result = run('zola', actions, output);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(fs.readFileSync(path.join(output, 'zola.json')));
  assert.deepEqual(
    report.trace.map(({ timeMs, events }) => [timeMs, events]),
    [
      [0, 1],
      [150, 2],
      [200, 3],
      [200, 3],
    ],
  );
  fs.writeFileSync(actions, JSON.stringify({ actions: [['tick', 2]] }));
  const tickOutput = path.join(directory, 'tick');
  result = run('zola', actions, tickOutput);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const tick = JSON.parse(fs.readFileSync(path.join(tickOutput, 'zola.json')));
  assert.deepEqual(
    fs.readFileSync(path.join(output, report.trace.at(-1).filename)),
    fs.readFileSync(path.join(tickOutput, tick.trace.at(-1).filename)),
  );
});
