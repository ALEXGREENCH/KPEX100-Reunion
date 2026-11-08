/** Original Kingston 2.12 ARM GNEX interpreter and graphics, in browser WASM. */
import { createARM } from './cpu.js';
import { SgsFile, bytes, decodeKorean } from './sgs.js';
import { VirtualFileSystem } from './vfs.js';
import { installRomAccelerators } from './rom-accelerators.js';
import { rgb565ToRGBA } from './rgb565.js';
export const ROM_SHA256 = '743d0b9a377dc6a3f0a80b7816cee575ad2f8249643876367c4bfaac54ddd19a';
const RELOC = 0x2000f8dc,
  BASE = 0x21000000,
  STOP = 0x23fff000,
  TOP = 0x20b3ed28,
  STACK = 0x20b3f5a0,
  VM_PC = 0x20b3eb84;
const EVENT_WORK_BUDGET = 20_000_000;
const RGB_PALETTE_MIN_ENTRIES = 32;
const hex = (n) => '0x' + (n >>> 0).toString(16).padStart(8, '0');
const boundedPush = (list, item, n) => {
  list.push(item);
  if (list.length > n) list.shift();
};
export class GnexError extends Error {}
export async function sha256(input) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes(input)))]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
}

export function extractMp3(payload) {
  const p = bytes(payload),
    rates = [44100, 48000, 32000];
  for (let start = 0; start < Math.min(4096, p.length - 8); start++) {
    let pos = start,
      frames = 0;
    while (pos + 4 <= p.length) {
      const h = ((p[pos] << 24) | (p[pos + 1] << 16) | (p[pos + 2] << 8) | p[pos + 3]) >>> 0;
      const version = (h >>> 19) & 3,
        layer = (h >>> 17) & 3,
        bitrate = (h >>> 12) & 15,
        rateIndex = (h >>> 10) & 3;
      if (
        h >>> 21 !== 0x7ff ||
        version === 1 ||
        layer !== 1 ||
        bitrate < 1 ||
        bitrate > 14 ||
        rateIndex === 3
      )
        break;
      const table =
        version === 3
          ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
          : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
      const rate = rates[rateIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4),
        size =
          Math.floor(((version === 3 ? 144000 : 72000) * table[bitrate]) / rate) + ((h >>> 9) & 1);
      if (pos + size > p.length) break;
      frames++;
      pos += size;
    }
    if (frames >= 2) return p.slice(start, pos);
  }
  throw new GnexError('No complete MPEG Layer III frames in sound resource');
}

export class GnexRuntime {
  static async create(rom, sgs, options = {}) {
    rom = bytes(rom);
    sgs = bytes(sgs);
    const [romHash, gameHash] = await Promise.all([sha256(rom), sha256(sgs)]);
    if (romHash !== ROM_SHA256) throw new GnexError('GNEX requires unmodified Kingston 2.12 ROM');
    const script = await SgsFile.open(sgs);
    const cpu = options.cpu || (await createARM());
    try {
      const runtime = new GnexRuntime(rom, script, {
        ...options,
        cpu,
        romHash,
        saveKey: options.saveKey || 'reunion.saves.' + gameHash,
      });
      if (runtime.sgs.version === 36) {
        const { createSwerve } = await import('./swerve.js');
        runtime.swerve = await createSwerve(runtime, {
          fastExecution: runtime.fastExecution,
          ...options.swerve,
        });
      }
      return runtime;
    } catch (e) {
      if (!options.cpu) {
        try {
          cpu.close();
        } catch {
          /* Preserve the initialization error. */
        }
      }
      throw e;
    }
  }
  constructor(
    rom,
    sgs,
    {
      cpu,
      romHash,
      width = 220,
      height = 176,
      profile = null,
      startData = 0,
      keyReleaseEvent = true,
      audio = null,
      nativeSoundType = null,
      saveKey = null,
      storage = null,
      saveData = null,
      onSave = null,
      clock = () => new Date(),
      nowMs = () => performance.now(),
      deviceMin = '01000000000',
      deviceUserId = 'Sinji',
      fastExecution = true,
      timeoutWorkBudget = EVENT_WORK_BUDGET,
    } = {},
  ) {
    if (!cpu) throw new GnexError('Use await GnexRuntime.create(), or provide an initialized CPU');
    if (romHash !== ROM_SHA256) throw new GnexError('Verified Kingston 2.12 ROM digest required');
    if (
      !Number.isSafeInteger(timeoutWorkBudget) ||
      timeoutWorkBudget < EVENT_WORK_BUDGET ||
      timeoutWorkBudget > 60_000_000
    )
      throw new GnexError('Invalid timer work budget');
    this.timeoutWorkBudget = timeoutWorkBudget;
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 64 ||
      height < 64 ||
      width > 512 ||
      height > 512
    )
      throw new GnexError('LCD dimensions must be 64–512 pixels');
    if (!Number.isInteger(startData) || startData < 0 || startData > 0xffffffff)
      throw new GnexError('START data must be an unsigned 32-bit integer');
    this.startData = startData;
    if (![null, 0, 1].includes(nativeSoundType))
      throw new GnexError('Native sound type must be null, 0 or 1');
    this.nativeSoundType = nativeSoundType;
    this.sgs = sgs instanceof SgsFile ? sgs : new SgsFile(sgs);
    this.title = this.sgs.title;
    this.profile = profile || (this.sgs.xorMask === 165 ? 'kpex' : 'phone');
    this.keyReleaseEvent = this.profile === 'phone' || keyReleaseEvent === true;
    if (this.sgs.body.length > 0xc00000)
      throw new GnexError('SGS exceeds 12 MiB guest content region');
    if (!/^\d{1,32}$/.test(deviceMin))
      throw new GnexError('Virtual phone MIN must contain 1–32 digits');
    if (typeof deviceUserId !== 'string' || !/^[\x20-\x7e]{0,8}$/.test(deviceUserId))
      throw new GnexError('Virtual script user ID must be at most 8 ASCII bytes');
    this.deviceUserId = deviceUserId;
    this.cpu = cpu;
    this.fastExecution = !!fastExecution;
    // SGS 36 intros consume the block-derived phone clock while loading 3D.
    // Keep their interpreter's reference block layout; accelerate Swerve itself.
    this.fastVmExecution = this.fastExecution && this.sgs.version !== 36;
    this.audio = audio;
    this.clock = clock;
    this.nowMs = nowMs;
    this.tickEpoch = nowMs();
    this.civilEpoch = clock().getTime();
    this.softwareInstructions = 0;
    this.tickResets = Array(10).fill(0);
    this.deviceMin = deviceMin;
    this.width = width;
    this.height = height;
    this.volume = 10;
    if (!storage) {
      try {
        storage = globalThis.localStorage || null;
      } catch {
        storage = null;
      }
    }
    this.vfs = new VirtualFileSystem(this.sgs, { saveKey, storage, saveData, onSave, clock });
    this.timers = Array.from({ length: 3 }, (_, channel) => ({
      channel,
      delay: null,
      repeat: false,
      revision: 0,
    }));
    this.timerRevision = 0;
    this.heldKeys = new Set();
    this.status = 'ready';
    this.error = null;
    this.syscalls = {};
    this.trace = [];
    this.eventCount = 0;
    this.audioRequests = [];
    this.audioDiagnostics = {
      requests: 0,
      ignoredNativeSubtypes: [],
      filteredNativeSubtypes: [],
      lastError: null,
      lastFormat: null,
    };
    this.heapNext = 0x23200000;
    this.heapAllocations = new Map();
    this.heapFree = [];
    this.frameCount = 0;
    this.exception = null;
    cpu.map(0x20000000, 0x4000000);
    cpu.write(0x20010000, bytes(rom).subarray(0x724));
    cpu.write(0x21c00000, bytes(rom).subarray(0x100000, 0x49a600));
    cpu.write(BASE, this.sgs.body);
    cpu.regWrite('sp', 0x23ff0000);
    for (const f of [0x3ca8c, 0x39220, 0x4d464, 0x45020, 0x45094, 0x45108]) {
      cpu.regWrite('lr', STOP);
      cpu.run(RELOC + f, STOP, 10000);
      if (cpu.regRead('pc') !== STOP)
        throw new GnexError('ROM dispatch initializer did not return');
    }
    const s = this.sgs;
    for (const [p, v] of [
      [0x20b3eb7c, BASE],
      [0x20b405a0, s.variables.length],
      [0x20b405a4, (s.c - s.b) / 4],
      [0x20b405a8, BASE + s.a],
      [0x20b405ac, BASE + s.b],
      [0x20b405b0, BASE + s.c],
      [0x20b3ed20, s.resources.length],
      [0x20b405b8, s.resources.length],
      [0x20b405b4, BASE + s.c],
    ])
      this._write(p, v);
    this.varAddresses = [];
    let pos = BASE + s.b;
    s.variables.forEach(([, count], i) => {
      this._write(BASE + s.a + i * 8 + 4, pos);
      this.varAddresses.push(pos);
      pos += count * 4;
    });
    s.resources.forEach((r, i) => this._write(BASE + s.c + i * 12 + 8, BASE + r.offset));
    cpu.write(0x200fefb8, Uint8Array.of(255, 0));
    this._setVar(4, width);
    this._setVar(5, height);
    for (const address of [0x336bc, 0x4e1e8, 0x3cf1c, 0x3cf4c, 0x3cc30])
      cpu.onCode((p) => this._hook(p), { begin: RELOC + address, end: RELOC + address });
    this._write(0x20b40e6c, width);
    this._write(0x20b40e70, height);
    // SDK handset capabilities: MA1, MA2, MA3, MA5, WAVE and MP3.
    if (this.profile === 'phone') this._write(0x20b41040, 0x1e6);
    this._write(0x20b3f144, width);
    this._write(0x20b3f148, height);
    this._write(0x20b3f14c, width);
    this._write(0x20b3f150, height);
    cpu.regWrite('sp', 0x23ff0000);
    cpu.regWrite('lr', STOP);
    cpu.regWrite('r0', width);
    cpu.regWrite('r1', height);
    cpu.regWrite('r2', 0x23000000);
    cpu.run(RELOC + 0x45bfc, STOP, 5_000_000);
    if (this.exception || cpu.regRead('pc') !== STOP)
      throw new GnexError(`Native display init failed: ${this.exception || 'instruction budget'}`);
    if (this.profile === 'phone' && cpu.onBlock) {
      this.blockClock = cpu.startBlockClock?.();
      if (!this.blockClock) {
        const observer = (address, size) => {
          this.softwareInstructions += Math.ceil(size / 4);
        };
        if (cpu.setBlockObserver) cpu.setBlockObserver(observer);
        else cpu.onBlock(observer);
      }
    }
    if (this.fastVmExecution) {
      // RGB image resources put the palette count immediately before their
      // triples. The high header bit selects the extended layout, and zero
      // represents 256 entries. Dynamic-only palettes use ARM unless this
      // script already has a qualifying palette in its initial resources.
      const hasLargeRgbPalette = this.sgs.resources.some(({ type, data }) => {
        if ((type !== 0x100 && type !== 0x101) || (data[0] & 0x7f) !== 0x0c) return false;
        const headerLength = data[0] & 0x80 ? 11 : 7;
        const count = data[headerLength - 1] || 256;
        return count >= RGB_PALETTE_MIN_ENTRIES && data.length >= headerLength + count * 3;
      });
      this.romAccelerators = installRomAccelerators(cpu, {
        romHash,
        minPaletteContinuationPixels: 192,
        minBlendedPalettePixels: 256,
        minRgbPaletteEntries: hasLargeRgbPalette ? RGB_PALETTE_MIN_ENTRIES : Infinity,
        minBlendRectanglePixels: 256,
        minSolidRectanglePixels: 256,
        enabled: () => this._fastEventActive,
        onSkippedInstructions: (count) => {
          if (this.profile === 'phone') this.softwareInstructions += count;
        },
      });
    }
    this._refreshLCD();
    if (this.profile === 'phone') this.presentedLCD = this.lcdPixels.slice();
  }
  get armInstructions() {
    return this.softwareInstructions + (this.blockClock?.() ?? 0);
  }
  get timerMs() {
    return this.timers[0].delay;
  }
  set timerMs(v) {
    this.timers[0].delay = v;
  }
  get timerRepeat() {
    return this.timers[0].repeat;
  }
  set timerRepeat(v) {
    this.timers[0].repeat = !!v;
  }
  get timerStates() {
    return this.timers.map((t) => ({ ...t }));
  }
  get timer_ms() {
    return this.timerMs;
  }
  set timer_ms(v) {
    this.timerMs = v;
  }
  get timer_repeat() {
    return this.timerRepeat;
  }
  get timer_revision() {
    return this.timerRevision;
  }
  get framebufferRGBA() {
    return this.framebuffer.data;
  }
  get diagnostics() {
    const pc = this.status === 'closed' ? this.lastPc : this._read(VM_PC);
    return {
      status: this.status,
      error: this.error,
      title: this.title,
      engine:
        this.profile === 'phone'
          ? 'GNEX phone compatibility / original ARM interpreter' +
            (this.swerve ? ' + Swerve 2.1 ARM' : '')
          : 'Original Kingston 2.12 ARM GNEX / Unicorn WASM',
      profile: this.profile,
      execution: this.fastVmExecution
        ? 'Bounded block execution and verified ROM shortcuts'
        : this.fastExecution
          ? 'Reference GNEX clock and bounded Swerve execution'
          : 'Instruction-count reference',
      events: this.eventCount,
      timer_ms: this.timerMs,
      bytecode_pc: pc >= BASE && pc < BASE + this.sgs.body.length ? hex(pc - BASE) : null,
      interpreter_pc: hex(pc),
      syscalls: { ...this.syscalls },
      trace: [...this.trace],
      audio: { ...this.audioDiagnostics },
      filesystem: this.vfs.diagnostics,
      timers: this.timerStates,
      externalRequest: this.externalRequest || null,
      environment: {
        phoneMIN: 'Synthetic virtual handset identifier',
        tickResolutionMs: 20,
        phoneClock:
          this.profile === 'phone' ? 'Host monotonic plus 10 MHz virtual ARM block clock' : null,
      },
      graphics: [
        'Original ROM RGB565 renderer, palette, ASCII and Korean fonts',
        ...(this.swerve ? ['Original Swerve 2.1 ARM software 3D renderer'] : []),
      ],
      swerve: this.swerve
        ? { backend: 'Original Swerve 2.1 ARM', recentCalls: this.swerve.log.slice(-12) }
        : null,
    };
  }
  _read(p) {
    return this.cpu.read32(p);
  }
  _write(p, n) {
    this.cpu.write32(p, n);
  }
  _setVar(i, n) {
    if (i < this.varAddresses.length) this._write(this.varAddresses[i], n);
  }
  _args(n) {
    const top = this._read(TOP) | 0;
    if (top < n - 1 || top > 1023) throw new GnexError(`Stack bounds: top=${top},need=${n}`);
    const a = [];
    for (let i = top - n + 1; i <= top; i++) a.push(this._read(STACK + i * 4) | 0);
    this._write(TOP, top - n);
    return a;
  }
  _push(n) {
    const top = (this._read(TOP) | 0) + 1;
    if (top < 0 || top >= 1024) throw new GnexError('GNEX stack overflow');
    this._write(TOP, top);
    this._write(STACK + top * 4, n);
  }
  _return() {
    this.cpu.regWrite('pc', this.cpu.regRead('lr'));
  }
  resourceBytes(i) {
    this.sgs.resource(i);
    const d = BASE + this.sgs.c + i * 12,
      n = this._read(d + 4),
      p = this._read(d + 8);
    if (n > 32 * 1024 * 1024) throw new GnexError('Guest resource too large');
    return this.cpu.read(p, n).slice();
  }
  _allocate(n) {
    if (n < 1 || n > 8 * 1024 * 1024) throw new GnexError(`Invalid guest allocation ${n}`);
    n = (n + 15) & ~15;
    let pointer;
    const free = this.heapFree.findIndex(([, size]) => size >= n);
    if (free >= 0) [pointer, n] = this.heapFree.splice(free, 1)[0];
    else {
      pointer = this.heapNext;
      if (pointer + n > 0x23e00000) throw new GnexError('Guest heap exhausted');
      this.heapNext += n;
    }
    this.heapAllocations.set(pointer, n);
    this.cpu.write(pointer, new Uint8Array(n));
    return pointer;
  }
  _free(p) {
    const n = this.heapAllocations.get(p);
    if (n !== undefined) {
      this.heapAllocations.delete(p);
      this.heapFree.push([p, n]);
    }
  }
  setResourceBytes(i, data) {
    this.sgs.resource(i);
    data = bytes(data);
    const d = BASE + this.sgs.c + i * 12,
      p = this._allocate(Math.max(1, data.length));
    this.cpu.write(p, data);
    this._free(this._read(d + 8));
    this._write(d + 4, data.length);
    this._write(d + 8, p);
  }
  _presentLCD(bounds = null) {
    const p = this._read(0x20b41260),
      src = this.cpu.read(p, this.width * this.height * 2);
    if (!bounds) {
      this.presentedLCD = src;
      this.lcdNeedsRefresh = true;
      return;
    }
    // FlushPartial takes inclusive endpoints. The native adapter swaps reversed
    // coordinates, then clips to the LCD (Kingston handler 0x2005dc38).
    let [x1, y1, x2, y2] = bounds;
    if (x1 > x2) [x1, x2] = [x2, x1];
    if (y1 > y2) [y1, y2] = [y2, y1];
    x1 = Math.max(0, x1);
    y1 = Math.max(0, y1);
    x2 = Math.min(this.width - 1, x2);
    y2 = Math.min(this.height - 1, y2);
    this.presentedLCD ??= this.lcdPixels.slice();
    if (x1 > x2 || y1 > y2) return;
    for (let y = y1; y <= y2; y++) {
      const first = (y * this.width + x1) * 2,
        end = (y * this.width + x2 + 1) * 2;
      this.presentedLCD.set(src.subarray(first, end), first);
    }
    this.lcdNeedsRefresh = true;
  }
  _refreshLCD() {
    // Before the first explicit flush, K-PEX previews the drawing memory.
    // Once a physical image is available, only a flush can change it.
    if (this.presentedLCD && !this.lcdNeedsRefresh) return;
    const src =
        this.presentedLCD || this.cpu.read(this._read(0x20b41260), this.width * this.height * 2),
      rgba = rgb565ToRGBA(src);
    this.lcdPixels = src;
    this.framebuffer = { width: this.width, height: this.height, data: rgba };
    this.lcdNeedsRefresh = false;
  }
  _hook(address) {
    try {
      if (address === RELOC + 0x3cc30) {
        [this.width, this.height, 0, 0].forEach((v, i) =>
          this._write(this.cpu.regRead('r' + i), v),
        );
        this.cpu.regWrite('r0', 0);
        this.cpu.regWrite('r12', this.width);
        this._return();
        return;
      }
      if (address === RELOC + 0x3cf1c) {
        // The K-PEX MallocInt helper forwards an element count to its byte
        // allocator, although its descriptors and loads use 32-bit elements.
        // Phone SDK arrays require four bytes per element. Preserve the ROM
        // device profile, and compensate only this specific allocation site.
        const intArray = this.profile === 'phone' && this.cpu.regRead('lr') === RELOC + 0x49578;
        this.cpu.regWrite(
          'r0',
          this._allocate((this.cpu.regRead('r0') >>> 0) * (intArray ? 4 : 1)),
        );
        this._return();
        return;
      }
      if (address === RELOC + 0x3cf4c) {
        this._free(this.cpu.regRead('r0'));
        this._return();
        return;
      }
      if (address === RELOC + 0x336bc)
        throw new GnexError(
          `Original GNEX exception ${this.cpu.regRead('r0')} at SGS ${hex(this._read(VM_PC) - BASE)}`,
        );
      const n = this.cpu.regRead('r0');
      // Register the two solid-rectangle shortcuts when a script first uses them.
      if (this._fastEventActive && (n === 0x37 || n === 0x39))
        this.romAccelerators?.enableSolidRectangles();
      this.syscalls[hex(n)] = (this.syscalls[hex(n)] || 0) + 1;
      boundedPush(this.trace, `calls ${hex(n)} @ SGS ${hex(this._read(VM_PC) - BASE)}`, 60);
      if (this._syscall(n)) this._return();
    } catch (e) {
      this.exception = e;
      this.cpu.stop();
    }
  }
  _audio(action, ...args) {
    try {
      const result = this.audio?.[action]?.(...args);
      result?.catch?.((e) => {
        this.audioDiagnostics.lastError = String(e);
      });
    } catch (e) {
      this.audioDiagnostics.lastError = String(e);
    }
  }
  _playAudio(payload, channel = 0) {
    this.audioDiagnostics.requests++;
    if (payload.length < 2) return;
    const rawType = payload[0] | (payload[1] << 8),
      type = this.profile === 'phone' ? rawType & 0x7fff : rawType,
      loop = this.profile === 'phone' && !!(rawType & 0x8000);
    try {
      if ([0, 1].includes(type) && this.nativeSoundType != null && type !== this.nativeSoundType) {
        const filtered = (this.audioDiagnostics.filteredNativeSubtypes ||= []);
        if (!filtered.includes(type)) filtered.push(type);
        return;
      }
      if (type === 0) {
        this.audioDiagnostics.lastFormat = 'GVM buzzer';
        this._audio('play', new Uint8Array(payload), 'audio/x-gvm-buzzer', loop, channel);
      } else if (type === 1) {
        this.audioDiagnostics.lastFormat = 'GVM MA1';
        this._audio('play', new Uint8Array(payload), 'audio/x-gvm-ma1', loop, channel);
      } else if (type === 8) {
        this.audioDiagnostics.lastFormat = 'MP3';
        this._audio('play', extractMp3(payload), 'audio/mpeg', loop, channel);
      } else if (
        this.profile === 'phone' &&
        [2, 3, 4, 5, 6].includes(type) &&
        payload.length >= 10 &&
        new TextDecoder('ascii').decode(payload.subarray(2, 6)) === 'MMMD'
      ) {
        const size =
          new DataView(payload.buffer, payload.byteOffset + 6, 4).getUint32(0, false) + 8;
        if (size > payload.length - 2) throw new GnexError('Truncated SMAF');
        this.audioDiagnostics.lastFormat = 'SMAF';
        this._audio('play', payload.slice(2, 2 + size), 'audio/x-smaf', loop, channel);
      } else if (type === 7) {
        let p = -1;
        for (let i = 2; i < Math.min(1024, payload.length - 12); i++)
          if (
            payload[i] === 82 &&
            payload[i + 1] === 73 &&
            payload[i + 2] === 70 &&
            payload[i + 3] === 70 &&
            payload[i + 8] === 87 &&
            payload[i + 9] === 65 &&
            payload[i + 10] === 86 &&
            payload[i + 11] === 69
          ) {
            p = i;
            break;
          }
        if (p < 0) throw new GnexError('Subtype7 sound has no recognized WAVE header');
        const n =
          new DataView(payload.buffer, payload.byteOffset + p + 4, 4).getUint32(0, true) + 8;
        if (p + n > payload.length) throw new GnexError('Truncated WAVE');
        this.audioDiagnostics.lastFormat = 'WAVE';
        this._audio('play', payload.slice(p, p + n), 'audio/wav', loop, channel);
      } else if (!this.audioDiagnostics.ignoredNativeSubtypes.includes(type))
        this.audioDiagnostics.ignoredNativeSubtypes.push(type);
    } catch (e) {
      this.audioDiagnostics.lastError = String(e);
    }
  }
  _syscall(n) {
    if (this.swerve?.syscall(n)) return true;
    if (this.vfs.syscall(this, n)) return true;
    if (n === 7) {
      const resource = this._args(1)[0];
      this.externalRequest = {
        kind: 'browser',
        url: decodeKorean(this.resourceBytes(resource)).slice(0, 2048),
        handled: false,
      };
      this._write(0x20b3ece4, 3);
      this._write(VM_PC, 0x200fefb8);
      return true;
    }
    if (n === 0x1e0) {
      let mask = 0;
      for (const code of this.heldKeys) if (code >= 0 && code < 32) mask |= 1 << code;
      this._push(mask);
      return true;
    }
    if (this.profile === 'phone' && n === 2) {
      this.setResourceBytes(this._args(1)[0], new TextEncoder().encode(this.deviceUserId + '\0'));
      this._push(0);
      return true;
    }
    // SDK 2.12 packed media heap keeps allocations for equal sizes and
    // reductions of at most 16 bytes (Emulator.exe helper 0x41C740).
    if (this.profile === 'phone' && n === 0x9e) {
      const top = this._read(TOP) | 0;
      if (top >= 1) {
        const i = this._read(STACK + (top - 1) * 4),
          size = this._read(STACK + top * 4) | 0;
        if (i < this.sgs.resources.length && size >= 0) {
          const old = this._read(BASE + this.sgs.c + i * 12 + 4),
            delta = ((size + 1) & ~1) - old;
          if (delta <= 0 && delta >= -16) {
            this._args(2);
            this._push(1);
            return true;
          }
        }
      }
    }
    if (this.profile === 'phone' && (n === 0x93 || n === 0x94)) {
      const [pointer, count] = this._args(2);
      if (count < 0 || count > 4 * 1024 * 1024)
        throw new GnexError('User NV transfer exceeds virtual storage capacity');
      const p = this.vfs.intPointer(this, pointer, count * 4);
      // The SDK reads exactly count*4 bytes and leaves the unread destination
      // unchanged on EOF. Its 64-byte slot stride is not a transfer limit.
      if (n === 0x93) {
        const data = this.vfs.userNV.subarray(0, count * 4);
        if (data.length) this.cpu.write(p, data);
      } else {
        if (count * 4 > this.vfs.userNV.length) {
          const data = new Uint8Array(count * 4);
          data.set(this.vfs.userNV);
          this.vfs.userNV = data;
        }
        this.vfs.userNV.set(this.cpu.read(p, count * 4));
        this.vfs.flush();
      }
      return true;
    }
    if (this.profile === 'phone' && (n === 4 || n === 5)) {
      const p = this.vfs.intPointer(this, this._args(1)[0], 16),
        now = new Date(
          this.civilEpoch + this.nowMs() - this.tickEpoch + this.armInstructions / 10_000,
        );
      const values =
        n === 4
          ? [now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getDay()]
          : [now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds()];
      values.forEach((v, i) => this._write(p + i * 4, v));
      return true;
    }
    if (n === 4 || n === 5) {
      const now = this.clock(),
        year = now.getFullYear();
      this.cpu.write(
        0x2098541c,
        Uint8Array.of(
          now.getSeconds(),
          now.getMinutes(),
          now.getHours(),
          now.getDate(),
          now.getMonth() + 1,
          year & 255,
          year >>> 8,
        ),
      );
      return false;
    }
    if (
      n === 0 ||
      n === 2 ||
      n === 0x61 ||
      n === 0x1e3 ||
      (n >= 0xc && n <= 0x5e) ||
      (n >= 0x9d && n <= 0xe1) ||
      (n >= 0x8c && n <= 0x94) ||
      (n >= 0xfc && n <= 0x100) ||
      (n >= 0x187 && n <= 0x18b) ||
      (n >= 0x1d9 && n <= 0x1df) ||
      (n >= 0x318 && n <= 0x329)
    )
      return false;
    if (n === 1 || n === 0x186)
      this.setResourceBytes(this._args(1)[0], new TextEncoder().encode(this.deviceMin + '\0'));
    else if (n === 0x5f) {
      this._presentLCD();
    } else if (n === 0x60) this._presentLCD(this._args(4));
    else if (n === 0x82) {
      const resource = this._args(1)[0];
      this.sgs.resource(resource);
      boundedPush(this.audioRequests, resource, 256);
      this._playAudio(this.resourceBytes(resource));
    } else if (n === 0x83) this._audio('stop');
    else if (n === 0x84) this._audio('pause');
    else if (n === 0x85) this._audio('resume');
    else if (n === 0x86) {
      const [channel, resource] = this._args(2);
      this.sgs.resource(resource);
      boundedPush(this.audioRequests, resource, 256);
      this._playAudio(this.resourceBytes(resource), channel);
    } else if (n >= 0x87 && n <= 0x89)
      this._audio(['stop', 'pause', 'resume'][n - 0x87], this._args(1)[0]);
    else if (n === 0x8a) this._push(this.volume);
    else if (n === 0x8b) {
      this.volume = Math.max(0, Math.min(10, this._args(1)[0]));
      this._audio('setVolume', this.volume / 10);
    } else if (n === 0x177) {
      const [channel, volume] = this._args(2);
      this.channelVolumes ??= {};
      this.channelVolumes[channel] = Math.max(0, Math.min(10, volume));
      this._audio('setVolume', this.channelVolumes[channel] / 10, channel);
    } else if (n === 0x178) {
      const channel = this._args(1)[0];
      this._push(this.channelVolumes?.[channel] ?? this.volume);
    } else if (n >= 0x95 && n <= 0x97) {
      const [delay, repeat] = this._args(2),
        timer = this.timers[n - 0x95];
      timer.delay = delay > 0 ? delay : null;
      timer.armedAt = this.nowMs();
      timer.repeat = !!repeat;
      timer.revision++;
      this.timerRevision++;
    } else if (n >= 0x98 && n <= 0x9a) {
      const timer = this.timers[n - 0x98];
      timer.delay = null;
      timer.revision++;
      this.timerRevision++;
    } else if (n === 0x9b || n === 0x9c) {
      const id = this._args(1)[0],
        tick =
          Math.floor(
            (this.nowMs() -
              this.tickEpoch +
              (this.profile === 'phone' ? this.armInstructions / 10000 : 0)) /
              20,
          ) * 20;
      if (n === 0x9b) this._push(id >= 0 && id < 10 ? (tick - this.tickResets[id]) | 0 : 0);
      else if (id >= 0 && id < 10) this.tickResets[id] = tick;
    } else throw new GnexError(`Unsupported syscall ${hex(n)}; stopped without invented behavior`);
    return true;
  }
  event(name, value, instructionBudget = EVENT_WORK_BUDGET) {
    const guarded = this.fastVmExecution && arguments.length < 3 && this.cpu.runGuarded;
    name = String(name).toUpperCase();
    if (guarded && name === 'TIMEOUT') instructionBudget = this.timeoutWorkBudget;
    if (value === undefined) value = name === 'START' ? this.startData : 0;
    if (!(name in this.sgs.entries)) throw new GnexError(`Unknown event ${name}`);
    if (['error', 'exited', 'closed'].includes(this.status)) return this.diagnostics;
    if (
      !Number.isInteger(instructionBudget) ||
      instructionBudget < 1 ||
      instructionBudget > 100_000_000
    )
      throw new GnexError('Invalid instruction budget');
    const entry = this.sgs.entries[name];
    if (!entry) return this.diagnostics;
    this._setVar(0, value);
    if (name === 'TIMEOUT') {
      this.frameCount++;
      this._setVar(6, this.frameCount);
      for (const [i, m] of [
        [7, 2],
        [8, 3],
        [9, 6],
      ])
        this._setVar(i, this.frameCount % m);
      const timer = this.timers[value];
      if (timer && !timer.repeat) timer.delay = null;
    }
    this.exception = null;
    this.cpu.regWrite('r0', entry);
    this.cpu.regWrite('lr', STOP);
    this.cpu.regWrite('sp', 0x23ff0000);
    this.status = 'running';
    this._fastEventActive = !!guarded;
    try {
      if (guarded) this.cpu.runGuarded(RELOC + 0x399bc, STOP, instructionBudget);
      else this.cpu.run(RELOC + 0x399bc, STOP, instructionBudget);
      if (this.exception) throw this.exception;
      if (this.cpu.regRead('pc') !== STOP)
        throw new GnexError(
          `Event ${name} exceeded ${instructionBudget} ARM ${guarded ? 'block work units' : 'instructions'}`,
        );
      this.eventCount++;
      this.status = this._read(0x20b3ece4) === 3 ? 'exited' : 'idle';
      if (this.status === 'exited') {
        for (const timer of this.timers) timer.delay = null;
        this._audio('stop');
      }
    } catch (e) {
      this.error = String(e.message || e);
      this.status = 'error';
    } finally {
      this._fastEventActive = false;
    }
    try {
      this._refreshLCD();
    } catch (e) {
      this.error = this.error || String(e.message || e);
      this.status = 'error';
    }
    return this.diagnostics;
  }
  setKey(code, pressed) {
    if (pressed) {
      this.heldKeys.add(code);
      return this.event('KEYPRESS', code);
    }
    const released = this.heldKeys.delete(code);
    // SDK 2.12 WM_KEYUP clears the individual button's held flag, then sends
    // KEYPRESS 0xff even if another button is still held (Emulator.exe
    // 0x40BE10 -> 0x409DC9 -> 0x44BF90, table 0x50F254[0x2f]).
    // The following VM dispatcher explicitly filters it for pre-v4/16-bit
    // scripts at 0x443BCC; only the modern 32-bit path receives the event.
    // Kingston's original key service also sends 0xff: traced through its
    // unmodified firmware at the 32-bit VM entry after hardware key releases.
    if (
      released &&
      this.keyReleaseEvent &&
      this.sgs.version >= 4 &&
      !['closed', 'exited', 'error'].includes(this.status)
    ) {
      return this.event('KEYPRESS', 0xff);
    }
    return this.diagnostics;
  }
  set_key(code, pressed) {
    return this.setKey(code, pressed);
  }
  close() {
    if (this.status === 'closed') return;
    this._audio('stop');
    this.vfs.flush();
    this.lastPc = this._read(VM_PC);
    try {
      this.swerve?.close();
    } finally {
      this.cpu.close();
      this.status = 'closed';
    }
  }
}
