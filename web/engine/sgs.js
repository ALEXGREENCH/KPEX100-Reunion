/** Validated GNEX v4/v36 containers. Source documents are data, not commands. */
export class SgsError extends Error {}
export const EVENTS = [
  'START',
  'END',
  'TIMEOUT',
  'KEYPRESS',
  'RSEVENT',
  'RSRECEIVE',
  'RESULT',
  'RECEIVE',
  'NETWORK',
  'SMSRECEIVE',
  'GENERAL',
];
export const bytes = (value) => (value instanceof Uint8Array ? value : new Uint8Array(value));
const wrapperOffset = (raw) =>
  raw[0] === 32 && raw[1] === 0 && raw[2] === 0 && raw[3] === 0 ? 32 : 0;
export function detectVersion(input) {
  const raw = bytes(input),
    offset = wrapperOffset(raw),
    n = raw[offset];
  return [1, 2, 4, 36].includes(n) ? n : [1, 2, 4, 36].includes(n ^ 165) ? n ^ 165 : n;
}
export function decodeKorean(value, fatal = false) {
  const data = bytes(value),
    end = data.indexOf(0);
  return new TextDecoder('euc-kr', { fatal }).decode(end < 0 ? data : data.subarray(0, end));
}
function readBody(input) {
  const raw = bytes(input);
  if (raw.length < 128) throw new SgsError('SGS header is truncated');
  const wrapperBytes = wrapperOffset(raw);
  let body = raw.slice(wrapperBytes);
  if (body.length < 128) throw new SgsError('SGS body header is truncated after wrapper');
  let xorMask = 0;
  if (![1, 2, 4, 36].includes(body[0]) && [1, 2, 4, 36].includes(body[0] ^ 165)) {
    body = body.map((x) => x ^ 165);
    xorMask = 165;
  }
  return { body, wrapperBytes, xorMask };
}

async function expandType2(body) {
  if (body[0] !== 4 || body[26] !== 2) return body;
  const header = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const storedSize = header.getUint32(120, true);
  const expandedSize = header.getUint32(108, true);
  if (expandedSize <= storedSize) return body;
  // The observed SKT WIPI layout leaves 18 bytes of media data before zlib.
  const media = header.getUint32(84, true);
  const streamOffset = media + 18;
  if (
    media < 128 ||
    storedSize !== body.length ||
    streamOffset + 6 >= storedSize ||
    body[storedSize - 1] !== 0xff ||
    expandedSize > 0xc00000
  )
    throw new SgsError('Invalid SGS type 2 compression layout');

  const expanded = new Uint8Array(expandedSize);
  expanded.set(body.subarray(0, streamOffset));
  new DataView(expanded.buffer).setUint32(120, expandedSize, true);
  const input = new Blob([body.subarray(streamOffset, -1)]);
  try {
    const reader = input.stream().pipeThrough(new DecompressionStream('deflate')).getReader();
    let offset = streamOffset;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value.length > expanded.length - offset) {
          await reader.cancel();
          throw new SgsError('Inflated SGS exceeds its declared size');
        }
        expanded.set(value, offset);
        offset += value.length;
      }
      if (offset !== expanded.length) throw new SgsError('Inflated SGS size disagrees with header');
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    if (error instanceof SgsError) throw error;
    throw new SgsError('Invalid SGS type 2 zlib stream', { cause: error });
  }
  return expanded;
}

export class SgsFile {
  static async open(input) {
    const original = readBody(input);
    const body = await expandType2(original.body);
    return new SgsFile(input, { ...original, body });
  }
  constructor(input, { body, wrapperBytes, xorMask } = readBody(input)) {
    this.wrapperBytes = wrapperBytes;
    this.xorMask = xorMask;
    this.version = body[0];
    if (![4, 36].includes(this.version))
      throw new SgsError(`SGS version ${this.version} is unsupported; v4/v36 required`);
    this.body = body;
    this.title = decodeKorean(body.subarray(10, 26));
    const v = new DataView(body.buffer, body.byteOffset, body.byteLength);
    [this.a, this.b, this.c, this.d] = [72, 76, 80, 84].map((p) => v.getUint32(p, true));
    this.declaredSize = v.getUint32(120, true);
    if (
      !(
        128 <= this.a &&
        this.a <= this.b &&
        this.b <= this.c &&
        this.c <= this.d &&
        this.d <= this.declaredSize &&
        this.declaredSize <= body.length
      )
    )
      throw new SgsError('SGS section offsets are outside the file or unordered');
    if ((this.b - this.a) % 8 || (this.d - this.c) % 12)
      throw new SgsError('SGS descriptor alignment is invalid');
    this.entries = Object.fromEntries(
      EVENTS.map((name, i) => [name, v.getUint32(28 + i * 4, true)]),
    );
    for (const p of Object.values(this.entries))
      if (p && (p < 128 || p >= this.a || p % 2))
        throw new SgsError('SGS entry point is outside bytecode');
    this.variables = [];
    let total = 0;
    for (let p = this.a; p < this.b; p += 8) {
      const item = [v.getUint16(p, true), v.getUint16(p + 2, true), v.getUint32(p + 4, true)];
      this.variables.push(item);
      total += item[1];
    }
    if (total * 4 !== this.c - this.b)
      throw new SgsError('SGS variable size disagrees with descriptors');
    this.resources = [];
    let pos = this.d;
    for (let p = this.c; p < this.d; p += 12) {
      const type = v.getUint32(p, true),
        length = v.getUint32(p + 4, true);
      if (pos + length > this.declaredSize)
        throw new SgsError('SGS resource exceeds declared payload');
      this.resources.push({ type, offset: pos, data: body.subarray(pos, pos + length) });
      pos += length;
    }
    if (pos !== this.declaredSize)
      throw new SgsError('SGS resources do not cover declared payload');
  }
  resource(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.resources.length)
      throw new SgsError(`Resource ${index} out of range`);
    return this.resources[index];
  }
}
