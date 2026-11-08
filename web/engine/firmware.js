// K-PEX / TCC76x hardware model, port of kpex/firmware.py.
// Actual ARM instructions execute inside Unicorn WASM. Unknown hardware stops.
import { ArmCPU, initCpu, getCpuModule } from './cpu.js';
import { unzipSync } from '../vendor/fflate.js';
const U32 = (x) => x >>> 0,
  hex = (x) => '0x' + U32(x).toString(16).padStart(8, '0');
const word = (b, o = 0) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(o, true);
const key212 = '743d0b9a377dc6a3f0a80b7816cee575ad2f8249643876367c4bfaac54ddd19a';
const IDLE = [
  0x20072c64, 0x200a1b08, 0x200a1b0c, 0x200a1b10, 0x200a1b14, 0x200a1b18, 0x200a1b1c, 0x200a1b20,
  0x200a1b24, 0x20072c68, 0x20072c6c, 0x20072c70, 0x20072c74, 0x200a1b28, 0x200a1b2c, 0x20072c78,
  0x200819b4, 0x20072c7c,
];
const R = Array.from({ length: 16 }, (_, i) => 'r' + i);
const ASCII = new TextEncoder();
function push(array, value, max = 512) {
  array.push(value);
  if (array.length > max * 2) array.splice(0, array.length - max);
}
function checksum(bytes) {
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  let s = 0;
  for (let i = 0; i < bytes.length; i += 4) s = U32(s + d.getUint32(i, true));
  return s;
}
export async function sha256(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (x) =>
    x.toString(16).padStart(2, '0'),
  ).join('');
}
export function inspectRom(rom) {
  if (rom.length < 0x100000 || rom.length % 4)
    throw new Error('ROM must contain an aligned 1 MiB executable');
  if (word(rom) !== 0xe59ff608 || new TextDecoder().decode(rom.subarray(8, 16)) !== 'Ver:1234')
    throw new Error('Unsupported K-PEX ROM header');
  if (word(rom, 0x14) !== 3) throw new Error('Expected three ROM resource sections');
  let expected = 0x100000;
  const sections = [];
  for (let i = 0; i < 3; i++) {
    const at = 0x20 + i * 16,
      offset = word(rom, at),
      start_sector = word(rom, at + 4),
      sectors = word(rom, at + 8),
      sum = word(rom, at + 12),
      length = sectors * 512;
    if (offset !== expected || !length || offset + length > rom.length)
      throw new Error('Invalid ROM resource bounds');
    sections.push({
      index: i,
      offset,
      start_sector,
      sectors,
      length,
      checksum: sum,
      checksum_valid: U32(checksum(rom.subarray(offset, offset + length)) + sum) === 0,
    });
    expected = offset + length;
  }
  if (expected !== rom.length) throw new Error('Unexpected trailing ROM bytes');
  const loads = [];
  for (let i = 0; i < 5; i++) {
    const at = 0x61c + i * 20,
      source = word(rom, at),
      destination = word(rom, at + 4),
      size = word(rom, at + 8);
    if (source < 0x70000000 || source - 0x70000000 + size > 0x100000)
      throw new Error('Invalid executable load descriptor');
    loads.push({
      source,
      destination,
      size,
      zero_size: word(rom, at + 12),
      zero_address: word(rom, at + 16),
    });
  }
  const executable_checksum_valid = checksum(rom.subarray(0, 0x100000)) === 0;
  return {
    size: rom.length,
    entry: word(rom, 0x610),
    loads,
    sections,
    executable_checksum_valid,
    checksum_valid: executable_checksum_valid && sections.every((s) => s.checksum_valid),
    sha256: null,
  };
}
export class FirmwareMachine {
  static async create(rom, options = {}) {
    await initCpu();
    const machine = new FirmwareMachine(rom, options);
    await machine.ready;
    return machine;
  }
  constructor(
    rom,
    {
      cpuModule,
      diskImage = null,
      adoptDiskImage = false,
      strictMMIO = true,
      fastIdle = true,
      traceInstructions = true,
    } = {},
  ) {
    this.rom = new Uint8Array(rom);
    this.rom_info = inspectRom(this.rom);
    if (!this.rom_info.checksum_valid) throw new Error('ROM checksum mismatch');
    this.uc = cpuModule || getCpuModule();
    this.strict_mmio = strictMMIO;
    this.fast_idle = fastIdle;
    this.traceInstructions = traceInstructions;
    this.disk_image = diskImage
      ? diskImage instanceof Uint8Array
        ? adoptDiskImage
          ? diskImage
          : new Uint8Array(diskImage)
        : new Uint8Array(diskImage).slice()
      : null;
    this._idleWords = IDLE.map((address) => word(this.rom, address - 0x2000f8dc));
    this.width = 220;
    this.height = 176;
    this.ready = sha256(this.rom).then((h) => {
      this.rom_info.sha256 = h;
      return this;
    });
    this.reset();
  }
  reset() {
    if (this.cpu) this.cpu.close();
    this.cpu = new ArmCPU(this.uc);
    const c = this.cpu;
    this._sdramPointer = c.mapAlias([0x20000000, 0x21000000], 0x1000000);
    this._romPointer = c.mapAlias([0x70000000], 0x100000);
    for (const [a, s] of [
      [0, 0x100000],
      [0x30000000, 0x10000],
      [0x40000000, 0x1000],
      [0x50000000, 0x1000],
      [0x80000000, 0x1000],
      [0xf0000000, 0x1000],
      [0xfffff000, 0x1000],
    ])
      c.map(a, s);
    c.write(0x70000000, this.rom.subarray(0, 0x100000));
    c.regWrite('cpsr', 0xd3);
    c.regWrite('pc', 0x70000000);
    this.instructions = 0;
    this.fast_forwarded_instructions = 0;
    this._run_end = null;
    this.status = 'ready';
    this.stop_reason = '';
    this.trace = [];
    this.mmio_trace = [];
    this.mmio_counts = {};
    this.unsupported = {};
    this.milestones = ['ROM checksum verified'];
    this.cp15 = { '15,0,0,0,0': 0x41009400, '15,0,1,0,0': 0x70 };
    this.mmio = {};
    this.pending = 0;
    this.timer_pending = 0;
    this.timer_counts = Array(6).fill(0);
    this.timer_last = 0;
    this.irq_count = 0;
    this.key_states = {};
    this._held_keys = [];
    this.gpio_inputs = {
      0x80000300: 0xffffffff,
      0x80000310: 0x3fffffff,
      0x80000320: 0xffff,
      0x80000330: 0xffff,
    };
    this.adc_inputs = Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [i, i === 4 ? 0 : 1023]),
    );
    this.adc_channel = 0;
    this.adc_started = false;
    this.pll_enable_at = 0;
    this.lcd_writes = 0;
    this.lcd_source = null;
    this.lcd_command = 0;
    this.lcd_registers = { 0: 0x8309, 0x44: 0xaf00, 0x45: 0xdb00 };
    this.lcd_pixels = new Uint8Array(220 * 176 * 2);
    this.lcd_x = 0;
    this.lcd_y = 0;
    this.lcd_pixel_writes = 0;
    this.lcd_frames = 0;
    this._lcd_rendered_count = -1;
    this._rgba = new Uint8ClampedArray(220 * 176 * 4);
    for (let i = 3; i < this._rgba.length; i += 4) this._rgba[i] = 255;
    this.ata_registers = { 28: 0x40, 4: 0 };
    this.ata_drive = 0;
    this.ata_buffer = new Uint8Array();
    this.ata_position = 0;
    this.ata_write_target = null;
    this.ata_trace = [];
    this.ata_disks = {
      0: this.disk_image ?? new Uint8Array(16 * 1024 * 1024),
    };
    this._deferred_writes = null;
    this._open_bus_pages = new Set();
    this._enteredSDRAM = false;
    this._displayedPixel = false;
    const defaults = {
      0x80000040: 0,
      0x80000044: 0,
      0x80000300: 0xffffffff,
      0x80000304: 0,
      0x80000310: 0x3fffffff,
      0x80000314: 0xff,
      0x80000318: 0x3c0000ff,
      0x80000320: 0xffff,
      0x80000330: 0x7fff,
      0x80000400: 0x7ffe,
      0x80000404: 0x2e02,
      0x80000408: 0x82000,
      0x8000040c: 0x800,
      0x80000418: 0x1be,
      0x8000043c: 0xfeff,
      0x80000130: 0x7c0,
      0x80000280: 0x7fff,
      0x80000a00: 0x18,
      0x80000a80: 0x18,
      0x80000a88: 0x2400,
      0x80000a14: 4,
      0x80000a2c: 0x3c0000,
      0x80000f00: 6,
      0x80000f48: 7,
      0x80000d00: 0x10,
      0x80000d34: 0x2edf,
      0x80000d44: 0x628,
      0x80000d48: 0x02001202,
      0x80000d54: 0x100,
      0x80000d58: 0x100,
      0xf0000000: 0x62e97010,
      0xf0000008: 0x8002,
      0xf0000010: 0x0b405649,
      0xf0000014: 0x0150569a,
      0xf0000018: 0x006056ba,
      0xf000001c: 0x0a70569a,
    };
    for (let i = 0; i < 6; i++) defaults[0x80000208 + i * 16] = i < 4 ? 0xffff : 0xfffff;
    for (const [a, v] of Object.entries(defaults)) this._writeMMIO(Number(a), v);
    c.onCode((a, s) => this._code(a, s));
    for (const [begin, end] of [
      [0x80000000, 0x80000fff],
      [0xf0000000, 0xf0000fff],
      [0xfffff000, 0xffffffff],
    ])
      c.onMemory((...v) => this._memory(...v), { begin, end });
    c.onMemory((...v) => this._lcdMemory(...v), { begin: 0x50000000, end: 0x50000fff });
    c.onMemory((...v) => this._ataMemory(...v), { begin: 0x40000000, end: 0x40000fff });
    c.onMemory((...v) => this._invalidMemory(...v), { invalid: true });
    c.onInterrupt((n) => this._stop('CPU exception ' + n + ' at ' + hex(c.regRead('pc'))));
  }
  get registers() {
    const r = Object.fromEntries(R.map((n) => [n, this.cpu.regRead(n)]));
    return {
      ...r,
      sp: r.r13,
      lr: r.r14,
      pc: r.r15,
      cpsr: this.cpu.regRead('cpsr'),
      spsr: this.cpu.regRead('spsr'),
    };
  }
  readMemory(a, n) {
    if (n < 0 || n > 0x100000) throw new Error('Inspection limited to 1MiB');
    return this.cpu.read(a, n);
  }
  key(name, pressed) {
    name = String(name).toLowerCase();
    name =
      {
        a: 'select',
        b: 'esc',
        start: 'play',
        enter: 'select',
        return: 'select',
        escape: 'esc',
        back: 'esc',
        record: 'rec',
        volume_down: 'vol-',
        volume_up: 'vol+',
      }[name] || name;
    this.key_states[name] = !!pressed;
    if (name === 'hold') {
      this.gpio_inputs[0x80000330] = U32(
        pressed ? this.gpio_inputs[0x80000330] & ~0x8000 : this.gpio_inputs[0x80000330] | 0x8000,
      );
      return;
    }
    const ladder = {
      play: 20,
      esc: 75,
      select: 150,
      rec: 230,
      aux: 310,
      mode: 390,
      menu: 465,
      up: 545,
      down: 620,
      right: 675,
      left: 740,
      'vol-': 815,
      'vol+': 915,
    };
    if (!(name in ladder)) return;
    this._held_keys = this._held_keys.filter((x) => x !== name);
    if (pressed) this._held_keys.push(name);
    this.adc_inputs[0] = this._held_keys.length ? ladder[this._held_keys.at(-1)] : 1023;
  }
  _writeMMIO(a, v) {
    this.mmio[a] = U32(v);
    this.cpu.write32(a, v);
  }
  _deferMMIO(a, v) {
    (this._deferred_writes ??= {})[a] = v;
  }
  _instruction(address) {
    // Both SDRAM windows refer to the same live WASM storage. Read the current
    // instruction instead of caching decoded RAM that the guest can overwrite.
    if (address >= 0x20000000 && address < 0x22000000)
      return U32(this.uc.getValue(this._sdramPointer + (address & 0xffffff), 'i32'));
    if (address >= 0x70000000 && address < 0x70100000)
      return U32(this.uc.getValue(this._romPointer + (address & 0xfffff), 'i32'));
    return this.cpu.read32(address);
  }
  _enabledInterrupts() {
    const ien = this.mmio[0x80000100] || 0;
    // TCC76x §5.2: IEN bit 15 gates delivery unless MISC.RDYIRQEN
    // repurposes it as the external READY interrupt's individual enable.
    if (this.mmio[0x80000a1c] & 0x8000) return this.pending & ien;
    return ien & 0x8000 ? this.pending & ien & ~0x8000 : 0;
  }
  _stop(reason, status = 'blocked') {
    this.status = status;
    this.stop_reason = reason;
    this.cpu.stop();
  }
  _condition(cond, psr) {
    const n = !!(psr & 0x80000000),
      z = !!(psr & 0x40000000),
      c = !!(psr & 0x20000000),
      v = !!(psr & 0x10000000);
    return [
      z,
      !z,
      c,
      !c,
      n,
      !n,
      v,
      !v,
      c && !z,
      !c || z,
      n === v,
      n !== v,
      !z && n === v,
      z || n !== v,
      true,
      false,
    ][cond];
  }
  _code(address, size) {
    // Unicorn invokes this hook before executing the next instruction. Stop
    // before any device or power-off side effect at an exhausted run boundary.
    if (this._run_end !== null && this.instructions >= this._run_end) {
      this.cpu.stop();
      return;
    }
    if (
      address === 0x200279b0 &&
      this.rom_info.sha256 === key212 &&
      this.mmio[0x80000304] === 0xffff27ff &&
      this.mmio[0x80000300] === 0x572
    ) {
      this._stop('Прошивка перешла в цикл выключения', 'off');
      return;
    }
    if (this._deferred_writes !== null) {
      for (const a in this._deferred_writes) this._writeMMIO(Number(a), this._deferred_writes[a]);
      this._deferred_writes = null;
    }
    if (
      this.fast_idle &&
      this._run_end !== null &&
      address === 0x20072c64 &&
      this.rom_info.sha256 === key212 &&
      this._fastIdle()
    )
      return;
    this.instructions++;
    if (this.traceInstructions) push(this.trace, address);
    if (!this._enteredSDRAM && address >= 0x20000000 && address < 0x22000000) {
      this.milestones.push('Entered SDRAM executable');
      this._enteredSDRAM = true;
    }
    if (this.instructions % 256 === 0) {
      this._advanceTimers();
      const enabled = this._enabledInterrupts();
      if (enabled) {
        const psr = this.cpu.regRead('cpsr'),
          irq = enabled & (this.mmio[0x8000010c] || 0),
          fiq = enabled & ~(this.mmio[0x8000010c] || 0);
        if (fiq && !(psr & 64)) {
          this._enterInterrupt(address, psr, true);
          return;
        }
        if (irq && !(psr & 128)) {
          this._enterInterrupt(address, psr, false);
          return;
        }
      }
    }
    if (size !== 4) return;
    const w = this._instruction(address);
    if ((w & 0x0f000010) !== 0x0e000010) return;
    const cop = (w >>> 8) & 15;
    if (cop !== 14 && cop !== 15) {
      this._stop('Unsupported coprocessor p' + cop + ' at ' + hex(address));
      return;
    }
    if (!this._condition(w >>> 28, this.cpu.regRead('cpsr'))) return;
    const parts = [cop, (w >>> 21) & 7, (w >>> 16) & 15, w & 15, (w >>> 5) & 7],
      key = parts.join(','),
      rn = (w >>> 12) & 15;
    if (w & 0x100000) {
      const value = this.cp15[key] || 0;
      if (rn === 15)
        this.cpu.regWrite('cpsr', (this.cpu.regRead('cpsr') & 0x0fffffff) | (value & 0xf0000000));
      else this.cpu.regWrite(R[rn], value);
    } else {
      this.cp15[key] = this.cpu.regRead(R[rn]);
    }
    this.cpu.regWrite('pc', address + 4);
  }
  _fastIdle() {
    const c = this.cpu;
    let psr = c.regRead('cpsr'),
      a = c.regRead('r4') + 16;
    if (psr & 32 || (psr & 31) === 16 || a & 3 || a < 0x20000000 || a > 0x21fffffc) return false;
    const physical = 0x20000000 + (a & 0xffffff);
    if (
      IDLE.includes(physical) ||
      !IDLE.every((pc, i) => this._instruction(pc) === this._idleWords[i])
    )
      return false;
    let counter = c.read32(a),
      r0 = c.regRead('r0'),
      r1 = c.regRead('r1'),
      lr = c.regRead('lr'),
      phase = 0;
    const initial = this.instructions,
      batch = { ratio: this._clockRatio(), dirty: false };
    const flush = () => {
      if (batch.dirty) {
        for (let n = 0; n < 6; n++) {
          const base = 0x80000200 + n * 16,
            cfg = this.mmio[base] || 0;
          if (cfg & 1 && ((cfg >>> 4) & 7) !== 7)
            this._writeMMIO(base + 4, Math.floor(this.timer_counts[n]));
        }
        this._writeMMIO(0x80000260, this.timer_pending);
      }
      c.write32(a, counter);
      c.regWrite('r0', r0);
      c.regWrite('r1', r1);
      c.regWrite('lr', lr);
      c.regWrite('cpsr', psr);
      c.regWrite('pc', IDLE[phase]);
      this.fast_forwarded_instructions += this.instructions - initial;
      if (this.traceInstructions) push(this.trace, IDLE[phase]);
    };
    while (this.instructions < this._run_end) {
      const available = Math.min(
        255 - (this.instructions % 256),
        this._run_end - this.instructions,
      );
      if (phase === 0 && available >= 18) {
        const n = Math.floor(available / 18),
          final = U32((psr & 0x0fffffff) | 0x60000000);
        r0 = n === 1 ? psr : final;
        r1 = counter = U32(counter + n);
        psr = final;
        lr = IDLE[17];
        this.instructions += n * 18;
        continue;
      }
      this.instructions++;
      if (this.instructions % 256 === 0) {
        this._advanceTimers(batch);
        const enabled = this._enabledInterrupts(),
          irq = enabled & (this.mmio[0x8000010c] || 0),
          fiq = enabled & ~(this.mmio[0x8000010c] || 0);
        if ((fiq && !(psr & 64)) || (irq && !(psr & 128))) {
          flush();
          this._enterInterrupt(IDLE[phase], psr, !!(fiq && !(psr & 64)));
          return true;
        }
      }
      switch (phase) {
        case 0:
          lr = IDLE[9];
          break;
        case 1:
          r0 = psr;
          break;
        case 2:
          r1 = U32(r0 | 128);
          break;
        case 3:
          psr = U32((psr & ~255) | (r1 & 255));
          break;
        case 4:
          r1 = psr;
          break;
        case 5:
          r1 &= 128;
          break;
        case 6:
          psr = U32((psr & 0x0fffffff) | 0x60000000);
          break;
        case 9:
          r1 = counter;
          break;
        case 10:
          r1 = U32(r1 + 1);
          break;
        case 11:
          counter = r1;
          break;
        case 12:
          lr = IDLE[15];
          break;
        case 13:
          psr = U32((psr & ~255) | (r0 & 255));
          break;
        case 15:
          lr = IDLE[17];
          break;
      }
      phase = (phase + 1) % 18;
    }
    flush();
    c.stop();
    return true;
  }
  _enterInterrupt(address, psr, fiq) {
    this.cpu.regWrite('cpsr', (psr & ~255) | (fiq ? 0xd1 : 0x92) | (psr & 64));
    this.cpu.regWrite('spsr', psr);
    this.cpu.regWrite('lr', address + 4);
    this.cpu.regWrite('pc', fiq ? 0x1c : 0x18);
    this.irq_count++;
    if (!this.milestones.includes('Delivered hardware timer interrupt'))
      this.milestones.push('Delivered hardware timer interrupt');
  }
  get nominalCpuHz() {
    return this._clockRatio(true);
  }
  _clockRatio(cpuOnly = false) {
    const pll = this.mmio[0x80000404] ?? 0x2e02,
      m = (pll >>> 8) & 63,
      p = pll & 63,
      s = (pll >>> 16) & 3,
      pllHz = (12000000 * 8 * (m + 2)) / ((p + 2) * (1 << s)),
      div = this.mmio[0x80000444] || 0,
      sys = this.mmio[0x80000408] ?? 0x82000,
      tclk = this.mmio[0x80000424] || 0,
      source = pll & 0x40000 ? pllHz : 12000000,
      f = sys & 63,
      // TCC76x §8: DCO phase zero bypasses the phase divider.
      cpu = div & 1 ? source / (f + 1) : f === 0 ? source : (source * f) / 64,
      ts = [source, 12000000, 32768, 0][(tclk >>> 8) & 3],
      tp = tclk & 63,
      timer = div & 256 ? ts / (tp + 1) : (ts * tp) / 64;
    return cpuOnly ? cpu : timer / Math.max(1, cpu);
  }
  _advanceTimers(batch = null) {
    const elapsed = this.instructions - this.timer_last;
    this.timer_last = this.instructions;
    const ticks = elapsed * (batch?.ratio ?? this._clockRatio());
    for (let n = 0; n < 6; n++) {
      const base = 0x80000200 + n * 16,
        cfg = this.mmio[base] || 0;
      if (!(cfg & 1)) continue;
      const select = (cfg >>> 4) & 7;
      if (select === 7) continue;
      const divisor = 2 ** (select <= 4 ? select + 1 : 2 * select),
        previous = this.timer_counts[n],
        ref = Math.max(1, this.mmio[base + 8] ?? 65535);
      let current = previous + ticks / divisor;
      if (Math.floor(current / ref) !== Math.floor(previous / ref) && cfg & 8) {
        this.timer_pending |= 1 << n;
        this.pending |= 64;
      }
      if (!(cfg & 2)) current %= ref;
      current %= 2 ** (n < 4 ? 16 : 20);
      this.timer_counts[n] = current;
      if (!batch) this._writeMMIO(base + 4, Math.floor(current));
    }
    if (batch) batch.dirty = true;
    else this._writeMMIO(0x80000260, this.timer_pending);
  }
  _knownMMIO(a) {
    if (a === 0x80000040 || a === 0x80000044) return true;
    if (a >= 0xf0000000 && a <= 0xf0000024) return a % 4 === 0;
    for (const [lo, hi] of [
      [0x80000100, 0x80000138],
      [0x80000200, 0x80000298],
      [0x80000300, 0x80000334],
      [0x80000400, 0x80000448],
      [0x80000d00, 0x80000d58],
      [0x80000a14, 0x80000a60],
      [0x80000f00, 0x80000f60],
    ])
      if (a >= lo && a <= hi) return a % 4 === 0;
    return [0x80000a00, 0x80000a04, 0x80000a10, 0x80000a80, 0x80000a84, 0x80000a88].includes(a);
  }
  _memory(access, address, size, value) {
    const a = U32(address & ~3),
      write = access === this.uc.MEM_WRITE,
      pc = this.cpu.regRead('pc');
    push(this.mmio_trace, { pc, address, size, write, value: write ? value : this.mmio[a] || 0 });
    if (!this._knownMMIO(a)) {
      this.unsupported[hex(a)] ??= { pc, access: write ? 'write' : 'read' };
      if (!write && this.strict_mmio) {
        this._stop('Unimplemented MMIO read ' + hex(a) + ' at PC ' + hex(pc));
        return;
      }
    }
    if (write) {
      const old = this.mmio[a] || 0,
        shift = (address & 3) * 8,
        mask = size === 4 ? 0xffffffff : U32(((1 << (size * 8)) - 1) << shift);
      value = U32((old & ~mask) | ((value << shift) & mask));
      const clockRun = this._clockRun;
      if (clockRun && old !== value && (a === 0x80000404 || a === 0x80000408 || a === 0x80000444)) {
        // The instruction that writes the register ran at the previous clock.
        clockRun.ms += ((this.instructions - clockRun.at) * 1000) / clockRun.hz;
        clockRun.at = this.instructions;
        this.mmio[a] = value;
        clockRun.hz = this.nominalCpuHz;
      } else this.mmio[a] = value;
      if (a === 0x80000040 || a === 0x80000044) {
        value &= a === 0x80000040 ? 65535 : 15;
        this._writeMMIO(a, value);
        this._deferMMIO(a, value);
      } else if (a === 0x80000104) {
        this.pending = U32(this.pending & ~value);
        if (this.timer_pending) this.pending |= 64;
      } else if (a === 0x80000260) {
        this.timer_pending &= ~value;
        this._deferMMIO(a, this.timer_pending);
      } else if (a >= 0x80000200 && a <= 0x80000250 && !(a & 15)) {
        if (value & 256) {
          this.timer_counts[(a - 0x80000200) / 16] = 0;
          this._writeMMIO(a + 4, 0);
        }
        this._deferMMIO(a, value & ~256);
      } else if (a >= 0x80000204 && a <= 0x80000254 && (a & 15) === 4) {
        const n = (a - 0x80000204) / 16;
        const count = value & (n < 4 ? 0xffff : 0xfffff);
        this.timer_counts[n] = count;
        this.mmio[a] = count;
        this._deferMMIO(a, count);
      } else if (a === 0x80000400) {
        if (old & 2048 && !(value & 2048)) this.pll_enable_at = this.instructions;
      } else if (a === 0x80000a00 || a === 0x80000a80) {
        this.adc_channel = value & 7;
        this.adc_started = !(value & 16);
      } else if (a === 0x80000d08) this._deferMMIO(a, 0);
      else if (a === 0x80000d0c) this._deferMMIO(a, U32(old & ~value));
      else if (a === 0x80000d10) this._deferMMIO(a, U32(old | value));
      else if (a === 0x80000d14) this._writeMMIO(0x80000d10, (this.mmio[0x80000d10] || 0) & ~value);
      else if (a === 0x80000d54 || a === 0x80000d58) this._deferMMIO(a, 256);
      else if (a >= 0x80000f00 && a <= 0x80000f60) this.lcd_writes++;
      return;
    }
    value = this.mmio[a] || 0;
    if (a === 0x80000404)
      value = (this.mmio[0x80000400] || 0) & 2048 ? value & ~0x100000 : value | 0x100000;
    else if ([0x80000108, 0x80000114, 0x80000120, 0x80000124, 0x80000128, 0x8000012c].includes(a)) {
      value = this.pending;
      if (a === 0x80000120 || a === 0x80000128) value &= this.mmio[0x8000010c] || 0;
      else if (a === 0x80000124 || a === 0x8000012c) value &= ~(this.mmio[0x8000010c] || 0);
      if ([0x80000114, 0x80000128, 0x8000012c].includes(a)) value &= this.mmio[0x80000100] || 0;
    } else if (a in this.gpio_inputs) {
      const direction = this.mmio[a + 4] || 0;
      value = (value & direction) | (this.gpio_inputs[a] & ~direction);
    } else if (a === 0x80000260) value = this.timer_pending;
    else if (a === 0x80000a10) {
      if ([0xb0, 0xb1, 0xb2, 0xb3, 0x82, 0x85, 0x8b].includes(value)) value = 8;
      else if (value === 8) value = 4;
      else {
        this._stop('Unknown chip challenge ' + hex(value));
        return;
      }
    } else if (a === 0x80000a84)
      value = this.adc_started
        ? 0x1000000 | (this.adc_channel << 16) | this.adc_inputs[this.adc_channel]
        : 0;
    else if (a === 0x80000a04)
      value = (this.adc_inputs[this.adc_channel] << 1) | Number(this.adc_started);
    else if (a === 0xf0000008) value |= 0x8000;
    this._writeMMIO(a, value);
  }
  _ataMemory(access, address, size, value) {
    const port = address - 0x40000000,
      c = this.cpu;
    if (![0, 4, 8, 12, 16, 20, 24, 28, 56].includes(port)) {
      this._stop('Unsupported ATA port ' + hex(address));
      return;
    }
    if (access === this.uc.MEM_READ) {
      if (port === 0) {
        const end = this.ata_position + size;
        if (
          !(this.ata_registers[28] & 8) ||
          this.ata_write_target ||
          ![1, 2, 4].includes(size) ||
          end > this.ata_buffer.length
        ) {
          this._stop('ATA read without an active read transfer');
          return;
        }
        let data = 0;
        for (let i = 0; i < size; i++) data |= this.ata_buffer[this.ata_position + i] << (i * 8);
        c.writeSized(address, data, size);
        this.ata_position = end;
        if (end === this.ata_buffer.length) this.ata_registers[28] = 0x40;
      } else c.writeSized(address, this.ata_registers[port === 56 ? 28 : port] || 0, size);
      return;
    }
    if (port === 0) {
      if (!(this.ata_registers[28] & 8) || !this.ata_write_target) {
        this._stop('ATA write without an active write transfer');
        return;
      }
      const [drive, offset, length] = this.ata_write_target;
      if (
        ![1, 2, 4].includes(size) ||
        this.ata_position + size > length ||
        this.ata_buffer.length !== length
      ) {
        this._stop('ATA write exceeds the active transfer');
        return;
      }
      for (let i = 0; i < size; i++)
        this.ata_buffer[this.ata_position++] = (value >>> (8 * i)) & 255;
      if (this.ata_position === length) {
        const disk = this.ata_disks[drive];
        if (disk === this.disk_image) this.ata_disks[drive] = disk.slice();
        this.ata_disks[drive].set(this.ata_buffer, offset);
        this.ata_write_target = null;
        this.ata_registers[28] = 0x40;
      }
      return;
    }
    this.ata_registers[port] = value & 255;
    if (port !== 28) return;
    const command = value & 255;
    this.ata_write_target = null;
    this.ata_buffer = new Uint8Array();
    this.ata_position = 0;
    this.ata_registers[28] = 0x40;
    const event = {
      command,
      drive: this.ata_drive,
      instructions: this.instructions,
      pc: c.regRead('pc'),
    };
    push(this.ata_trace, event, 256);
    if (command === 0x61 || command === 0x62) {
      const selected = this.ata_registers[4] || 0;
      if (selected in this.ata_disks) {
        this.ata_drive = selected;
        this.ata_registers[4] = 0;
      } else this.ata_registers[4] = 32;
      return;
    }
    this.ata_registers[4] = 0;
    const disk = this.ata_disks[this.ata_drive] || new Uint8Array(),
      sectors = disk.length / 512;
    if (command === 0x63) {
      this.ata_buffer = new Uint8Array(512);
      this.ata_buffer.set(ASCII.encode('REUNION000000001'), 1);
      this.ata_registers[28] = 0x48;
      return;
    }
    if (command === 0xec) {
      this.ata_buffer = new Uint8Array(512);
      const view = new DataView(this.ata_buffer.buffer),
        fields = {
          0: 0x40,
          1: Math.min(16383, Math.max(1, Math.floor(sectors / (16 * 63)))),
          3: 16,
          6: 63,
          47: 0x8001,
          49: 0x200,
          53: 1,
          60: sectors & 65535,
          61: sectors >>> 16,
        };
      for (const [k, v] of Object.entries(fields)) view.setUint16(Number(k) * 2, v, true);
      const model = ASCII.encode('REUNION VIRTUAL FLASH'.padEnd(40, ' '));
      for (let i = 0; i < 40; i += 2) {
        this.ata_buffer[54 + i] = model[i + 1];
        this.ata_buffer[55 + i] = model[i];
      }
      this.ata_registers[28] = 0x48;
      return;
    }
    if ([0x20, 0x21, 0x30, 0x31].includes(command)) {
      const r = this.ata_registers,
        lba = U32(
          (r[12] || 0) | ((r[16] || 0) << 8) | ((r[20] || 0) << 16) | (((r[24] || 0) & 15) << 24),
        ),
        count = r[8] || 256,
        offset = lba * 512,
        length = count * 512;
      Object.assign(event, { lba, count });
      if (offset + length > disk.length) {
        r[4] = 16;
        r[28] = 0x41;
        return;
      }
      r[28] = 0x48;
      if (command === 0x20 || command === 0x21)
        this.ata_buffer = disk.subarray(offset, offset + length);
      else {
        this.ata_buffer = new Uint8Array(length);
        this.ata_write_target = [this.ata_drive, offset, length];
      }
      return;
    }
    if ([0x64, 0xe7, 0xef, 0x91, 0xe0, 0xe1].includes(command)) return;
    this._stop('Unsupported ATA command ' + hex(command));
  }
  _lcdMemory(access, address, size, value) {
    const port = address - 0x50000000;
    if (![0, 2].includes(port) || size !== 2) {
      this._stop('Unsupported LCD bus access ' + hex(address));
      return;
    }
    if (access === this.uc.MEM_READ) {
      this.cpu.writeSized(
        address,
        this.lcd_command === 0 ? 0x8309 : this.lcd_registers[this.lcd_command] || 0,
        2,
      );
      return;
    }
    this.lcd_writes++;
    if (port === 0) {
      this.lcd_command = value & 65535;
      if (value === 0x22) {
        this.lcd_x = (this.lcd_registers[0x45] || 0) & 255;
        this.lcd_y = (this.lcd_registers[0x44] || 0) & 255;
      }
      return;
    }
    if (this.lcd_command !== 0x22) {
      this.lcd_registers[this.lcd_command] = value & 65535;
      return;
    }
    if (this.lcd_x >= 0 && this.lcd_x < 220 && this.lcd_y >= 0 && this.lcd_y < 176) {
      const o = (this.lcd_y * 220 + this.lcd_x) * 2;
      this.lcd_pixels[o] = value & 255;
      this.lcd_pixels[o + 1] = (value >>> 8) & 255;
      this.lcd_pixel_writes++;
      this.lcd_source = 0x50000002;
      if (!this._displayedPixel) {
        this.milestones.push('Firmware wrote LCD pixels');
        this._displayedPixel = true;
      }
    }
    this.lcd_x++;
    const xe = Math.min(219, (this.lcd_registers[0x45] ?? 0xdb00) >>> 8),
      ye = Math.min(175, (this.lcd_registers[0x44] ?? 0xaf00) >>> 8);
    if (this.lcd_x > xe) {
      this.lcd_x = (this.lcd_registers[0x45] || 0) & 255;
      this.lcd_y++;
      if (this.lcd_y > ye) {
        this.lcd_y = (this.lcd_registers[0x44] || 0) & 255;
        this.lcd_frames++;
      }
    }
  }
  _invalidMemory(access, address, size, value) {
    const pc = this.cpu.regRead('pc');
    if (
      access === this.uc.MEM_WRITE_UNMAPPED &&
      address >= 0xf0000028 &&
      address <= 0xffffffff &&
      !((this.mmio[0x80000a60] || 0) & 0x10000)
    ) {
      const page = U32(address & ~4095);
      if (!this._open_bus_pages.has(page)) {
        this.cpu.map(page, 4096);
        this._open_bus_pages.add(page);
      }
      this.unsupported[hex(address)] ??= { pc, access: 'ignored undefined write' };
      return true;
    }
    this._stop('Unmapped memory access ' + access + ' at ' + hex(address) + ', PC ' + hex(pc));
    return false;
  }
  get framebufferRGBA() {
    if (this._lcd_rendered_count !== this.lcd_pixel_writes) {
      for (let i = 0; i < 220 * 176; i++) {
        const v = this.lcd_pixels[i * 2] | (this.lcd_pixels[i * 2 + 1] << 8),
          r = (v >>> 11) & 31,
          g = (v >>> 5) & 63,
          b = v & 31;
        this._rgba[i * 4] = (r << 3) | (r >>> 2);
        this._rgba[i * 4 + 1] = (g << 2) | (g >>> 4);
        this._rgba[i * 4 + 2] = (b << 3) | (b >>> 2);
        this._rgba[i * 4 + 3] = 255;
      }
      this._lcd_rendered_count = this.lcd_pixel_writes;
    }
    return this._rgba;
  }
  run(budget = 100000, { snapshot = true } = {}) {
    if (!Number.isSafeInteger(budget) || budget < 1 || budget > 10000000)
      throw new Error('Instruction budget must be 1..10000000');
    if (['blocked', 'error', 'off'].includes(this.status))
      return snapshot ? this.snapshot() : undefined;
    this.status = 'running';
    this._run_end = this.instructions + budget;
    const pc = this.cpu.regRead('pc'),
      thumb = !!(this.cpu.regRead('cpsr') & 32);
    try {
      // _code enforces the exact instruction limit, including fast-forwarded
      // idle work. A second per-instruction counter inside Unicorn is redundant.
      this.cpu.run(pc | Number(thumb), 0xffffffff, 0);
    } catch (e) {
      if (!['blocked', 'error'].includes(this.status)) {
        this.status = 'error';
        this.stop_reason = String(e);
      }
    } finally {
      this._run_end = null;
    }
    if (this.status === 'running') this.status = 'paused';
    if (snapshot) return this.snapshot();
  }
  runWithNominalClock(budget) {
    const run = { at: this.instructions, hz: this.nominalCpuHz, ms: 0 };
    this._clockRun = run;
    try {
      this.run(budget, { snapshot: false });
      return run.ms + ((this.instructions - run.at) * 1000) / run.hz;
    } finally {
      this._clockRun = null;
    }
  }
  snapshot() {
    return {
      status: this.status,
      stop_reason: this.stop_reason,
      instructions: this.instructions,
      fast_forwarded_instructions: this.fast_forwarded_instructions,
      pc: this.cpu.regRead('pc'),
      registers: this.registers,
      irq_count: this.irq_count,
      lcd_writes: this.lcd_writes,
      lcd_source: this.lcd_source,
      lcd_pixel_writes: this.lcd_pixel_writes,
      lcd_frames: this.lcd_frames,
      milestones: [...this.milestones],
      strict_mmio: this.strict_mmio,
      unsupported: { ...this.unsupported },
      firmware_resources_loaded: this.cpu.read32(0x21c00000) === 0x12345678,
      ata_commands: this.ata_trace.length,
      ata_last: this.ata_trace.slice(-8),
      rom_sha256: this.rom_info.sha256,
      checksum_valid: this.rom_info.checksum_valid,
      limitations: [
        'ARM940T instructions via Unicorn WASM ARM926-compatible core; CP15 shadow',
        'Instruction time is approximate; codec/PCM, RTC, SD and USB devices incomplete',
        'Other ROM versions may stop at unsupported hardware; no boot success is fabricated',
      ],
    };
  }
  async loadState(bytes) {
    await this.ready;
    if (bytes.length > 128 * 1024 * 1024) throw new Error('State archive is too large');
    let expanded = 0;
    const files = unzipSync(new Uint8Array(bytes), {
      filter: (f) => {
        expanded += f.originalSize;
        if (expanded > 384 * 1024 * 1024) throw new Error('Expanded state is too large');
        return true;
      },
    });
    if (!files['manifest.json'] || files['manifest.json'].length > 4000000)
      throw new Error('Invalid state manifest');
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
    if (manifest.format !== 'reunion-machine-state' || manifest.version !== 1)
      throw new Error('Unsupported state format');
    if (manifest.rom_sha256 !== this.rom_info.sha256)
      throw new Error('State belongs to a different ROM');
    const blobEntries = Object.entries(manifest.blobs || {});
    if (blobEntries.length > 1024) throw new Error('Too many state blobs');
    for (const [name, info] of blobEntries) {
      const b = files[name];
      if (!b || b.length !== info.size || (await sha256(b)) !== info.sha256)
        throw new Error('Damaged state blob ' + name);
    }
    const blob = (name) => {
      if (!Object.hasOwn(manifest.blobs, name) || !files[name])
        throw new Error('Missing state blob');
      return files[name];
    };
    const decode = (v, depth = 0) => {
      if (depth > 64) throw new Error('State nesting too deep');
      if (v === null || typeof v !== 'object') return v;
      if (v.type === 'bytes' || v.type === 'bytearray') return blob(v.blob).slice();
      if (['list', 'tuple', 'deque', 'set'].includes(v.type)) {
        const a = v.items.map((x) => decode(x, depth + 1));
        return v.type === 'set' ? new Set(a) : a;
      }
      if (v.type === 'dict' || v.type === 'Counter') {
        const out = Object.create(null);
        for (const [k, x] of v.items) {
          const key = decode(k, depth + 1);
          if (['__proto__', 'constructor', 'prototype'].includes(String(key)))
            throw new Error('Invalid state key');
          out[Array.isArray(key) ? key.join(',') : key] = decode(x, depth + 1);
        }
        return out;
      }
      throw new Error('Unknown state value encoding');
    };
    const attributes = decode(manifest.peripherals),
      allowed = new Set([
        'strict_mmio',
        'fast_idle',
        'instructions',
        'fast_forwarded_instructions',
        'status',
        'stop_reason',
        'trace',
        'mmio_trace',
        'mmio_counts',
        'unsupported',
        'milestones',
        'cp15',
        'mmio',
        'pending',
        'timer_pending',
        'timer_counts',
        'timer_last',
        'irq_count',
        'key_states',
        '_held_keys',
        'gpio_inputs',
        'adc_inputs',
        'adc_channel',
        'adc_started',
        'pll_enable_at',
        'lcd_writes',
        'lcd_source',
        'lcd_command',
        'lcd_registers',
        'lcd_pixels',
        'lcd_x',
        'lcd_y',
        'lcd_pixel_writes',
        'lcd_frames',
        '_lcd_rendered_count',
        'ata_registers',
        'ata_drive',
        'ata_buffer',
        'ata_position',
        'ata_write_target',
        'ata_trace',
        'ata_disks',
        '_deferred_writes',
        '_open_bus_pages',
      ]);
    for (const k of Object.keys(attributes))
      if (!allowed.has(k)) throw new Error('Unsupported state field ' + k);
    if (
      !(attributes.lcd_pixels instanceof Uint8Array) ||
      attributes.lcd_pixels.length !== 220 * 176 * 2
    )
      throw new Error('Invalid LCD state');
    const state = manifest.cpu,
      uint = (v) => Number.isInteger(v) && v >= 0 && v <= 0xffffffff;
    if (
      !state ||
      !uint(state.pc) ||
      !uint(state.cpsr) ||
      state.shared?.length !== 8 ||
      !state.shared.every(uint) ||
      state.banks?.length !== 6
    )
      throw new Error('Invalid ARM state');
    const modes = [0x10, 0x11, 0x12, 0x13, 0x17, 0x1b];
    for (let i = 0; i < 6; i++) {
      const bank = state.banks[i];
      if (
        bank.mode !== modes[i] ||
        bank.registers?.length !== 7 ||
        !bank.registers.every(uint) ||
        (i !== 0 && !uint(bank.spsr))
      )
        throw new Error('Invalid ARM banked state');
    }
    const regions = new Map([
        [0, 0x100000],
        [0x20000000, 0x1000000],
        [0x30000000, 0x10000],
        [0x40000000, 0x1000],
        [0x50000000, 0x1000],
        [0x80000000, 0x1000],
        [0xf0000000, 0x1000],
        [0xfffff000, 0x1000],
      ]),
      seen = new Set();
    for (const mem of manifest.memory) {
      if (seen.has(mem.start) || blob(mem.blob).length !== mem.size)
        throw new Error('Invalid memory state');
      seen.add(mem.start);
      if (regions.get(mem.start) !== mem.size)
        throw new Error('State memory mapping is unsupported');
    }
    if (seen.size !== regions.size) throw new Error('Incomplete memory state');
    // All external data is checked before changing the running machine.
    for (const mem of manifest.memory) this.cpu.write(mem.start, blob(mem.blob));
    for (const bank of state.banks) {
      this.cpu.regWrite('cpsr', 0xc0 | bank.mode);
      for (let i = 0; i < 7; i++) this.cpu.regWrite(R[8 + i], bank.registers[i]);
      if (bank.mode !== 0x10) this.cpu.regWrite('spsr', bank.spsr);
    }
    for (let i = 0; i < 8; i++) this.cpu.regWrite(R[i], state.shared[i]);
    this.cpu.regWrite('cpsr', state.cpsr);
    this.cpu.regWrite('pc', state.pc);
    Object.assign(this, attributes);
    this._enteredSDRAM = this.milestones.includes('Entered SDRAM executable');
    this._displayedPixel = this.milestones.includes('Firmware wrote LCD pixels');
    if (this._deferred_writes && !Object.keys(this._deferred_writes).length)
      this._deferred_writes = null;
    this._run_end = null;
    this._lcd_rendered_count = -1;
    this.status = 'paused';
    this.stop_reason = '';
    return this.snapshot();
  }
  close() {
    this.cpu.close();
  }
}
