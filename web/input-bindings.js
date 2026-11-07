/** Persistent digital input bindings; input devices never alter the emulated VM profile. */
export const actions = [
  ['up', 'Вверх'],
  ['down', 'Вниз'],
  ['left', 'Влево'],
  ['right', 'Вправо'],
  ['a', 'OK / SELECT'],
  ['b', 'ESC'],
  ['menu', 'MENU'],
  ['start', 'PLAY / ENTER'],
  ['mode', 'MODE'],
  ['rec', 'REC'],
  ['f1', 'F1 / Меню'],
  ['f2', 'F2 / Назад'],
  ['clear', 'CLR'],
  ['send', 'Вызов'],
  ['end', 'Отбой'],
  ...Array.from({ length: 10 }, (_, i) => ['digit' + i, String(i)]),
  ['star', '*'],
  ['hash', '#'],
  ['pause', 'Пауза'],
];
const names = new Set(actions.map(([id]) => id));
const directions = {
  up: ['key:ArrowUp', 'pad:b12', 'pad:a1-'],
  down: ['key:ArrowDown', 'pad:b13', 'pad:a1+'],
  left: ['key:ArrowLeft', 'pad:b14', 'pad:a0-'],
  right: ['key:ArrowRight', 'pad:b15', 'pad:a0+'],
};
export const defaults = {
  player: {
    ...directions,
    a: ['key:KeyZ', 'pad:b0'],
    b: ['key:KeyX', 'key:Escape', 'pad:b1'],
    menu: ['key:Tab', 'pad:b8'],
    start: ['key:Enter', 'pad:b9'],
    mode: ['key:KeyC', 'pad:b4'],
    rec: ['key:KeyV', 'pad:b5'],
    pause: ['key:Space'],
  },
  phone: {
    ...directions,
    a: ['key:KeyZ', 'pad:b0'],
    clear: ['key:KeyX', 'key:Escape', 'key:Backspace', 'pad:b1'],
    f1: ['key:KeyQ', 'key:Tab', 'pad:b2'],
    f2: ['key:KeyE', 'pad:b3'],
    send: ['pad:b4'],
    end: ['pad:b5'],
    start: ['key:Enter', 'pad:b9'],
    star: ['char:*', 'key:NumpadMultiply', 'pad:b6'],
    hash: ['char:#', 'pad:b7'],
    ...Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => ['digit' + i, ['key:Digit' + i, 'key:Numpad' + i]]),
    ),
    pause: ['key:Space'],
  },
};
// Host alternatives stay here so every source shares the normal held-action
// accounting, and user profile/game overrides retain priority.
const gameDefaults = {
  // This WI-TOP build uses 1/7/4/5/3 for navigation.
  'hellfire-witop-v1': {
    profile: 'phone',
    bindings: {
      digit1: [...defaults.phone.digit1, ...directions.up],
      digit7: [...defaults.phone.digit7, ...directions.down],
      digit4: [...defaults.phone.digit4, ...directions.left],
      digit5: [...defaults.phone.digit5, ...directions.right],
      digit3: [...defaults.phone.digit3, ...defaults.phone.a],
    },
  },
  'sketcher-myracer': {
    profile: 'phone',
    bindings: { send: [...defaults.phone.send, 'key:KeyA'] },
  },
};
export const validToken = (token) =>
  typeof token === 'string' &&
  /^(?:key:[A-Za-z][A-Za-z0-9]{0,31}|char:[*#]|mouse:[0-4]|wheel:(?:up|down)|pad:(?:b(?:[0-9]|[1-9][0-9])|a(?:[0-9]|[1-2][0-9]|3[01])[-+]))$/.test(
    token,
  );
function clean(bindings) {
  return Object.fromEntries(
    Object.entries(bindings || {})
      .filter(([id, tokens]) => names.has(id) && Array.isArray(tokens))
      .map(([id, tokens]) => [id, [...new Set(tokens.filter(validToken))].slice(0, 32)]),
  );
}
export function restoreBindings(raw) {
  const state = { schema: 1, profiles: { player: {}, phone: {} }, games: {} };
  if (!raw || raw.schema !== 1) return state;
  for (const profile of ['player', 'phone'])
    state.profiles[profile] = clean(raw.profiles?.[profile]);
  for (const [id, game] of Object.entries(raw.games || {}))
    if (
      /^[\w.-]{1,160}$/.test(id) &&
      !['__proto__', 'constructor', 'prototype'].includes(id) &&
      ['player', 'phone'].includes(game?.profile)
    )
      state.games[id] = { profile: game.profile, bindings: clean(game.bindings) };
  return state;
}
export function activeBindings(state, profile, gameId = null) {
  const game = Object.hasOwn(state.games, gameId) ? state.games[gameId] : null;
  const preset = Object.hasOwn(gameDefaults, gameId) ? gameDefaults[gameId] : null;
  const result = Object.fromEntries(
    Object.entries(defaults[profile]).map(([id, tokens]) => [id, [...tokens]]),
  );
  for (const overrides of [
    preset?.profile === profile ? preset.bindings : {},
    state.profiles[profile],
    game?.profile === profile ? game.bindings : {},
  ])
    for (const [id, tokens] of Object.entries(overrides)) {
      if (!Object.hasOwn(result, id)) continue;
      for (const other of Object.keys(result))
        if (other !== id) result[other] = result[other].filter((token) => !tokens.includes(token));
      result[id] = [...tokens];
    }
  return result;
}
export function actionForToken(bindings, token) {
  return Object.entries(bindings).find(([, tokens]) => tokens.includes(token))?.[0] || null;
}
export function assignBinding(state, profile, gameId, action, token, append = false) {
  if (!Object.hasOwn(defaults[profile], action) || !validToken(token))
    throw Error('Invalid input binding');
  const current = activeBindings(state, profile, gameId);
  const target = gameId
    ? (state.games[gameId] ??= { profile, bindings: {} }).bindings
    : state.profiles[profile];
  for (const [other, tokens] of Object.entries(current))
    if (other !== action && tokens.includes(token))
      target[other] = tokens.filter((x) => x !== token);
  target[action] = append ? [...new Set([...(current[action] || []), token])] : [token];
}
export function removeBinding(state, profile, gameId, action, token) {
  const current = activeBindings(state, profile, gameId);
  const target = gameId
    ? (state.games[gameId] ??= { profile, bindings: {} }).bindings
    : state.profiles[profile];
  target[action] = (current[action] || []).filter((x) => x !== token);
}
export function keyboardTokens(event) {
  return [...(['*', '#'].includes(event.key) ? ['char:' + event.key] : []), 'key:' + event.code];
}
export function tokenLabel(token) {
  if (token.startsWith('char:')) return token.slice(5);
  if (token.startsWith('key:'))
    return token
      .slice(4)
      .replace(/^Key/, '')
      .replace(/^Digit/, '')
      .replace(/^Numpad/, 'Num ')
      .replace('Arrow', '')
      .replace('Space', 'Пробел');
  if (token.startsWith('mouse:'))
    return ['Мышь: левая', 'Мышь: средняя', 'Мышь: правая', 'Мышь: назад', 'Мышь: вперёд'][
      Number(token.slice(6))
    ];
  if (token.startsWith('wheel:')) return token.endsWith('up') ? 'Колесо ↑' : 'Колесо ↓';
  if (token.startsWith('pad:b')) return 'Геймпад: ' + (Number(token.slice(5)) + 1);
  const m = /^pad:a(\d+)([-+])$/.exec(token);
  return m ? 'Ось ' + (Number(m[1]) + 1) + ' ' + m[2] : token;
}
export function gamepadTokens(pad, previous = new Set()) {
  const tokens = new Set();
  for (let i = 0; i < Math.min(100, pad.buttons.length); i++) {
    const token = 'pad:b' + i,
      button = pad.buttons[i];
    if (button.pressed || button.value >= (previous.has(token) ? 0.35 : 0.6)) tokens.add(token);
  }
  for (let i = 0; i < Math.min(32, pad.axes.length); i++)
    for (const [sign, direction] of [
      [-1, '-'],
      [1, '+'],
    ]) {
      const token = 'pad:a' + i + direction;
      if (pad.axes[i] * sign >= (previous.has(token) ? 0.35 : 0.65)) tokens.add(token);
    }
  return tokens;
}
