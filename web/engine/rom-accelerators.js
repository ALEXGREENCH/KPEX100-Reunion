/** Exact shortcuts for individually verified Kingston 2.12 ARM routines. */
const KINGSTON_212_SHA256 = '743d0b9a377dc6a3f0a80b7816cee575ad2f8249643876367c4bfaac54ddd19a';
const FILL_ENTRY = 0x2005067c;
const DESCRIPTOR = 0x20b41258;
const RECT_ENTRY = 0x2004f9c4;
const RECT_EXIT = 0x2004f9f8;
const PALETTE_ROW_ENTRY = 0x2004e4c4;
const PALETTE_ROW_EXIT = 0x2004e74c;
const COLOR_MATCH_ENTRY = 0x20055a7c;
const COLOR_PALETTE_POINTER = 0x20b41bc4;
const COLOR_MATCH_SIGNATURES = [
  [
    COLOR_MATCH_ENTRY,
    '0700a0e1a40401eb840080e0b000d0e104308de208208de20c108de2c2ffffeb0c009de5080040e0900001e008009de5090040e0901021e004009de50a0040e0901031e00200001a0400a0e110d08de2f087bde8050051e10460a0b1014084e20150a0b18b0054e3e4ffffda0600a0e1f5ffffea',
  ],
  [
    0x200559a8,
    '10402de9f840a0e320c404e000c081e580001ce307c08c1300c08115fcc0a0e3a0c10ce000c082e540001ce303c08c1300c08215800104e0000083e5000091e5800010e307008013000081151080bde8',
  ],
  [0x20096d18, '0010d0e50120d0e50230d0e50300d0e5021481e1031881e1000c81e11eff2fe1'],
].map(([address, hex]) => [
  address,
  Uint8Array.from(hex.match(/../g).map((value) => Number.parseInt(value, 16))),
]);
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
    minPaletteBatchPixels = 4096,
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
  for (const [address, signature] of COLOR_MATCH_SIGNATURES) {
    const actual = cpu.read(address, signature.length);
    if (!signature.every((value, index) => actual[index] === value))
      throw new Error('Kingston RGB565 palette search does not match verified ROM');
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
    colorSearches: 0,
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
    const count = cpu.regRead('r6');
    const narrow = count < minPaletteRowPixels;
    if (count < 1 || (narrow && count < 32) || count > 512) {
      stats.paletteFallbacks++;
      return;
    }
    const stack = cpu.regRead('sp');
    const inRam = (first, length) => first >= 0x20000000 && first + length <= 0x24000000;
    if (stack & 3 || !inRam(stack, 0x34)) {
      stats.paletteFallbacks++;
      return;
    }
    // Short rows are worthwhile only as a large, verified image batch. Reject
    // small sprites before reading their palette and pixel buffers.
    if (narrow) {
      const image = cpu.read32(stack + 0x30),
        row = cpu.read32(stack);
      if (
        !inRam(image, 0x260) ||
        row >= 512 ||
        (((cpu.read32(image + 0x4c) | 0) >> 16) - row) * count < minPaletteBatchPixels
      ) {
        stats.paletteFallbacks++;
        return;
      }
    }
    if (cpu.regRead('r9') !== 0 || cpu.regRead('r3') !== 0) {
      stats.paletteFallbacks++;
      return;
    }
    const flags = cpu.regRead('cpsr'),
      source = cpu.regRead('r2'),
      bitOffset = cpu.regRead('r1'),
      palette = cpu.regRead('r5');
    if (flags & 0x20) {
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
    if (narrow && (rows < 2 || rows * count < minPaletteBatchPixels)) {
      stats.paletteFallbacks++;
      return;
    }
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
  // The native search already checked indices 0..3 and 16. Scan 17..138 in one RAM
  // read, then execute the terminating iteration on ARM, including its writes
  // to the scratch stack and its register/flag results.
  const removeColorMatch = cpu.addBlockShortcut(COLOR_MATCH_ENTRY, (address, size) => {
    if (!enabled() || cpu.regRead('r4') !== 17 || size !== 8) return;
    if (cpu.runStop !== 0x23fff000) return;
    if (cpu.regRead('r7') !== COLOR_PALETTE_POINTER || cpu.regRead('cpsr') & 0x20) return;
    const red = cpu.regRead('r8'),
      green = cpu.regRead('r9'),
      blue = cpu.regRead('r10'),
      palette = cpu.read32(COLOR_PALETTE_POINTER),
      stack = cpu.regRead('sp');
    if (
      red > 255 ||
      green > 255 ||
      blue > 255 ||
      palette & 1 ||
      palette < 0x20000000 ||
      palette + 280 > 0x24000000 ||
      (palette < stack + 16 && stack < palette + 280)
    )
      return;

    let nearest = cpu.regRead('r6'),
      best = cpu.regRead('r5'),
      index = 17;
    if (nearest > 16 || best > 0x30000) return;
    const raw = cpu.read(palette + 34, 244);
    for (; index < 139; index++) {
      const p = (index - 17) * 2,
        color = raw[p] | (raw[p + 1] << 8),
        r = (color >>> 8) & 0xf8,
        g = (color >>> 3) & 0xfc,
        b = (color << 3) & 0xf8;
      const dr = (r | (r & 0x80 ? 7 : 0)) - red,
        dg = (g | (g & 0x40 ? 3 : 0)) - green,
        db = b - blue;
      const distance = dr * dr + dg * dg + db * db;
      if (distance === 0) break;
      if (distance < best) {
        best = distance;
        nearest = index;
      }
    }
    if (index === 17) return;
    const skipped = 52 * (index - 17);
    // The accelerated search is a bounded host loop. Charge its work
    // separately from the original ARM instruction count used by the clock.
    const work = 64 + 8 * (index - 17);
    if (cpu.blockBudget != null && work > cpu.blockBudget) return;
    cpu.regWrite('r4', index);
    cpu.regWrite('r5', best);
    cpu.regWrite('r6', nearest);
    if (cpu.blockBudget != null) cpu.blockBudget -= work;
    onSkippedInstructions(skipped);
    stats.colorSearches++;
    stats.skippedInstructions += skipped;
  });
  return {
    stats,
    dispose() {
      removeFill();
      removeRectangle();
      removePaletteRow();
      removeColorMatch();
    },
  };
}
