#!/usr/bin/env node
// Replay the original Kingston 2.12 menu, filesystem and ADC path on emulated ARM.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FirmwareMachine } from '../web/engine/firmware.js';
import { createDisk } from '../web/engine/disk.js';
import { SgsFile } from '../web/engine/sgs.js';
import { VirtualFileSystem } from '../web/engine/vfs.js';

const usage =
  'node tools/replay-petris-native.mjs --output DIRECTORY [--sgs PETRIS.SGS] [--pulse-ms 40..120]';
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  console.log(usage);
  process.exit(0);
}
const options = Object.create(null);
for (let i = 0; i < args.length; i += 2) {
  const flag = args[i];
  if (
    !['--output', '--sgs', '--pulse-ms'].includes(flag) ||
    !args[i + 1] ||
    args[i + 1].startsWith('--') ||
    Object.hasOwn(options, flag)
  )
    throw Error(usage);
  options[flag] = args[i + 1];
}
if (!options['--output']) throw Error(usage);
const pulseMs = options['--pulse-ms'] === undefined ? null : Number(options['--pulse-ms']);
if (pulseMs !== null && (!Number.isInteger(pulseMs) || pulseMs < 40 || pulseMs > 120))
  throw Error('Pulse duration must be an integer from 40 to 120 modeled milliseconds');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(options['--output']);
if (fs.existsSync(output) && fs.readdirSync(output).length)
  throw Error('Output directory must be empty; existing results will not be overwritten');
fs.mkdirSync(output, { recursive: true });
const read = (file) => fs.readFileSync(path.join(root, file));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const app = options['--sgs']
  ? fs.readFileSync(path.resolve(options['--sgs']))
  : read('web/data/games/demo-petris.sgs');
const firmware = read('web/data/firmware/Kingston-2.12.rom');
const cart = read('demos/gg/petris/PETRIS.GG');
assert.equal(digest(firmware), '743d0b9a377dc6a3f0a80b7816cee575ad2f8249643876367c4bfaac54ddd19a');
assert.equal(digest(cart), '2de507b5708cc66020a700e3f4674216cb3374fc5d39369da86221bb34a07ba9');
const script = new SgsFile(app);
assert.deepEqual(Buffer.from(new VirtualFileSystem(script).files.get('petris.ggr')), cart);
const base = script.variables.findIndex(
  (v, i) => v[1] === 8193 && script.variables[i + 1]?.[1] === 8192,
);
assert(base >= 0);
const scroll = script.variables.findIndex((v, i) => i > base && v[1] === 144) - base;
assert.equal(scroll, 35, 'Unsupported Petris global layout');
const disk = createDisk(
  [
    { name: 'PETRIS.SGS', data: app },
    { name: 'PETRIS.GGR', data: cart },
  ],
  firmware,
);
const machine = await FirmwareMachine.create(firmware, {
  diskImage: disk,
  adoptDiskImage: true,
  fastIdle: true,
  traceInstructions: false,
});
const cpu = machine.cpu;
const word = (address) => cpu.read32(address) >>> 0;
const register = (name) => cpu.regRead(name) >>> 0;
const inRam = (address) => address >= 0x20000000 && address < 0x22000000;
const pointer = (index) => {
  const table = word(0x20b405a8);
  return inRam(table) ? word(table + index * 8 + 4) : 0;
};
const value = (index, offset = 0) => {
  const address = pointer(base + index);
  return inRam(address) ? word(address + offset * 4) : 0;
};
const state = () => ({
  frame: value(34),
  pc: value(12),
  pad: value(22),
  pending: value(23),
  failure: value(13),
});
const vramByte = (offset) => (value(2, offset >> 2) >>> ((offset & 3) * 8)) & 255;
const sprites = () => {
  const sat = (value(4, 5) & 126) << 7;
  return Array.from({ length: 32 }, (_, i) => [
    vramByte(sat + i),
    vramByte(sat + 128 + i * 2),
    vramByte(sat + 129 + i * 2),
  ]);
};
let elapsed = 0,
  status = 'incomplete',
  readBuffer = 0;
const io = [],
  keys = [],
  inputs = [],
  stages = [];
const time = () => {
  const active = machine._clockRun;
  return {
    instructions: machine.instructions,
    modeledMs:
      elapsed + (active ? active.ms + ((machine.instructions - active.at) * 1000) / active.hz : 0),
  };
};
const hook = (address, callback) => cpu.onCode(callback, { begin: address, end: address });
function installObservers() {
  hook(0x20049298, () => {
    if (register('r0') === script.entries.KEYPRESS && word(0x20b3eb7c))
      keys.push({ key: word(pointer(0)), ...time() });
  });
  hook(0x20052374, () =>
    io.push({
      operation: 'open',
      path: Buffer.from(cpu.read(register('r0'), 64))
        .toString('ascii')
        .split('\0')[0],
      mode: register('r1'),
    }),
  );
  hook(0x2005de20, () => {
    if (io.at(-1)?.operation === 'open') io.at(-1).result = register('r0') | 0;
  });
  hook(0x20052400, () => {
    readBuffer = register('r1');
    io.push({ operation: 'read', requested: register('r2') });
  });
  hook(0x2005e068, () => {
    const item = io.at(-1);
    if (item?.operation !== 'read') return;
    item.result = register('r0') | 0;
    if (item.result === cart.length) item.sha256 = digest(cpu.read(readBuffer, cart.length));
  });
  hook(0x2005de54, () => io.push({ operation: 'close', result: register('r0') | 0 }));
}
function run(count) {
  for (let i = 0; i < count; i += 10_000_000) {
    elapsed += machine.runWithNominalClock(Math.min(10_000_000, count - i));
    assert.equal(machine.status, 'paused', machine.stop_reason);
  }
}
function receipt() {
  fs.writeFileSync(
    path.join(output, 'native-petris.json'),
    JSON.stringify(
      {
        scope:
          'Original Kingston 2.12 menu and ADC on emulated ARM. Modeled time is not a physical-device measurement. Short presses only; long-hold firmware release behavior is a separate check.',
        status,
        pulseMs,
        appHash: digest(app),
        cartHash: digest(cart),
        firmwareHash: digest(firmware),
        io,
        keys,
        inputs,
        stages,
        state: state(),
        time: time(),
      },
      null,
      2,
    ) + '\n',
  );
}
function until(predicate, name, limit, quantum = 20_000_000) {
  for (let i = 0; i < limit && !predicate(); i += quantum) {
    run(Math.min(quantum, limit - i));
    assert.equal(state().failure, 0, JSON.stringify({ name, state: state() }));
    if (i && i % 800_000_000 < quantum)
      console.log(JSON.stringify({ waiting: name, ...time(), state: state() }));
  }
  assert(predicate(), JSON.stringify({ name, ...time(), state: state(), io }));
}
function menu(key) {
  machine.key(key, true);
  run(6_000_000);
  machine.key(key, false);
  run(60_000_000);
}
const waitFrame = (target, name) => until(() => state().frame >= target, name, 28_000_000_000);
function stage(name, target) {
  waitFrame(target, name);
  const frame = Buffer.from(machine.framebufferRGBA);
  fs.writeFileSync(path.join(output, name + '.rgba'), frame);
  stages.push({
    stage: name,
    ...time(),
    state: state(),
    sha256: digest(frame),
    sprites: sprites(),
  });
  receipt();
  console.log(JSON.stringify(stages.at(-1)));
}
function hold(name, code, count) {
  const input = { name, code, pressed: time(), pressedFrame: state().frame };
  const firstKey = keys.length;
  inputs.push(input);
  machine.key(name, true);
  try {
    if (pulseMs === null) waitFrame(state().frame + count, name);
    else {
      const deadline = elapsed + pulseMs;
      while (elapsed < deadline) run(100_000);
    }
  } finally {
    input.released = time();
    input.releasedFrame = state().frame;
    machine.key(name, false);
  }
  if (pulseMs !== null)
    until(
      () => keys.slice(firstKey).some((key) => key.key === code),
      name + ' pulse delivery',
      200_000_000,
      1_000_000,
    );
}
try {
  run(500_000_000);
  for (const key of ['right', 'right', 'a']) menu(key);
  installObservers();
  menu('a');
  until(() => io.some((e) => e.operation === 'close'), 'cartridge read', 750_000_000);
  assert(
    io.some(
      (e) =>
        e.operation === 'open' && e.path === 'GAME/PETRIS.GGR' && e.mode === 3 && e.result >= 0,
    ),
  );
  assert(
    io.some((e) => e.operation === 'read' && e.result === cart.length && e.sha256 === digest(cart)),
  );
  assert(io.some((e) => e.operation === 'close' && e.result === 0));
  assert.deepEqual(Buffer.from(cpu.read(pointer(base), cart.length)), cart);
  stage('title', 250);
  hold('start', 21, 3);
  stage('start', 317);
  hold('a', 20, 3);
  stage('confirm', 384);
  hold('a', 20, 3);
  stage('second-confirm', 486);
  stage('board', 786);
  hold('right', 17, 3);
  stage('piece-right', 816);
  hold('a', 20, 2);
  stage('piece-rotate', 846);
  hold('down', 19, 3);
  stage('piece-drop', 876);
  for (const s of stages.slice(4))
    assert.equal(s.state.pad | s.state.pending | s.state.failure, 0, s.stage);
  const [board, right, rotate, down] = stages.slice(4).map((s) => s.sprites[0]);
  assert.equal(right[1], board[1] + 8, 'Right moves one cell');
  assert.equal(right[2], board[2]);
  assert.deepEqual(rotate.slice(0, 2), right.slice(0, 2));
  assert.equal(rotate[2], right[2] + 4, 'Select changes rotation');
  assert.deepEqual(down.slice(1), rotate.slice(1));
  assert(down[0] > rotate[0], 'Figure is lower after Down; this does not measure acceleration');
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i],
      end = inputs[i + 1]?.pressed.instructions ?? machine.instructions;
    const press = keys.find(
      (e) =>
        e.key === input.code &&
        e.instructions >= input.pressed.instructions &&
        e.instructions <= end,
    );
    const release = keys.find(
      (e) =>
        e.key === 255 && e.instructions >= input.released.instructions && e.instructions <= end,
    );
    assert(press && release && press.instructions < release.instructions, input.name);
  }
  status = 'passed';
} finally {
  receipt();
  machine.close();
}
