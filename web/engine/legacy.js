/** Original K-PEX 8-bit GNEX interpreter for SGS v1/v2. No bytecode translation. */
import { GnexRuntime, GnexError, ROM_SHA256, sha256 } from './gnex.js';
import { VirtualFileSystem } from './vfs.js';
import { bytes, decodeKorean, EVENTS, SgsError } from './sgs.js';
import { createARM } from './cpu.js';
const RELOC = 0x2000f8dc,
  BASE = 0x21000000,
  STOP = 0x23fff000,
  STATE = 0x20b405d0,
  TOP = 0x20b3ed28,
  STACK = 0x20b4062c,
  OLD_PC = 0x20b3eb80;
export function parseLegacy(input) {
  const raw = bytes(input),
    wrapperBytes = raw[0] === 32 && raw[1] === 0 && raw[2] === 0 && raw[3] === 0 ? 32 : 0;
  let body = raw.slice(wrapperBytes),
    xorMask = 0;
  if (![1, 2].includes(body[0]) && [1, 2].includes(body[0] ^ 165)) {
    body = body.map((x) => x ^ 165);
    xorMask = 165;
  }
  const version = body[0],
    headerSize = version === 1 ? 52 : 100;
  if (![1, 2].includes(version) || body.length < headerSize)
    throw new SgsError('Invalid legacy SGS header');
  const view = new DataView(body.buffer, body.byteOffset, body.length),
    [a, b, c, d] = [44, 46, 48, 50].map((o) => view.getUint16(o, true));
  if (
    !(headerSize <= a && a <= b && b <= c && c <= d && d <= body.length) ||
    (b - a) % 4 ||
    (d - c) % 4
  )
    throw new SgsError('Invalid legacy SGS section layout');
  const entries = Object.fromEntries(EVENTS.map((name) => [name, 0]));
  EVENTS.slice(0, 8).forEach((name, i) => (entries[name] = view.getUint16(28 + 2 * i, true)));
  for (const entry of Object.values(entries))
    if (entry && (entry < headerSize || entry >= a))
      throw new SgsError('Legacy entry outside bytecode');
  const variables = [];
  let initialized = 0;
  for (let p = a; p < b; p += 4) {
    const type = body[p],
      count = body[p + 1],
      init = body[p + 2];
    if (type > 1 || !count) throw new SgsError('Invalid legacy variable descriptor');
    variables.push([type, count, init]);
    if (!type || init) initialized += count * 2;
  }
  if (initialized !== c - b) throw new SgsError('Legacy initialized variable size mismatch');
  const resources = [];
  let pos = d;
  for (let p = c; p < d; p += 4) {
    const type = view.getUint16(p, true),
      length = view.getUint16(p + 2, true);
    if (pos + length > body.length) throw new SgsError('Legacy resource exceeds file');
    resources.push({ type, offset: pos, data: body.subarray(pos, pos + length) });
    pos += length;
  }
  // The preserved Ragnarok v2 copy has CRLF after its complete resource data.
  // Native ARM loading/execution matches the covered-prefix control; preserve
  // the original bytes and admit only this bounded suffix, not arbitrary data.
  const trailingBytes = body.length - pos;
  if (
    trailingBytes !== 0 &&
    !(version === 2 && trailingBytes === 2 && body[pos] === 13 && body[pos + 1] === 10)
  )
    throw new SgsError('Legacy resource sizes do not cover file');
  return {
    body,
    version,
    headerSize,
    wrapperBytes,
    xorMask,
    a,
    b,
    c,
    d,
    declaredSize: pos,
    trailingBytes,
    title: decodeKorean(body.subarray(10, 26)),
    entries,
    variables,
    resources,
    resource(index) {
      if (!Number.isInteger(index) || index < 0 || index >= resources.length)
        throw new SgsError('Legacy resource out of range');
      return resources[index];
    },
  };
}
// This empty v4 descriptor only initializes the shared original display/HAL.
// The original legacy loader then creates its own 16-bit variables/resources.
function displayBootstrap() {
  const b = new Uint8Array(320),
    v = new DataView(b.buffer);
  b[0] = 4;
  [128, 256, 320, 320].forEach((x, i) => v.setUint32(72 + i * 4, x, true));
  v.setUint32(120, b.length, true);
  for (let i = 0; i < 16; i++) {
    v.setUint16(128 + i * 8, 1, true);
    v.setUint16(130 + i * 8, 1, true);
  }
  return b;
}
export class LegacyRuntime extends GnexRuntime {
  static async create(rom, sgs, options = {}) {
    rom = bytes(rom);
    sgs = bytes(sgs);
    const [romHash, gameHash] = await Promise.all([sha256(rom), sha256(sgs)]);
    if (romHash !== ROM_SHA256) throw new GnexError('Legacy GNEX requires Kingston 2.12 ROM');
    const cpu = options.cpu || (await createARM());
    try {
      return new LegacyRuntime(rom, sgs, {
        ...options,
        cpu,
        romHash,
        saveKey: options.saveKey || 'reunion.saves.' + gameHash,
      });
    } catch (e) {
      if (!options.cpu) cpu.close();
      throw e;
    }
  }
  constructor(rom, sgs, options) {
    const parsed = parseLegacy(sgs);
    if (parsed.body.length > 0xc00000)
      throw new GnexError('SGS exceeds 12 MiB guest content region');
    super(rom, displayBootstrap(), options);
    this.sgs = parsed;
    this.title = parsed.title;
    this.legacyReady = true;
    // Standalone host service: native GVM initializes chat locking to S_ON.
    // Keep the raw byte: the original BA callback does not coerce to boolean.
    this.legacyChatLockValue = 1;
    this.vfs = new VirtualFileSystem(parsed, {
      saveKey: options.saveKey,
      storage: options.storage,
      saveData: options.saveData,
      onSave: options.onSave,
    });
    this.cpu.write(BASE, parsed.body);
    this._write(0x20b3eb7c, BASE);
    this._write(0x20b3ed10, BASE + ((parsed.body.length + 15) & ~15));
    this._write(0x20b3ed14, 0xc00000);
    this._write(0x20b3f144, this.width);
    this._write(0x20b3f148, this.height);
    this.cpu.writeSized(0x20b3eb8e, parsed.version, 2);
    for (const f of [0x35b90, 0x44354, 0x443dc, 0x44464, 0x35e9c]) {
      this.cpu.regWrite('lr', STOP);
      this.cpu.regWrite('sp', 0x23ff0000);
      this.cpu.run(RELOC + f, STOP, 5000000);
      if (
        this.exception ||
        this.cpu.regRead('pc') !== STOP ||
        (f === 0x35b90 && !this.cpu.regRead('r0'))
      )
        throw new GnexError('Legacy ROM initializer failed: ' + (this.exception || f.toString(16)));
    }
    const table = this._read(STATE + 0x14);
    this.varAddresses = parsed.variables.map((_, i) => this._read(table + i * 8 + 4));
    // The launcher 20ms platform tick is not a script TIMEOUT. Only explicit
    // SetTimer/SetTimer1/SetTimer2 arm the three EVENT_TIMEOUT channels.
    for (const [f, n] of [
      [0x4d328, 0x95],
      [0x4d370, 0x96],
      [0x4d3b8, 0x97],
      [0x4d400, 0x98],
      [0x4d410, 0x99],
      [0x4d424, 0x9a],
    ])
      this.cpu.onCode(
        () => {
          try {
            this._syscall(n);
            this._return();
          } catch (e) {
            this.exception = e;
            this.cpu.stop();
          }
        },
        { begin: RELOC + f, end: RELOC + f },
      );
    for (const [f, n] of [
      [0x4d208, 2],
      [0x4bdd0, 0x82],
      [0x4be50, 0x83],
      [0x4be58, 0x82],
      [0x4bed4, 0x83],
    ])
      this.cpu.onCode(
        () => {
          try {
            this._syscall(n);
            this._return();
          } catch (e) {
            this.exception = e;
            this.cpu.stop();
          }
        },
        { begin: RELOC + f, end: RELOC + f },
      );
    for (const [f, date] of [
      [0x4d280, true],
      [0x4d2c4, false],
    ])
      this.cpu.onCode(
        () => {
          try {
            const encoded = this._args(1)[0],
              constant = !!(encoded & 0x4000),
              index = encoded & 0x3fff,
              capacity = this._read(STATE + (constant ? 0xc : 0x10));
            if (index + 4 > capacity) throw new GnexError('Legacy clock array bounds');
            const p = this._read(STATE + (constant ? 0x18 : 0x20)) + index * 2;
            const now = new Date(
                this.civilEpoch + this.nowMs() - this.tickEpoch + this.armInstructions / 10000,
              ),
              values = date
                ? [now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getDay()]
                : [now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds()];
            values.forEach((v, i) => this.cpu.writeSized(p + i * 2, v, 2));
            this._return();
          } catch (e) {
            this.exception = e;
            this.cpu.stop();
          }
        },
        { begin: RELOC + f, end: RELOC + f },
      );
    // Original GetUserNV/PutUserNV wrappers already resolve and bound the
    // 16-bit integer array before calling these byte-oriented storage drivers.
    for (const [f, write] of [
      [0x42058, false],
      [0x420f8, true],
    ])
      this.cpu.onCode(
        () => {
          try {
            const p = this.cpu.regRead('r0'),
              n = this.cpu.regRead('r1');
            if (n > 65536) throw new GnexError('Legacy user NV exceeds bounds');
            this.vfs.operations++;
            if (write) {
              this.vfs.files.set('usernv.bin', this.cpu.read(p, n).slice());
              this.vfs.created.set('usernv.bin', this.clock().getTime());
              this.vfs.flush();
            } else {
              const saved = this.vfs.files.get('usernv.bin');
              if (saved) this.cpu.write(p, saved.subarray(0, n));
            }
            this._return();
          } catch (e) {
            this.exception = e;
            this.cpu.stop();
          }
        },
        { begin: RELOC + f, end: RELOC + f },
      );
    // Legacy Flush reaches the native physical screen adapter directly, without
    // the v4 syscall dispatcher. Preserve its submitted image before RestoreLCD.
    this.cpu.onCode(
      () => {
        try {
          this._presentLCD();
          this._return();
        } catch (e) {
          this.exception = e;
          this.cpu.stop();
        }
      },
      { begin: RELOC + 0x4412c, end: RELOC + 0x4412c },
    );
    this.cpu.onCode(
      () => {
        this.legacyOpcode = this.cpu.regRead('r0');
      },
      { begin: RELOC + 0x362b0, end: RELOC + 0x362b0 },
    );
    // Kingston leaves these legacy platform operations at the error15 stub.
    // Preserve their argument/state ABI instead of discarding an unknown opcode.
    this.cpu.onCode(
      () => {
        if (this.legacyOpcode === 0x52 || this.legacyOpcode === 0xba) {
          try {
            if (this.legacyOpcode === 0x52) this._syscall(1);
            else this.legacyChatLockValue = this._args(1)[0] & 255;
            this._return();
          } catch (e) {
            this.exception = e;
            this.cpu.stop();
          }
        }
      },
      { begin: RELOC + 0x33768, end: RELOC + 0x33768 },
    );
    this._refreshLCD();
  }
  _read(p) {
    return super._read(this.legacyReady && p === 0x20b3eb84 ? OLD_PC : p);
  }
  _setVar(i, n) {
    if (!this.legacyReady) return super._setVar(i, n);
    if (i < this.varAddresses.length) this.cpu.writeSized(this.varAddresses[i], n, 2);
  }
  _args(n) {
    if (!this.legacyReady) return super._args(n);
    const top = this._read(TOP) | 0;
    if (top < n - 1 || top > 1023) throw new GnexError('Legacy stack bounds');
    const data = this.cpu.read(STACK + (top - n + 1) * 2, n * 2),
      v = new DataView(data.buffer, data.byteOffset, data.length),
      args = [];
    for (let i = 0; i < n; i++) args.push(v.getInt16(i * 2, true));
    this._write(TOP, top - n);
    return args;
  }
  _push(n) {
    if (!this.legacyReady) return super._push(n);
    const top = (this._read(TOP) | 0) + 1;
    if (top < 0 || top >= 1024) throw new GnexError('Legacy stack overflow');
    this._write(TOP, top);
    this.cpu.writeSized(STACK + top * 2, n, 2);
  }
  resourceBytes(i) {
    if (!this.legacyReady) return super.resourceBytes(i);
    this.sgs.resource(i);
    const descriptor = this._read(STATE + 0x2c) + i * 8,
      head = this.cpu.read(descriptor, 8),
      v = new DataView(head.buffer, head.byteOffset, 8);
    return this.cpu.read(v.getUint32(4, true), v.getUint16(2, true));
  }
  setResourceBytes(i, data) {
    if (!this.legacyReady) return super.setResourceBytes(i, data);
    this.sgs.resource(i);
    data = bytes(data);
    if (data.length > 65535) throw new GnexError('Legacy resource exceeds 16-bit length');
    const d = this._read(STATE + 0x2c) + i * 8,
      p = this._allocate(Math.max(1, data.length));
    this.cpu.write(p, data);
    this._free(this._read(d + 4));
    this.cpu.writeSized(d, 1, 1);
    this.cpu.writeSized(d + 2, data.length, 2);
    this._write(d + 4, p);
  }
  event(name, value, instructionBudget = 20000000) {
    const guarded = this.fastVmExecution && arguments.length < 3 && this.cpu.runGuarded;
    name = String(name).toUpperCase();
    if (guarded && name === 'TIMEOUT') instructionBudget = this.timeoutWorkBudget;
    if (value === undefined) value = name === 'START' ? this.startData : 0;
    if (!(name in this.sgs.entries)) throw new GnexError('Unknown legacy event');
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
      if (value === 0) {
        this.frameCount = (this.frameCount + 1) % 32767;
        this._setVar(3, this.frameCount);
        for (const [i, m] of [
          [4, 2],
          [5, 3],
          [6, 6],
        ])
          this._setVar(i, this.frameCount % m);
      }
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
      if (guarded) this.cpu.runGuarded(RELOC + 0x36274, STOP, instructionBudget);
      else this.cpu.run(RELOC + 0x36274, STOP, instructionBudget);
      if (this.exception) throw this.exception;
      if (this.cpu.regRead('pc') !== STOP)
        throw new GnexError(
          `Legacy event exceeded ${guarded ? 'block work' : 'instruction'} budget`,
        );
      this.eventCount++;
      this.status = this._read(0x20b3ece4) === 3 ? 'exited' : 'idle';
      if (this.status === 'exited') {
        for (const timer of this.timers) timer.delay = null;
        this._audio('stop');
      }
    } catch (e) {
      this.error =
        String(e.message || e) + ' (legacy opcode0x' + (this.legacyOpcode ?? 0).toString(16) + ')';
      this.status = 'error';
    } finally {
      this._fastEventActive = false;
    }
    try {
      this._refreshLCD();
    } catch (e) {
      this.error = this.error || String(e);
      this.status = 'error';
    }
    return this.diagnostics;
  }
  get diagnostics() {
    return {
      ...super.diagnostics,
      engine: 'Original Kingston 2.12 8-bit GNEX / Unicorn WASM',
      format: this.sgs.version,
      legacyChatLockValue: this.legacyChatLockValue,
    };
  }
}
