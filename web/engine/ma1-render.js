import { parseMa1 } from './ma1.js';

const tau = 2 * Math.PI;
const floor = 10 ** (-48 / 20);
// YMU757B B2 p16: full-scale attack and 48dB decay/release times, seconds.
const attackSeconds = [
  Infinity,
  Infinity,
  19.04084,
  9.52042,
  4.76021,
  2.3801,
  1.19005,
  0.59503,
  0.29751,
  0.14876,
  0.07438,
  0.03719,
  0.01859,
  0.0093,
  0.00465,
  0,
];
const decaySeconds = [
  Infinity,
  Infinity,
  36.617,
  18.3085,
  9.15425,
  4.57712,
  2.28856,
  1.14425,
  0.57214,
  0.28607,
  0.14304,
  0.07152,
  0.03576,
  0.01788,
  0.00894,
  0.00223,
];

/** Nominal MA1 envelope; dB-linear stages approximate its internal envelope curve. */
export class Ma1Envelope {
  constructor(patch, rate) {
    this.patch = patch;
    this.rate = rate;
    this.stage = 'attack';
    this.level = Number.isFinite(attackSeconds[patch.attackRate]) ? floor : 0;
    this.attack =
      attackSeconds[patch.attackRate] === 0
        ? Infinity
        : 10 ** (48 / (20 * rate * attackSeconds[patch.attackRate]));
    this.decay = this.coefficient(patch.decayRate);
    this.damp = this.coefficient(patch.releaseRate);
    this.sustain = 10 ** ((-3 * patch.sustainLevel) / 20);
  }
  coefficient(rate) {
    return 10 ** (-48 / (20 * this.rate * decaySeconds[rate]));
  }
  off() {
    if (this.stage === 'release' || this.stage === 'idle') return;
    this.release = this.coefficient(
      this.patch.sustainOn ? 6 : this.patch.sustained ? this.patch.releaseRate : 9,
    );
    this.stage = this.level > 0 ? 'release' : 'idle';
  }
  tick() {
    if (this.stage === 'attack') {
      if (this.attack === Infinity) this.level = 1;
      else this.level = Math.min(1, this.level * this.attack);
      if (this.level >= 1) this.stage = 'decay';
    } else if (this.stage === 'decay') {
      this.level = Math.max(this.sustain, this.level * this.decay);
      if (this.level <= this.sustain) this.stage = this.patch.sustained ? 'sustain' : 'damp';
    } else if (this.stage === 'damp' || this.stage === 'release') {
      this.level *= this.stage === 'damp' ? this.damp : this.release;
      if (this.level < floor) {
        this.level = 0;
        this.stage = 'idle';
      }
    }
    return this.level;
  }
}

const semitones = [null, 1, 2, 3, null, 4, 5, 6, null, 7, 8, 9, null, 10, 11, 12];
export function ma1Frequency(block, noteCode) {
  if (
    !Number.isInteger(block) ||
    !Number.isInteger(noteCode) ||
    block < 1 ||
    block > 3 ||
    semitones[noteCode] == null
  )
    throw Error('Reserved MA1 pitch');
  return 440 * 2 ** ((48 + (block - 1) * 12 + semitones[noteCode] - 69) / 12);
}

/** Compile raw FIFO words onto the nominal chip clock, without WinMM jitter. */
export function ma1Timeline(input, rate = 44100) {
  if (!Number.isInteger(rate) || rate < 8000 || rate > 48000) throw Error('Invalid MA1 rate');
  const parsed = parseMa1(input),
    tickSeconds = parsed.nominalWholeNoteMs / 48000;
  const events = [];
  let tick = 0;
  const pendingGates = [0, 0, 0, 0];
  for (const word of parsed.score) {
    const atFrame = Math.floor(tick * tickSeconds * rate);
    const frequency = word.kind === 'note' ? ma1Frequency(word.block, word.noteCode) : 0;
    const offTick = word.tieOrSlur ? Infinity : tick + word.sdkGateTicks;
    const offFrame = Number.isFinite(offTick) ? Math.floor(offTick * tickSeconds * rate) : Infinity;
    events.push({ ...word, atFrame, frequency, offFrame });
    pendingGates[word.channel] = word.kind === 'note' && Number.isFinite(offFrame) ? offFrame : 0;
    tick += word.sdkIntervalTicks;
  }
  return {
    ...parsed,
    events,
    endFrame: Math.max(...pendingGates, Math.floor(tick * tickSeconds * rate)),
  };
}

class Voice {
  constructor(patch, rate, event) {
    this.patch = patch;
    this.envelopes = patch.map((p) => new Ma1Envelope(p, rate));
    this.gains = patch.map((p) => 10 ** ((-0.75 * p.totalLevel) / 20));
    this.phases = [0, 0];
    this.feedback = 0;
    this.keyed = true;
    this.setNote(event);
  }
  setNote(event) {
    this.frequency = event.frequency;
    this.offFrame = event.offFrame;
    this.tie = event.tieOrSlur;
    this.vibrato = event.vibrato;
  }
  off() {
    this.keyed = false;
    for (const envelope of this.envelopes) envelope.off();
  }
  tick(rate, vibrato) {
    let modulator = 0,
      output = 0;
    for (let i = 0; i < 2; i++) {
      const op = this.patch[i];
      const factor = op.multiple || 0.5;
      const frequency = this.frequency * factor * (this.vibrato && op.vibrato ? vibrato : 1);
      // MA1 feedback belongs to the carrier. Phase index and one-sample delay
      // approximate its internal FM arithmetic; this is not a bit-exact core.
      const feedback = i && op.feedback ? this.feedback * Math.PI * 2 ** (op.feedback - 5) : 0;
      let sample = Math.sin(this.phases[i] + (i ? tau * modulator + feedback : 0));
      if (op.halfWave) sample = Math.max(0, sample);
      sample *= this.envelopes[i].tick() * this.gains[i];
      this.phases[i] = (this.phases[i] + (tau * frequency) / rate) % tau;
      if (i === 0) modulator = sample;
      else output = sample;
    }
    this.feedback = output;
    return output;
  }
  get active() {
    return this.envelopes[1].level > 0;
  }
}

/** Four mono FM parts using the resource's own two-operator patches. */
export async function renderMa1(
  input,
  {
    rate = 44100,
    maxSeconds = 180,
    cancelled = () => false,
    yieldTask = () => new Promise((resolve) => setTimeout(resolve, 0)),
  } = {},
) {
  if (!Number.isFinite(maxSeconds) || maxSeconds <= 0 || maxSeconds > 180)
    throw Error('Invalid MA1 output bounds');
  const check = () => {
    if (cancelled()) throw new DOMException('Audio request superseded', 'AbortError');
  };
  check();
  const score = ma1Timeline(input, rate),
    limit = Math.floor(rate * maxSeconds);
  const voices = [null, null, null, null],
    assigned = [...score.registerVoiceAssignments];
  const pcm = [],
    chunkSize = 16384;
  let chunk = new Int16Array(Math.min(chunkSize, limit)),
    cursor = 0;
  let position = 0,
    frames = 0,
    ended = score.events.length === 0,
    peak = 0;
  let previousIn = 0,
    previousOut = 0;
  const highpass = rate / (rate + tau * 15); // approximate speaker AC coupling
  while (frames < limit && !ended) {
    for (const voice of voices) if (voice?.keyed && frames >= voice.offFrame) voice.off();
    while (position < score.events.length && score.events[position].atFrame <= frames) {
      const event = score.events[position++],
        ch = event.channel,
        current = voices[ch];
      if (event.kind === 'rest') {
        current?.off();
        if (event.changeVoice) assigned[ch] = event.voice;
      } else if (current?.keyed && current.tie && current.patch === score.voices[assigned[ch]]) {
        current.setNote(event);
      } else voices[ch] = new Voice(score.voices[assigned[ch]], rate, event);
    }
    if (position === score.events.length && frames >= score.endFrame)
      for (const voice of voices) if (voice?.keyed) voice.off();
    const vibrato = 2 ** ((13.47 * Math.sin((tau * 6.4 * frames) / rate)) / 1200);
    let mixed = 0;
    for (const voice of voices) if (voice?.active) mixed += 0.2 * voice.tick(rate, vibrato);
    const sample = highpass * (previousOut + mixed - previousIn);
    previousIn = mixed;
    previousOut = sample;
    peak = Math.max(peak, Math.abs(sample));
    chunk[cursor++] = Math.round(Math.max(-1, Math.min(1, sample)) * 32767);
    frames++;
    ended =
      position === score.events.length &&
      frames >= score.endFrame &&
      voices.every((v) => !v?.active);
    if (cursor === chunk.length) {
      pcm.push(chunk);
      cursor = 0;
      if (frames < limit) chunk = new Int16Array(Math.min(chunkSize, limit - frames));
      if (!ended && frames < limit) {
        await yieldTask();
        check();
      }
    }
  }
  if (cursor) pcm.push(chunk.subarray(0, cursor));
  check();
  const wave = new Uint8Array(44 + frames * 2),
    view = new DataView(wave.buffer);
  wave.set(new TextEncoder().encode('RIFF'), 0);
  wave.set(new TextEncoder().encode('WAVEfmt '), 8);
  wave.set(new TextEncoder().encode('data'), 36);
  view.setUint32(4, wave.length - 8, true);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(40, frames * 2, true);
  let offset = 44;
  for (const block of pcm) {
    for (const value of block) {
      view.setInt16(offset, value, true);
      offset += 2;
    }
    await yieldTask();
    check();
  }
  return { wave, rate, frames, peak, truncated: !ended };
}
