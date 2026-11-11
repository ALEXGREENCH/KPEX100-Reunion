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

test('Petris executes mirrored ROM and RAM across memory boundaries with Z80 prefixes', async () => {
  const rom = Buffer.alloc(32768);
  rom.write('TMR SEGA', 0x7ff0, 'ascii');
  rom[0x7fff] = 0x7a;
  // Reset executes LD (BC),A and JP 0100. A later JR at FFFF uses byte 0 as
  // its displacement, wraps PC to 0003, and reaches the completion marker.
  rom.set([0x02, 0xc3, 0x00, 0x01, 0x00, 0x00, 0x3e, 0x66, 0x32, 0x04, 0xc1, 0x76]);
  const ramCode = [
    0x01,
    0x34,
    0x12, // LD BC,1234
    0xdd,
    0x21,
    0xcd,
    0xab, // LD IX,ABCD
    0xed,
    0x5f, // LD A,R
    0x32,
    0x02,
    0xc1,
    0xdd,
    0x7c, // LD A,IXH
    0x32,
    0x03,
    0xc1,
    0x3e,
    0x18,
    0x32,
    0xff,
    0xff, // Put JR at FFFF.
    0xc3,
    0xff,
    0xff,
  ];
  const program = [0xf3, 0x31, 0xf0, 0xdf];
  const store = (address, bytes) => {
    program.push(0x21, address & 255, address >> 8);
    for (const byte of bytes) program.push(0x36, byte, 0x23);
  };
  store(0xc000, [0x00, 0xc1, 0xc3, 0x10, 0xc0]);
  store(0xc010, ramCode);
  program.push(0x3e, 0x5a, 0xc3, 0xff, 0xbf);
  rom.set(program, 0x100);
  // BFFF mirrors ROM 3FFF. The two operands are fetched from C000/C001.
  rom[0x3fff] = 0x32;
  const expectedR = (2 + 2 + (1 + 2 * 5) + (1 + 2 * ramCode.length) + 2 + 1 + 1 + 1 + 2 + 2) & 127;
  const game = await GnexRuntime.create(
    read('web/data/firmware/Kingston-2.12.rom'),
    replaceCartridge(read('web/data/games/demo-petris.sgs'), 'PETRIS.GGR', rom),
    { profile: 'kpex' },
  );
  try {
    game.event('START');
    const base = game.sgs.variables.findIndex(
      (v, i) => v[1] === 8193 && game.sgs.variables[i + 1]?.[1] === 8192,
    );
    const ram = (i) => game.cpu.read32(game.varAddresses[base + 1] + i * 4) & 255;
    for (let i = 0; i < 10 && ram(0x104) !== 0x66; i++) {
      game.event('TIMEOUT', 0);
      assert.equal(game.status, 'idle', game.error);
    }
    assert.equal(ram(0x100), 0x5a, 'ROM-to-RAM operand fetch');
    assert.equal(ram(0x102), expectedR, 'M1 refresh count includes DD and ED prefixes');
    assert.equal(ram(0x103), 0xab, 'indexed instruction executed from RAM');
    assert.equal(ram(0x104), 0x66, 'PC wrapped from FFFF to ROM');
  } finally {
    game.close();
  }
});
