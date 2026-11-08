#!/usr/bin/env node
// Compare full firmware execution with a reference checkout of Reunion.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const [reference, mode = 'timed'] = process.argv.slice(2);
if (!reference || !['timed', 'all-roms'].includes(mode)) {
  console.error('Usage: node tools/benchmark-firmware.mjs REFERENCE_CHECKOUT [timed|all-roms]');
  process.exit(1);
}
const root = fileURLToPath(new URL('../', import.meta.url));
const web = path.join(root, 'web');
const asset = (url) => fs.readFileSync(path.join(web, url));
const { createDisk } = await import('../web/engine/disk.js');
const catalog = JSON.parse(asset('data/catalog.json'));
const original = catalog.firmwares.find(({ id }) => id === 'kingston-2.12');
const aliases = {
  hellfire: 'HELLFIRE.SGS',
  kpetris: 'KPETRIS.SGS',
  ikaria: 'IKARIA.SGS',
  godori: 'GODORI.SGS',
};
let ordinal = 0;
const games = catalog.games
  .filter((game) => game.engine !== 'ads')
  .map((game, index) => ({
    name:
      aliases[game.id] ||
      `R${String(mode === 'all-roms' ? index : ++ordinal).padStart(7, '0')}.SGS`,
    data: asset(game.url),
  }));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const versions = await Promise.all(
  [path.resolve(reference), root].map(async (dir) => {
    const { FirmwareMachine } = await import(
      pathToFileURL(path.join(dir, 'web/engine/firmware.js'))
    );
    return {
      FirmwareMachine,
      revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim(),
      engineSha256: hash(fs.readFileSync(path.join(dir, 'web/engine/firmware.js'))),
    };
  }),
);
const timed = [
  { name: 'cold-start', rom: original, instructions: 100_000_000 },
  {
    name: 'menu-state',
    rom: original,
    state: 'Kingston-2.12-menu.reunion-state',
    instructions: 50_000_000,
  },
  {
    name: 'hellfire-state',
    rom: original,
    state: 'Kingston-2.12-HellFire-gameplay.reunion-state',
    instructions: 20_000_000,
  },
];
const cases =
  mode === 'timed'
    ? timed
    : catalog.firmwares.map((rom) => ({ name: rom.id, rom, instructions: 100_000_000 }));

async function sample(version, entry) {
  const rom = asset(entry.rom.url);
  const machine = await version.FirmwareMachine.create(rom, {
    diskImage: entry.state ? null : createDisk(games, rom),
    adoptDiskImage: true,
    traceInstructions: false,
  });
  try {
    if (entry.state) await machine.loadState(asset('data/states/' + entry.state));
    const started = performance.now();
    for (let remaining = entry.instructions; remaining > 0; remaining -= 10_000_000) {
      machine.run(Math.min(remaining, 10_000_000), { snapshot: false });
      if (machine.status !== 'paused') break;
    }
    const elapsedMs = performance.now() - started;
    const {
      status,
      stop_reason,
      instructions,
      registers,
      irq_count,
      lcd_pixel_writes,
      lcd_frames,
      firmware_resources_loaded,
      ata_commands,
      ata_last,
    } = machine.snapshot();
    return {
      elapsedMs,
      checkpoint: {
        status,
        stop_reason,
        instructions,
        registers,
        irq_count,
        lcd_pixel_writes,
        lcd_frames,
        firmware_resources_loaded,
        ata_commands,
        ata_last,
        pending: machine.pending,
        timer_pending: machine.timer_pending,
        timer_counts: machine.timer_counts,
        timer_last: machine.timer_last,
        lcdSha256: hash(machine.framebufferRGBA),
        sdramSha256: hash(machine.cpu.read(0x20000000, 0x1000000)),
      },
    };
  } finally {
    machine.close();
  }
}
const median = (samples) => [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)];
const scenarios = [];
for (const entry of cases) {
  const results = [[], []];
  for (let pair = 0; pair < (mode === 'timed' ? 3 : 1); pair++) {
    for (const i of pair % 2 ? [1, 0] : [0, 1]) results[i].push(await sample(versions[i], entry));
  }
  const [before, after] = results;
  const checkpoint = before[0].checkpoint;
  const differingFields = Object.keys(checkpoint).filter((key) =>
    [...before, ...after].some(
      (r) => JSON.stringify(r.checkpoint[key]) !== JSON.stringify(checkpoint[key]),
    ),
  );
  const timingsMs = results.map((r) => r.map((s) => s.elapsedMs));
  const speedup = median(timingsMs[0]) / median(timingsMs[1]);
  scenarios.push({
    name: entry.name,
    romSha256: entry.rom.sha256,
    budget: entry.instructions,
    matchingCheckpoint: !differingFields.length,
    differingFields,
    timingsMs,
    speedup,
    reference: checkpoint,
    current: after[0].checkpoint,
  });
  console.error(
    `${entry.name}: ${speedup.toFixed(2)}×, ${after[0].checkpoint.status}, checkpoint ${differingFields.join(', ') || 'matches'}`,
  );
}
console.log(
  JSON.stringify(
    {
      reference: versions[0].revision,
      currentBase: versions[1].revision,
      engineSha256: { reference: versions[0].engineSha256, current: versions[1].engineSha256 },
      environment: { node: process.version, platform: process.platform, cpu: os.cpus()[0]?.model },
      mode,
      scenarios,
    },
    null,
    2,
  ),
);
if (scenarios.some((x) => x.current.status !== 'paused' || !x.matchingCheckpoint))
  process.exitCode = 1;
