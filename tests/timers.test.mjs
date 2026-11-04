import test from 'node:test';
import assert from 'node:assert/strict';
import { TimerScheduler } from '../web/engine/timers.js';

test('three GNEX timers retain independent deadlines and accept callback reprogramming', () => {
  const scheduler = new TimerScheduler();
  let states = [
    { channel: 0, delay: 100, repeat: true, revision: 1 },
    { channel: 1, delay: 20, repeat: false, revision: 1 },
    { channel: 2, delay: 50, repeat: true, revision: 1 },
  ];
  scheduler.sync(states, 1000);
  assert.deepEqual([scheduler.next().channel, scheduler.next().at], [1, 1020]);
  states[1] = { ...states[1], delay: null, revision: 2 };
  scheduler.sync(states, 1020, 1);
  assert.deepEqual([scheduler.next().channel, scheduler.next().at], [2, 1050]);
  // A key event does not restart untouched timers.
  scheduler.sync(states, 1030);
  assert.equal(scheduler.next().at, 1050);
  // The timer callback changes its own repeat interval and enables timer 1 again.
  states[2] = { ...states[2], delay: 40, revision: 2 };
  states[1] = { ...states[1], delay: 15, revision: 3 };
  scheduler.sync(states, 1050, 2);
  assert.deepEqual([scheduler.next().channel, scheduler.next().at], [1, 1065]);
  assert.equal(scheduler.deadlines.get(0).at, 1100);
  assert.equal(scheduler.deadlines.get(2).at, 1090);
  scheduler.shift(5000);
  assert.equal(scheduler.next().at, 6065);
  scheduler.sync([], 6100);
  assert.equal(scheduler.next(), null);
});
