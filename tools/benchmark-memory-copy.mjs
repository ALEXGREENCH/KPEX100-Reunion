#!/usr/bin/env node
/** Compare owned bulk copies with the former scalar getValue path, using real WASM RAM. */
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createARM } from '../web/engine/cpu.js';
const output = process.argv[2];
if (!output || process.argv.length !== 3)
  throw Error('Usage: node tools/benchmark-memory-copy.mjs NEW.json');
if (fs.existsSync(output)) throw Error('Output already exists');
const cpu = await createARM(),
  bulk = cpu.uc.readArrayFromMemory;
if (typeof bulk !== 'function') throw Error('This benchmark requires the bulk-copy bridge');
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const result = {
  schema: 1,
  utc: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  cpu: os.cpus()[0]?.model,
  method:
    'Real uc_mem_read and owned output. Alternate scalar fallback and bulk order over five rounds of 500 reads after warmup; compare complete bytes outside timing. This measures memory transfer, not frame rate or whole-game speed.',
  sizes: [],
};
try {
  cpu.map(0x100000, 0x100000);
  const expected = Uint8Array.from({ length: 0x100000 }, (_, i) => (i * 37 + 11) & 255);
  cpu.write(0x100000, expected);
  for (const bytes of [38400, 77440, 131072, 0x100000]) {
    const record = { bytes, scalarMs: [], bulkMs: [] };
    result.sizes.push(record);
    for (let round = -1; round < 5; round++)
      for (const mode of round % 2 === 0 ? [false, true] : [true, false]) {
        cpu.uc.readArrayFromMemory = mode ? bulk : undefined;
        let last;
        const start = performance.now();
        for (let i = 0; i < 500; i++) last = cpu.read(0x100000, bytes);
        const elapsed = performance.now() - start;
        assert.deepEqual(last, expected.slice(0, bytes));
        if (round >= 0) record[mode ? 'bulkMs' : 'scalarMs'].push(elapsed);
      }
    record.medianScalarMs = median(record.scalarMs);
    record.medianBulkMs = median(record.bulkMs);
    record.speedup = record.medianScalarMs / record.medianBulkMs;
    record.verifiedSha256 = createHash('sha256').update(expected.subarray(0, bytes)).digest('hex');
  }
  result.ok = true;
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(
    JSON.stringify(
      result.sizes.map((r) => ({ bytes: r.bytes, speedup: r.speedup })),
      null,
      2,
    ),
  );
} finally {
  cpu.uc.readArrayFromMemory = bulk;
  cpu.close();
}
