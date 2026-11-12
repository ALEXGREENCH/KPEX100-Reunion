#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { FirmwareMachine } from '../web/engine/firmware.js';
import { SgsFile } from '../web/engine/sgs.js';
import { unzipSync } from '../web/vendor/fflate.js';
const usage =
  'node tools/replay-petris-state.mjs --state FILE --sgs FILE --output EMPTY_DIRECTORY --mode grid|timing';
const args = process.argv.slice(2),
  options = {};
if (args.length === 1 && args[0] === '--help') {
  console.log(usage);
  process.exit(0);
}
for (let i = 0; i < args.length; i += 2) {
  assert(
    ['--state', '--sgs', '--output', '--mode'].includes(args[i]) &&
      args[i + 1] &&
      !Object.hasOwn(options, args[i]),
    usage,
  );
  options[args[i]] = args[i + 1];
}
assert(
  ['--state', '--sgs', '--output', '--mode'].every((k) => options[k]),
  usage,
);
assert(['grid', 'timing'].includes(options['--mode']), usage);
const sha = (b) => createHash('sha256').update(b).digest('hex');
const raw = fs.readFileSync(options['--state']);
assert(raw.length < 128 * 1024 * 1024);
const metadata = unzipSync(raw, {
  filter: (f) => {
    if (f.name !== 'manifest.json') return false;
    assert(f.originalSize <= 4000000, 'State manifest is too large');
    return true;
  },
})['manifest.json'];
const manifest = JSON.parse(new TextDecoder().decode(metadata));
const firmware = fs.readFileSync(
  new URL('../web/data/firmware/Kingston-2.12.rom', import.meta.url),
);
const app = fs.readFileSync(options['--sgs']),
  sgs = new SgsFile(app);
assert.equal(sha(firmware), '743d0b9a377dc6a3f0a80b7816cee575ad2f8249643876367c4bfaac54ddd19a');
assert.equal(sha(firmware), manifest.rom_sha256);
assert.equal(sha(app), manifest.provenance.app_sha256);
assert(Number.isFinite(manifest.provenance.modeled_elapsed_ms));
const output = path.resolve(options['--output']);
assert(
  !fs.existsSync(output) || fs.readdirSync(output).length === 0,
  'Output directory must be empty',
);
fs.mkdirSync(output, { recursive: true });
const m = await FirmwareMachine.create(firmware, {
    fastIdle: true,
    traceInstructions: false,
  }),
  cpu = m.cpu;
const word = (a) => cpu.read32(a) >>> 0,
  reg = (n) => cpu.regRead(n) >>> 0;
const base = sgs.variables.findIndex((v, i) => v[1] === 8193 && sgs.variables[i + 1]?.[1] === 8192);
assert(base >= 0);
let elapsed = 0;
const ptr = (i) => word(word(0x20b405a8) + i * 8 + 4),
  value = (i) => word(ptr(base + i));
const time = () => {
  const active = m._clockRun;
  return {
    instructions: m.instructions,
    modeledMs:
      elapsed + (active ? active.ms + ((m.instructions - active.at) * 1000) / active.hz : 0),
  };
};
const state = () => ({
  frame: value(34),
  pc: value(12),
  pad: value(22),
  pending: value(23),
  failure: value(13),
});
const run = (count) => {
  for (let i = 0; i < count; i += 10000000) {
    elapsed += m.runWithNominalClock(Math.min(10000000, count - i));
    assert.equal(m.status, 'paused', m.stop_reason);
    assert.equal(value(13), 0);
  }
};
const restore = async () => {
  await m.loadState(raw);
  elapsed = manifest.provenance.modeled_elapsed_ms;
  assert.equal(value(34), 250);
};
const report = {
  scope:
    'Original Kingston 2.12 on emulated ARM, restored from a verified original-menu title state. No API result substitution or firmware patch. Modeled time is not physical-device FPS.',
  firmware: sha(firmware),
  app: sha(app),
  checkpoint: sha(raw),
  mode: options['--mode'],
};
const save = () =>
  fs.writeFileSync(
    path.join(output, 'native-' + options['--mode'] + '.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
try {
  await restore();
  if (options['--mode'] === 'grid') {
    const keys = [];
    report.results = [];
    cpu.onCode(
      () => {
        if (reg('r0') === sgs.entries.KEYPRESS && word(0x20b3eb7c))
          keys.push({ key: word(ptr(0)), ...time() });
      },
      { begin: 0x20049298, end: 0x20049298 },
    );
    for (const phase of [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110]) {
      await restore();
      keys.length = 0;
      let deadline = elapsed + phase;
      while (elapsed < deadline) run(100000);
      const pressed = time();
      m.key('start', true);
      deadline = elapsed + 80;
      while (elapsed < deadline) run(100000);
      const released = time();
      m.key('start', false);
      run(200000000);
      report.results.push({
        phase,
        pressed,
        released,
        keys: [...keys],
        state: state(),
        time: time(),
      });
      save();
      console.log(
        'Phase',
        phase,
        keys.map((k) => k.key),
      );
    }
  } else {
    report.frames = [];
    const framePointer = ptr(base + 34);
    assert(framePointer >= 0x20000000 && framePointer < 0x22000000);
    assert.equal(cpu.uc.MEM_WRITE, 17);
    cpu.onMemory(
      (type, address, size, frame) => {
        if (type !== 17) return;
        assert.equal(size, 4);
        assert.equal(address, framePointer);
        const scalars = [
          ...Array.from({ length: 19 }, (_, i) => i + 5),
          30,
          31,
          32,
          33,
          ...Array.from({ length: 15 }, (_, i) => i + 37),
        ].map((i) => value(i));
        report.frames.push({
          frame,
          ...time(),
          ram: sha(cpu.read(ptr(base + 1), 8192 * 4)),
          vram: sha(cpu.read(ptr(base + 2), 4096 * 4)),
          cram: sha(cpu.read(ptr(base + 3), 32 * 4)),
          regs: sha(cpu.read(ptr(base + 4), 11 * 4)),
          scalars,
        });
      },
      { begin: framePointer, end: framePointer + 3 },
    );
    for (let count = 0; count < 3000000000 && report.frames.at(-1)?.frame !== 301; count += 100000)
      run(100000);
    assert.equal(report.frames.at(-1)?.frame, 301);
    save();
    console.log('Observed', report.frames.length, 'native frame boundaries');
  }
} finally {
  m.close();
}
