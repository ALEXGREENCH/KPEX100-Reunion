import {
  actions,
  defaults,
  restoreBindings,
  activeBindings,
  actionForToken,
  assignBinding,
  removeBinding,
  keyboardTokens,
  tokenLabel,
  gamepadTokens,
} from './input-bindings.js';

/** Keyboard, mouse and Gamepad API inputs share the same per-source release rules. */
export function createInputControls({ getSession, sendKey, togglePause, unlock, releaseAll }) {
  const $ = (id) => document.getElementById(id);
  let state = restoreBindings(null),
    capture = null,
    pendingConflict = null;
  try {
    state = restoreBindings(JSON.parse(localStorage.getItem('reunion-bindings')));
  } catch {
    /* optional preference */
  }
  const keyboard = new Map(),
    mouse = new Map(),
    pads = new Map();
  const wheels = new Map();
  const profile = () => (getSession()?.platform === 'mobile' ? 'phone' : 'player');
  const bindings = () =>
    activeBindings(state, profile(), getSession()?.kind === 'game' ? getSession().id : null);
  const scope = () => ({
    profile: $('bindingProfile').value,
    gameId: $('bindingGame').checked && getSession()?.kind === 'game' ? getSession().id : null,
  });
  function emit(action, pressed, source, repeat = false) {
    if (action === 'pause') {
      if (pressed && !repeat) togglePause();
    } else sendKey(action, pressed, source, repeat);
  }
  function release() {
    for (const [code, action] of keyboard) emit(action, false, 'keyboard:' + code);
    keyboard.clear();
    for (const [button, action] of mouse) emit(action, false, 'mouse:' + button);
    mouse.clear();
    for (const [index, pad] of pads) {
      for (const [token, action] of pad.active) emit(action, false, `gamepad:${index}:${token}`);
      pad.active.clear();
    }
    for (const [token, pulse] of wheels) {
      clearTimeout(pulse.timer);
      emit(pulse.action, false, token);
    }
    wheels.clear();
  }
  function save() {
    try {
      localStorage.setItem('reunion-bindings', JSON.stringify(state));
    } catch {
      /* remains usable for this session */
    }
    refreshHints();
  }
  function refreshHints() {
    const map = bindings();
    for (const button of document.querySelectorAll('#controls [data-key]')) {
      const labels = (map[button.dataset.key] || []).map(tokenLabel);
      button.title = labels.length ? labels.join(' / ') : 'Назначение: меню → Управление';
      button.setAttribute(
        'aria-label',
        button.textContent + (labels.length ? ' · ' + labels.join(', ') : ''),
      );
    }
    $('keyboardHelp').textContent =
      'Выберите действие и назначьте кнопку. «+» добавляет альтернативу. Нажатия разных устройств можно сочетать.';
  }
  function endCapture() {
    capture = null;
    pendingConflict = null;
    $('bindingCapture').hidden = true;
    $('bindingConflict').hidden = true;
  }
  function commit(token) {
    const { profile, gameId, action, append, replaceToken } = capture;
    releaseAll();
    if (replaceToken) removeBinding(state, profile, gameId, action, replaceToken);
    assignBinding(state, profile, gameId, action, token, append);
    endCapture();
    save();
    render();
  }
  function accept(token) {
    const map = activeBindings(state, capture.profile, capture.gameId),
      other = actionForToken(map, token);
    if (other && other !== capture.action) {
      pendingConflict = token;
      $('bindingConflictText').textContent =
        `${tokenLabel(token)} уже назначено: ${actions.find(([id]) => id === other)?.[1] || other}. Перенести назначение?`;
      $('bindingConflict').hidden = false;
      return;
    }
    commit(token);
  }
  function begin(action, append, replaceToken = null) {
    releaseAll();
    capture = { ...scope(), action, append, replaceToken };
    pendingConflict = null;
    $('bindingCapture').hidden = false;
    $('bindingConflict').hidden = true;
    $('captureTitle').textContent = actions.find(([id]) => id === action)[1];
    $('capturePad').focus({ preventScroll: true });
  }
  function render() {
    const { profile: kind, gameId } = scope(),
      map = activeBindings(state, kind, gameId);
    const fragment = document.createDocumentFragment();
    for (const [id, label] of actions.filter(([id]) => Object.hasOwn(defaults[kind], id))) {
      const row = document.createElement('div');
      row.className = 'binding-row';
      const name = document.createElement('span');
      name.className = 'binding-action';
      name.textContent = label;
      const list = document.createElement('div');
      list.className = 'binding-tokens';
      for (const token of map[id] || []) {
        const chip = document.createElement('span');
        chip.className = 'binding-chip';
        const change = document.createElement('button');
        change.textContent = tokenLabel(token);
        change.title = 'Изменить это назначение';
        change.addEventListener('click', () => begin(id, true, token));
        const remove = document.createElement('button');
        remove.textContent = '×';
        remove.setAttribute('aria-label', `Удалить ${tokenLabel(token)} для ${label}`);
        remove.addEventListener('click', () => {
          releaseAll();
          removeBinding(state, kind, gameId, id, token);
          save();
          render();
        });
        chip.append(change, remove);
        list.append(chip);
      }
      const add = document.createElement('button');
      add.textContent = '+';
      add.setAttribute('aria-label', 'Добавить назначение: ' + label);
      add.addEventListener('click', () => begin(id, true));
      const replace = document.createElement('button');
      replace.textContent = 'Заменить';
      replace.title = 'Заменить все назначения этого действия';
      replace.addEventListener('click', () => begin(id, false));
      const controls = document.createElement('div');
      controls.className = 'binding-actions';
      controls.append(add, replace);
      row.append(name, list, controls);
      fragment.append(row);
    }
    $('bindingList').replaceChildren(fragment);
  }
  function refresh() {
    endCapture();
    $('bindingProfile').value = profile();
    $('bindingGame').checked = false;
    $('bindingGame').disabled = getSession()?.kind !== 'game';
    render();
    refreshHints();
  }
  for (const id of ['bindingProfile', 'bindingGame'])
    $(id).addEventListener('change', () => {
      releaseAll();
      endCapture();
      if ($('bindingProfile').value !== profile()) {
        $('bindingGame').checked = false;
        $('bindingGame').disabled = true;
      } else $('bindingGame').disabled = getSession()?.kind !== 'game';
      render();
    });
  $('bindingReset').addEventListener('click', () => {
    releaseAll();
    const s = scope();
    if (s.gameId) delete state.games[s.gameId];
    else state.profiles[s.profile] = {};
    endCapture();
    save();
    render();
  });
  $('captureCancel').addEventListener('click', endCapture);
  $('conflictConfirm').addEventListener('click', () => {
    if (capture && pendingConflict) commit(pendingConflict);
  });
  $('conflictCancel').addEventListener('click', endCapture);
  $('help').addEventListener('close', endCapture);
  document.addEventListener(
    'keydown',
    (event) => {
      if (capture) {
        if (event.code === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          endCapture();
          return;
        }
        if (
          pendingConflict ||
          event.repeat ||
          (event.ctrlKey && !event.code.startsWith('Control')) ||
          (event.altKey && !event.code.startsWith('Alt')) ||
          (event.metaKey && !event.code.startsWith('Meta'))
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        accept(keyboardTokens(event)[0]);
        return;
      }
      if (
        !getSession() ||
        document.querySelector('dialog[open]') ||
        (event.ctrlKey && !event.code.startsWith('Control')) ||
        (event.altKey && !event.code.startsWith('Alt')) ||
        (event.metaKey && !event.code.startsWith('Meta')) ||
        event.target.closest('input,select,textarea,[contenteditable=true]')
      )
        return;
      if (['Enter', 'Space'].includes(event.code) && event.target.closest('button,a,summary'))
        return;
      if (event.code === 'Tab' && (event.target !== $('screen') || event.shiftKey)) return;
      const action = keyboardTokens(event)
        .map((token) => actionForToken(bindings(), token))
        .find(Boolean);
      if (!action) return;
      event.preventDefault();
      unlock();
      keyboard.set(event.code, action);
      if (!event.repeat || ['up', 'down', 'left', 'right'].includes(action))
        emit(action, true, 'keyboard:' + event.code, event.repeat);
    },
    true,
  );
  document.addEventListener(
    'keyup',
    (event) => {
      const action = keyboard.get(event.code);
      keyboard.delete(event.code);
      if (action) {
        event.preventDefault();
        emit(action, false, 'keyboard:' + event.code);
      }
    },
    true,
  );
  const onLcd = (event) =>
    Boolean(event.target.closest('#lcdWindow')) && !event.target.closest('button');
  document.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') return;
    if (capture && event.target.closest('#capturePad')) {
      event.preventDefault();
      if (!pendingConflict) accept('mouse:' + event.button);
      return;
    }
    if (!getSession() || document.querySelector('dialog[open]') || !onLcd(event)) return;
    const action = actionForToken(bindings(), 'mouse:' + event.button);
    if (!action) return;
    event.preventDefault();
    unlock();
    mouse.set(event.button, action);
    $('screen').focus({ preventScroll: true });
    emit(action, true, 'mouse:' + event.button);
  });
  document.addEventListener('pointerup', (event) => {
    const action = mouse.get(event.button);
    mouse.delete(event.button);
    if (action) emit(action, false, 'mouse:' + event.button);
  });
  document.addEventListener('pointercancel', () => {
    for (const [button, action] of mouse) emit(action, false, 'mouse:' + button);
    mouse.clear();
  });
  document.addEventListener('contextmenu', (event) => {
    if (
      (capture && event.target.closest('#capturePad')) ||
      (onLcd(event) && actionForToken(bindings(), 'mouse:2'))
    )
      event.preventDefault();
  });
  document.addEventListener(
    'wheel',
    (event) => {
      const token = event.deltaY < 0 ? 'wheel:up' : 'wheel:down';
      if (!event.deltaY) return;
      if (capture && event.target.closest('#capturePad')) {
        event.preventDefault();
        if (!pendingConflict) accept(token);
        return;
      }
      if (!getSession() || document.querySelector('dialog[open]') || !onLcd(event)) return;
      const action = actionForToken(bindings(), token);
      if (!action) return;
      event.preventDefault();
      unlock();
      const previous = wheels.get(token);
      if (previous) clearTimeout(previous.timer);
      else emit(action, true, token);
      wheels.set(token, {
        action,
        timer: setTimeout(() => {
          wheels.delete(token);
          emit(action, false, token);
        }, 60),
      });
    },
    { passive: false },
  );
  function poll() {
    const seen = new Set();
    let connected = [];
    try {
      connected = [...(navigator.getGamepads?.() || [])].filter(Boolean);
    } catch {
      /* not available in every browser */
    }
    for (const pad of connected) {
      seen.add(pad.index);
      let record = pads.get(pad.index);
      if (!record) {
        record = { previous: new Set(), active: new Map() };
        pads.set(pad.index, record);
      }
      const tokens = gamepadTokens(pad, record.previous);
      for (const [token, action] of record.active)
        if (
          !tokens.has(token) ||
          document.hidden ||
          document.querySelector('dialog[open]') ||
          !getSession()
        ) {
          emit(action, false, `gamepad:${pad.index}:${token}`);
          record.active.delete(token);
        }
      for (const token of tokens)
        if (!record.previous.has(token)) {
          if (capture) {
            if (!pendingConflict) accept(token);
            break;
          }
          if (document.hidden || document.querySelector('dialog[open]') || !getSession()) continue;
          const action = actionForToken(bindings(), token);
          if (action) {
            unlock();
            record.active.set(token, action);
            emit(action, true, `gamepad:${pad.index}:${token}`);
          }
        }
      record.previous = tokens;
    }
    for (const [index, record] of pads)
      if (!seen.has(index)) {
        for (const [token, action] of record.active)
          emit(action, false, `gamepad:${index}:${token}`);
        pads.delete(index);
      }
    if ($('help').open)
      $('gamepadStatus').textContent = connected.length
        ? 'Подключено: ' + connected.map((p) => p.id).join(', ')
        : 'Геймпад: нажмите любую кнопку на подключённом устройстве.';
    requestAnimationFrame(poll);
  }
  requestAnimationFrame(poll);
  refreshHints();
  return { release, refresh, refreshHints };
}
