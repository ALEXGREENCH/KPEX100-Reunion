#!/usr/bin/env node
// Observe the original firmware clock across a single Mobile C callback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { FirmwareMachine } from '../web/engine/firmware.js';
import { createDisk } from '../web/engine/disk.js';
import { SgsFile } from '../web/engine/sgs.js';
const read = (p) => fs.readFileSync(new URL(p, import.meta.url));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  console.log('node tools/probe-kingston-callback-clock.mjs --output NEW.json');
  process.exit(0);
}
if (args.length !== 2 || args[0] !== '--output' || !args[1])
  throw Error('Expected --output NEW.json');
const output = args[1];
if (fs.existsSync(output)) throw Error('Output file already exists');
const firmware = read('../web/data/firmware/Kingston-2.12.rom');
assert.equal(sha(firmware), '743d0b9a377dc6a3f0a80b7816cee575ad2f8249643876367c4bfaac54ddd19a');
const app = read('fixtures/kingston-callback-clock/clock.sgs');
assert.equal(sha(app), '8c79353af9698c1a7259415894271b0c31a8323f41f4c51bb9c1b4a5a4502573');
const script = new SgsFile(app),
  index = script.variables.findIndex((v) => v[1] === 17);
assert(index >= 0);
const m = await FirmwareMachine.create(firmware, {
  diskImage: createDisk([{ name: 'TICK.SGS', data: app }], firmware),
  adoptDiskImage: true,
  fastIdle: true,
  traceInstructions: false,
});
const cpu = m.cpu,
  word = (a) => cpu.read32(a) >>> 0;
let elapsed = 0,
  entry = null;
const hooks = new Set(),
  events = [];
const time = () => {
  const a = m._clockRun;
  return {
    instructions: m.instructions,
    modeledMs: elapsed + (a ? a.ms + ((m.instructions - a.at) * 1000) / a.hz : 0),
    cpsr: cpu.regRead('cpsr') >>> 0,
    irqs: m.irq_count,
  };
};
const run = (n) => {
  for (let i = 0; i < n; i += 1000000) {
    elapsed += m.runWithNominalClock(Math.min(1000000, n - i));
    assert.equal(m.status, 'paused', m.stop_reason);
  }
};
const values = () => {
  const t = word(0x20b405a8),
    p = t >= 0x20000000 && t < 0x21000000 ? word(t + index * 8 + 4) : 0;
  return p >= 0x20000000 && p < 0x21000000
    ? Array.from({ length: 17 }, (_, i) => word(p + i * 4))
    : [];
};
const menu = (k) => {
  m.key(k, true);
  run(6000000);
  m.key(k, false);
  run(60000000);
};
try {
  run(500000000);
  for (const k of ['right', 'right', 'a']) menu(k);
  cpu.onCode(
    () => {
      if (cpu.regRead('r0') >>> 0 !== script.entries.TIMEOUT) return;
      entry = time();
      const lr = cpu.regRead('lr') >>> 0;
      if (hooks.has(lr)) return;
      hooks.add(lr);
      cpu.onCode(
        () => {
          if (entry) {
            events.push({ start: entry, end: time() });
            entry = null;
          }
        },
        { begin: lr, end: lr },
      );
    },
    { begin: 0x20049298, end: 0x20049298 },
  );
  menu('a');
  for (let i = 0; i < 500000000 && (!events.length || values()[16] !== 0x454e4421); i += 1000000)
    run(1000000);
  assert.equal(values()[16], 0x454e4421);
  assert(events.length);
  const report = {
    scope:
      'Original Kingston 2.12 on emulated ARM. One long generated TIMEOUT handler; no physical-device measurement.',
    firmware: sha(firmware),
    app: sha(app),
    values: values(),
    events,
  };
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(report);
} finally {
  m.close();
}
