/** A Unicorn block hook that crosses into JavaScript only for observed addresses. */
let modulePromise;

export function loadBlockMonitor() {
  return (modulePromise ??= (async () => {
    const url = new URL('./block-monitor.wasm', import.meta.url);
    if (globalThis.process?.versions?.node) {
      const { readFile } = await import('node:fs/promises');
      return WebAssembly.compile(await readFile(url));
    }
    const response = await fetch(url);
    if (!response.ok) throw Error(`ARM block monitor: HTTP ${response.status}`);
    return WebAssembly.compile(await response.arrayBuffer());
  })());
}

export function installBlockMonitor(module, uc, handle, observe) {
  const native = new WebAssembly.Instance(module, {
    unicorn: { stop: uc._uc_emu_stop, observe },
  }).exports;
  const slot = uc._malloc(4);
  if (!slot) throw Error('WASM hook allocation failed');
  let callback;
  try {
    callback = uc.addFunction(native.hook, 'vijii');
    // uc_hook_add's last argument is the Emscripten varargs pointer.
    // UC_HOOK_BLOCK reads no varargs. begin=1, end=0 covers all addresses.
    const result = uc._uc_hook_add(handle, slot, uc.HOOK_BLOCK, callback, 0, 1n, 0n, 0);
    if (result) throw Error(`Unicorn block hook (${result}): ${uc.strerror(result)}`);
    return { native, hook: { handle: uc.getValue(slot, '*'), callback } };
  } catch (error) {
    if (callback !== undefined) uc.removeFunction(callback);
    throw error;
  } finally {
    uc._free(slot);
  }
}
