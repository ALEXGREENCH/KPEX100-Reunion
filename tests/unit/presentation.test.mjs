import test from 'node:test';
import assert from 'node:assert/strict';
import { automaticDevice, deviceFor, fitFrame, devices } from '../../web/presentation.js';

test('photographic devices follow explicit provenance, never framebuffer dimensions', () => {
  const expected = {
    'galaga-lg-sd1000': 'sd1000',
    'fortress-tournament-lg-sd1000': 'sd1000',
    'bubble-bobble-lg-sd1020': 'sd1020',
    'vocabulary-quiz-lg-sv130': 'sv130',
    'shrek-2-lg-sd810': 'sd810',
  };
  for (const [id, device] of Object.entries(expected))
    assert.equal(automaticDevice({ kind: 'game', platform: 'mobile', id }), device);
  assert.equal(
    automaticDevice({ kind: 'game', platform: 'mobile', id: 'unknown', width: 128, height: 128 }),
    'gnex',
  );
  for (const id of ['cenix-1.00', 'cenix-2.21'])
    assert.equal(automaticDevice({ kind: 'firmware', rom: { id } }), 'cenix');
  assert.equal(automaticDevice({ kind: 'firmware', rom: { id: 'kingston-2.12' } }), 'kingston');
  assert.equal(automaticDevice({ kind: 'game', platform: 'kpex', id: 'hellfire' }), 'kingston');
});

test('manual skin selection is cosmetic and leaves the session untouched', () => {
  const session = Object.freeze({ kind: 'game', id: 'hellfire', platform: 'kpex', sessionId: 12 });
  for (const skin of devices) assert.equal(deviceFor(session, skin.id).id, skin.id);
  assert.equal(deviceFor(session, 'missing').id, 'kingston');
  assert.equal(session.sessionId, 12);
});

test('frame fitting preserves square pixels and bounds at every supported shape', () => {
  for (const [width, height] of [
    [220, 176],
    [128, 128],
    [128, 160],
    [176, 204],
    [176, 220],
    [240, 320],
    [320, 240],
  ]) {
    for (const [bw, bh] of [
      [440, 352],
      [342, 273.6],
      [170, 136],
    ]) {
      const fitted = fitFrame(width, height, bw, bh);
      assert.ok(fitted.width <= bw + 1e-8 && fitted.height <= bh + 1e-8);
      assert.ok(Math.abs(fitted.width / fitted.height - width / height) < 1e-8);
      if (width <= bw && height <= bh) assert.equal(fitted.width % width, 0);
    }
  }
});
