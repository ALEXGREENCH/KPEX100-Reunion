#!/usr/bin/env node
/** Compare exact and guarded ARM execution with identical deterministic SGS input. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const options = {
  root: path.resolve(here, '..'),
  runs: 3,
  frames: 60,
  warmups: 1,
  swerveMode: 'auto',
  games:
    'hellfire,kpetris,ikaria,godori,gnex13_mu_-_fairy,gnex26_independence_day_3d,gnex1_1zimae,gnex19_super_action_hero',
  output: null,
};
const usage =
  'Usage: node tools/benchmark-web.mjs [--root DIR] [--runs 3] [--frames 60] [--warmups 1] [--games id,id] [--swerveMode auto|exact|guarded] [--output FILE]';
if (process.argv.includes('--help')) {
  console.log(usage);
  process.exit(0);
}
for (let i = 2; i < process.argv.length; i++) {
  const name = process.argv[i].replace(/^--/, '');
  if (!(name in options) || process.argv[i] === name || !process.argv[i + 1]) throw Error(usage);
  options[name] = ['runs', 'frames', 'warmups'].includes(name)
    ? Number(process.argv[++i])
    : process.argv[++i];
}
for (const [name, min, max] of [
  ['runs', 1, 21],
  ['frames', 1, 10000],
  ['warmups', 0, 10],
])
  if (!Number.isInteger(options[name]) || options[name] < min || options[name] > max)
    throw Error(`Invalid --${name}: expected integer ${min}..${max}`);
if (!['auto', 'exact', 'guarded'].includes(options.swerveMode)) throw Error('Invalid --swerveMode');

process.env.TZ = 'UTC';
const root = path.resolve(options.root);
const web = path.join(root, 'web');
const { GnexRuntime } = await import(pathToFileURL(path.join(web, 'engine/gnex.js')));
const { LegacyRuntime } = await import(pathToFileURL(path.join(web, 'engine/legacy.js')));
const { initCpu } = await import(pathToFileURL(path.join(web, 'engine/cpu.js')));
const catalog = JSON.parse(fs.readFileSync(path.join(web, 'data/catalog.json')));
const rom = fs.readFileSync(path.join(web, 'data/firmware/Kingston-2.12.rom'));
const hash = (data) => createHash('sha256').update(data).digest('hex');
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const stable = (value) =>
  JSON.stringify(value, (key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
const selected = options.games.split(',').map((id) => {
  const entry = catalog.games.find((item) => item.id === id);
  if (!entry) throw Error('Unknown game: ' + id);
  return { ...entry, data: fs.readFileSync(path.join(web, entry.url)) };
});
const swerve = selected.some((entry) => entry.format === 36)
  ? fs.readFileSync(path.join(web, 'engine/vendor/swerve/swv21brew.mod'))
  : null;

await initCpu(); // Exclude one-time WASM compilation from both execution modes.
const report = {
  schema: 1,
  createdAt: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: os.cpus()[0]?.model,
  },
  parameters: {
    runs: options.runs,
    frames: options.frames,
    warmups: options.warmups,
    swerveMode: options.swerveMode,
  },
  methodology: [
    'Real GNEX/legacy/Swerve WASM runtimes in Node; this measures guest work, not browser paint FPS, network or audio synthesis.',
    'Paired exact/guarded runs alternate order. Fresh runtime each time; optional warmups excluded; medians reported.',
    'START and exactly frames explicit manual TIMEOUT calls, including unarmed timers. This is a deterministic execution benchmark, not browser scheduler replay.',
    'Civil clock starts 2026-01-01T12:00:00Z and monotonic clock advances by the selected armed timer delay or 50 ms fallback. First five Swerve intro steps use 500 ms.',
    'Frame-trail SHA hashes pixels after each event and input; hashes and result inspection are outside measured guest-call time.',
    'Every mode and repetition must match frames, status, error, event count, syscalls and timer states. Guarded/exact call routing is checked independently.',
    'SGS36 retains exact GNEX VM timing in both modes; its native Swerve renderer uses the selected execution mode. Other formats use guarded VM execution and safe native helpers when enabled.',
  ],
  romSha256: hash(rom),
  games: [],
};

async function run(entry, fastExecution) {
  let virtualMs = 0;
  const civilEpoch = Date.parse('2026-01-01T12:00:00Z');
  const Runtime = entry.format < 4 ? LegacyRuntime : GnexRuntime;
  const started = performance.now();
  const runtime = await Runtime.create(rom, entry.data, {
    ...entry.runtime,
    fastExecution,
    nowMs: () => virtualMs,
    clock: () => new Date(civilEpoch + virtualMs),
    ...(entry.format === 36
      ? {
          swerve: {
            binary: swerve,
            fastExecution:
              options.swerveMode === 'auto' ? fastExecution : options.swerveMode === 'guarded',
          },
        }
      : {}),
  });
  const initializationMs = performance.now() - started;
  let guestMs = 0,
    guardedCalls = 0,
    exactCalls = 0,
    swerveGuardedCalls = 0,
    swerveExactCalls = 0;
  const frameTrail = createHash('sha256');
  const checkpoints = [];
  try {
    if (typeof runtime.cpu.runGuarded !== 'function')
      throw Error(
        'Expected ArmCPU.runGuarded and fastExecution constructor option; refusing a false before/after comparison',
      );
    const guarded = runtime.cpu.runGuarded.bind(runtime.cpu);
    runtime.cpu.runGuarded = (...args) => {
      guardedCalls++;
      return guarded(...args);
    };
    const exact = runtime.cpu.run.bind(runtime.cpu);
    runtime.cpu.run = (...args) => {
      exactCalls++;
      return exact(...args);
    };
    if (runtime.swerve) {
      const cpu = runtime.swerve.machine.cpu,
        nativeGuarded = cpu.runGuarded.bind(cpu),
        nativeExact = cpu.run.bind(cpu);
      cpu.runGuarded = (...args) => {
        swerveGuardedCalls++;
        return nativeGuarded(...args);
      };
      cpu.run = (...args) => {
        swerveExactCalls++;
        return nativeExact(...args);
      };
    }
    function call(action) {
      const at = performance.now();
      action();
      guestMs += performance.now() - at;
      if (runtime.status !== 'idle')
        throw Error(`${entry.id}: ${runtime.status}: ${runtime.error}`);
      frameTrail.update(runtime.framebufferRGBA);
    }
    function key(code) {
      call(() => runtime.setKey(code, true));
      call(() => runtime.setKey(code, false));
    }
    function checkpoint(frame) {
      checkpoints.push({
        frame,
        timeMs: virtualMs,
        rgbaSha256: hash(runtime.framebufferRGBA),
        events: runtime.eventCount,
      });
    }
    call(() => runtime.event('START'));
    checkpoint(0);
    for (let i = 0; i < options.frames; i++) {
      if (i === 5) key(entry.id === 'hellfire' ? 21 : entry.format === 36 ? 5 : 20);
      if (i > 5 && i % 10 === 0) key(i % 20 === 0 ? 16 : 17);
      const timer = runtime.timerStates.find((state) => state.delay > 0);
      virtualMs += entry.format === 36 && i < 5 ? 500 : timer?.delay || 50;
      call(() => runtime.event('TIMEOUT', timer?.channel || 0));
      if ((i + 1) % 20 === 0 || i + 1 === options.frames) checkpoint(i + 1);
    }
    const expectGuardedVm = fastExecution && entry.format !== 36;
    const expectGuardedSwerve =
      entry.format === 36 &&
      (options.swerveMode === 'auto' ? fastExecution : options.swerveMode === 'guarded');
    if (guardedCalls > 0 !== expectGuardedVm || swerveGuardedCalls > 0 !== expectGuardedSwerve)
      throw Error(
        `fastExecution=${fastExecution} selected unexpected routing: ${guardedCalls} guarded VM calls, ${swerveGuardedCalls} guarded Swerve calls`,
      );
    return {
      initializationMs,
      guestMs,
      guardedCalls,
      exactCalls,
      swerveGuardedCalls,
      swerveExactCalls,
      result: {
        rgbaSha256: hash(runtime.framebufferRGBA),
        frameTrailSha256: frameTrail.digest('hex'),
        width: runtime.width,
        height: runtime.height,
        status: runtime.status,
        error: runtime.error,
        events: runtime.eventCount,
        syscalls: { ...runtime.syscalls },
        timerStates: runtime.timerStates,
        virtualMs,
        checkpoints,
      },
    };
  } finally {
    runtime.close();
  }
}

for (const entry of selected) {
  console.error(`Benchmark: ${entry.id}`);
  const record = {
    id: entry.id,
    format: entry.format,
    gameSha256: hash(entry.data),
    exact: [],
    guarded: [],
  };
  report.games.push(record);
  try {
    for (let i = 0; i < options.warmups; i++) {
      await run(entry, false);
      await run(entry, true);
    }
    let expected;
    for (let i = 0; i < options.runs; i++)
      for (const fast of i % 2 === 0 ? [false, true] : [true, false]) {
        const measured = await run(entry, fast);
        const fingerprint = stable(measured.result);
        expected ??= fingerprint;
        measured.matches = fingerprint === expected;
        record[fast ? 'guarded' : 'exact'].push(measured);
      }
    record.matches = [...record.exact, ...record.guarded].every((r) => r.matches);
    record.medianExactMs = median(record.exact.map((r) => r.guestMs));
    record.medianGuardedMs = median(record.guarded.map((r) => r.guestMs));
    record.speedup = record.medianExactMs / record.medianGuardedMs;
    console.error(
      `  ${record.medianExactMs.toFixed(1)} -> ${record.medianGuardedMs.toFixed(1)} ms (${record.speedup.toFixed(2)}x), matching=${record.matches}`,
    );
  } catch (error) {
    record.error = String(error.stack || error);
    record.matches = false;
    console.error('  ' + error.message);
  }
}
report.passed = report.games.every((entry) => entry.matches);
const output = JSON.stringify(report, null, 2) + '\n';
if (options.output) fs.writeFileSync(path.resolve(options.output), output);
else process.stdout.write(output);
if (!report.passed) process.exitCode = 1;
