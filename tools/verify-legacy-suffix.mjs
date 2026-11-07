#!/usr/bin/env node
/** Compare the preserved Ragnarok CRLF original and its covered-prefix control in native ARM. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createARM } from '../web/engine/cpu.js';
import { LegacyRuntime, parseLegacy } from '../web/engine/legacy.js';
import { TimerScheduler } from '../web/engine/timers.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const hash = (body) => createHash('sha256').update(body).digest('hex');
const options = { output: null };
const args = process.argv.slice(2);
while (args.length) {
  const name = args.shift();
  if (name !== '--output' || options.output || !args.length)
    throw Error('Usage: node tools/verify-legacy-suffix.mjs --output NEW.json');
  options.output = args.shift();
}
if (!options.output) throw Error('Require --output NEW.json');
const entry = JSON.parse(fs.readFileSync(path.join(root, 'web/data/catalog.json'))).games.find(
  (game) => game.id === 'ragnarok-gaiden-brewgames',
);
const raw = fs.readFileSync(path.join(root, 'web', entry.url));
assert.equal(hash(raw), '1148d44f550aae03115b669b9a681fd7ecd593af6396d11c0e43d0ae5e3caef9');
const parsed = parseLegacy(raw),
  prefix = raw.subarray(0, parsed.declaredSize),
  rom = fs.readFileSync(path.join(root, 'web/data/firmware/Kingston-2.12.rom')),
  plan = JSON.parse(
    fs.readFileSync(path.join(root, 'validation/brewgames-replays/ragnarok-gaiden-brewgames.json')),
  );
assert.equal(parsed.trailingBytes, 2);
assert.deepEqual([...raw.subarray(prefix.length)], [13, 10]);
fs.closeSync(fs.openSync(options.output, 'wx'));
const report = {
  schema: 1,
  utc: new Date().toISOString(),
  ok: false,
  scope:
    'Original ARM loader/interpreter: complete unchanged Ragnarok SGS and a derived covered-prefix control, each with exact and guarded execution. Compare registers/CPSR, variables, all resource payloads, framebuffer, timers, held keys, VM PC/status/events after every action. Native memory hooks observe the two suffix addresses after the SGS is copied. This neither establishes the origin of CRLF nor covers every game path.',
  toolSha256: hash(fs.readFileSync(fileURLToPath(import.meta.url))),
  parserSha256: hash(fs.readFileSync(path.join(root, 'web/engine/legacy.js'))),
  romSha256: hash(rom),
  plan,
  results: [],
};
const save = () => fs.writeFileSync(options.output, JSON.stringify(report, null, 2) + '\n');
save();
for (const fastExecution of [false, true])
  for (const [label, data] of [
    ['unchanged-original', raw],
    ['derived-covered-prefix-control', prefix],
  ]) {
    const cpu = await createARM(),
      accesses = [];
    let collecting = false;
    const write = cpu.write.bind(cpu);
    cpu.write = (address, value) => {
      write(address, value);
      if (address === 0x21000000 && value.length === data.length) collecting = true;
    };
    cpu.onMemory(
      (type, address, size, value) => {
        if (!collecting) return;
        assert.ok(accesses.length < 1000, 'Suffix observation limit');
        accesses.push({ type, address, size, value, pc: cpu.regRead('pc') });
      },
      { begin: 0x21000000 + prefix.length, end: 0x21000000 + raw.length - 1 },
    );
    let now = 0;
    const game = await LegacyRuntime.create(rom, data, {
        cpu,
        ...plan.runtime,
        fastExecution,
        nowMs: () => now,
        clock: () => new Date(Date.UTC(2026, 0, 1, 12) + now),
      }),
      timers = new TimerScheduler(),
      states = [];
    const capture = () => ({
      status: game.status,
      error: game.error,
      timeMs: now,
      events: game.eventCount,
      frameSha256: hash(game.framebufferRGBA),
      variablesSha256: hash(
        JSON.stringify(
          game.varAddresses.map((address, i) =>
            hash(cpu.read(address, game.sgs.variables[i][1] * 2)),
          ),
        ),
      ),
      resourcesSha256: hash(
        JSON.stringify(game.sgs.resources.map((_, i) => hash(game.resourceBytes(i)))),
      ),
      timers: game.timerStates,
      held: [...game.heldKeys],
      registers: Array.from({ length: 16 }, (_, i) => cpu.regRead('r' + i)),
      cpsr: cpu.regRead('cpsr'),
      pc: game.diagnostics.pc,
    });
    try {
      game.event('START');
      timers.sync(game.timerStates, now);
      states.push(capture());
      for (const [kind, value] of plan.actions) {
        if (kind === 'advance') {
          const until = now + value;
          let count = 0;
          while (game.status === 'idle') {
            const timer = timers.next();
            if (!timer || timer.at > until) break;
            assert.ok(++count <= 10000, 'Timer dispatch limit');
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
        assert.equal(game.status, 'idle', game.error);
        states.push(capture());
      }
      report.results.push({
        label,
        fastExecution,
        sourceBytes: data.length,
        sourceSha256: hash(data),
        states,
        accesses,
      });
      save();
      console.log(
        JSON.stringify({
          label,
          fastExecution,
          events: game.eventCount,
          accesses: accesses.length,
        }),
      );
    } finally {
      game.close();
    }
  }
for (const result of report.results.slice(1))
  assert.deepEqual(result.states, report.results[0].states);
report.ok = true;
save();
