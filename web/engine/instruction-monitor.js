/** Keep ordinary firmware instructions inside WASM while retaining the device hook. */
let modulePromise;

export function loadInstructionMonitor() {
  return (modulePromise ??= (async () => {
    const url = new URL('./instruction-monitor.wasm', import.meta.url);
    if (globalThis.process?.versions?.node) {
      const { readFile } = await import('node:fs/promises');
      return WebAssembly.compile(await readFile(url));
    }
    const response = await fetch(url);
    if (!response.ok) throw Error(`ARM instruction monitor: HTTP ${response.status}`);
    return WebAssembly.compile(await response.arrayBuffer());
  })().catch(() => null));
}

export function installInstructionMonitor(module, cpu, slow) {
  const uc = cpu.uc;
  const native = new WebAssembly.Instance(module, {
    unicorn: { memory: uc.reunionWasmMemory(), slow },
  }).exports;
  const slot = uc._malloc(4);
  if (!slot) throw Error('WASM hook allocation failed');
  let callback;
  try {
    callback = uc.addFunction(native.hook, 'vijii');
    // The final argument is Emscripten's unused varargs pointer for UC_HOOK_CODE.
    const result = uc._uc_hook_add(cpu.handle, slot, uc.HOOK_CODE, callback, 0, 1n, 0n, 0);
    if (result) throw Error(`Unicorn instruction hook (${result}): ${uc.strerror(result)}`);
    cpu.hooks.push({ handle: uc.getValue(slot, '*'), callback });
    return native;
  } catch (error) {
    if (callback !== undefined) uc.removeFunction(callback);
    throw error;
  } finally {
    uc._free(slot);
  }
}
