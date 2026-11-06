/** Raw GVM MA1 register/score inspection. This module does not synthesize audio. */
const intervals = [0, 2, 3, 4, 6, 8, 9, 12, 18, 24, 48, 0, 16, 24, 36, 48];
const gates = [
  [1, 2, 3, 5, 7, 8, 11, 17],
  [15, 23, 29, 32, 35, 41, 47, 56],
];

export function parseMa1(input) {
  if (!(input instanceof Uint8Array) || input.length < 86 || input.length > 4 * 1024 * 1024)
    throw Error('Invalid raw GVM MA1 input');
  const view = new DataView(input.buffer, input.byteOffset, input.length);
  const word = (offset) => view.getUint16(offset, true);
  const type = word(0),
    declaredBytes = word(2),
    end = declaredBytes + 2;
  if ((type & 0x7fff) !== 1) throw Error('Expected GVM MA1 subtype 1');
  if (declaredBytes < 84 || declaredBytes % 2 || end > input.length)
    throw Error('Invalid raw GVM MA1 declared length');
  const voices = Array.from({ length: 8 }, (_, i) =>
    Array.from({ length: 2 }, (_, j) => {
      const a = word(4 + i * 8 + j * 4),
        b = word(6 + i * 8 + j * 4);
      return {
        multiple: a >>> 13,
        vibrato: !!(a & 0x1000),
        sustained: !!(a & 0x0800),
        sustainOn: !!(a & 0x0400),
        releaseRate: (a >>> 6) & 15,
        decayRate: (a >>> 2) & 15,
        attackRate: ((a & 3) << 2) | (b >>> 14),
        sustainLevel: (b >>> 10) & 15,
        totalLevel: (b >>> 4) & 63,
        halfWave: !!(b & 8),
        feedback: b & 7,
      };
    }),
  );
  const registerWords = Array.from({ length: 9 }, (_, i) => word(68 + i * 2));
  const tempoRegister = registerWords[1];
  const score = [];
  for (let offset = 86; offset < end; offset += 2) {
    const value = word(offset),
      block = value >>> 14,
      noteCode = (value >>> 10) & 15;
    const intervalCode = (value >>> 3) & 15,
      gateCode = value & 7;
    score.push({
      index: score.length,
      offset,
      word: value,
      block,
      noteCode,
      channel: (value >>> 8) & 3,
      intervalCode,
      gateCode,
      sdkIntervalTicks: intervals[intervalCode],
      sdkGateTicks: gates[intervalCode > 10 ? 1 : 0][gateCode],
      kind: block ? 'note' : 'rest',
      vibrato: block !== 0 && !!(value & 128),
      changeVoice: block === 0 && !!(value & 128),
      voice: block === 0 && value & 128 ? gateCode : null,
      canonicalRest: block === 0 && noteCode === 12,
      validPitch: block !== 0 && noteCode % 4 !== 0,
      tieOrSlur: block !== 0 && intervalCode >= 11 && gateCode === 7,
    });
  }
  return {
    loop: !!(type & 0x8000),
    declaredBytes,
    trailingBytes: input.length - end,
    voices,
    registerWords,
    tempoRegister,
    // The Windows SDK consumes the allotment nibbles in reverse channel order.
    sdkVoiceAssignments: Array.from(
      { length: 4 },
      (_, i) => (registerWords[0] >>> ((3 - i) * 4)) & 7,
    ),
    registerVoiceAssignments: Array.from(
      { length: 4 },
      (_, i) => (registerWords[0] >>> (i * 4)) & 7,
    ),
    sdkWholeNoteMs: 28 * tempoRegister,
    // Yamaha's tempo formula; this is deliberately separate from WinMM timing.
    nominalWholeNoteMs: (240000 * ((tempoRegister & 255) + 1)) / 8739,
    score,
  };
}
