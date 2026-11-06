#!/usr/bin/env node
/** Seeded input with virtual deadlines and a host-side Worker timeout; not a playthrough. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
const root = fileURLToPath(new URL('../', import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
if (isMainThread) {
  const options = { minutes: 10, seed: 0x12345678, game: null, prelude: null, output: null };
  const args = process.argv.slice(2);
  while (args.length) {
    const key = args.shift().replace(/^--/, '');
    if (!Object.hasOwn(options, key) || !args.length)
      throw Error(
        'Usage: node tools/stress-kpex.mjs --output NEW.json [--game ID] [--minutes 10] [--seed 12345] [--prelude actions.json]',
      );
    options[key] = ['minutes', 'seed'].includes(key) ? Number(args.shift()) : args.shift();
  }
  if (
    !Number.isFinite(options.minutes) ||
    options.minutes < 0.01 ||
    options.minutes > 60 ||
    !Number.isInteger(options.seed) ||
    options.seed < 0 ||
    options.seed > 0xffffffff ||
    !options.output
  )
    throw Error('Require a new output file, 0.01–60 minutes and a uint32 seed');
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'web/data/catalog.json')));
  const entries = catalog.games.filter(
    (g) => g.platform === 'kpex' && (!options.game || g.id === options.game),
  );
  if (!entries.length) throw Error('No matching K-PEX game');
  const prelude = options.prelude ? JSON.parse(fs.readFileSync(options.prelude)) : null;
  if (
    prelude &&
    (!Array.isArray(prelude.actions) ||
      prelude.actions.some(
        (pair) =>
          !Array.isArray(pair) ||
          !['key', 'tick', 'hold', 'release'].includes(pair[0]) ||
          !Number.isInteger(pair[1]) ||
          pair[1] < 0 ||
          pair[1] > (pair[0] === 'tick' ? 100000 : 255),
      ))
  )
    throw Error('Prelude requires bounded key/tick/hold/release pairs');
  fs.closeSync(fs.openSync(options.output, 'wx'));
  const report = {
    schema: 1,
    utc: new Date().toISOString(),
    options,
    preludeSha256: prelude ? hash(fs.readFileSync(options.prelude)) : null,
    limits:
      'Seeded input, virtual time, no physical device or full level coverage. A clean script Exit is not a freeze. Host timeout: 15 seconds without returning from an event. Wall times depend on the host and concurrent work.',
    results: [],
  };
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(2, entries.length) }, async () => {
      while (next < entries.length) {
        const entry = entries[next++];
        const result = await new Promise((resolve) => {
          const w = new Worker(new URL(import.meta.url), {
            workerData: { entry, options, prelude },
          });
          let timer,
            last = null,
            settled = false;
          const done = (result) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            w.terminate();
            resolve(result);
          };
          const arm = () => {
            clearTimeout(timer);
            timer = setTimeout(() => done({ id: entry.id, status: 'host-timeout', last }), 15000);
          };
          arm();
          w.on('message', (message) => {
            if (message.progress) {
              last = message;
              arm();
            } else done(message);
          });
          w.on('error', (error) =>
            done({ id: entry.id, status: 'host-error', error: error.message, last }),
          );
          w.on('exit', (code) => {
            if (!settled)
              done({ id: entry.id, status: 'host-error', error: 'Worker exited ' + code, last });
          });
        });
        report.results.push(result);
        fs.writeFileSync(options.output, JSON.stringify(report, null, 2) + '\n');
        console.log(
          JSON.stringify({
            id: result.id,
            status: result.status,
            virtualMs: result.virtualMs,
            wallMs: result.wallMs,
          }),
        );
      }
    }),
  );
  if (report.results.some((r) => !['idle', 'exited'].includes(r.status))) process.exitCode = 1;
} else {
  const { GnexRuntime } = await import('../web/engine/gnex.js');
  const { TimerScheduler } = await import('../web/engine/timers.js');
  const { entry, options, prelude } = workerData;
  const romEntry = JSON.parse(
    fs.readFileSync(path.join(root, 'web/data/catalog.json')),
  ).firmwares.find((r) => r.id === 'kingston-2.12');
  function original(item) {
    const bytes = fs.readFileSync(path.join(root, 'web', item.url));
    if (bytes.length !== item.bytes || hash(bytes) !== item.sha256)
      throw Error('Original hash mismatch: ' + item.id);
    return bytes;
  }
  let ms = 0,
    seed = options.seed,
    events = 0,
    longest = 0,
    r = null;
  const started = performance.now(),
    timers = new TimerScheduler(),
    lastActions = [],
    trail = [];
  const result = { id: entry.id, gameSha256: entry.sha256, romSha256: romEntry.sha256, trail };
  function event(type, value) {
    parentPort.postMessage({ progress: true, ms, type, value, events });
    const at = performance.now();
    if (type === 'down') r.setKey(value, true);
    else if (type === 'up') r.setKey(value, false);
    else r.event(type, value);
    longest = Math.max(longest, performance.now() - at);
    events++;
    lastActions.push([ms, type, value ?? null]);
    if (lastActions.length > 100) lastActions.shift();
    if (events % 1000 === 0)
      trail.push({
        ms,
        events,
        rgbaSha256: hash(r.framebufferRGBA),
        vmPc: r.diagnostics.bytecode_pc,
      });
    timers.sync(r.timerStates, ms, type === 'TIMEOUT' ? value : null);
    return r.status === 'idle';
  }
  try {
    r = await GnexRuntime.create(original(romEntry), original(entry), {
      ...entry.runtime,
      nowMs: () => ms,
      clock: () => new Date(Date.UTC(2026, 10, 6) + ms),
    });
    event('START');
    if (prelude)
      for (const [type, value] of prelude.actions) {
        if (r.status !== 'idle') break;
        if (type === 'key') {
          event('down', value);
          if (r.status === 'idle') event('up', value);
        } else if (type === 'hold') event('down', value);
        else if (type === 'release') event('up', value);
        else
          for (let i = 0; i < value && r.status === 'idle'; i++) {
            const t = timers.next();
            if (!t) break;
            ms = Math.max(ms, t.at);
            event('TIMEOUT', t.channel);
          }
      }
    result.preludeEndMs = ms;
    result.preludeFrameSha256 = hash(r.framebufferRGBA);
    const end = ms + options.minutes * 60000;
    let nextInput = ms + 200,
      releaseAt = null,
      held = null;
    while (ms < end && r.status === 'idle') {
      const timer = timers.next();
      ms = Math.min(timer?.at ?? Infinity, nextInput, releaseAt ?? Infinity, end);
      if (ms >= end) break;
      if (ms === releaseAt) {
        if (!event('up', held)) break;
        held = null;
        releaseAt = null;
      }
      if (ms === nextInput) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        if (held !== null && !event('up', held)) break;
        held = prelude
          ? [16, 17, 18, 19, 20][seed % 5]
          : ms < 2000
            ? ms < 600
              ? 21
              : 20
            : [16, 17, 18, 19, 20, 21][seed % 6];
        if (!event('down', held)) break;
        releaseAt = ms + (prelude ? 100 + (seed % 300) : 80 + (seed % 160));
        nextInput = ms + (prelude ? 500 + (seed % 500) : 300 + (seed % 700));
      }
      if (timer && ms === timer.at) event('TIMEOUT', timer.channel);
    }
    Object.assign(result, {
      status: r.status,
      error: r.error,
      virtualMs: ms,
      events,
      longestEventMs: Math.round(longest * 100) / 100,
      wallMs: Math.round(performance.now() - started),
      rgbaSha256: hash(r.framebufferRGBA),
      timerStates: r.timerStates,
      externalRequest: r.diagnostics.externalRequest,
    });
    if (r.status !== 'idle') result.lastActions = lastActions;
  } catch (error) {
    Object.assign(result, {
      status: 'host-error',
      error: error.message,
      virtualMs: ms,
      events,
      lastActions,
    });
  } finally {
    r?.close();
  }
  parentPort.postMessage(result);
}
