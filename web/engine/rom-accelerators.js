/** Exact shortcuts for individually verified Kingston 2.12 ARM routines. */
const KINGSTON_212_SHA256 = '743d0b9a377dc6a3f0a80b7816cee575ad2f8249643876367c4bfaac54ddd19a';
const FILL_ENTRY = 0x2005067c;
const DESCRIPTOR = 0x20b41258;
const RECT_ENTRY = 0x2004f9c4;
const RECT_EXIT = 0x2004f9f8;
const RECT_SIGNATURE = Uint8Array.from(
  '0170a0e1080000ea0ec0a0e10010a0e1020051e1b240ccd0011081d2fbffffdab611dbe1017087e281e08ee0030057e1f4ffffda'
    .match(/../g)
    .map((value) => Number.parseInt(value, 16)),
);
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
  {
    romHash,
    enabled = () => true,
    onSkippedInstructions = () => {},
    minRectanglePixels = 4096,
  } = {},
) {
  if (romHash !== KINGSTON_212_SHA256)
    throw new Error('ROM accelerators require verified Kingston 2.12');
  const code = cpu.read(FILL_ENTRY, FILL_SIGNATURE.length);
  if (!FILL_SIGNATURE.every((value, index) => code[index] === value))
    throw new Error('Kingston RGB565 fill routine does not match verified ROM');
  if (cpu.read32(0x200508b0) !== DESCRIPTOR)
    throw new Error('Kingston RGB565 descriptor literal does not match verified ROM');
  const rectangle = cpu.read(RECT_ENTRY, RECT_SIGNATURE.length);
  if (
    !RECT_SIGNATURE.every((value, index) => rectangle[index] === value) ||
    cpu.read32(0x2004f424) !== DESCRIPTOR
  )
    throw new Error('Kingston RGB565 rectangle kernel does not match verified ROM');

  const stats = {
    fills: 0,
    pixels: 0,
    skippedInstructions: 0,
    fallbacks: 0,
    rectangles: 0,
    rectanglePixels: 0,
    rectangleFallbacks: 0,
    rectangleSmall: 0,
  };
  // The shared block monitor charges the entry block and updates the clock first.
  // Extra per-instruction CODE hooks would slow unrelated ARM interpreter paths.
  const removeFill = cpu.addBlockShortcut(FILL_ENTRY, (address, size) => {
    if (!enabled()) return;
    const entryInstructions = Math.ceil(size / 4);
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
  });
  const removeRectangle = cpu.addBlockShortcut(RECT_ENTRY, (address, size) => {
    if (!enabled()) return;
    const rectangleEntryInstructions = Math.ceil(size / 4);
    const x1 = cpu.regRead('r0'),
      y1 = cpu.regRead('r1'),
      x2 = cpu.regRead('r2'),
      y2 = cpu.regRead('r3');
    const width = x2 - x1 + 1,
      rows = y2 - y1 + 1;
    // Register/PC updates cost more than short native spans. Only batch large fills.
    if (width > 0 && rows > 0 && width * rows < minRectanglePixels) {
      stats.rectangleSmall++;
      return;
    }
    const cpsr = cpu.regRead('cpsr'),
      first = cpu.regRead('lr');
    // +0x16 is the native row stride in pixels; +0x14 is not a height field.
    const stride = cpu.read32(DESCRIPTOR + 0x14) >>> 16;
    const byteLength = cpu.read32(DESCRIPTOR + 0x18),
      height = byteLength / (stride * 2);
    const last = first + (rows - 1) * stride * 2 + width * 2;
    if (
      (cpsr & 0x20) !== 0 ||
      cpu.regRead('r11') !== DESCRIPTOR ||
      x1 > x2 ||
      y1 > y2 ||
      x2 >= stride ||
      y2 >= height ||
      stride > 512 ||
      height > 512 ||
      !Number.isInteger(height) ||
      first !== cpu.read32(DESCRIPTOR + 8) + (y1 * stride + x1) * 2 ||
      (first & 1) !== 0 ||
      first < 0x23000000 ||
      last > 0x23ff0000 ||
      rectangleEntryInstructions < 1 ||
      rectangleEntryInstructions > 2
    ) {
      stats.rectangleFallbacks++;
      return;
    }
    // MOV/B + the initial CMP/B, then per row: two MOV, four instructions
    // per pixel and the final failed test, three row updates, CMP/B.
    const skipped = 4 + rows * (4 * width + 11) - rectangleEntryInstructions;
    const work = skipped * 2;
    if (cpu.blockBudget != null && work > cpu.blockBudget) {
      stats.rectangleFallbacks++;
      return;
    }
    const color = cpu.regRead('r4'),
      row = new Uint8Array(width * 2);
    for (let i = 0; i < row.length; i += 2) {
      row[i] = color & 255;
      row[i + 1] = (color >>> 8) & 255;
    }
    // Coalesce rows into one host transfer. Preserve pixels between rows outside
    // the requested rectangle as well as its untouched neighboring pixels.
    const output = width === stride ? new Uint8Array(last - first) : cpu.read(first, last - first);
    for (let y = 0; y < rows; y++) output.set(row, y * stride * 2);
    cpu.write(first, output);
    cpu.regWrite('r1', stride);
    cpu.regWrite('r7', y2 + 1);
    cpu.regWrite('r12', last);
    cpu.regWrite('lr', first + rows * stride * 2);
    cpu.regWrite('cpsr', ((cpsr & 0x0fffffff) | 0x20000000) >>> 0);
    // Keep the original POP: it restores all callee-saved registers and PC.
    cpu.regWrite('pc', RECT_EXIT);
    if (cpu.blockBudget != null) cpu.blockBudget -= work;
    onSkippedInstructions(skipped);
    stats.rectangles++;
    stats.rectanglePixels += width * rows;
    stats.skippedInstructions += skipped;
  });
  return {
    stats,
    dispose() {
      removeFill();
      removeRectangle();
    },
  };
}
