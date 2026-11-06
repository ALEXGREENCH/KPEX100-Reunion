import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseMa1 } from '../../web/engine/ma1.js';

const reference = JSON.parse(
  fs.readFileSync(new URL('../../validation/gvm-ma1-native-reference.json', import.meta.url)),
);

test('raw MA1 fields match the isolated SDK across originals and all packed score codes', () => {
  assert.equal(reference.vectors.length, 8);
  let count = 0;
  for (const row of reference.vectors) {
    const input = Buffer.from(row.payloadHex, 'hex'),
      before = Buffer.from(input);
    const parsed = parseMa1(input);
    assert.equal(parsed.score.length, row.init.sequenceWords, row.name);
    assert.equal(parsed.sdkWholeNoteMs, row.init.wholeNoteMs, row.name);
    assert.deepEqual(parsed.sdkVoiceAssignments, row.init.voiceSlots, row.name);
    assert.equal(parsed.score.length, row.words.length);
    for (const [i, fields] of row.words.entries())
      for (const key of Object.keys(fields))
        assert.equal(parsed.score[i][key], fields[key], `${row.name}:${i}:${key}`);
    assert.deepEqual(input, before);
    count += parsed.score.length;
  }
  assert.equal(count, 820);
});

test('MA1 retains register order and operator bits separately from the Windows approximation', () => {
  const bytes = Buffer.from(reference.vectors[0].payloadHex, 'hex');
  // Independent bit assignments from Yamaha register10/11: 2D67 / 9ABC.
  bytes.writeUInt16LE(0x2d67, 4);
  bytes.writeUInt16LE(0x9abc, 6);
  const parsed = parseMa1(bytes);
  assert.deepEqual(parsed.voices[0][0], {
    multiple: 1,
    vibrato: false,
    sustained: true,
    sustainOn: true,
    releaseRate: 5,
    decayRate: 9,
    attackRate: 14,
    sustainLevel: 6,
    totalLevel: 43,
    halfWave: true,
    feedback: 4,
  });
  assert.deepEqual(parsed.registerVoiceAssignments, [0, 1, 2, 3]);
  assert.deepEqual(parsed.sdkVoiceAssignments, [3, 2, 1, 0]);
  assert.equal(parsed.tempoRegister, 14);
  assert.equal(parsed.sdkWholeNoteMs, 392);
  assert.ok(Math.abs(parsed.nominalWholeNoteMs - 411.946447) < 0.00001);
});

test('MA1 identifies rests, voice changes, ties and reserved pitches without inventing playback', () => {
  const input = Buffer.alloc(94);
  input.writeUInt16LE(0x8001, 0);
  input.writeUInt16LE(92, 2);
  input.writeUInt16LE(0x338f, 86); // rest,channel3,voice7,interval1
  input.writeUInt16LE(0x7c5f, 88); // block1,C,intervalB,gate7 tie/slur
  input.writeUInt16LE(0x4000, 90); // block1,reserved pitch0
  input.writeUInt16LE(0x3000, 92); // canonical rest,interval0 ambiguity retained
  const parsed = parseMa1(input);
  assert.equal(parsed.loop, true);
  assert.deepEqual(
    [
      parsed.score[0].kind,
      parsed.score[0].channel,
      parsed.score[0].changeVoice,
      parsed.score[0].voice,
    ],
    ['rest', 3, true, 7],
  );
  assert.equal(parsed.score[1].tieOrSlur, true);
  assert.equal(parsed.score[1].validPitch, true);
  assert.equal(parsed.score[2].validPitch, false);
  assert.equal(parsed.score[3].canonicalRest, true);
  assert.equal(parsed.score[3].sdkIntervalTicks, 0);
  assert.equal(parsed.nominalWholeNoteMs, 240000 / 8739);
  assert.equal(parsed.sdkWholeNoteMs, 0);
});

test('MA1 length bounds respect subviews, declared score extent, padding and malformed headers', () => {
  const original = Buffer.from(reference.vectors[1].payloadHex, 'hex');
  const container = Buffer.concat([Buffer.alloc(3, 0xaa), original, Buffer.alloc(4)]);
  assert.deepEqual(parseMa1(container.subarray(3, -4)), parseMa1(original));
  const padded = parseMa1(container.subarray(3));
  assert.equal(padded.trailingBytes, 4);
  assert.deepEqual(padded.score, parseMa1(original).score);
  const empty = original.subarray(0, 86);
  empty.writeUInt16LE(84, 2);
  assert.deepEqual(parseMa1(empty).score, []);
  assert.throws(() => parseMa1(original.buffer), /Invalid/);
  assert.throws(() => parseMa1(new Uint8Array(4 * 1024 * 1024 + 1)), /Invalid/);
  assert.throws(() => parseMa1(new Uint8Array(85)), /Invalid/);
  const wrong = Buffer.from(empty);
  wrong.writeUInt16LE(2, 0);
  assert.throws(() => parseMa1(wrong), /subtype/);
  for (const length of [0, 83, 85, 65534]) {
    const bad = Buffer.from(empty);
    bad.writeUInt16LE(length, 2);
    assert.throws(() => parseMa1(bad), /length/);
  }
});
