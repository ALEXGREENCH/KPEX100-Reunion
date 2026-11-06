import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { traceNativeKeyEvents } from '../tools/trace-kpex-key-events.mjs';
import { GnexRuntime } from '../web/engine/gnex.js';
const root = new URL('../web/', import.meta.url);
const catalogue = JSON.parse(fs.readFileSync(new URL('data/catalog.json', root)));
const read = (entry) => fs.readFileSync(new URL(entry.url, root));

test('default K-PEX input matches original firmware presses and releases at the native VM entry', async () => {
  const rom = read(catalogue.firmwares.find((x) => x.id === 'kingston-2.12'));
  const game = read(catalogue.games.find((x) => x.id === 'hellfire'));
  const reference = await traceNativeKeyEvents(
    rom,
    read(catalogue.states.find((x) => x.id === 'hellfire-battle')),
    game,
  );
  assert.deepEqual(
    reference.records.map((x) => x.value),
    [20, 255, 17, 255],
  );
  const runtime = await GnexRuntime.create(rom, game);
  try {
    runtime.event('START');
    const actual = [];
    runtime.cpu.onCode(
      () => {
        if (runtime.cpu.regRead('r0') === runtime.sgs.entries.KEYPRESS)
          actual.push(runtime._read(runtime.varAddresses[0]));
      },
      { begin: 0x20049298, end: 0x20049298 },
    );
    for (const [key, pressed] of [
      [20, true],
      [20, false],
      [17, true],
      [17, false],
    ])
      runtime.setKey(key, pressed);
    assert.deepEqual(
      actual,
      reference.records.map((x) => x.value),
    );
    const before = runtime.eventCount;
    runtime.setKey(17, false);
    assert.equal(runtime.eventCount, before, 'unheld release must not send an extra event');
    assert.equal(runtime.status, 'idle', runtime.error);
  } finally {
    runtime.close();
  }
});
