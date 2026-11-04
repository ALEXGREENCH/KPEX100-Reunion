import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createARM } from '../web/engine/cpu.js';
import { FirmwareMachine, inspectRom } from '../web/engine/firmware.js';
import { unzipSync, zipSync, strToU8, strFromU8 } from '../web/vendor/fflate.js';
const root = new URL('../web/data/', import.meta.url);
const rom = fs.readFileSync(new URL('firmware/Kingston-2.12.rom', root));
const fixture = JSON.parse(
  fs.readFileSync(new URL('./fixtures/firmware-reference.json', import.meta.url)),
);
function frameHash(machine) {
  const rgba = machine.framebufferRGBA,
    rgb = new Uint8Array(220 * 176 * 3);
  for (let i = 0; i < 220 * 176; i++) rgb.set(rgba.subarray(i * 4, i * 4 + 3), i * 3);
  return crypto.createHash('sha256').update(rgb).digest('hex');
}

test('real ARM crosses long translation blocks and shares SDRAM aliases', async () => {
  const cpu = await createARM();
  try {
    cpu.mapAlias([0x20000000, 0x21000000], 0x1000000);
    // The published Unicorn 2.1.4 WASM faulted in this original initializer.
    cpu.write(0x20010000, rom.subarray(0x724, 0x100000));
    cpu.regWrite('sp', 0x20fff000);
    cpu.regWrite('lr', 0x20ffff00);
    cpu.run(0x2000f8dc + 0x39220, 0x20ffff00, 1000000);
    assert.equal(cpu.regRead('pc'), 0x20ffff00);
    cpu.write32(0x20c00000, 0x12345678);
    assert.equal(cpu.read32(0x21c00000), 0x12345678);
  } finally {
    cpu.close();
  }
});

test('malformed or damaged ROM cannot create a machine', () => {
  assert.throws(() => inspectRom(new Uint8Array(8)), /aligned/);
  const broken = new Uint8Array(rom);
  broken[0x100100] ^= 1;
  assert.equal(inspectRom(broken).checksum_valid, false);
  assert.throws(() => new FirmwareMachine(broken), /checksum/);
});

test('real guest LCD writes produce the displayed RGB565 pixel', async () => {
  const m = await FirmwareMachine.create(rom);
  try {
    m.cpu.write(0x20010000, Buffer.from('2200a0e3b000c1e1f800a0e30004a0e1b200c1e1feffffea', 'hex'));
    m.cpu.regWrite('pc', 0x20010000);
    m.cpu.regWrite('r1', 0x50000000);
    const result = m.run(5);
    assert.equal(result.status, 'paused');
    assert.equal(result.lcd_pixel_writes, 1);
    assert.deepEqual([...m.framebufferRGBA.subarray(0, 4)], [255, 0, 0, 255]);
  } finally {
    m.close();
  }
});

for (const [name, file] of [
  ['menu', 'Kingston-2.12-menu.reunion-state'],
  ['hellfire', 'Kingston-2.12-HellFire-gameplay.reunion-state'],
])
  test(`WASM ${name} replay exactly matches desktop ARM over 10M instructions`, async () => {
    const expected = fixture.find((x) => x.name === name),
      m = await FirmwareMachine.create(rom);
    try {
      await m.loadState(fs.readFileSync(new URL('states/' + file, root)));
      m.key('right', true);
      const actual = m.run(10000000);
      m.key('right', false);
      for (const key of [
        'registers',
        'pc',
        'instructions',
        'irq_count',
        'lcd_pixel_writes',
        'lcd_frames',
      ])
        assert.deepEqual(actual[key], expected[key], key);
      assert.deepEqual(m.timer_counts, expected.timer_counts);
      assert.equal(m.timer_last, expected.timer_last);
      assert.equal(frameHash(m), expected.frame_hash);
    } finally {
      m.close();
    }
  });

test('state ROM mismatch is rejected before modifying the guest', async () => {
  const m = await FirmwareMachine.create(rom);
  try {
    const files = unzipSync(
        fs.readFileSync(new URL('states/Kingston-2.12-menu.reunion-state', root)),
      ),
      manifest = JSON.parse(strFromU8(files['manifest.json']));
    manifest.rom_sha256 = '0'.repeat(64);
    files['manifest.json'] = strToU8(JSON.stringify(manifest));
    const before = m.registers;
    await assert.rejects(() => m.loadState(zipSync(files, { level: 1 })), /different ROM/);
    assert.deepEqual(m.registers, before);
    assert.equal(m.instructions, 0);
  } finally {
    m.close();
  }
});

test('native power-off loop is terminal only with its confirmed hardware signature', async () => {
  const m = await FirmwareMachine.create(rom);
  try {
    m.cpu.write(0x20010000, rom.subarray(0x724, 0x100000));
    m.cpu.regWrite('pc', 0x200279b0);
    m.mmio[0x80000304] = 0xffff27ff;
    m.mmio[0x80000300] = 0x572;
    const result = m.run(20);
    assert.equal(result.status, 'off');
    assert.match(result.stop_reason, /выключения/);
    const count = m.instructions;
    assert.equal(m.run(100).instructions, count);
  } finally {
    m.close();
  }
});
