#!/usr/bin/env node
/** Reproduce a game session with a virtual clock and original GNEX bytecode. */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { GnexRuntime } from '../web/engine/gnex.js';
import { LegacyRuntime } from '../web/engine/legacy.js';
import { TimerScheduler } from '../web/engine/timers.js';

function png(width, height, rgba) {
  const table = Array.from({ length: 256 }, (_, n) => {
    for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  const chunk = (tag, bytes) => {
    const data = Buffer.concat([Buffer.from(tag), bytes]),
      result = Buffer.alloc(bytes.length + 12);
    let crc = 0xffffffff;
    for (const value of data) crc = table[(crc ^ value) & 255] ^ (crc >>> 8);
    result.writeUInt32BE(bytes.length);
    data.copy(result, 4);
    result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
    return result;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++)
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(
      rows,
      y * (width * 4 + 1) + 1,
    );
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const project = fileURLToPath(new URL('../', import.meta.url));
let game;
try {
  const [id, actionFile, outputArgument] = process.argv.slice(2);
  if (!id || !actionFile)
    throw Error('Usage: node tools/replay-sgs.mjs GAME_ID actions.json [OUTPUT_DIRECTORY]');
  const catalog = JSON.parse(fs.readFileSync(path.join(project, 'web/data/catalog.json')));
  const entry = catalog.games.find((game) => game.id === id);
  if (!entry) throw Error('Unknown game id: ' + id);
  const plan = JSON.parse(fs.readFileSync(actionFile, 'utf8'));
  const actions = Array.isArray(plan) ? plan : plan.actions;
  if (!Array.isArray(actions) || actions.length > 1000)
    throw Error('Expected an array of up to 1000 actions');
  const output = path.resolve(outputArgument || path.join(project, 'validation/gameplay'));
  fs.mkdirSync(output, { recursive: true });
  let now = 0;
  const Runtime = entry.format < 4 ? LegacyRuntime : GnexRuntime;
  game = await Runtime.create(
    fs.readFileSync(path.join(project, 'web/data/firmware/Kingston-2.12.rom')),
    fs.readFileSync(path.join(project, 'web', entry.url)),
    {
      ...entry.runtime,
      ...plan.runtime,
      nowMs: () => now,
      clock: () => new Date(2026, 0, 1, 12, 0, 0),
      ...(entry.format === 36
        ? {
            swerve: {
              binary: fs.readFileSync(path.join(project, 'web/engine/vendor/swerve/swv21brew.mod')),
            },
          }
        : {}),
    },
  );
  const timers = new TimerScheduler(),
    trace = [];
  const capture = (label) => {
    const filename = id.replace(/[^a-zA-Z0-9_.-]/g, '_') + '-' + label + '.png';
    fs.writeFileSync(
      path.join(output, filename),
      png(game.width, game.height, game.framebufferRGBA),
    );
    trace.push({
      label,
      filename,
      status: game.status,
      error: game.error,
      timeMs: now,
      events: game.eventCount,
      timers: game.timerStates,
    });
  };
  game.event('START');
  timers.sync(game.timerStates, now);
  capture('start');
  for (let step = 0; step < actions.length && game.status === 'idle'; step++) {
    const [kind, value, deltaMs] = actions[step];
    if (!Number.isInteger(value) || value < 0 || value > 10000) throw Error('Invalid action value');
    if (kind === 'tick') {
      for (let i = 0; i < value && game.status === 'idle'; i++) {
        const timer = timers.next();
        if (!timer) break;
        now = timer.at;
        game.event('TIMEOUT', timer.channel);
        timers.sync(game.timerStates, now, timer.channel);
      }
    } else if (kind === 'manualTick') {
      if (!Number.isInteger(deltaMs) || deltaMs < 1 || deltaMs > 10000)
        throw Error('manualTick requires a virtual time delta of 1–10000 milliseconds');
      for (let i = 0; i < value && game.status === 'idle'; i++) {
        now += deltaMs;
        const active = game.timerStates.filter((timer) => timer.delay !== null);
        for (const timer of active) {
          if (game.status !== 'idle') break;
          if (game.timerStates[timer.channel].delay === null) continue;
          game.event('TIMEOUT', timer.channel);
          timers.sync(game.timerStates, now, timer.channel);
        }
      }
    } else if (['key', 'hold', 'release'].includes(kind) && value < 32) {
      game.setKey(value, kind !== 'release');
      if (kind === 'key') game.setKey(value, false);
      timers.sync(game.timerStates, now);
    } else throw Error('Unknown action: ' + kind);
    capture(`${step}-${kind}${value}`);
  }
  fs.writeFileSync(
    path.join(output, id + '.json'),
    JSON.stringify(
      {
        id,
        runtime: { ...entry.runtime, ...plan.runtime },
        clockMode: actions.some(([kind]) => kind === 'manualTick')
          ? 'Explicit manual time steps; each manualTick delivers active timer channels once per step'
          : 'TimerScheduler scheduled deadlines',
        actions,
        trace,
        diagnostics: game.diagnostics,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ id, status: game.status, error: game.error, events: game.eventCount, output }),
  );
  if (game.status === 'error') process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  game?.close();
}
