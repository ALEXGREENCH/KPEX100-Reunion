import test from 'node:test';
import assert from 'node:assert/strict';
import { AdsAudio } from '../../web/engine/ads-audio.js';

test('ADS sound accepts bounded clips and coalesces adjacent timer requests', () => {
  const source = new Uint8Array(40);
  const body = new DataView(source.buffer, 3, 34);
  for (const offset of [0, 16]) {
    body.setUint32(offset, 0x4d4d4d44);
    body.setUint32(offset + 4, 6);
    body.setUint32(offset + 8, 0x434e5449);
  }
  const events = [];
  const audio = new AdsAudio(body, {
    play: (bytes, mime, loop) => events.push({ bytes: [...bytes], mime, loop }),
    stop: () => events.push('stop'),
  });

  audio.request(1, -1);
  audio.request(1, 24);
  audio.request(2, 0);
  audio.flush(1, true);
  assert.deepEqual(events, []);

  const sample = { bytes: [...source.subarray(3, 17)], mime: 'audio/x-smaf', loop: false };
  audio.request(1, 0);
  audio.flush(2, true);
  assert.deepEqual(events, [sample]);

  audio.request(0x00460000, 16);
  audio.request(1, 0);
  audio.flush(3, true);
  assert.deepEqual(events, [sample]);
  audio.request(1, 0);
  audio.flush(4, false);
  assert.deepEqual(events, [sample, sample]);

  audio.request(0x10001, 16);
  audio.flush(5, false);
  audio.request(0x10001, 16);
  audio.flush(8, true);
  assert.deepEqual(events.at(-1), { ...sample, loop: true });
  assert.equal(events.length, 3);

  audio.request(0, 0);
  audio.flush(9, true);
  audio.request(0, 0);
  audio.flush(10, true);
  assert.deepEqual(events.slice(3), ['stop']);
});
