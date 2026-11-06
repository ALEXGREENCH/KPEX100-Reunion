/** Original GNEX display scaling, with a compact table of channel values. */
let rgbaWords;

function colors() {
  if (rgbaWords) return rgbaWords;
  // Uint32 output stores use host byte order; input RGB565 is always little-endian.
  const littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  const table = new Uint32Array(128);
  for (let c = 0; c < 32; c++) {
    const value = Math.floor((c * 255) / 31);
    table[c] = littleEndian ? (value | 0xff000000) >>> 0 : ((value << 24) | 255) >>> 0;
    table[96 + c] = littleEndian ? value << 16 : value << 8;
  }
  for (let c = 0; c < 64; c++) {
    const value = Math.floor((c * 255) / 63);
    table[32 + c] = littleEndian ? value << 8 : value << 16;
  }
  rgbaWords = table;
  return table;
}

export function rgb565ToRGBA(source) {
  if (!(source instanceof Uint8Array) || (source.length & 1) !== 0)
    throw new TypeError('Expected complete little-endian RGB565 bytes');
  const table = colors();
  // Each frame owns its bytes: Worker transfer or a later frame must not mutate it.
  const rgba = new Uint8ClampedArray(source.length * 2);
  const words = new Uint32Array(rgba.buffer);
  for (let i = 0, j = 0; i < source.length; i += 2, j++) {
    const color = source[i] | (source[i + 1] << 8);
    words[j] = table[color >>> 11] | table[32 + ((color >>> 5) & 63)] | table[96 + (color & 31)];
  }
  return rgba;
}
