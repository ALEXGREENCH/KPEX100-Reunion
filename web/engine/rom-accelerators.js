/** Exact shortcuts for individually verified Kingston 2.12 ARM routines. */
const KINGSTON_212_SHA256 = '743d0b9a377dc6a3f0a80b7816cee575ad2f8249643876367c4bfaac54ddd19a';
const FILL_ENTRY = 0x2005067c;
const DESCRIPTOR = 0x20b41258;
const RECT_ENTRY = 0x2004f9c4;
const RECT_EXIT = 0x2004f9f8;
const PALETTE_ROW_ENTRY = 0x2004e4c4;
const PALETTE_ROW_EXIT = 0x2004e74c;
const PALETTE_ROW_SIGNATURES = [
  [0x2004e4c4, '0080a0e30c009de59c0000ea'],
  [0x2004e4d0, '00c0d2e518e09de501e04ee03ccea0e110e09de50ec00ce01ce09de50e005ce18b00000a'],
  [0x2004e4f4, '000059e30f00001a'],
  [0x2004e4fc, '8cc085e0b0e0dce1010053e3b0e0c0e18400001a'],
  [0x2004e724, '2cc09de5018088e28c0080e014c09de50c1081e0080051e3012082a20010a0a3060058e160ffffba'],
  [0x2004e744, '060058e160ffffba'],
  [
    0x2004e74c,
    '30c09de580cf8ce2df05dce15ec0dce500048ce10cc09de51003a0e180008ce00c008de508009de500c09de5002082e004009de501c08ce2001081e0080051e3c12182a0071001a200c08de530c09de5df04dce14ec0dce500048ce100c09de50c0050e143ffffca',
  ],
].map(([address, hex]) => [
  address,
  Uint8Array.from(hex.match(/../g).map((value) => Number.parseInt(value, 16))),
]);
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
    minPaletteRowPixels = 128,
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
  for (const [address, signature] of PALETTE_ROW_SIGNATURES) {
    const actual = cpu.read(address, signature.length);
    if (!signature.every((value, index) => actual[index] === value))
      throw new Error('Kingston palette row kernel does not match verified ROM');
  }

  const stats = {
    fills: 0,
    pixels: 0,
    skippedInstructions: 0,
    fallbacks: 0,
    rectangles: 0,
    rectanglePixels: 0,
    rectangleFallbacks: 0,
    rectangleSmall: 0,
    paletteRows: 0,
    paletteBatches: 0,
    palettePixels: 0,
    paletteWrites: 0,
    paletteFallbacks: 0,
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
  // Enter once per row, before MOV r8,#0 / LDR r0,[sp,#12]. Unsupported
  // drawing modes therefore pay one guard per row, not one guard per pixel.
  const removePaletteRow = cpu.addBlockShortcut(PALETTE_ROW_ENTRY, (address, size) => {
    if (!enabled()) return;
    if (cpu.runStop > PALETTE_ROW_ENTRY && cpu.runStop < PALETTE_ROW_EXIT) {
      stats.paletteFallbacks++;
      return;
    }
    if (cpu.regRead('r9') !== 0 || cpu.regRead('r3') !== 0) {
      stats.paletteFallbacks++;
      return;
    }
    const count = cpu.regRead('r6');
    if (count < 1 || count < minPaletteRowPixels || count > 512) {
      stats.paletteFallbacks++;
      return;
    }
    const flags = cpu.regRead('cpsr'),
      stack = cpu.regRead('sp'),
      source = cpu.regRead('r2'),
      bitOffset = cpu.regRead('r1'),
      palette = cpu.regRead('r5');
    const inRam = (first, length) => first >= 0x20000000 && first + length <= 0x24000000;
    if (flags & 0x20 || stack & 3 || !inRam(stack, 0x34)) {
      stats.paletteFallbacks++;
      return;
    }
    const destination = cpu.read32(stack + 0x0c),
      mask = cpu.read32(stack + 0x10),
      bits = cpu.read32(stack + 0x14),
      shift = cpu.read32(stack + 0x18),
      transparent = cpu.read32(stack + 0x1c),
      step = cpu.read32(stack + 0x2c);
    const sourceBytes = Math.ceil((bitOffset + count * bits) / 8),
      outputBytes = count * 2,
      paletteBytes = (mask + 1) * 2;
    const overlaps = (first, length) =>
      destination < first + length && first < destination + outputBytes;
    if (
      ![1, 2, 4, 8].includes(bits) ||
      mask !== (1 << bits) - 1 ||
      shift !== 8 - bits ||
      bitOffset > 7 ||
      bitOffset % bits !== 0 ||
      step !== 1 ||
      size !== 12 ||
      destination & 1 ||
      palette & 1 ||
      destination < 0x23000000 ||
      destination + outputBytes > 0x23ff0000 ||
      !inRam(source, sourceBytes) ||
      !inRam(palette, paletteBytes) ||
      overlaps(source, sourceBytes) ||
      overlaps(palette, paletteBytes) ||
      overlaps(stack, 0x34)
    ) {
      stats.paletteFallbacks++;
      return;
    }
    // Batch the remaining ordinary rows of this same native image invocation.
    // Leave the last row's outer loop/epilogue native. Any uncertain geometry
    // retains the separately verified one-row path above.
    let rows = 1,
      sourceStepBits = 0,
      destinationStride = 0;
    const rowIndex = cpu.read32(stack),
      image = cpu.read32(stack + 0x30);
    const outsideKernel =
      Number.isInteger(cpu.runStop) &&
      (cpu.runStop < PALETTE_ROW_ENTRY || cpu.runStop > 0x2004e7b8);
    if (outsideKernel && rowIndex < 512 && inRam(image, 0x260)) {
      const height = (cpu.read32(image + 0x4c) | 0) >> 16,
        stride = (cpu.read32(image + 0x25c) | 0) >> 16,
        paddingBits = cpu.read32(stack + 4),
        paddingBytes = cpu.read32(stack + 8) | 0,
        candidateRows = height - rowIndex,
        candidateStep = count * bits + paddingBytes * 8 + paddingBits,
        candidateInput = Math.ceil(
          (bitOffset + (candidateRows - 1) * candidateStep + count * bits) / 8,
        ),
        candidateOutput = (candidateRows - 1) * stride * 2 + outputBytes;
      const intersects = (a, an, b, bn) => a < b + bn && b < a + an;
      if (
        candidateRows > 1 &&
        candidateRows <= 512 &&
        stride >= count &&
        stride <= 512 &&
        paddingBytes >= 0 &&
        paddingBits < 8 &&
        paddingBits % bits === 0 &&
        destination + candidateOutput <= 0x23ff0000 &&
        inRam(source, candidateInput) &&
        !intersects(destination, candidateOutput, source, candidateInput) &&
        !intersects(destination, candidateOutput, palette, paletteBytes) &&
        !intersects(destination, candidateOutput, stack, 0x34) &&
        !intersects(destination, candidateOutput, image + 0x4c, 4) &&
        !intersects(destination, candidateOutput, image + 0x25c, 4) &&
        !intersects(source, candidateInput, stack, 0x34) &&
        !intersects(palette, paletteBytes, stack, 0x34) &&
        !intersects(image + 0x4c, 4, stack, 0x34) &&
        !intersects(image + 0x25c, 4, stack, 0x34)
      ) {
        rows = candidateRows;
        sourceStepBits = candidateStep;
        destinationStride = stride * 2;
      }
    }
    const inputLength = Math.ceil((bitOffset + (rows - 1) * sourceStepBits + count * bits) / 8),
      outputLength = (rows - 1) * destinationStride + outputBytes;
    const input = cpu.read(source, inputLength),
      colors = cpu.read(palette, paletteBytes),
      output = cpu.read(destination, outputLength);
    let writes = 0,
      lastColor = transparent;
    for (let y = 0; y < rows; y++) {
      for (let i = 0; i < count; i++) {
        const bit = bitOffset + y * sourceStepBits + i * bits,
          index = (input[bit >>> 3] >>> (shift - (bit & 7))) & mask,
          out = y * destinationStride + i * 2;
        lastColor = transparent;
        if (index !== transparent) {
          output[out] = colors[index * 2];
          output[out + 1] = colors[index * 2 + 1];
          lastColor = colors[index * 2] | (colors[index * 2 + 1] << 8);
          writes++;
        }
      }
    }
    // Entry's three instructions are already charged. Initial CMP/BLT cost 2;
    // each pixel costs 19 instructions, plus 7 when the index is not transparent.
    // Unicorn 1.0.3's counted run omits the outer fall-through block's 26
    // instructions from BLOCK notifications; uncounted guarded runs include it.
    // Preserve each native mode's observed clock, not an invented common clock.
    const betweenRows = cpu.runCounted ? 5 : 31;
    const skipped = 2 + count * rows * 19 + writes * 7 + (rows - 1) * betweenRows,
      work = skipped * 2;
    if (cpu.blockBudget != null && work > cpu.blockBudget) {
      stats.paletteFallbacks++;
      return;
    }
    if (writes) cpu.write(destination, output);
    const endBit = bitOffset + (rows - 1) * sourceStepBits + count * bits;
    if (rows > 1) {
      cpu.write32(stack, rowIndex + rows - 1);
      cpu.write32(stack + 0x0c, destination + (rows - 1) * destinationStride);
    }
    cpu.regWrite('r0', destination + outputLength);
    cpu.regWrite('r1', endBit & 7);
    cpu.regWrite('r2', source + (endBit >>> 3));
    cpu.regWrite('r8', count);
    cpu.regWrite('r12', bits);
    cpu.regWrite('lr', lastColor);
    cpu.regWrite('cpsr', ((flags & 0x0fffffff) | 0x60000000) >>> 0);
    cpu.regWrite('pc', PALETTE_ROW_EXIT);
    if (cpu.blockBudget != null) cpu.blockBudget -= work;
    onSkippedInstructions(skipped);
    stats.paletteRows += rows;
    stats.paletteBatches++;
    stats.palettePixels += count * rows;
    stats.paletteWrites += writes;
    stats.skippedInstructions += skipped;
  });
  return {
    stats,
    dispose() {
      removeFill();
      removeRectangle();
      removePaletteRow();
    },
  };
}
