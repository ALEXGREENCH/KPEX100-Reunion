#!/usr/bin/env node
/** Observe the original firmware's VM input arguments, through emulated hardware keys. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { FirmwareMachine } from '../web/engine/firmware.js';
import { SgsFile } from '../web/engine/sgs.js';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
export async function traceNativeKeyEvents(rom, state, game) {
  const identities = {
    rom: '743d0b9a377dc6a3f0a80b7816cee575ad2f8249643876367c4bfaac54ddd19a',
    state: '29dc80cb5ca38b491f3196f14510aa15fb144ebae4716d745687c8e26591851d',
    game: 'e13a9ddadaf05774b7f4d71a4f9a43ff742835bfc3b8c3389703bcf679391622',
  };
  for (const [name, bytes] of Object.entries({ rom, state, game }))
    if (sha(bytes) !== identities[name]) throw Error('Unexpected original ' + name + ' SHA-256');
  const machine = await FirmwareMachine.create(rom, { fastIdle: true, traceInstructions: false });
  try {
    await machine.loadState(state);
    const script = new SgsFile(game),
      records = [];
    const base = machine.cpu.read32(0x20b3eb7c);
    const bytecodeHash = sha(machine.cpu.read(base + 128, script.a - 128));
    if (bytecodeHash !== sha(script.body.subarray(128, script.a)))
      throw Error('Reached state bytecode differs from original Hell Fire');
    let phase = 'idle';
    const start = machine.instructions;
    machine.cpu.onCode(
      () => {
        const entry = machine.cpu.regRead('r0');
        if (entry !== script.entries.KEYPRESS) return;
        const table = machine.cpu.read32(0x20b405a8),
          var0 = machine.cpu.read32(table + 4);
        records.push({
          phase,
          instructions: machine.instructions,
          entry,
          value: machine.cpu.read32(var0),
        });
      },
      { begin: 0x20049298, end: 0x20049298 },
    );
    for (const [name, key, pressed] of [
      ['idle', null, false],
      ['press-select', 'a', true],
      ['release-select', 'a', false],
      ['press-right', 'right', true],
      ['release-right', 'right', false],
    ]) {
      phase = name;
      if (key) machine.key(key, pressed);
      machine.run(5_000_000, { snapshot: false });
      if (machine.status === 'error') throw Error(machine.error);
    }
    return {
      schema: 1,
      utc: new Date().toISOString(),
      scope:
        'Original Kingston 2.12 firmware and reached Hell Fire state, modeled hardware key presses/releases. No direct VM event injection, ROM/SGS patch or physical-device test.',
      identities,
      vmEntry: '0x20049298',
      keyEntry: script.entries.KEYPRESS,
      reachedStateBytecodeSha256: bytecodeHash,
      instructions: machine.instructions - start,
      records,
      status: machine.status,
    };
  } finally {
    machine.close();
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.argv[2];
  if (!output || process.argv.length !== 3)
    throw Error('Usage: node tools/trace-kpex-key-events.mjs NEW.json');
  if (fs.existsSync(output)) throw Error('Output already exists');
  const root = new URL('../web/', import.meta.url),
    catalog = JSON.parse(fs.readFileSync(new URL('data/catalog.json', root)));
  const read = (entry) => fs.readFileSync(new URL(entry.url, root));
  const result = await traceNativeKeyEvents(
    read(catalog.firmwares.find((x) => x.id === 'kingston-2.12')),
    read(catalog.states.find((x) => x.id === 'hellfire-battle')),
    read(catalog.games.find((x) => x.id === 'hellfire')),
  );
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(result));
}
