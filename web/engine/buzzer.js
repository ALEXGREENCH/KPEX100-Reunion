/** GVM buzzer events from the original SDK; square-wave output approximates its speaker. */
export const buzzerFrequencies = Object.freeze([
  392, 415, 440, 466, 494, 523, 554, 587, 622, 659, 698, 740, 784, 831, 880, 923, 988, 1047, 1109,
  1175, 1245, 1319, 1397, 1475, 1568, 1661, 1760, 1865, 1976, 2093, 2217, 2349, 2489, 2637, 2794,
  2960, 3136,
]);

export function buzzerEvents(input) {
  if (!(input instanceof Uint8Array) || input.length > 4 * 1024 * 1024)
    throw Error('Invalid GVM buzzer input');
  if (input.length < 3 || (input[0] | ((input[1] & 0x7f) << 8)) !== 0)
    throw Error('Expected GVM buzzer subtype 0');
  const events = [];
  let atMs = 0;
  for (let p = 2; p < input.length; p += 2) {
    const note = input[p];
    if (note >= 38) return { events, durationMs: atMs };
    if (p + 1 >= input.length) throw Error('Truncated GVM buzzer event');
    if (events.length >= 65536) throw Error('GVM buzzer event limit');
    const durationMs = input[p + 1] * 3;
    events.push({ atMs, frequency: note === 37 ? 0 : buzzerFrequencies[note], durationMs });
    atMs += durationMs;
  }
  throw Error('GVM buzzer has no end marker');
}

export async function renderBuzzer(
  input,
  {
    rate = 44100,
    maxSeconds = 180,
    cancelled = () => false,
    yieldTask = () => new Promise((resolve) => setTimeout(resolve, 0)),
  } = {},
) {
  if (
    !Number.isInteger(rate) ||
    rate < 8000 ||
    rate > 48000 ||
    !Number.isFinite(maxSeconds) ||
    maxSeconds <= 0 ||
    maxSeconds > 180
  )
    throw Error('Invalid GVM buzzer output bounds');
  const check = () => {
    if (cancelled()) throw new DOMException('Audio request superseded', 'AbortError');
  };
  check();
  const parsed = buzzerEvents(input);
  const frames = Math.min(
    Math.floor((parsed.durationMs * rate) / 1000),
    Math.floor(maxSeconds * rate),
  );
  const wave = new Uint8Array(44 + frames * 2),
    view = new DataView(wave.buffer);
  for (const [offset, value] of [
    [0, 'RIFF'],
    [8, 'WAVEfmt '],
    [36, 'data'],
  ])
    wave.set(new TextEncoder().encode(value), offset);
  view.setUint32(4, wave.length - 8, true);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(40, frames * 2, true);
  let rendered = 0;
  for (const event of parsed.events) {
    const start = Math.floor((event.atMs * rate) / 1000);
    const end = Math.min(frames, Math.floor(((event.atMs + event.durationMs) * rate) / 1000));
    if (start >= frames) break;
    for (let i = start; i < end; i++) {
      const sample = event.frequency
        ? (((i - start) * event.frequency) / rate) % 1 < 0.5
          ? 6553
          : -6553
        : 0;
      view.setInt16(44 + i * 2, sample, true);
      if (++rendered % 16384 === 0) {
        await yieldTask();
        check();
      }
    }
  }
  check();
  return { wave, frames, rate, truncated: frames < Math.floor((parsed.durationMs * rate) / 1000) };
}
