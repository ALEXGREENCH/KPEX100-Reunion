#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { GnexRuntime } from '../web/engine/gnex.js';
const read = (p) => fs.readFileSync(new URL(p, import.meta.url));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const usage = 'node tools/replay-petris-frames.mjs DIAGNOSTIC.sgs EMPTY_OUTPUT_DIRECTORY';
if (process.argv.length === 3 && process.argv[2] === '--help') {
  console.log(usage);
  process.exit(0);
}
assert.equal(process.argv.length, 4, usage);
const firmware = read('../web/data/firmware/Kingston-2.12.rom');
assert.equal(sha(firmware), '743d0b9a377dc6a3f0a80b7816cee575ad2f8249643876367c4bfaac54ddd19a');
const appFile = process.argv[2],
  directory = path.resolve(process.argv[3]);
assert(
  !fs.existsSync(directory) || fs.readdirSync(directory).length === 0,
  'Output directory must be empty',
);
fs.mkdirSync(directory, { recursive: true });
const output = (name) => path.join(directory, name);
await replay();
async function replay() {
  const name = 'frames';
  const sgs = fs.readFileSync(appFile),
    g = await GnexRuntime.create(firmware, sgs, { profile: 'kpex' });
  const base = g.sgs.variables.findIndex(
    (v, i) => v[1] === 8193 && g.sgs.variables[i + 1]?.[1] === 8192,
  );
  const probe = g.sgs.variables.findIndex((v) => v[1] === 4336);
  assert(base >= 0 && probe >= 0 && g.sgs.variables[probe + 1][1] === 8192);
  const val = (i, j = 0) => g.cpu.read32(g.varAddresses[i] + j * 4) >>> 0;
  const cpu = g.cpu,
    desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(cpu), 'blockBudget');
  let initial = null,
    work = 0,
    last = -1,
    presented = -1;
  const charges = [],
    frames = {},
    presentations = [];
  Object.defineProperty(cpu, 'blockBudget', {
    get: () => desc.get.call(cpu),
    set: (value) => {
      if (value !== null) initial = value;
      else if (initial !== null) {
        work = initial - (desc.get.call(cpu) ?? 0);
        initial = null;
      }
      desc.set.call(cpu, value);
    },
  });
  const out = {
    scope:
      'Instrumented Petris replay with guest-frame inputs. This diagnostic program does not test native keypad delivery or physical FPS.',
    sgs: sha(sgs),
    frames,
    presentations,
    charges,
    status: 'incomplete',
  };
  const save = () =>
    fs.writeFileSync(output(name + '-probe.json'), JSON.stringify(out, null, 2) + '\n');
  try {
    g.event('START');
    assert.equal(g.status, 'idle', g.error);
    for (let count = 0; count < 20000 && last < 890; count++) {
      g.event('TIMEOUT', 0);
      charges.push(work);
      assert.equal(g.status, 'idle', g.error);
      assert.equal(val(base + 13), 0);
      const frame = val(probe, 4285);
      if (frame !== 0xffffffff && frame !== last) {
        assert.equal(frame, last + 1);
        const data = Buffer.from(cpu.read(g.varAddresses[probe], 4336 * 4));
        const ram = Buffer.from(cpu.read(g.varAddresses[probe + 1], 8192 * 4));
        frames[frame] = {
          callback: count + 1,
          data: sha(data),
          ram: sha(ram),
          work: charges.reduce((a, b) => a + b, 0),
        };
        if ([0, 30, 250, 317, 384, 486, 536, 786, 800, 810, 890].includes(frame)) {
          fs.writeFileSync(output(name + '-' + frame + '.vdp'), data);
          fs.writeFileSync(output(name + '-' + frame + '.ram'), ram);
          console.log(name, 'snapshot', frame, frames[frame]);
          save();
        }
        last = frame;
      }
      const shown = val(probe + 5);
      if (shown !== 0xffffffff && shown !== presented) {
        const pixels = Buffer.from(g.framebufferRGBA);
        presentations.push({ frame: shown, callback: count + 1, sha256: sha(pixels) });
        if ([250, 317, 384, 486, 536, 786, 800, 810, 890].includes(shown))
          fs.writeFileSync(output(name + '-shown-' + shown + '.rgba'), pixels);
        presented = shown;
      }
    }
    assert.equal(last, 890);
    out.status = 'passed';
    out.totalWork = charges.reduce((a, b) => a + b, 0);
    out.maxWork = Math.max(...charges);
  } finally {
    save();
    g.close();
  }
}
