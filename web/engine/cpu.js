// Unicorn ARM/WASM adapter. Stable 1.0.3 core; see vendor/LICENSE (GPL-2.0).
// Upstream: https://github.com/AlexAltea/unicorn.js
// The published 2.1.4 TCI build faults on long ARM translation blocks; the
// official 1.0.3 ARM release passes the real firmware/GNEX differential suite.
import { installBlockMonitor, loadBlockMonitor } from './block-monitor.js';

let modulePromise, loadedModule;
export async function createCpuModule() {
  const m = await import('./vendor/unicorn_arm_legacy.js');
  const options = globalThis.process?.versions?.node
    ? {}
    : { locateFile: (file) => new URL('./vendor/' + file, import.meta.url).href };
  return (m.default || globalThis.MUnicornLegacy)(options);
}
export async function initCpu() {
  if (!modulePromise) modulePromise = createCpuModule().then((m) => (loadedModule = m));
  return modulePromise;
}
export function getCpuModule() {
  if (!loadedModule) throw new Error('Call await initCpu() before constructing an ARM machine');
  return loadedModule;
}
export const initLegacyCpu = initCpu;
export class ArmCPU {
  constructor(uc, blockModule = null) {
    this.uc = uc;
    this.blockModule = blockModule;
    this.engine = new uc.Unicorn(uc.ARCH_ARM, uc.MODE_ARM);
    this.sizeArgument = uc.VERSION_MAJOR >= 2 ? BigInt : Number;
    this.handle = uc.getValue(this.engine.handle_ptr, '*');
    this.scratch = uc._malloc(4);
    this.buffer = 0;
    this.bufferSize = 0;
    this.allocations = [];
    this.hooks = [];
    this.blockShortcutLow = Infinity;
    this.blockShortcutHigh = -Infinity;
    this.regs = {};
    for (let i = 0; i < 16; i++) this.regs['r' + i] = uc['ARM_REG_R' + i];
    Object.assign(this.regs, {
      sp: uc.ARM_REG_SP,
      lr: uc.ARM_REG_LR,
      pc: uc.ARM_REG_PC,
      cpsr: uc.ARM_REG_CPSR,
      spsr: uc.ARM_REG_SPSR,
    });
    this.regs.r13 = this.regs.sp;
    this.regs.r14 = this.regs.lr;
    this.regs.r15 = this.regs.pc;
  }
  check(ret) {
    if (ret) throw new Error(`Unicorn (${ret}): ${this.uc.strerror(ret)}`);
  }
  regId(reg) {
    const result = typeof reg === 'string' ? this.regs[reg.toLowerCase()] : reg;
    if (result === undefined) throw new Error('Unknown ARM register ' + reg);
    return result;
  }
  regRead(reg) {
    this.check(this.uc._uc_reg_read(this.handle, this.regId(reg), this.scratch));
    return this.uc.getValue(this.scratch, 'i32') >>> 0;
  }
  regWrite(reg, value) {
    this.uc.setValue(this.scratch, value | 0, 'i32');
    this.check(this.uc._uc_reg_write(this.handle, this.regId(reg), this.scratch));
  }
  createRegisterBatch(registers) {
    const uc = this.uc;
    if (
      typeof uc._uc_reg_read_batch !== 'function' ||
      typeof uc._uc_reg_write_batch !== 'function' ||
      typeof uc.reunionWasmMemory !== 'function'
    )
      return null;
    const count = registers.length;
    if (!Number.isInteger(count) || count < 1 || count > 18)
      throw Error('Invalid ARM register batch size');
    const ids = registers.map((register) => {
      if (typeof register !== 'string' || !Object.hasOwn(this.regs, register.toLowerCase()))
        throw Error('Unknown 32-bit ARM register ' + register);
      return this.regId(register);
    });
    const pointer = uc._malloc(count * 12);
    if (!pointer) return null;
    this.allocations.push(pointer);
    const memory = uc.reunionWasmMemory();
    const pointerTable = pointer + count * 4;
    const valuesAddress = pointerTable + count * 4;
    const layout = new Uint32Array(memory.buffer, pointer, count * 2);
    layout.set(ids);
    for (let i = 0; i < count; i++) layout[count + i] = valuesAddress + i * 4;
    let values = new Uint32Array(memory.buffer, valuesAddress, count);
    const currentValues = () => {
      if (values.buffer !== memory.buffer)
        values = new Uint32Array(memory.buffer, valuesAddress, count);
      return values;
    };
    return {
      // This view is borrowed until the next read, write, or WASM heap growth.
      read: () => {
        this.check(uc._uc_reg_read_batch(this.handle, pointer, pointerTable, count));
        return currentValues();
      },
      write: (...registerValues) => {
        if (registerValues.length !== count) throw Error('Wrong number of ARM register values');
        currentValues().set(registerValues);
        this.check(uc._uc_reg_write_batch(this.handle, pointer, pointerTable, count));
      },
    };
  }
  map(address, size, permissions = 7) {
    this.engine.mem_map(address, size, permissions);
  }
  mapAlias(addresses, size, permissions = 7) {
    const pointer = this.uc._malloc(size);
    if (!pointer) throw new Error('WASM RAM allocation failed');
    this.uc.writeArrayToMemory(new Uint8Array(size), pointer);
    this.allocations.push(pointer);
    for (const address of addresses)
      this.check(
        this.uc._uc_mem_map_ptr(
          this.handle,
          BigInt(address),
          this.sizeArgument(size),
          permissions,
          pointer,
        ),
      );
    return pointer;
  }
  bufferFor(size) {
    if (size > this.bufferSize) {
      if (this.buffer) this.uc._free(this.buffer);
      this.buffer = this.uc._malloc(Math.max(size, 4096));
      this.bufferSize = Math.max(size, 4096);
    }
    return this.buffer;
  }
  read(address, size) {
    const p = this.bufferFor(size);
    this.check(this.uc._uc_mem_read(this.handle, BigInt(address), p, this.sizeArgument(size)));
    if (this.uc.readArrayFromMemory) return this.uc.readArrayFromMemory(p, size);
    const bytes = new Uint8Array(size),
      view = new DataView(bytes.buffer);
    let i = 0;
    for (; i + 4 <= size; i += 4) view.setUint32(i, this.uc.getValue(p + i, 'i32') >>> 0, true);
    for (; i < size; i++) bytes[i] = this.uc.getValue(p + i, 'i8');
    return bytes;
  }
  read32(address) {
    this.check(
      this.uc._uc_mem_read(this.handle, BigInt(address), this.scratch, this.sizeArgument(4)),
    );
    return this.uc.getValue(this.scratch, 'i32') >>> 0;
  }
  write(address, bytes) {
    const p = this.bufferFor(bytes.length);
    this.uc.writeArrayToMemory(bytes, p);
    this.check(
      this.uc._uc_mem_write(this.handle, BigInt(address), p, this.sizeArgument(bytes.length)),
    );
  }
  write32(address, value) {
    this.uc.setValue(this.scratch, value | 0, 'i32');
    this.check(
      this.uc._uc_mem_write(this.handle, BigInt(address), this.scratch, this.sizeArgument(4)),
    );
  }
  writeSized(address, value, size) {
    this.uc.setValue(this.scratch, value | 0, 'i32');
    this.check(
      this.uc._uc_mem_write(this.handle, BigInt(address), this.scratch, this.sizeArgument(size)),
    );
  }
  onCode(callback, { begin = 1, end = 0 } = {}) {
    const h = this.engine.hook_add(
      this.uc.HOOK_CODE,
      (_, a, s) => callback(Number(a), s),
      {},
      begin,
      end,
    );
    this.hooks.push(h);
    return h;
  }
  onBlock(callback, { begin = 1, end = 0 } = {}) {
    const h = this.engine.hook_add(
      this.uc.HOOK_BLOCK,
      (_, a, s) => callback(Number(a), s),
      {},
      begin,
      end,
    );
    this.hooks.push(h);
    return h;
  }
  get blockBudget() {
    const remaining = this.nativeBlockMonitor?.budget.value ?? this.jsBlockBudget;
    return remaining < 0 ? null : (remaining ?? null);
  }
  set blockBudget(value) {
    if (this.nativeBlockMonitor) this.nativeBlockMonitor.budget.value = value ?? -1;
    else this.jsBlockBudget = value;
  }
  get runStart() {
    return this.currentRunStart;
  }
  set runStart(value) {
    this.currentRunStart = value;
    if (this.nativeBlockMonitor) this.nativeBlockMonitor.start.value = value ?? -1;
  }
  _observeBlock(address, size) {
    this.blockObserver?.(address, size);
    // Keep direct emu_start entries native, including duplicated initial TBs.
    if (
      address >= this.blockShortcutLow &&
      address <= this.blockShortcutHigh &&
      address !== this.runStart
    )
      this.blockShortcuts.get(address)?.(address, size);
  }
  _ensureBlockMonitor() {
    if (this.blockMonitor) return;
    if (this.blockModule) {
      const { native, hook } = installBlockMonitor(
        this.blockModule,
        this.uc,
        this.handle,
        (address, size) => this._observeBlock(address >>> 0, size),
      );
      this.nativeBlockMonitor = native;
      this.blockMonitor = hook;
      native.start.value = this.runStart ?? -1;
      this.hooks.push(hook);
      this._syncBlockShortcuts();
      return;
    }
    this.blockMonitor = this.onBlock((address, size) => {
      if (this.jsBlockBudget != null) {
        // Two bytes per instruction is conservative for both ARM and Thumb.
        // Refuse the next block before its work could exceed the watchdog.
        const cost = Math.max(1, Math.ceil(size / 2));
        if (cost > this.jsBlockBudget) {
          this.stop();
          return;
        }
        this.jsBlockBudget -= cost;
      }
      this._observeBlock(address, size);
    });
  }
  _syncBlockShortcuts() {
    const native = this.nativeBlockMonitor;
    if (!native) return;
    const addresses = new Uint32Array(native.shortcuts.buffer);
    const count = this.blockShortcuts?.size ?? 0;
    const fits = count <= addresses.length;
    native.notify.value = this.blockObserver || !fits ? 1 : 0;
    native.count.value = fits ? count : 0;
    native.low.value = this.blockShortcutLow;
    native.high.value = this.blockShortcutHigh;
    if (fits && count) addresses.set([...this.blockShortcuts.keys()]);
  }
  addBlockShortcut(address, callback) {
    if (
      !Number.isInteger(address) ||
      address < 0 ||
      address > 0xffffffff ||
      typeof callback !== 'function'
    )
      throw Error('Invalid block shortcut');
    this._ensureBlockMonitor();
    this.blockShortcuts ??= new Map();
    if (this.blockShortcuts.has(address)) throw Error('Block shortcut already registered');
    this.blockShortcuts.set(address, callback);
    this.blockShortcutLow = Math.min(this.blockShortcutLow, address);
    this.blockShortcutHigh = Math.max(this.blockShortcutHigh, address);
    this._syncBlockShortcuts();
    return () => {
      this.blockShortcuts?.delete(address);
      this.blockShortcutLow = Math.min(...(this.blockShortcuts?.keys() || []));
      this.blockShortcutHigh = Math.max(...(this.blockShortcuts?.keys() || []));
      this._syncBlockShortcuts();
    };
  }
  setBlockObserver(callback) {
    this.blockObserver = callback;
    this._ensureBlockMonitor();
    this._syncBlockShortcuts();
  }
  startBlockClock() {
    this._ensureBlockMonitor();
    const clock = this.nativeBlockMonitor?.clock;
    if (!clock) return null;
    const origin = clock.value;
    return () => Number(clock.value - origin);
  }
  onMemory(callback, { begin = 1, end = 0, invalid = false } = {}) {
    const types = invalid
      ? this.uc.HOOK_MEM_INVALID
      : this.uc.HOOK_MEM_READ | this.uc.HOOK_MEM_WRITE;
    const h = this.engine.hook_add(
      types,
      (_, type, a, s, v) => callback(type, Number(a), s, Number(v)),
      {},
      begin,
      end,
    );
    this.hooks.push(h);
    return h;
  }
  onInterrupt(callback) {
    const h = this.engine.hook_add(this.uc.HOOK_INTR, (_, n) => callback(n));
    this.hooks.push(h);
    return h;
  }
  removeHook(h) {
    this.engine.hook_del(h);
    this.hooks = this.hooks.filter((x) => x !== h);
  }
  run(start, stop, budget) {
    const previousStart = this.runStart;
    const previousStop = this.runStop;
    const previousCounted = this.runCounted;
    this.runStart = (start & ~1) >>> 0;
    this.runStop = stop >>> 0;
    this.runCounted = budget > 0;
    try {
      this.engine.emu_start(start >>> 0, stop >>> 0, 0, budget);
    } finally {
      this.runStart = previousStart;
      this.runStop = previousStop;
      this.runCounted = previousCounted;
    }
  }
  runGuarded(start, stop, workBudget) {
    if (!Number.isSafeInteger(workBudget) || workBudget < 1 || workBudget > 200_000_000)
      throw new Error('Invalid ARM block work budget');
    if (this.blockBudget != null) throw new Error('Nested execution on the same ARM CPU');
    this._ensureBlockMonitor();
    this.blockBudget = workBudget;
    const previousStart = this.runStart;
    const previousStop = this.runStop;
    const previousCounted = this.runCounted;
    this.runStart = (start & ~1) >>> 0;
    this.runStop = stop >>> 0;
    this.runCounted = false;
    try {
      // Unicorn's count hook instruments every instruction. A persistent
      // block watchdog keeps ordinary event calls bounded without that cost.
      this.engine.emu_start(start >>> 0, stop >>> 0, 0, 0);
    } finally {
      this.blockBudget = null;
      this.runStart = previousStart;
      this.runStop = previousStop;
      this.runCounted = previousCounted;
    }
  }
  stop() {
    this.engine.emu_stop();
  }
  close() {
    this.blockShortcuts = null;
    this.blockShortcutLow = Infinity;
    this.blockShortcutHigh = -Infinity;
    for (const h of this.hooks) this.engine.hook_del(h);
    this.hooks = [];
    this.engine.close();
    for (const p of this.allocations) this.uc._free(p);
    if (this.buffer) this.uc._free(this.buffer);
    this.uc._free(this.scratch);
  }
}
export async function createARM({ isolated = false, nativeMonitor = true } = {}) {
  const [uc, blockModule] = await Promise.all([
    isolated ? createCpuModule() : initCpu(),
    nativeMonitor ? loadBlockMonitor() : null,
  ]);
  return new ArmCPU(uc, blockModule);
}
