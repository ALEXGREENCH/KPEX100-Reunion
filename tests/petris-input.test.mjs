import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GnexRuntime } from '../web/engine/gnex.js';
import { replaceCartridge } from '../web/engine/cartridge-disk.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url));
const cartridge = Buffer.alloc(32768);
cartridge.set([
  0xf3, 0x31, 0x00, 0xdf, 0xdb, 0xdc, 0x32, 0x00, 0xc0, 0xdb, 0x00, 0x32, 0x01, 0xc0, 0xc3, 0x04,
  0x00,
]);
cartridge.write('TMR SEGA', 0x7ff0, 'ascii');
cartridge[0x7fff] = 0x7a;
const app = replaceCartridge(read('web/data/games/demo-petris.sgs'), 'PETRIS.GGR', cartridge);

test('Petris releases stale Kingston keys and preserves simultaneous holds and short taps', async () => {
  const game = await GnexRuntime.create(read('web/data/firmware/Kingston-2.12.rom'), app, {
    profile: 'kpex',
  });
  const base = game.sgs.variables.findIndex(
    (v, i) => v[1] === 8193 && game.sgs.variables[i + 1]?.[1] === 8192,
  );
  const ram = (i) => game.cpu.read32(game.varAddresses[base + 1] + i * 4) & 255;
  const poll = () => {
    game.event('TIMEOUT', 0);
    assert.equal(game.status, 'idle', game.error);
    return [ram(0), ram(1)];
  };
  try {
    game.event('START');
    assert.deepEqual(poll(), [255, 192]);
    game.setKey(21, true);
    assert.deepEqual(poll(), [255, 64]);
    // Original firmware may deliver 0xff while GetKeyState still has Play set.
    game.event('KEYPRESS', 255);
    assert.deepEqual(poll(), [255, 192]);
    assert.deepEqual(poll(), [255, 192]);
    game.heldKeys.clear();

    game.setKey(17, true);
    game.setKey(20, true);
    assert.deepEqual(poll(), [231, 192]);
    game.setKey(17, false);
    assert.deepEqual(poll(), [239, 192]);
    game.setKey(20, false);
    assert.deepEqual(poll(), [255, 192]);

    // A tap released before TIMEOUT remains latched until the cartridge reads.
    game.setKey(20, true);
    game.setKey(20, false);
    assert.deepEqual(poll(), [239, 192]);
    assert.deepEqual(poll(), [255, 192]);

    game.setKey(10, true);
    assert.deepEqual(poll(), [223, 192]);
    game.event('KEYPRESS', 255);
    assert.deepEqual(poll(), [255, 192]);
  } finally {
    game.close();
  }
});
