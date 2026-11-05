/** Exact shortcuts for individually verified Kingston 2.12 ARM routines. */
const KINGSTON_212_SHA256 = '743d0b9a377dc6a3f0a80b7816cee575ad2f8249643876367c4bfaac54ddd19a';
const FILL_ENTRY = 0x2005067c;
const DESCRIPTOR = 0x20b41258;
const FILL_SIGNATURE = Uint8Array.from(
  '2c129fe5182091e5081091e5a230a0e10020a0e3030052e1b200c13001208232fbffff3a0ef0a0e1'
    .match(/../g)
    .map((value) => Number.parseInt(value, 16)),
);

/**
 * ROM offset 0x40da0: fill the current native RGB565 buffer with r0's low half.
 * The original loop runs floor(byteLength / 2) stores, then CMP of equal values.
 * Preserve its registers, CPSR and block-based virtual instruction clock.
 * Callers must disable shortcuts for explicit architectural instruction budgets.
 */
export function installRomAccelerators(
  cpu,
  { romHash, enabled = () => true, onSkippedInstructions = () => {} } = {},
) {
  if (romHash !== KINGSTON_212_SHA256)
    throw new Error('ROM accelerators require verified Kingston 2.12');
  const code = cpu.read(FILL_ENTRY, FILL_SIGNATURE.length);
  if (!FILL_SIGNATURE.every((value, index) => code[index] === value))
    throw new Error('Kingston RGB565 fill routine does not match verified ROM');
  if (cpu.read32(0x200508b0) !== DESCRIPTOR)
    throw new Error('Kingston RGB565 descriptor literal does not match verified ROM');

  const stats = { fills: 0, pixels: 0, skippedInstructions: 0, fallbacks: 0 };
  let entryInstructions = 0;
  // Unicorn reports the entry translation block before its first CODE hook.
  // It can contain the first loop iteration; measure rather than assume its size.
  const blockHook = cpu.onBlock(
    (address, size) => {
      entryInstructions = Math.ceil(size / 4);
    },
    { begin: FILL_ENTRY, end: FILL_ENTRY },
  );
  const codeHook = cpu.onCode(
    () => {
      if (!enabled()) return;
      const cpsr = cpu.regRead('cpsr');
      const target = cpu.regRead('lr');
      const buffer = cpu.read32(DESCRIPTOR + 8);
      const byteLength = cpu.read32(DESCRIPTOR + 0x18);
      const pixels = byteLength >>> 1;
      const bytes = pixels * 2;
      // Restrict to the runner's ordinary allocated RAM. Odd-sized buffers retain
      // their final byte. Odd addresses and unusual layouts use original ARM.
      if (
        (cpsr & 0x20) !== 0 ||
        (target & 3) !== 0 ||
        bytes > 512 * 512 * 2 ||
        (pixels !== 0 &&
          ((buffer & 1) !== 0 || buffer < 0x23000000 || buffer + bytes > 0x23ff0000)) ||
        entryInstructions < 1 ||
        entryInstructions > 9
      ) {
        stats.fallbacks++;
        return;
      }
      // Five setup instructions + four instructions for every loop test (including
      // the final failed condition) + MOV pc,lr. The entry block is already counted.
      const skipped = 4 * pixels + 10 - entryInstructions;
      const work = skipped * 2;
      if (cpu.blockBudget != null && work > cpu.blockBudget) {
        stats.fallbacks++;
        return;
      }
      if (pixels !== 0) {
        const color = cpu.regRead('r0');
        const output = new Uint8Array(bytes);
        const low = color & 255;
        const high = (color >>> 8) & 255;
        for (let offset = 0; offset < bytes; offset += 2) {
          output[offset] = low;
          output[offset + 1] = high;
        }
        cpu.write(buffer, output);
      }
      cpu.regWrite('r1', (buffer + bytes) >>> 0);
      cpu.regWrite('r2', pixels);
      cpu.regWrite('r3', pixels);
      cpu.regWrite('cpsr', ((cpsr & 0x0fffffff) | 0x60000000) >>> 0);
      cpu.regWrite('pc', target);
      if (cpu.blockBudget != null) cpu.blockBudget -= work;
      onSkippedInstructions(skipped);
      stats.fills++;
      stats.pixels += pixels;
      stats.skippedInstructions += skipped;
    },
    { begin: FILL_ENTRY, end: FILL_ENTRY },
  );
  return {
    stats,
    dispose() {
      cpu.removeHook(codeHook);
      cpu.removeHook(blockHook);
    },
  };
}
