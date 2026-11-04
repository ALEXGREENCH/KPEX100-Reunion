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
export function detectVersion(input) {
  const raw = bytes(input),
    offset = raw[0] === 32 && raw[1] === 0 && raw[2] === 0 && raw[3] === 0 ? 32 : 0,
    n = raw[offset];
  return [1, 2, 4, 36].includes(n) ? n : [1, 2, 4, 36].includes(n ^ 165) ? n ^ 165 : n;
}
export function decodeKorean(value, fatal = false) {
  const data = bytes(value),
    end = data.indexOf(0);
  return new TextDecoder('euc-kr', { fatal }).decode(end < 0 ? data : data.subarray(0, end));
}
export class SgsFile {
  constructor(input) {
    const raw = bytes(input);
    if (raw.length < 128) throw new SgsError('SGS header is truncated');
    this.wrapperBytes = raw[0] === 32 && raw[1] === 0 && raw[2] === 0 && raw[3] === 0 ? 32 : 0;
    let body = raw.slice(this.wrapperBytes);
    if (body.length < 128) throw new SgsError('SGS body header is truncated after wrapper');
    this.xorMask = 0;
    if (![1, 2, 4, 36].includes(body[0]) && [1, 2, 4, 36].includes(body[0] ^ 165)) {
      body = body.map((x) => x ^ 165);
      this.xorMask = 165;
    }
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
