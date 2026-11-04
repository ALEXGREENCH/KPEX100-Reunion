import createSmafModule from './vendor/smaf.mjs';

let modulePromise;
export function initSmaf(options = {}) {
  return (modulePromise ||= createSmafModule(options));
}

/** Decode bounded SMAF input to stereo PCM WAVE. Preset FM timbres are approximate. */
export async function renderSmaf(
  input,
  {
    rate = 44100,
    maxSeconds = 180,
    cancelled = () => false,
    yieldTask = () => new Promise((resolve) => setTimeout(resolve, 0)),
  } = {},
) {
  const data = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (data.length < 12 || data.length > 4 * 1024 * 1024) throw Error('Invalid SMAF size');
  if (
    !Number.isInteger(rate) ||
    rate < 8000 ||
    rate > 48000 ||
    !(maxSeconds > 0 && maxSeconds <= 180)
  )
    throw Error('Invalid SMAF output limits');
  const mod = await initSmaf();
  const source = mod._malloc(data.length),
    buffer = mod._malloc(8192 * 2 * 4);
  let synth = 0;
  try {
    mod.HEAPU8.set(data, source);
    synth = mod._smaf_create(source, data.length, rate);
    if (!synth) throw Error('SMAF contains no playable track');
    const limit = Math.floor(rate * maxSeconds),
      chunks = [];
    let frames = 0,
      peak = 0,
      ended = false;
    while (frames < limit) {
      if (cancelled()) throw new DOMException('Audio request superseded', 'AbortError');
      const count = mod._smaf_render(synth, buffer, Math.min(8192, limit - frames));
      if (count <= 0) {
        ended = true;
        break;
      }
      const floats = mod.HEAPF32.subarray(buffer / 4, buffer / 4 + count * 2);
      const pcm = new Int16Array(count * 2);
      for (let i = 0; i < pcm.length; i++) {
        peak = Math.max(peak, Math.abs(floats[i]));
        pcm[i] = Math.max(-32768, Math.min(32767, Math.trunc(floats[i] * 32767)));
      }
      chunks.push(pcm);
      frames += count;
      await yieldTask();
    }
    const wave = new Uint8Array(44 + frames * 4),
      view = new DataView(wave.buffer);
    const tag = (offset, value) => wave.set(new TextEncoder().encode(value), offset);
    tag(0, 'RIFF');
    view.setUint32(4, wave.length - 8, true);
    tag(8, 'WAVE');
    tag(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 2, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 4, true);
    view.setUint16(32, 4, true);
    view.setUint16(34, 16, true);
    tag(36, 'data');
    view.setUint32(40, frames * 4, true);
    let offset = 44;
    for (const chunk of chunks)
      for (const sample of chunk) {
        view.setInt16(offset, sample, true);
        offset += 2;
      }
    return { wave, rate, frames, peak, truncated: !ended && frames === limit };
  } finally {
    if (synth) mod._smaf_destroy(synth);
    mod._free(buffer);
    mod._free(source);
  }
}
