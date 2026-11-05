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

test('firmware instruction boundary stops infinite guest code before extra device effects', async () => {
  const m = await FirmwareMachine.create(rom);
  try {
    const start = 0x20010000;
    // ADD r0, r0, #1; B back to ADD. The machine hook must stop an endless loop.
    m.cpu.write(start, Buffer.from('010080e2fdffffea', 'hex'));
    m.cpu.regWrite('pc', start);
    m.cpu.regWrite('r0', 0);
    assert.equal(m.run(1).instructions, 1);
    assert.equal(m.cpu.regRead('r0'), 1);
    assert.equal(m.cpu.regRead('pc'), start + 4);
    assert.equal(m.run(2).instructions, 3);
    assert.equal(m.cpu.regRead('r0'), 2);
    assert.equal(m.cpu.regRead('pc'), start + 4);

    // STR r0, [r1]; MOV r0, r0. A deferred masked device write belongs to
    // the next instruction boundary and must not run after a one-step budget.
    const store = start + 0x100;
    m.cpu.write(store, Buffer.from('000081e50000a0e1', 'hex'));
    m.cpu.regWrite('pc', store);
    m.cpu.regWrite('r0', 0x12345678);
    m.cpu.regWrite('r1', 0x80000040);
    m.run(1);
    assert.equal(m.cpu.read32(0x80000040), 0x12345678);
    assert.equal(m._deferred_writes[0x80000040], 0x5678);
    m.run(1);
    assert.equal(m.cpu.read32(0x80000040), 0x5678);

    // Reaching the shutdown address is not the same as executing its hook.
    m.cpu.write(0x200279ac, Buffer.from('0000a0e1', 'hex'));
    m.cpu.regWrite('pc', 0x200279ac);
    m.mmio[0x80000304] = 0xffff27ff;
    m.mmio[0x80000300] = 0x572;
    assert.equal(m.run(1).status, 'paused');
    assert.equal(m.cpu.regRead('pc'), 0x200279b0);
    assert.equal(m.run(1).status, 'off');
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

test('rewritten SDRAM instructions use the current coprocessor opcode', async () => {
  const m = await FirmwareMachine.create(rom);
  try {
    const pc = 0x20010000;
    m.cpu.write32(pc, 0xe1a00000); // MOV r0,r0
    m.cpu.regWrite('pc', pc);
    m.run(1);
    m.cpu.write32(pc + 0x1000000, 0xee100f10); // MRC p15,0,r0,c0,c0,0 through SDRAM mirror
    m.cpu.regWrite('pc', pc);
    m.run(1);
    assert.equal(m.cpu.regRead('r0'), 0x41009400);
    assert.equal(m.cpu.regRead('pc'), pc + 4);
  } finally {
    m.close();
  }
});

test('modified Kingston idle code executes as ARM without a shortcut', async () => {
  const m = await FirmwareMachine.create(rom);
  try {
    m.cpu.write(0x20010000, rom.subarray(0x724, 0x100000));
    const entry = 0x20072c64;
    m.cpu.write32(entry, 0xe2877001); // ADD r7,r7,#1
    m.cpu.regWrite('r7', 12);
    m.cpu.regWrite('r4', 0x20008000);
    m.cpu.regWrite('pc', entry);
    m.run(1);
    assert.equal(m.cpu.regRead('r7'), 13);
    assert.equal(m.fast_forwarded_instructions, 0);
  } finally {
    m.close();
  }
});

test('a guest TCNT write sets the running timer, with 16- and 20-bit counters', async () => {
  const m = await FirmwareMachine.create(rom);
  try {
    const code = 0x20010000;
    m.cpu.write(code, Buffer.from('000081e50000a0e1', 'hex')); // STR r0,[r1]; NOP
    const store = (address, value) => {
      m.cpu.regWrite('pc', code);
      m.cpu.regWrite('r0', value);
      m.cpu.regWrite('r1', address);
      m.run(2);
    };
    m._writeMMIO(0x80000444, 0x101);
    m._writeMMIO(0x80000408, 0);
    m._writeMMIO(0x80000424, 0x13f); // timer clock = CPU/64
    m._writeMMIO(0x80000200, 3);
    m.instructions = 254;
    store(0x80000204, 0xdead1234);
    assert.equal(m.timer_counts[0], 0x1236);
    assert.equal(m.cpu.read32(0x80000204), 0x1236);
    store(0x80000244, 0xfabc1234);
    assert.equal(m.timer_counts[4], 0xc1234);
    assert.equal(m.cpu.read32(0x80000244), 0xc1234);
    store(0x80000240, 0x100);
    assert.equal(m.timer_counts[4], 0);
    assert.equal(m.cpu.read32(0x80000244), 0);
  } finally {
    m.close();
  }
});

test('IRQ delivery respects the TCC76x master enable and READY exception', async () => {
  const m = await FirmwareMachine.create(rom);
  try {
    const code = 0x20010000;
    m.cpu.write32(code, 0xeafffffe); // B .
    const tick = (ien, misc) => {
      m.instructions = 255;
      m.timer_last = 0;
      m.pending = 0x40;
      m._writeMMIO(0x80000100, ien);
      m._writeMMIO(0x8000010c, 0x40);
      m._writeMMIO(0x80000a1c, misc);
      m.cpu.regWrite('cpsr', 0x13);
      m.cpu.regWrite('pc', code);
      return m.run(1).pc;
    };
    assert.equal(tick(0x40, 0), code);
    assert.equal(m.pending, 0x40);
    assert.equal(tick(0x8040, 0), 0x18);
    assert.equal(tick(0x40, 0x8000), 0x18);
  } finally {
    m.close();
  }
});

test('ATA reissue aborts partial writes and completed writes preserve the reset image', async () => {
  const disk = new Uint8Array(1024).fill(0x56);
  const m = await FirmwareMachine.create(rom, { diskImage: disk, adoptDiskImage: true });
  try {
    const io = (port, value) => m._ataMemory(m.uc.MEM_WRITE, 0x40000000 + port, 2, value);
    const read = () => m._ataMemory(m.uc.MEM_READ, 0x40000000, 2, 0);
    const writeSector = () => {
      io(8, 1);
      io(28, 0x30);
    };
    assert.equal(m.ata_disks[0], disk);
    writeSector();
    io(0, 0x1234);
    io(28, 0xec);
    assert.equal(m.ata_write_target, null);
    read();
    assert.equal(m.cpu.read32(0x40000000) & 0xffff, 0x40);
    io(0, 0xffff);
    assert.equal(m.status, 'blocked');
    assert.equal(disk[0], 0x56);
    m.reset();
    writeSector();
    for (let i = 0; i < 256; i++) io(0, 0x1234);
    assert.equal(m.ata_registers[28], 0x40);
    assert.deepEqual([...m.ata_disks[0].subarray(0, 4)], [0x34, 0x12, 0x34, 0x12]);
    assert.equal(disk[0], 0x56);
    m.reset();
    assert.equal(m.ata_disks[0], disk);
    writeSector();
    read();
    assert.equal(m.status, 'blocked');
    assert.equal(m.ata_position, 0);
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
