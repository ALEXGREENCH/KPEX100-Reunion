/** Original GNEX display scaling. */
const littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
let redGreen, blue;

function initColors() {
  redGreen = new Uint32Array(2048);
  blue = new Uint32Array(32);
  for (let c = 0; c < 32; c++) {
    const value = Math.floor((c * 255) / 31);
    const red = littleEndian ? value | 0xff000000 : (value << 24) | 255;
    blue[c] = littleEndian ? value << 16 : value << 8;
    for (let g = 0; g < 64; g++) {
      const green = Math.floor((g * 255) / 63);
      redGreen[(c << 6) | g] = red | (green << (littleEndian ? 8 : 16));
    }
  }
}

export function rgb565ToRGBA(source) {
  if (!(source instanceof Uint8Array) || (source.length & 1) !== 0)
    throw new TypeError('Expected complete little-endian RGB565 bytes');
  if (!redGreen) initColors();
  // Each frame owns its bytes: Worker transfer or a later frame must not mutate it.
  const rgba = new Uint8ClampedArray(source.length * 2);
  const words = new Uint32Array(rgba.buffer);
  if (littleEndian && (source.byteOffset & 1) === 0) {
    const colors = new Uint16Array(source.buffer, source.byteOffset, words.length);
    for (let i = 0; i < colors.length; i++) {
      const color = colors[i];
      words[i] = redGreen[color >>> 5] | blue[color & 31];
    }
  } else {
    for (let i = 0, j = 0; i < source.length; i += 2, j++) {
      const color = source[i] | (source[i + 1] << 8);
      words[j] = redGreen[color >>> 5] | blue[color & 31];
    }
  }
  return rgba;
}
