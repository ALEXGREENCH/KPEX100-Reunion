/** Record the original 8-bit dispatcher opcode without a JavaScript callback. */
const dispatch = 0x20045b8c;
const dispatchWord = 0xe7950100; // LDR r0, [r5, r0, LSL #2]
let modulePromise;

export function loadLegacyOpcodeMonitor() {
  return (modulePromise ??= (async () => {
    const url = new URL('./legacy-opcode-monitor.wasm', import.meta.url);
    if (globalThis.process?.versions?.node) {
      const { readFile } = await import('node:fs/promises');
      return WebAssembly.compile(await readFile(url));
    }
    const response = await fetch(url);
    if (!response.ok) throw Error(`Legacy opcode monitor: HTTP ${response.status}`);
    return WebAssembly.compile(await response.arrayBuffer());
  })().catch(() => null));
}

export function installLegacyOpcodeMonitor(module, cpu) {
  const uc = cpu.uc;
  if (!module || !uc?.reunionWasmMemory || !(cpu.scratch > 0)) return null;
  let slot, callback;
  try {
    if (cpu.read32(dispatch) !== dispatchWord) return null;
    const monitor = new WebAssembly.Instance(module, {
      unicorn: { memory: uc.reunionWasmMemory(), regRead: uc._uc_reg_read },
    }).exports;
    monitor.register.value = cpu.regId('r0');
    // This hook reads one register synchronously. The CPU already owns an
    // aligned four-byte slot that its other register reads can reuse later.
    monitor.scratch.value = cpu.scratch;
    slot = uc._malloc(4);
    if (!slot) return null;
    callback = uc.addFunction(monitor.hook, 'vijii');
    const pc = BigInt(dispatch);
    const result = uc._uc_hook_add(cpu.handle, slot, uc.HOOK_CODE, callback, 0, pc, pc, 0);
    if (result) throw Error(`Legacy opcode hook (${result}): ${uc.strerror(result)}`);
    cpu.hooks.push({ handle: uc.getValue(slot, '*'), callback });
    return monitor.value;
  } catch {
    if (callback !== undefined) uc.removeFunction(callback);
    return null;
  } finally {
    if (slot) uc._free(slot);
  }
}
