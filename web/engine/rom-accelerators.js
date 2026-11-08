/** Exact shortcuts for individually verified Kingston 2.12 ARM routines. */
const KINGSTON_212_SHA256 = '743d0b9a377dc6a3f0a80b7816cee575ad2f8249643876367c4bfaac54ddd19a';
const FILL_ENTRY = 0x2005067c;
const DESCRIPTOR = 0x20b41258;
const RECT_ENTRY = 0x2004f9c4;
const RECT_EXIT = 0x2004f9f8;
const BLEND_RECT_ENTRY = 0x2004fa04;
const BLEND_MASK_LITERAL = 0x2005035c;
const BLEND_MASKS = 0x21f4ed90;
const SOLID_RECT_ENTRIES = [0x200505e8, 0x20050634];
const PALETTE_ROW_ENTRY = 0x2004e4c4;
const PALETTE_ROW_EXIT = 0x2004e74c;
const COLOR_MATCH_ENTRY = 0x20055a7c;
const COLOR_PALETTE_POINTER = 0x20b41bc4;
const ALIGNED_COPY_ENTRY = 0x200968b4;
const ALIGNED_COPY_SIGNATURE = Uint8Array.from([
  0x10, 0x40, 0x2d, 0xe9, 0x20, 0x20, 0x52, 0xe2, 0x05, 0x00, 0x00, 0x3a, 0x18, 0x50, 0xb1, 0x28,
  0x18, 0x50, 0xa0, 0x28, 0x18, 0x50, 0xb1, 0x28, 0x18, 0x50, 0xa0, 0x28, 0x20, 0x20, 0x52, 0x22,
  0xf9, 0xff, 0xff, 0x2a,
]);
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
const RGB_PALETTE_ENTRY = 0x2004e268;
const RGB_PALETTE_OUTPUT = 0x20b41bfc;
const RGB_PALETTE_SIGNATURE = Uint8Array.from(
  '060057e307f18f90240000ea0b0000ea0a0000ea090000ea020000ea160000ea150000ea140000ea0030d8e500308de501a0d8e502b0d8e5023088e2160000ea0030d8e5403f63e25331a0e1ff3063e200308de501c0d8e5023088e240cf6ce25cc1a0e1ffa06ce202c0d8e540cf6ce25cc1a0e1ffb06ce2070000ea0030d8e53332a0e100308de501c0d8e5023088e23ca2a0e102c0d8e53cb2a0e1018083e200309de5fcc00ae2f83003e20334a0e18c3183e10bcca0e1ac3d83e1b230c4e0010080e2050050e1ccffffbafe8fbde8'
    .match(/../g)
    .map((value) => Number.parseInt(value, 16)),
);
const PALETTE_BLEND_ENTRY = 0x2004e53c;
const PALETTE_BLEND_SIGNATURE = Uint8Array.from(
  '030059e3550000ca8cc085e0b0e0dce130c09de5010053e36972dce568c2dce507748ce130c09de5ae7007e06ba2dce56ac2dce50aa48ce12ec10ae00ce087e030c09de56da2dce56cc2dce5b070d0e10aa48ce130c09de5a7a00ae06fb2dce56ec2dce50bb48ce127c10be00cc08ae00ec08ce0b0c0c0e15a00001a'
    .match(/../g)
    .map((value) => Number.parseInt(value, 16)),
);
const RECT_SIGNATURE = Uint8Array.from(
  '0170a0e1080000ea0ec0a0e10010a0e1020051e1b240ccd0011081d2fbffffdab611dbe1017087e281e08ee0030057e1f4ffffda'
    .match(/../g)
    .map((value) => Number.parseInt(value, 16)),
);
const BLEND_RECT_SIGNATURE = Uint8Array.from(
  '03005ce3240000ca50599fe50170a0e18c5185e01d0000ea0e10a0e10060a0e1150000ea01c0d5e50080d5e50290d5e504a0d5e50c8488e103c0d5e5a48008e0016086e20c9489e124c109e00c9088e005c0d5e5b080d1e10ca48ae1a8c00ae00c9089e007c0d5e506a0d5e50ca48ae128c10ae00cc089e0b2c0c1e0020056e1e7ffffdab611dbe1017087e281e08ee0030057e1dfffffdaf08fbde8'
    .match(/../g)
    .map((value) => Number.parseInt(value, 16)),
);
const SOLID_RECT_SIGNATURE = Uint8Array.from(
  '0010a0e1020051e11c5096d59c0505d085508ed0815085d0b040c5d1011081d2f7ffffda01c08ce203005ce1f3ffffda7080bde870402de9b0629fe510409de508e096e501c0a0e1090000ea0010a0e1020051e11c5096d59c0505d085508ed0815085d0b040c5d1011081d2f7ffffda01c08ce203005ce1f3ffffda7080bde8'
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
    minPaletteContinuationPixels = Infinity,
    mirrorPalette = false,
    minBlendedPalettePixels = Infinity,
    minRgbPaletteEntries = Infinity,
    minBlendRectanglePixels = Infinity,
    minSolidRectanglePixels = Infinity,
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
  const copyCode = cpu.read(ALIGNED_COPY_ENTRY, ALIGNED_COPY_SIGNATURE.length);
  if (!ALIGNED_COPY_SIGNATURE.every((value, index) => copyCode[index] === value))
    throw new Error('Kingston aligned copy routine does not match verified ROM');

  const accelerateBlend = Number.isFinite(minBlendRectanglePixels);
  if (accelerateBlend) {
    const blendCode = cpu.read(BLEND_RECT_ENTRY - 8, BLEND_RECT_SIGNATURE.length);
    if (
      !BLEND_RECT_SIGNATURE.every((value, index) => blendCode[index] === value) ||
      cpu.read32(BLEND_MASK_LITERAL) !== BLEND_MASKS
    )
      throw new Error('Kingston RGB565 blended rectangle kernel does not match verified ROM');
  }

  const accelerateSolidRectangle = Number.isFinite(minSolidRectanglePixels);
  if (accelerateSolidRectangle) {
    const code = cpu.read(0x200505c0, SOLID_RECT_SIGNATURE.length);
    if (!SOLID_RECT_SIGNATURE.every((value, index) => code[index] === value))
      throw new Error('Kingston RGB565 solid rectangle kernels do not match verified ROM');
  }

  const accelerateBlendedPalette = Number.isFinite(minBlendedPalettePixels);
  if (accelerateBlendedPalette) {
    const code = cpu.read(PALETTE_BLEND_ENTRY, PALETTE_BLEND_SIGNATURE.length);
    if (!PALETTE_BLEND_SIGNATURE.every((value, index) => code[index] === value))
      throw new Error('Kingston blended palette kernel does not match verified ROM');
  }

  const accelerateRgbPalette = Number.isFinite(minRgbPaletteEntries);
  if (accelerateRgbPalette) {
    const code = cpu.read(0x2004e1a4, RGB_PALETTE_SIGNATURE.length);
    if (!RGB_PALETTE_SIGNATURE.every((value, index) => code[index] === value))
      throw new Error('Kingston RGB palette conversion does not match verified ROM');
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
    blendedRectangles: 0,
    blendedRectanglePixels: 0,
    solidRectangles: 0,
    solidRectanglePixels: 0,
    paletteRows: 0,
    paletteBatches: 0,
    paletteContinuations: 0,
    mirroredPaletteBatches: 0,
    mirroredPalettePixels: 0,
    blendedPaletteBatches: 0,
    blendedPalettePixels: 0,
    rgbPalettes: 0,
    rgbPaletteEntries: 0,
    palettePixels: 0,
    paletteWrites: 0,
    paletteFallbacks: 0,
    colorSearches: 0,
    bulkCopies: 0,
    copiedBytes: 0,
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
  // Alpha modes 1–3 combine two fixed bit masks per source and destination
  // pixel. Keep the last row and the register-restoring epilogue in ARM.
  const removeBlendRectangle = accelerateBlend
    ? cpu.addBlockShortcut(BLEND_RECT_ENTRY, (address, size) => {
        const budget = cpu.blockBudget;
        if (
          !enabled() ||
          cpu.runCounted ||
          cpu.runStop !== 0x23fff000 ||
          size !== 16 ||
          budget == null
        )
          return;
        const x1 = cpu.regRead('r0'),
          y1 = cpu.regRead('r1');
        const x2 = cpu.regRead('r2'),
          y2 = cpu.regRead('r3');
        const width = x2 - x1 + 1,
          rows = y2 - y1;
        if (width <= 0 || rows <= 0 || width * rows < minBlendRectanglePixels) return;
        const mode = cpu.regRead('r12');
        if (mode < 1 || mode > 3 || cpu.regRead('r11') !== DESCRIPTOR || cpu.regRead('cpsr') & 0x20)
          return;
        const stride = cpu.read32(DESCRIPTOR + 0x14) >>> 16;
        const height = cpu.read32(DESCRIPTOR + 0x18) / (stride * 2);
        const buffer = cpu.read32(DESCRIPTOR + 8),
          first = cpu.regRead('lr');
        const end = first + (rows * stride + width) * 2;
        const sp = cpu.regRead('sp');
        if (
          x2 >= stride ||
          y2 >= height ||
          stride > 512 ||
          height > 512 ||
          !Number.isInteger(height) ||
          first !== buffer + (y1 * stride + x1) * 2 ||
          first & 1 ||
          first < 0x23000000 ||
          end > 0x23ff0000 ||
          (first < sp + 36 && sp < end)
        )
          return;
        // A completed row costs 3 setup, 2 first compare, 24 per pixel and
        // 5 row advance instructions. The entry's initial check is still native.
        const perRow = 10 + 24 * width;
        if (budget < (rows + 1) * perRow * 2 + 64) return;
        const color = cpu.regRead('r4');
        const sourceMasks = cpu.read32(BLEND_MASKS + mode * 8);
        const destinationMasks = cpu.read32(BLEND_MASKS + mode * 8 + 4);
        const source =
          ((color >>> 1) & (sourceMasks & 0xffff)) + ((color >>> 2) & (sourceMasks >>> 16));
        const low = destinationMasks & 0xffff,
          high = destinationMasks >>> 16;
        const output = cpu.read(first, ((rows - 1) * stride + width) * 2);
        for (let row = 0; row < rows; row++) {
          const start = row * stride * 2;
          for (let at = start, stop = start + width * 2; at < stop; at += 2) {
            const pixel = output[at] | (output[at + 1] << 8);
            const result = source + ((pixel >>> 1) & low) + ((pixel >>> 2) & high);
            output[at] = result & 0xff;
            output[at + 1] = (result >>> 8) & 0xff;
          }
        }
        cpu.write(first, output);
        // Start the translated setup block at the last row. The final row
        // initializes the same scratch registers and returns through the native POP.
        cpu.regWrite('r1', y2);
        cpu.regWrite('lr', first + rows * stride * 2);
        const skipped = rows * perRow;
        cpu.blockBudget = budget - skipped * 2;
        onSkippedInstructions(skipped);
        stats.blendedRectangles++;
        stats.blendedRectanglePixels += rows * width;
        stats.skippedInstructions += skipped;
      })
    : null;
  // RGB and packed-color solid fills share the same row loop. Hook the
  // initial outer compare and let the last row and POP run on ARM.
  const removeSolidRectangles = [];
  const solidRectangle = (address, size) => {
    const budget = cpu.blockBudget;
    if (!enabled() || cpu.runCounted || cpu.runStop !== 0x23fff000 || size !== 8 || budget == null)
      return;
    const x1 = cpu.regRead('r0'),
      x2 = cpu.regRead('r2');
    const y1 = cpu.regRead('r12'),
      y2 = cpu.regRead('r3');
    const width = x2 - x1 + 1,
      rows = y2 - y1;
    if (
      width <= 0 ||
      rows <= 0 ||
      width * rows < minSolidRectanglePixels ||
      cpu.regRead('r6') !== DESCRIPTOR ||
      cpu.regRead('cpsr') & 0x20
    )
      return;
    const stride = cpu.read32(DESCRIPTOR + 0x1c);
    const height = cpu.read32(DESCRIPTOR + 0x18) / (stride * 2);
    const buffer = cpu.regRead('lr'),
      first = buffer + (y1 * stride + x1) * 2;
    const end = first + (rows * stride + width) * 2;
    const stack = cpu.regRead('sp');
    if (
      x2 >= stride ||
      y2 >= height ||
      stride > 512 ||
      height > 512 ||
      !Number.isInteger(height) ||
      buffer !== cpu.read32(DESCRIPTOR + 8) ||
      first & 1 ||
      first < 0x23000000 ||
      end > 0x23ff0000 ||
      (first < stack + 16 && stack < end)
    )
      return;
    // Each row has one MOV, eight instructions per pixel and final
    // failed test, plus three for the outer loop.
    const perRow = 8 * width + 12;
    if (budget < (rows + 1) * perRow * 2 + 32) return;
    const color = cpu.regRead('r4');
    const row = new Uint8Array(width * 2);
    for (let at = 0; at < row.length; at += 2) {
      row[at] = color & 255;
      row[at + 1] = (color >>> 8) & 255;
    }
    const length = ((rows - 1) * stride + width) * 2;
    const output = width === stride ? new Uint8Array(length) : cpu.read(first, length);
    for (let y = 0; y < rows; y++) output.set(row, y * stride * 2);
    cpu.write(first, output);
    cpu.regWrite('r12', y2);
    const skipped = rows * perRow;
    cpu.blockBudget = budget - skipped * 2;
    onSkippedInstructions(skipped);
    stats.solidRectangles++;
    stats.solidRectanglePixels += rows * width;
    stats.skippedInstructions += skipped;
  };
  // The plain RGB mode copies triples from a resource into the interpreter's
  // palette workspace. Let the last color write the scratch stack and return.
  const rgbReadRegisters = ['r7', 'r0', 'cpsr', 'r4', 'r8', 'sp', 'r10'];
  const rgbRead = accelerateRgbPalette && cpu.createRegisterBatch?.(rgbReadRegisters);
  const rgbWrite = rgbRead && cpu.createRegisterBatch?.(['r0', 'r4', 'r8']);
  const rgbPalette = (address, size) => {
    if (
      !enabled() ||
      address === cpu.runStart ||
      cpu.runCounted ||
      cpu.runStop !== 0x23fff000 ||
      size !== 8
    )
      return;
    const count = cpu.regRead('r5');
    if (count < 2 || count < minRgbPaletteEntries || count > 256) return;
    const budget = cpu.blockBudget;
    if (budget == null || budget < count * 42 + 32) return;
    const regs = rgbRead.read();
    if (regs[0] !== 3 || regs[1] !== 0 || regs[2] & 0x20) return;
    const dest = regs[3],
      source = regs[4],
      stack = regs[5];
    const sourceEnd = source + count * 3,
      destEnd = dest + count * 2;
    if (
      dest !== RGB_PALETTE_OUTPUT ||
      regs[6] !== dest - 0x54 ||
      source < 0x20000000 ||
      sourceEnd > 0x24000000 ||
      stack & 3 ||
      stack < 0x20000000 ||
      stack + 48 > 0x24000000 ||
      (source < destEnd && dest < sourceEnd) ||
      (source < stack + 48 && stack < sourceEnd) ||
      (dest < stack + 48 && stack < destEnd)
    )
      return;
    const colors = count - 1;
    const input = cpu.read(source, colors * 3),
      output = new Uint8Array(colors * 2);
    for (let i = 0, j = 0; i < input.length; i += 3, j += 2) {
      const color = ((input[i] & 0xf8) << 8) | ((input[i + 1] & 0xfc) << 3) | (input[i + 2] >>> 3);
      output[j] = color & 255;
      output[j + 1] = color >>> 8;
    }
    cpu.write(dest, output);
    rgbWrite.write(colors, dest + output.length, source + input.length);
    // Two dispatch instructions, one jump-table branch, six input and
    // twelve conversion/output instructions per skipped entry.
    const skipped = colors * 21;
    cpu.blockBudget = budget - skipped * 2;
    onSkippedInstructions(skipped);
    stats.rgbPalettes++;
    stats.rgbPaletteEntries += colors;
    stats.skippedInstructions += skipped;
  };
  let rgbPaletteHook =
    rgbRead && rgbWrite
      ? cpu.onBlock(rgbPalette, { begin: RGB_PALETTE_ENTRY, end: RGB_PALETTE_ENTRY })
      : null;
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
    if (count < 1 || count > 512 || (narrow && count < 12)) {
      stats.paletteFallbacks++;
      return;
    }
    const mode = cpu.regRead('r9');
    const blended = accelerateBlendedPalette && mode >= 1 && mode <= 3;
    const continuationPixels = blended ? minBlendedPalettePixels : minPaletteContinuationPixels;
    const canContinue =
      (narrow || blended) &&
      count >= 12 &&
      !cpu.runCounted &&
      cpu.runStop === 0x23fff000 &&
      Number.isFinite(continuationPixels);
    if (narrow && count < 32 && !canContinue) {
      stats.paletteFallbacks++;
      return;
    }
    const stack = cpu.regRead('sp');
    const inRam = (first, length) => first >= 0x20000000 && first + length <= 0x24000000;
    if (stack & 3 || !inRam(stack, 0x34)) {
      stats.paletteFallbacks++;
      return;
    }
    if ((mode !== 0 && !(blended && canContinue)) || cpu.regRead('r3') !== 0) {
      stats.paletteFallbacks++;
      return;
    }
    const rowIndex = cpu.read32(stack);
    // Try blending only at the first row. The later rows of an unsupported
    // image should fall through without reading its descriptor again.
    if (blended && rowIndex !== 0) {
      stats.paletteFallbacks++;
      return;
    }
    const image = cpu.read32(stack + 0x30);
    const imageBytes = blended ? 0x270 : 0x260;
    const height =
      rowIndex < 512 && inRam(image, imageBytes) ? (cpu.read32(image + 0x4c) | 0) >> 16 : 0;
    const remainingRows = height - rowIndex;
    // Reject small sprites before reading their palette and pixel buffers.
    if (
      (blended || (narrow && remainingRows * count < minPaletteBatchPixels)) &&
      !(canContinue && (remainingRows - 1) * count >= continuationPixels)
    ) {
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
      step = cpu.read32(stack + 0x2c) | 0;
    const mirrored = step === -1 && mirrorPalette && canContinue && !blended;
    // The native row starts at its rightmost pixel when the step is negative.
    const outputStart = mirrored ? destination - (count - 1) * 2 : destination;
    const sourceBytes = Math.ceil((bitOffset + count * bits) / 8),
      outputBytes = count * 2,
      paletteBytes = (mask + 1) * 2;
    const overlaps = (first, length) =>
      outputStart < first + length && first < outputStart + outputBytes;
    if (
      ![1, 2, 4, 8].includes(bits) ||
      mask !== (1 << bits) - 1 ||
      shift !== 8 - bits ||
      bitOffset > 7 ||
      bitOffset % bits !== 0 ||
      (step !== 1 && !mirrored) ||
      size !== 12 ||
      destination & 1 ||
      palette & 1 ||
      outputStart < 0x23000000 ||
      outputStart + outputBytes > 0x23ff0000 ||
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
    const outsideKernel =
      Number.isInteger(cpu.runStop) &&
      (cpu.runStop < PALETTE_ROW_ENTRY || cpu.runStop > 0x2004e7b8);
    if (outsideKernel && remainingRows > 1) {
      const stride = (cpu.read32(image + 0x25c) | 0) >> 16,
        paddingBits = cpu.read32(stack + 4),
        paddingBytes = cpu.read32(stack + 8) | 0,
        candidateRows = remainingRows,
        candidateStep = count * bits + paddingBytes * 8 + paddingBits,
        candidateInput = Math.ceil(
          (bitOffset + (candidateRows - 1) * candidateStep + count * bits) / 8,
        ),
        candidateOutput = (candidateRows - 1) * stride * 2 + outputBytes;
      const intersects = (a, an, b, bn) => a < b + bn && b < a + an;
      if (
        candidateRows <= 512 &&
        stride >= count &&
        stride <= 512 &&
        paddingBytes >= 0 &&
        paddingBits < 8 &&
        paddingBits % bits === 0 &&
        outputStart + candidateOutput <= 0x23ff0000 &&
        inRam(source, candidateInput) &&
        !intersects(outputStart, candidateOutput, source, candidateInput) &&
        !intersects(outputStart, candidateOutput, palette, paletteBytes) &&
        !intersects(outputStart, candidateOutput, stack, 0x34) &&
        !intersects(outputStart, candidateOutput, image + 0x4c, 4) &&
        !intersects(outputStart, candidateOutput, image + 0x25c, 4) &&
        !intersects(source, candidateInput, stack, 0x34) &&
        !intersects(palette, paletteBytes, stack, 0x34) &&
        !intersects(image + 0x4c, 4, stack, 0x34) &&
        !intersects(image + 0x25c, 4, stack, 0x34) &&
        (!blended ||
          (!intersects(outputStart, candidateOutput, image + 0x268, 8) &&
            !intersects(image + 0x268, 8, stack, 0x34)))
      ) {
        rows = candidateRows;
        sourceStepBits = candidateStep;
        destinationStride = stride * 2;
      }
    }
    const budget = cpu.blockBudget;
    // Resume at the current translated row entry with the state of the last
    // row. This avoids a PC write and a translated-block exit for small sprites.
    // Reserve the worst-case work through the native last row and its return.
    const visibleCost = blended ? 33 : 7;
    const continueLastRow =
      canContinue &&
      rows > 1 &&
      (rows - 1) * count >= continuationPixels &&
      budget != null &&
      budget >= rows * (62 + 2 * (19 + visibleCost) * count) + 128;
    if (continueLastRow) rows--;
    const inputLength = Math.ceil((bitOffset + (rows - 1) * sourceStepBits + count * bits) / 8),
      outputLength = (rows - 1) * destinationStride + outputBytes;
    if (
      !continueLastRow &&
      (mirrored ||
        blended ||
        (narrow && (count < 32 || rows < 2 || rows * count < minPaletteBatchPixels)))
    ) {
      stats.paletteFallbacks++;
      return;
    }
    const input = cpu.read(source, inputLength),
      colors = cpu.read(palette, paletteBytes),
      output = cpu.read(outputStart, outputLength);
    const sourceMasks = blended ? cpu.read32(image + 0x268) : 0;
    const destinationMasks = blended ? cpu.read32(image + 0x26c) : 0;
    const sourceHalf = sourceMasks & 0xffff,
      sourceQuarter = sourceMasks >>> 16;
    const destinationHalf = destinationMasks & 0xffff,
      destinationQuarter = destinationMasks >>> 16;
    let writes = 0,
      lastColor = transparent,
      lastDestination = 0,
      lastDestinationHalf = 0;
    const firstPixel = mirrored ? outputBytes - 2 : 0;
    const pixelStep = step * 2;
    for (let y = 0; y < rows; y++) {
      let out = y * destinationStride + firstPixel;
      for (let i = 0; i < count; i++, out += pixelStep) {
        const bit = bitOffset + y * sourceStepBits + i * bits,
          index = (input[bit >>> 3] >>> (shift - (bit & 7))) & mask;
        lastColor = transparent;
        if (index !== transparent) {
          lastColor = colors[index * 2] | (colors[index * 2 + 1] << 8);
          if (blended) {
            lastColor = ((lastColor >>> 1) & sourceHalf) + ((lastColor >>> 2) & sourceQuarter);
            lastDestination = output[out] | (output[out + 1] << 8);
            lastDestinationHalf = (lastDestination >>> 1) & destinationHalf;
            const pixel =
              lastColor + lastDestinationHalf + ((lastDestination >>> 2) & destinationQuarter);
            output[out] = pixel & 255;
            output[out + 1] = (pixel >>> 8) & 255;
          } else {
            output[out] = colors[index * 2];
            output[out + 1] = colors[index * 2 + 1];
          }
          writes++;
        }
      }
    }
    // Each pixel costs 19 instructions, plus 7 for a visible copy or 33 for a
    // visible blend. Resuming
    // at a row entry skips complete rows: 3 entry, 2 initial CMP/BLT and
    // 26 outer-loop instructions per row. For the older exit shortcut the
    // first entry is charged and the last outer loop is still native.
    // Counted Unicorn runs omit the 26-instruction block from notifications.
    const betweenRows = cpu.runCounted ? 5 : 31;
    const skipped =
        count * rows * 19 +
        writes * visibleCost +
        (continueLastRow ? rows * 31 : 2 + (rows - 1) * betweenRows),
      work = skipped * 2;
    if (budget != null && work > budget) {
      stats.paletteFallbacks++;
      return;
    }
    if (writes) cpu.write(outputStart, output);
    const endBit =
      bitOffset +
      (continueLastRow ? rows * sourceStepBits : (rows - 1) * sourceStepBits + count * bits);
    const rowAdvance = continueLastRow ? rows : rows - 1;
    if (rowAdvance > 0) {
      cpu.write32(stack, rowIndex + rowAdvance);
      cpu.write32(stack + 0x0c, destination + rowAdvance * destinationStride);
    }
    // The outer CMP(height, row) sets C before a new row. The native entry
    // then reloads r0 from the updated stack and clears r8 for the last row.
    cpu.regWrite('r0', continueLastRow ? height : destination + outputLength);
    cpu.regWrite('r1', endBit & 7);
    cpu.regWrite('r2', source + (endBit >>> 3));
    cpu.regWrite('r8', count);
    cpu.regWrite('r12', continueLastRow ? rowIndex + rowAdvance : bits);
    cpu.regWrite('lr', lastColor);
    if (blended && writes) {
      cpu.regWrite('r7', lastDestination);
      cpu.regWrite('r10', lastDestinationHalf);
      cpu.regWrite('r11', destinationQuarter);
    }
    cpu.regWrite(
      'cpsr',
      ((flags & 0x0fffffff) | (continueLastRow ? 0x20000000 : 0x60000000)) >>> 0,
    );
    if (continueLastRow) stats.paletteContinuations++;
    else cpu.regWrite('pc', PALETTE_ROW_EXIT);
    if (budget != null) cpu.blockBudget = budget - work;
    onSkippedInstructions(skipped);
    if (mirrored) {
      stats.mirroredPaletteBatches++;
      stats.mirroredPalettePixels += count * rows;
    }
    if (blended) {
      stats.blendedPaletteBatches++;
      stats.blendedPalettePixels += count * rows;
    }
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
  // SaveLCD/RestoreLCD use this aligned forward-copy path. Leave the original
  // register save, final 32-byte chunk and tail on ARM.
  const removeBulkCopy = cpu.addBlockShortcut(ALIGNED_COPY_ENTRY, (address, size) => {
    if (!enabled() || cpu.runCounted || cpu.runStop !== 0x23fff000 || size !== 12) return;
    const remaining = cpu.regRead('r2'),
      budget = cpu.blockBudget;
    if (budget == null || remaining < 4096 || remaining > 512 * 1024) return;
    if (cpu.regRead('cpsr') & 0x20) return;
    const to = cpu.regRead('r0'),
      from = cpu.regRead('r1');
    if (
      (to | from) & 3 ||
      to < 0x23000000 ||
      from < 0x20000000 ||
      to + remaining > 0x23ff0000 ||
      from + remaining > 0x24000000 ||
      (to < from + remaining && from < to + remaining)
    )
      return;
    // A copy touching the routine's two saved registers has to follow ARM
    // read/write order. Reject it before the host performs any writes.
    const sp = cpu.regRead('sp');
    if (
      sp & 3 ||
      sp < 0x20000008 ||
      sp > 0x24000000 ||
      (from < sp && sp - 8 < from + remaining) ||
      (to < sp && sp - 8 < to + remaining)
    )
      return;
    const bytes = (remaining - 32) & ~31,
      skipped = (bytes / 32) * 6,
      work = skipped * 2;
    // Reserve enough work for the remaining loop iteration and return. A
    // watchdog must never stop at a shortcut's intermediate register state.
    if (work + 64 > budget) return;
    cpu.write(to, cpu.read(from, bytes));
    cpu.regWrite('r0', to + bytes);
    cpu.regWrite('r1', from + bytes);
    cpu.regWrite('r2', remaining - bytes);
    cpu.blockBudget = budget - work;
    onSkippedInstructions(skipped);
    stats.bulkCopies++;
    stats.copiedBytes += bytes;
    stats.skippedInstructions += skipped;
  });
  return {
    stats,
    enableSolidRectangles() {
      if (!accelerateSolidRectangle || removeSolidRectangles.length) return;
      for (const entry of SOLID_RECT_ENTRIES)
        removeSolidRectangles.push(cpu.addBlockShortcut(entry, solidRectangle));
    },
    dispose() {
      removeFill();
      removeRectangle();
      removeBlendRectangle?.();
      if (rgbPaletteHook) {
        cpu.removeHook(rgbPaletteHook);
        rgbPaletteHook = null;
      }
      for (const remove of removeSolidRectangles) remove();
      removePaletteRow();
      removeColorMatch();
      removeBulkCopy();
    },
  };
}
