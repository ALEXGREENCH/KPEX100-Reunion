/** Native Swerve 2.1.0.364 ARM/BREW host. Binary provenance: doc/swerve-provenance.json. */
import { createARM } from './cpu.js';
const BASE = 0x04000000,
  HEAP = 0x06000000,
  TRAP = 0x08000000,
  STACK = 0x09ff0000,
  STOP = 0x09fff000,
  INSTRUCTION_LIMIT = 100_000_000;
export class SwerveMachine {
  static async create(binary, helperNames, options = {}) {
    const cpu = await createARM({ isolated: true });
    try {
      return new SwerveMachine(cpu, binary, helperNames, options);
    } catch (e) {
      cpu.close();
      throw e;
    }
  }
  constructor(cpu, binary, names, { fastExecution = true } = {}) {
    this.cpu = cpu;
    this.fastExecution = !!fastExecution;
    this.heap = HEAP;
    this.allocs = new Map();
    this.freeBlocks = [];
    this.traps = new Map();
    this.calls = [];
    this.error = null;
    this.nativeCalls = 0;
    this.files = new Map();
    this.openFiles = new Map();
    for (const [a, n] of [
      [BASE - 4096, 0x100000],
      [HEAP, 0x1000000],
      [TRAP, 0x20000],
      [0x09000000, 0x1000000],
    ])
      cpu.map(a, n);
    cpu.regWrite('cpsr', 0x10);
    cpu.write(BASE, binary);
    this.helpers = this.alloc(names.length * 4);
    this.app = this.alloc(1024);
    const helper = {
      malloc: (n) => this.alloc(n),
      free: (p) => this.free(p),
      memmove: (d, s, n) => {
        cpu.write(d, cpu.read(s, n));
        return d;
      },
      memset: (d, c, n) => {
        cpu.write(d, new Uint8Array(n).fill(c & 255));
        return d;
      },
      strlen: (p) => this.cstr(p).length,
      strcmp: (a, b) => {
        const x = this.cstr(a),
          y = this.cstr(b);
        return x < y ? -1 : x > y ? 1 : 0;
      },
      memcmp: (a, b, n) => {
        const x = cpu.read(a, n),
          y = cpu.read(b, n);
        for (let i = 0; i < n; i++) if (x[i] !== y[i]) return x[i] - y[i];
        return 0;
      },
      GetAppInstance: () => this.app,
      GetAEEVersion: () => 0x02010308,
      realloc: (p, n) => {
        const q = this.alloc(n);
        if (p) cpu.write(q, cpu.read(p, Math.min(n, this.allocs.get(p) || 0)));
        this.free(p);
        return q;
      },
      GetRAMFree: (p) => {
        if (p) cpu.write32(p, 0x1000000);
        return HEAP + 0x1000000 - this.heap;
      },
      aee_GetUpTimeMS: () => Math.floor(performance.now()),
      aee_GetTimeMS: () => Date.now() % 86400000,
    };
    names.forEach((name, i) =>
      cpu.write32(this.helpers + i * 4, this.trap('helper:' + name, helper[name])),
    );
    // BREW app instance lookup executes as original ARM ABI instructions.
    const fast = TRAP + 0x10000;
    cpu.write32(fast, 0xe59f0000);
    cpu.write32(fast + 4, 0xe12fff1e);
    cpu.write32(fast + 8, this.app);
    cpu.write32(this.helpers + names.indexOf('GetAppInstance') * 4, fast);
    this.shell = this.alloc(4);
    const sv = this.alloc(52 * 4);
    cpu.write32(this.shell, sv);
    for (let i = 0; i < 52; i++)
      cpu.write32(
        sv + i * 4,
        this.trap(
          'shell:' + i,
          i < 2
            ? () => 1
            : i === 2
              ? (shell, cls, out) => {
                  if (cls !== 0x1001003) throw Error('Unknown BREW class ' + cls.toString(16));
                  cpu.write32(out, this.fileMgr);
                  return 0;
                }
              : null,
        ),
      );
    cpu.write32(this.app + 12, this.shell);
    this.fileMgr = this.alloc(4);
    const fv = this.alloc(16 * 4);
    cpu.write32(this.fileMgr, fv);
    for (let i = 0; i < 16; i++)
      cpu.write32(
        fv + i * 4,
        this.trap(
          'filemgr:' + i,
          i < 2
            ? () => 1
            : i === 2
              ? (self, path, mode) => {
                  if (mode !== 1) throw Error('Unsupported file mode ' + mode);
                  const name = this.cstr(path).replaceAll('\\', '/').split('/').pop();
                  const data = this.files.get(name);
                  if (!data) return 0;
                  const obj = this.alloc(4);
                  cpu.write32(obj, this.fileVtable);
                  this.openFiles.set(obj, { data, offset: 0 });
                  return obj;
                }
              : i === 9
                ? () => 2
                : null,
        ),
      );
    this.fileVtable = this.alloc(16 * 4);
    for (let i = 0; i < 16; i++)
      cpu.write32(
        this.fileVtable + i * 4,
        this.trap(
          'file:' + i,
          i === 0
            ? () => 1
            : i === 1
              ? (p) => {
                  this.openFiles.delete(p);
                  return 0;
                }
              : i === 3
                ? (p, dst, n) => {
                    const f = this.openFiles.get(p);
                    if (!f) throw Error('Invalid file');
                    const got = Math.min(n, f.data.length - f.offset);
                    cpu.write(dst, f.data.subarray(f.offset, f.offset + got));
                    f.offset += got;
                    return got;
                  }
                : null,
        ),
      );
    cpu.write32(BASE - 4, this.helpers);
    cpu.onCode(
      (a) => {
        const item = this.traps.get(a);
        if (!item) return;
        const args = Array.from({ length: item.fn ? item.fn.length : 4 }, (_, i) =>
          i < 4 ? cpu.regRead('r' + i) : cpu.read32(cpu.regRead('sp') + (i - 4) * 4),
        );
        try {
          this.calls.push({ name: item.name, args });
          if (this.calls.length > 100) this.calls.shift();
          if (!item.fn)
            throw Error(
              'Unimplemented BREW ' + item.name + ' ' + args.map((x) => x.toString(16)).join(','),
            );
          const value = item.fn(...args);
          cpu.regWrite('r0', value >>> 0);
          cpu.regWrite('pc', cpu.regRead('lr'));
        } catch (e) {
          this.error = e;
          cpu.stop();
        }
      },
      { begin: TRAP, end: TRAP + 0xffff },
    );
    cpu.onMemory(
      (t, a, s, v) => {
        throw Error(
          'Swerve invalid memory ' +
            a.toString(16) +
            ' size ' +
            s +
            ' regs ' +
            Array.from({ length: 13 }, (_, i) => cpu.regRead('r' + i).toString(16)),
        );
      },
      { invalid: true },
    );
    this.scratch = 0x09000000;
    let rc = this.call(BASE, this.shell, this.helpers, this.scratch);
    if (rc) throw Error('AEEMod_Load: ' + rc);
    this.module = cpu.read32(this.scratch);
    rc = this.call(
      cpu.read32(cpu.read32(this.module) + 8),
      this.module,
      this.shell,
      0x102bbfc,
      this.scratch,
    );
    if (rc) throw Error('Swerve CreateInstance: ' + rc);
    this.engine = cpu.read32(this.scratch);
  }
  cstr(p) {
    let s = '';
    for (let i = 0; i < 65536; i++) {
      const c = this.cpu.read(p + i, 1)[0];
      if (!c) return s;
      s += String.fromCharCode(c);
    }
    throw Error('Unterminated BREW string');
  }
  alloc(n) {
    if (!Number.isInteger(n) || n < 0 || n > 0x800000)
      throw Error('Invalid Swerve allocation ' + n);
    n = Math.max(16, (n + 15) & ~15);
    let p;
    const i = this.freeBlocks.findIndex((b) => b[1] >= n);
    if (i >= 0) {
      const block = this.freeBlocks[i];
      p = block[0];
      if (block[1] === n) this.freeBlocks.splice(i, 1);
      else {
        block[0] += n;
        block[1] -= n;
      }
    } else {
      p = this.heap;
      this.heap += n;
      if (this.heap > HEAP + 0x1000000) throw Error('Swerve heap exhausted');
    }
    this.allocs.set(p, n);
    this.cpu.write(p, new Uint8Array(n));
    return p;
  }
  free(p) {
    if (!p) return;
    const size = this.allocs.get(p);
    if (size === undefined) throw Error('Invalid native free ' + p.toString(16));
    this.allocs.delete(p);
    this.freeBlocks.push([p, size]);
    this.freeBlocks.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < this.freeBlocks.length; i++)
      if (this.freeBlocks[i - 1][0] + this.freeBlocks[i - 1][1] === this.freeBlocks[i][0]) {
        this.freeBlocks[i - 1][1] += this.freeBlocks[i][1];
        this.freeBlocks.splice(i--, 1);
      }
  }
  trap(name, fn) {
    const p = TRAP + this.traps.size * 4;
    this.traps.set(p, { name, fn });
    this.cpu.write32(p, 0xe12fff1e);
    return p;
  }
  call(p, ...args) {
    return this.#call(p, args, INSTRUCTION_LIMIT);
  }
  #call(p, args, workBudget) {
    const c = this.cpu;
    this.error = null;
    c.regWrite('sp', STACK);
    c.regWrite('lr', STOP);
    args.forEach((v, i) => {
      if (i < 4) c.regWrite('r' + i, v);
      else c.write32(STACK + (i - 4) * 4, v);
    });
    this.nativeCalls++;
    try {
      if (this.fastExecution) c.runGuarded(p, STOP, workBudget);
      else c.run(p, STOP, INSTRUCTION_LIMIT);
    } catch (e) {
      throw Error((e.message || String(e)) + ' at Swerve ARM ' + c.regRead('pc').toString(16));
    }
    if (this.error) throw this.error;
    if (c.regRead('pc') !== STOP) throw Error('Swerve instruction budget exceeded');
    return c.regRead('r0');
  }
  createObject(type) {
    this.cpu.write32(this.scratch, 0);
    const rc = this.call(
      this.cpu.read32(this.cpu.read32(this.engine) + 16),
      this.engine,
      type,
      this.scratch,
    );
    if (rc) throw Error('Swerve create type' + type + ': ' + rc);
    return this.cpu.read32(this.scratch);
  }
  initialize() {
    if (this.engine) return 0;
    const rc = this.call(
      this.cpu.read32(this.cpu.read32(this.module) + 8),
      this.module,
      this.shell,
      0x102bbfc,
      this.scratch,
    );
    if (!rc) this.engine = this.cpu.read32(this.scratch);
    return rc;
  }
  uninitialize() {
    if (this.engine) {
      this.method(this.engine, 1);
      this.engine = 0;
    }
  }
  method(object, slot, ...args) {
    return this.call(this.cpu.read32(this.cpu.read32(object) + slot * 4), object, ...args);
  }
  loadScene(loader, length, bytes) {
    const entry = this.cpu.read32(this.cpu.read32(loader) + 3 * 4);
    // The watchdog charges 32-bit ARM instructions as two units to bound Thumb too.
    // Give the scene loader room for the same ARM work as the exact instruction limit.
    return this.#call(entry, [loader, length, bytes], 2 * INSTRUCTION_LIMIT);
  }
  close() {
    if (!this.cpu) return;
    const cpu = this.cpu;
    this.cpu = null;
    try {
      cpu.close();
    } finally {
      // Drop closures that capture the isolated WASM module so its large
      // memory can be collected even if closed diagnostics are retained.
      this.traps.clear();
      this.allocs.clear();
      this.freeBlocks.length = 0;
      this.files.clear();
      this.openFiles.clear();
    }
  }
}
