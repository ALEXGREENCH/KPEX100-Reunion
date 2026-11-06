import test from 'node:test';
import assert from 'node:assert/strict';
import {
  restoreBindings,
  activeBindings,
  assignBinding,
  removeBinding,
  actionForToken,
  gamepadTokens,
  keyboardTokens,
  validToken,
} from '../../web/input-bindings.js';

test('alternatives coexist, replacing and conflicts affect only the selected scope', () => {
  const state = restoreBindings(null);
  assignBinding(state, 'player', null, 'a', 'key:KeyF', true);
  assert.deepEqual(activeBindings(state, 'player').a, ['key:KeyZ', 'pad:b0', 'key:KeyF']);
  assignBinding(state, 'player', 'battle-armor', 'a', 'mouse:0');
  assert.deepEqual(activeBindings(state, 'player', 'battle-armor').a, ['mouse:0']);
  assert.equal(actionForToken(activeBindings(state, 'player', 'hellfire'), 'key:KeyF'), 'a');
  assignBinding(state, 'player', 'battle-armor', 'b', 'key:ArrowUp', true);
  const game = activeBindings(state, 'player', 'battle-armor');
  assert.equal(actionForToken(game, 'key:ArrowUp'), 'b');
  assert.ok(!game.up.includes('key:ArrowUp'));
  assert.ok(activeBindings(state, 'player').up.includes('key:ArrowUp'));
  removeBinding(state, 'player', 'battle-armor', 'a', 'mouse:0');
  assert.deepEqual(activeBindings(state, 'player', 'battle-armor').a, []);
  assert.deepEqual(restoreBindings(JSON.parse(JSON.stringify(state))), state);
  delete state.games['battle-armor'];
  assert.ok(activeBindings(state, 'player', 'battle-armor').a.includes('key:KeyF'));
  state.profiles.player = {};
  assert.equal(actionForToken(activeBindings(state, 'player'), 'key:KeyF'), null);
  assert.deepEqual(activeBindings(state, 'phone').a, ['key:KeyZ', 'pad:b0']);
});

test('stored preferences reject invalid actions, device tokens and prototype game ids', () => {
  const state = restoreBindings(
    JSON.parse(
      '{"schema":1,"profiles":{"player":{"a":["mouse:0","mouse:0","pad:b99","pad:b100",null],"bogus":["key:KeyA"]}},"games":{"__proto__":{"profile":"player","bindings":{}},"ok":{"profile":"wrong"}}}',
    ),
  );
  assert.deepEqual(state.profiles.player, { a: ['mouse:0', 'pad:b99'] });
  assert.deepEqual(state.games, {});
  assert.equal(validToken('pad:a31-'), true);
  assert.equal(validToken('pad:a32-'), false);
  assert.throws(() => assignBinding(state, 'phone', null, 'rec', 'key:KeyR'));
  assert.deepEqual(keyboardTokens({ key: '#', code: 'Digit3' }), ['char:#', 'key:Digit3']);
});

test('gamepad axes and analog buttons use separate engage and release thresholds', () => {
  const pad = { buttons: [{ pressed: false, value: 0.61 }], axes: [0.7, -0.7] };
  const held = gamepadTokens(pad);
  assert.deepEqual([...held], ['pad:b0', 'pad:a0+', 'pad:a1-']);
  pad.buttons[0].value = 0.4;
  pad.axes = [0.4, -0.4];
  assert.equal(gamepadTokens(pad).size, 0);
  assert.deepEqual(gamepadTokens(pad, held), held);
  pad.buttons[0].value = 0.34;
  pad.axes = [0.34, -0.34];
  assert.equal(gamepadTokens(pad, held).size, 0);
});

test('a game override owns its token even after a later global profile edit', () => {
  const state = restoreBindings(null);
  assignBinding(state, 'player', 'battle-armor', 'a', 'key:KeyF');
  assignBinding(state, 'player', null, 'b', 'key:KeyF');
  const game = activeBindings(state, 'player', 'battle-armor');
  assert.equal(actionForToken(game, 'key:KeyF'), 'a');
  assert.ok(!game.b.includes('key:KeyF'));
  assert.equal(actionForToken(activeBindings(state, 'player'), 'key:KeyF'), 'b');
});

test('WI-TOP alternatives are scoped to its phone build and user overrides take priority', () => {
  const state = restoreBindings(null),
    id = 'hellfire-witop-v1';
  const game = activeBindings(state, 'phone', id);
  for (const [token, action] of [
    ['key:ArrowUp', 'digit1'],
    ['pad:a1-', 'digit1'],
    ['key:ArrowDown', 'digit7'],
    ['pad:b13', 'digit7'],
    ['key:ArrowLeft', 'digit4'],
    ['pad:a0-', 'digit4'],
    ['key:ArrowRight', 'digit5'],
    ['pad:b15', 'digit5'],
    ['key:KeyZ', 'digit3'],
    ['pad:b0', 'digit3'],
  ])
    assert.equal(actionForToken(game, token), action);
  assert.ok(game.digit1.includes('key:Digit1'));
  assert.ok(game.digit3.includes('key:Numpad3'));
  for (const [profile, other] of [
    ['phone', 'hellfire'],
    ['player', id],
    ['phone', '__proto__'],
  ]) {
    const bindings = activeBindings(state, profile, other);
    assert.equal(actionForToken(bindings, 'key:ArrowUp'), 'up');
    assert.equal(actionForToken(bindings, 'pad:b0'), 'a');
  }
  assert.deepEqual(state, restoreBindings(null), 'presets do not write user preferences');
  assignBinding(state, 'phone', null, 'digit9', 'key:ArrowUp');
  assert.equal(actionForToken(activeBindings(state, 'phone', id), 'key:ArrowUp'), 'digit9');
  assignBinding(state, 'phone', id, 'digit1', 'key:ArrowUp');
  assert.equal(actionForToken(activeBindings(state, 'phone', id), 'key:ArrowUp'), 'digit1');
  removeBinding(state, 'phone', id, 'digit3', 'pad:b0');
  assert.equal(actionForToken(activeBindings(state, 'phone', id), 'pad:b0'), null);
  const restored = restoreBindings(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(activeBindings(restored, 'phone', id), activeBindings(state, 'phone', id));
});
