import { SmafDecoder } from './smaf-decoder.js';
import { SWERVE, MAX_ASSET_BYTES, assetCatalog, identifyAsset, sha256 } from './local-assets.js';
import { libraryEntries, libraryCounts } from './library.js';

const $ = (id) => document.getElementById(id);
const ui = Object.fromEntries(
  [...document.querySelectorAll('[id]')].map((node) => [node.id, node]),
);
const number = new Intl.NumberFormat('ru-RU');
const canvas = $('screen');
const context = canvas.getContext('2d', { alpha: false });
context.imageSmoothingEnabled = false;

let catalog = { firmwares: [], games: [], states: [] };
let libraryTab = 'games';
let swerve = { ...SWERVE, available: false };
let importing = false;
let selectedRom = null;
let current = null;
let worker = null;
let workerReady = false;
let running = false;
let machineOff = false;
let hasFrame = false;
let frameCount = 0;
let pendingCommand = null;
let toastTimer = 0;
let loadSequence = 0;
let sessionCounter = 0;
let soundEnabled = true;
let warnedMemorySaves = false;
const uploads = new Set();
const held = new Map();
const logs = [];
const memorySaves = new Map();
let storage = null;
const storageReady = import('./storage.js')
  .then((module) => {
    storage = module;
  })
  .catch(() => {
    storage = {
      loadSave: async (id) => memorySaves.get(id),
      saveGame: async (id, data) => memorySaves.set(id, data),
      listAssets: async () => [],
      storeAsset: async () => false,
    };
    log('Постоянные сохранения недоступны. Сохранения этой сессии останутся до закрытия вкладки.');
  });

function log(message, error = false) {
  const text = String(message);
  if (logs.at(-1)?.message === text) return;
  logs.push({ message: text, error, at: new Date() });
  if (logs.length > 80) logs.shift();
  $('logCount').textContent = String(logs.length);
  const fragment = document.createDocumentFragment();
  for (const entry of [...logs].reverse()) {
    const item = document.createElement('li');
    item.className = entry.error ? 'log-error' : '';
    const time = document.createElement('time');
    time.textContent = entry.at.toLocaleTimeString('ru-RU');
    item.append(time, document.createTextNode(entry.message));
    fragment.append(item);
  }
  $('log').replaceChildren(fragment);
}

function toast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => {
    $('toast').hidden = true;
  }, 3500);
}

function fail(message, title = 'Исполнение остановлено') {
  running = false;
  $('errorTitle').textContent = title;
  $('errorText').textContent = String(message);
  $('errorBanner').hidden = false;
  if (!hasFrame) {
    $('emptyTitle').textContent = 'Запуск остановлен';
    $('emptyHint').textContent = 'Подробности под экраном';
  }
  setStatus('Остановлено', 'error');
  log(message, true);
  audio.pause();
  updateTransport();
}

function setStatus(text, kind = '') {
  $('runStatus').textContent = text;
  $('runStatus').className = `state-badge ${kind}`;
  $('deviceLed').classList.toggle('on', kind === 'running');
}

function updateTransport() {
  $('playPause').disabled = !current || !workerReady || machineOff;
  $('reset').disabled = !current || !workerReady;
  $('step').disabled = !current || !workerReady || running || machineOff;
  $('playPause').querySelector('span').textContent = running ? 'Пауза' : 'Продолжить';
  $('playPause')
    .querySelector('use')
    .setAttribute('href', running ? '#i-pause' : '#i-play');
  $('playPause').title = running ? 'Пауза · Space' : 'Продолжить · Space';
  $('bootFirmware').disabled = !selectedRom?.available;
  document.querySelectorAll('[data-key]').forEach((button) => {
    button.disabled = !current || !workerReady || machineOff;
  });
}

function post(message) {
  if (!worker) {
    fail('Ядро эмулятора недоступно. Обновите страницу.');
    return;
  }
  worker.postMessage({ ...message, sessionId: message.sessionId ?? current?.sessionId ?? null });
}

function sourceText(details) {
  return details.kind === 'game'
    ? (details.applicationType === 'sample' ? 'Учебный пример · ' : '') +
        (details.platform === 'mobile'
          ? 'GNEX · телефонный профиль'
          : 'Оригинальный GNEX · Kingston 2.12') +
        (details.research ? ' · совместимость исследуется' : '')
    : details.checkpoint
      ? `${details.rom.title} · сохранённый запуск устройства`
      : `${details.rom.title} · холодный старт ARM`;
}

function beginSession(details, command) {
  releaseAll();
  audio.stop();
  current = { ...details, sessionId: ++sessionCounter };
  command = { ...command, sessionId: current.sessionId };
  running = false;
  machineOff = false;
  frameCount = 0;
  hasFrame = false;
  $('errorBanner').hidden = true;
  $('screenEmpty').hidden = false;
  $('emptyTitle').textContent = 'Загружаем оригинальный код';
  $('emptyHint').textContent = details.title;
  context.fillStyle = '#000';
  context.fillRect(0, 0, canvas.width, canvas.height);
  $('screenshot').disabled = true;
  $('nowPlaying').textContent = details.title;
  $('modeLabel').textContent =
    details.kind === 'game'
      ? details.applicationType === 'sample'
        ? 'ПРИМЕР SGS'
        : 'ИГРА SGS'
      : 'РОДНАЯ ПРОШИВКА';
  $('phoneKeys').hidden = details.platform !== 'mobile';
  $('sourceLabel').textContent = sourceText(details);
  $('gameHint').textContent = details.startHint || '';
  $('gameHint').hidden = !details.startHint;
  $('diagMode').textContent = details.kind === 'game' ? 'GNEX / ARM' : 'Полная прошивка';
  $('diagRom').textContent = details.rom.title;
  $('diagInstructions').textContent = '0';
  $('diagEvents').textContent = '0';
  $('frameCounter').textContent = '0 кадров';
  setStatus('Загрузка');
  if (workerReady) post(command);
  else pendingCommand = command;
  updateTransport();
  renderLibrary();
  canvas.focus({ preventScroll: true });
  log(`Загрузка: ${details.title}`);
}

async function loadGame(game) {
  if (!game.available) {
    toast(`Добавьте свой файл ${game.title}.`);
    $('assetFile').click();
    return;
  }
  audio.unlock();
  const sequence = ++loadSequence;
  const rom =
    catalog.firmwares.find((item) => item.id === 'kingston-2.12') ||
    catalog.firmwares.find((item) => /kingston.*2[._ -]?12/i.test(`${item.title} ${item.id}`));
  if (!rom?.available) {
    toast('Для SGS добавьте оригинальный ROM Kingston 2.12.');
    $('assetFile').click();
    return;
  }
  if (game.format === 36 && !swerve.available) {
    toast('Для этой 3D-игры добавьте оригинальный swv21brew.mod (Swerve 2.1).');
    $('assetFile').click();
    return;
  }
  await storageReady;
  let saveData;
  try {
    saveData = await storage.loadSave(game.id);
  } catch (error) {
    log(`Не удалось прочитать сохранение: ${error.message}`, true);
  }
  if (sequence !== loadSequence) return;
  beginSession(
    {
      kind: 'game',
      id: game.id,
      title: game.title,
      rom,
      platform: game.platform,
      applicationType: game.applicationType,
      research:
        game.applicationType !== 'sample' &&
        !['verified', 'playable', 'utility'].includes(game.compatibility),
      startHint: game.startHint,
    },
    {
      type: 'loadGame',
      romUrl: rom.url,
      romTitle: rom.title,
      gameUrl: game.url,
      gameTitle: game.title,
      gameId: game.id,
      runtime: game.runtime,
      swerveUrl: game.format === 36 ? swerve.url : undefined,
      saveData,
    },
  );
}

function bootFirmware() {
  if (!selectedRom?.available) return;
  ++loadSequence;
  audio.unlock();
  beginSession(
    { kind: 'firmware', id: selectedRom.id, title: selectedRom.title, rom: selectedRom },
    {
      type: 'boot',
      romUrl: selectedRom.url,
      romTitle: selectedRom.title,
      diskGames: catalog.games.filter((game) => game.available),
    },
  );
}

function loadCheckpoint(state) {
  ++loadSequence;
  audio.unlock();
  const rom = catalog.firmwares.find((item) => item.id === state.romId);
  if (!state.available || !rom?.available) {
    toast('Добавьте состояние и его оригинальный ROM Kingston 2.12.');
    return;
  }
  beginSession(
    { kind: 'firmware', id: state.id, title: state.title, rom, checkpoint: true },
    {
      type: 'loadState',
      romUrl: rom.url,
      romTitle: rom.title,
      stateUrl: state.url,
      title: state.title,
    },
  );
}

function chooseRom(rom) {
  if (!rom?.available) {
    toast(`Добавьте свой ROM${rom ? ` ${rom.title}` : ''}.`);
    $('assetFile').click();
    return;
  }
  selectedRom = rom;
  $('firmwareSelect').value = rom.id;
  renderLibrary();
  updateTransport();
}

function updateLibraryHint() {
  const entries = libraryEntries(catalog, libraryTab);
  const available = entries.filter((entry) => entry.available).length;
  $('libraryHint').textContent =
    libraryTab !== 'firmwares'
      ? available === entries.length && available > 0
        ? libraryTab === 'samples'
          ? 'Учебные примеры · Mobile C / GNEX'
          : 'Оригинальные SGS · GNEX'
        : `Доступно ${available} из ${entries.length} · добавьте свои файлы`
      : available > 0
        ? 'Выберите ROM для холодного старта'
        : 'Добавьте ROM для запуска прошивки';
}

function renderLibrary() {
  updateLibraryHint();
  const query = $('librarySearch').value.trim().toLocaleLowerCase();
  const appTab = libraryTab !== 'firmwares';
  const entries = libraryEntries(catalog, libraryTab).filter((item) =>
    `${item.title} ${item.id}`.toLocaleLowerCase().includes(query),
  );
  const fragment = document.createDocumentFragment();
  for (const entry of entries) {
    const button = document.createElement('button');
    const active = appTab
      ? current?.kind === 'game' && current.id === entry.id
      : selectedRom?.id === entry.id;
    button.className = `library-item${active ? ' active' : ''}${entry.available ? '' : ' unavailable'}`;
    button.setAttribute('aria-pressed', String(active));
    button.title = !entry.available
      ? `Добавить свой файл ${entry.title}`
      : appTab
        ? `Запустить ${entry.title}`
        : `Выбрать ${entry.title}`;
    const art = document.createElement('span');
    art.className = 'item-art';
    art.textContent =
      libraryTab === 'firmwares'
        ? 'ROM'
        : entry.title
            .replace(/[^\p{L}\p{N}]/gu, '')
            .slice(0, 2)
            .toUpperCase();
    art.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('span');
    copy.className = 'item-copy';
    const title = document.createElement('span');
    title.className = 'item-title';
    title.textContent = entry.title;
    const subtitle = document.createElement('span');
    subtitle.className = 'item-subtitle';
    const badge = document.createElement('span');
    const sample = entry.applicationType === 'sample';
    if (appTab) {
      const labels = { verified: '● Проверено', playable: '● Играет', utility: '● Приложение' };
      const label = sample ? '● Пример' : labels[entry.compatibility];
      badge.className = label ? 'verified-mark' : 'research-mark';
      badge.textContent = label || '○ Исследование';
      subtitle.append(badge, document.createTextNode(` · ${entry.format || 'SGS'}`));
    } else subtitle.textContent = entry.local ? 'Локальный файл' : 'Оригинальная прошивка';
    if (!entry.available) {
      if (sample) subtitle.replaceChildren(badge, document.createTextNode(' · Добавьте свой файл'));
      else subtitle.textContent = 'Добавьте свой файл';
    }
    const arrow = document.createElement('span');
    arrow.className = 'item-arrow';
    arrow.textContent = !entry.available ? '+' : appTab ? '▷' : active ? '✓' : '→';
    arrow.setAttribute('aria-hidden', 'true');
    copy.append(title, subtitle);
    button.append(art, copy, arrow);
    button.addEventListener('click', () => (appTab ? loadGame(entry) : chooseRom(entry)));
    fragment.append(button);
  }
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-list';
    empty.textContent = query
      ? 'Ничего не найдено. Попробуйте другое название.'
      : 'В коллекции пока нет файлов.';
    fragment.append(empty);
  }
  $('libraryList').replaceChildren(fragment);
}

function populateCatalog() {
  const sgs = catalog.games.filter((entry) => entry.available);
  const roms = catalog.firmwares.filter((entry) => entry.available);
  const gnexReady = roms.some((entry) => entry.id === 'kingston-2.12');
  const counts = libraryCounts(catalog);
  for (const [tab, id] of Object.entries({
    games: 'gamesCount',
    samples: 'samplesCount',
    firmwares: 'romsCount',
  })) {
    const { available, total } = counts[tab];
    $(id).textContent = available === total ? String(total) : `${available} / ${total}`;
  }
  $('collectionCount').textContent = String(sgs.length + roms.length);
  $('setupHint').hidden = gnexReady && sgs.length > 0;
  $('assetStatus').textContent =
    `${sgs.length} SGS · ${roms.length} ROM${swerve.available ? ' · Swerve 2.1' : ''}`;
  if (!current) {
    $('emptyTitle').textContent =
      gnexReady && sgs.length ? 'Готов к возвращению' : 'Добавьте ROM и игры';
    $('emptyHint').textContent =
      gnexReady && sgs.length
        ? 'Откройте игру или пример из библиотеки'
        : 'Kingston 2.12 + ваши SGS';
    $('nowPlaying').textContent =
      gnexReady && sgs.length ? 'Выберите игру или пример' : 'Ваша коллекция — на вашем устройстве';
    $('sourceLabel').textContent =
      gnexReady && sgs.length
        ? 'Оригинальный код. Маленький экран. Большое возвращение.'
        : 'Добавьте свою коллекцию и запустите оригинальный код устройства.';
  }
  $('firmwareSelect').replaceChildren(
    ...roms.map((rom) => {
      const option = document.createElement('option');
      option.value = rom.id;
      option.textContent = rom.title;
      return option;
    }),
  );
  if (!roms.length) {
    const option = document.createElement('option');
    option.textContent = 'Добавьте ROM';
    $('firmwareSelect').append(option);
  }
  $('firmwareSelect').disabled = !roms.length;
  if (!selectedRom?.available)
    selectedRom = roms.find((rom) => rom.id === 'kingston-2.12') || roms[0] || null;
  if (selectedRom) $('firmwareSelect').value = selectedRom.id;
  const states = catalog.states.filter((state) => state.available);
  $('quickStateHint').textContent = states.length
    ? 'Быстрый запуск возвращает игры из снимка накопителя. Для полной коллекции и добавленных игр выберите холодный старт.'
    : 'Быстрый запуск появится после добавления проверенного файла .reunion-state. Поддержка аппаратуры экспериментальная.';
  $('quickStates').replaceChildren(
    ...states.map((state) => {
      const button = document.createElement('button');
      button.className = 'quick-state';
      button.disabled = !roms.some((rom) => rom.id === state.romId);
      button.title = button.disabled
        ? 'Добавьте ROM Kingston 2.12 для этого состояния'
        : state.title;
      button.append(document.createTextNode(state.title));
      const icon = document.createElement('span');
      icon.textContent = '↗';
      button.append(icon);
      button.addEventListener('click', () => loadCheckpoint(state));
      return button;
    }),
  );
  renderLibrary();
  updateTransport();
}

function resizeScreen() {
  const area = $('screenArea');
  const device = area.querySelector('.device');
  const bezel = area.querySelector('.lcd-bezel');
  const padding = (node) => {
    const style = getComputedStyle(node);
    return parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 2;
  };
  const available = area.clientWidth - padding(area) - padding(device) - padding(bezel) - 2;
  // Leave room for transport and physical buttons, while keeping every LCD pixel square.
  const heightScale = Math.max(
    1,
    Math.floor((window.innerHeight - (document.fullscreenElement ? 360 : 500)) / canvas.height),
  );
  const scale = Math.max(1, Math.min(heightScale, Math.floor(available / canvas.width)));
  canvas.style.width = `${canvas.width * scale}px`;
  canvas.style.height = `${canvas.height * scale}px`;
}

function drawFrame(message) {
  const width = Number(message.width) || 220;
  const height = Number(message.height) || 176;
  if (width > 1024 || height > 1024 || width < 1 || height < 1) return;
  let pixels = message.pixels ?? message.data;
  if (pixels instanceof ArrayBuffer) pixels = new Uint8ClampedArray(pixels);
  else if (!(pixels instanceof Uint8ClampedArray)) pixels = new Uint8ClampedArray(pixels);
  if (pixels.length !== width * height * 4) {
    log('Ядро прислало кадр неверного размера.', true);
    return;
  }
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    resizeScreen();
  }
  $('screenDimensions').textContent = `${width} × ${height} · пиксельное масштабирование`;
  canvas.setAttribute('aria-label', `Экран эмулятора, ${width} на ${height} пикселей`);
  context.putImageData(new ImageData(pixels, width, height), 0, 0);
  hasFrame = true;
  frameCount++;
  $('screenEmpty').hidden = true;
  $('screenshot').disabled = false;
  $('frameCounter').textContent = `${number.format(frameCount)} кадров`;
}

function bounded(value, depth = 0) {
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer)
    return `[${value.byteLength} байт]`;
  if (typeof value === 'bigint') return String(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth > 4) return '…';
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => bounded(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 50)
      .map(([key, item]) => [key, bounded(item, depth + 1)]),
  );
}

function receiveStatus(message) {
  const diagnostics = message.diagnostics || message;
  const state = String(message.status || diagnostics.status || '').toLowerCase();
  if (state === 'off') {
    if (!machineOff) log('Прошивка перешла в цикл выключения. Доступны холодный и быстрый запуск.');
    machineOff = true;
    running = false;
    releaseAll();
    audio.stop();
    $('errorBanner').hidden = true;
    $('sourceLabel').textContent =
      'Прошивка завершила работу. Выберите холодный или быстрый запуск.';
    $('emptyTitle').textContent = 'Плеер выключен';
    $('emptyHint').textContent = 'Выберите холодный или быстрый запуск';
  }
  if (typeof message.running === 'boolean') running = message.running;
  else if (state === 'running' || state === 'playing') running = true;
  else if (['paused', 'blocked', 'error', 'unsupported', 'exited', 'stopped'].includes(state))
    running = false;
  if (machineOff) running = false;
  const error = message.error || diagnostics.error;
  if (state === 'off') {
    setStatus('Плеер выключен');
  } else if (error || ['blocked', 'error', 'unsupported'].includes(state)) {
    fail(
      error ||
        message.stop_reason ||
        diagnostics.stop_reason ||
        message.message ||
        'Неподдерживаемая операция устройства.',
    );
  } else {
    if (state !== 'loading') $('errorBanner').hidden = true;
    setStatus(
      state === 'loading' ? 'Загрузка' : running ? 'Исполняется' : current ? 'Пауза' : 'Ожидание',
      running ? 'running' : '',
    );
  }
  const instructions = diagnostics.instructions ?? message.instructions;
  const events = diagnostics.events ?? diagnostics.event_count ?? message.events;
  if (instructions !== undefined) $('diagInstructions').textContent = number.format(instructions);
  if (events !== undefined) $('diagEvents').textContent = number.format(events);
  $('technicalData').textContent = JSON.stringify(bounded(diagnostics), null, 2).slice(0, 14000);
  if (message.message) log(message.message, Boolean(error));
  if (running && audio.buffer && !audio.paused && !audio.node) audio.resume();
  updateTransport();
}

function connectWorker() {
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.addEventListener('message', async ({ data }) => {
      // A previous load can finish after the user has already chosen another game.
      // Its saves still belong in IndexedDB; its video/audio/status do not belong to the new screen.
      if (
        ['frame', 'status', 'audio', 'error', 'log'].includes(data.type) &&
        data.sessionId != null &&
        data.sessionId !== current?.sessionId
      )
        return;
      switch (data.type) {
        case 'ready':
          workerReady = true;
          $('connectionText').textContent = 'Ядро готово';
          $('connectionDot').className = 'status-dot ready';
          log('Ядро WebAssembly готово.');
          if (pendingCommand) {
            post(pendingCommand);
            pendingCommand = null;
          }
          updateTransport();
          break;
        case 'frame':
          drawFrame(data);
          break;
        case 'status':
          receiveStatus(data);
          break;
        case 'error':
          fail(data.message || data.error || 'Ошибка ядра');
          break;
        case 'log':
          log(data.message || data.text, data.level === 'error');
          break;
        case 'audio':
          audio.receive(data);
          break;
        case 'save':
          try {
            await storageReady;
            const persistent = await storage.saveGame(data.gameId || current?.id, data.data);
            if (persistent === false && !warnedMemorySaves) {
              warnedMemorySaves = true;
              log(
                'Браузер не разрешил постоянные сохранения. Прогресс останется только до закрытия вкладки.',
                true,
              );
              toast('Сохранения доступны только до закрытия вкладки.');
            }
          } catch (error) {
            log(`Не удалось сохранить игру: ${error.message}`, true);
            toast('Браузер не разрешил записать сохранение.');
          }
          break;
      }
    });
    worker.addEventListener('error', (event) => {
      workerReady = false;
      $('connectionText').textContent = 'Ошибка ядра';
      $('connectionDot').className = 'status-dot error';
      fail(
        event.message ||
          'Не удалось загрузить WebAssembly. Проверьте соединение и обновите страницу.',
        'Не удалось запустить ядро',
      );
    });
  } catch (error) {
    fail(error.message, 'Браузер не смог создать ядро');
  }
}

function sendKey(key, pressed, source, repeat = false) {
  if (!current || !workerReady || machineOff) return;
  let sources = held.get(key);
  if (pressed) {
    if (!sources) {
      sources = new Set();
      held.set(key, sources);
    }
    const first = sources.size === 0;
    sources.add(source);
    if (first || repeat) post({ type: 'key', key, pressed: true });
  } else if (sources) {
    sources.delete(source);
    if (!sources.size) {
      held.delete(key);
      post({ type: 'key', key, pressed: false });
    }
  }
  document
    .querySelectorAll(`[data-key="${key}"]`)
    .forEach((button) => button.classList.toggle('held', held.has(key)));
}

function releaseAll() {
  for (const key of held.keys()) if (workerReady) post({ type: 'key', key, pressed: false });
  held.clear();
  document.querySelectorAll('.held').forEach((button) => button.classList.remove('held'));
}

function togglePlayback() {
  if (!current || !workerReady || machineOff) return;
  audio.unlock();
  releaseAll();
  running = !running;
  post({ type: running ? 'resume' : 'pause' });
  running ? audio.resume() : audio.pause();
  setStatus(running ? 'Исполняется' : 'Пауза', running ? 'running' : '');
  updateTransport();
}

const keyMap = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyZ: 'a',
  KeyX: 'b',
  Enter: 'start',
  Tab: 'menu',
  Escape: 'b',
  KeyC: 'mode',
  KeyV: 'rec',
};
const phoneKeyMap = {
  ...keyMap,
  Backspace: 'clear',
  KeyQ: 'f1',
  KeyE: 'f2',
  NumpadMultiply: 'star',
  Digit0: 'digit0',
  Numpad0: 'digit0',
};
for (let digit = 1; digit <= 9; digit++) {
  phoneKeyMap['Digit' + digit] = 'digit' + digit;
  phoneKeyMap['Numpad' + digit] = 'digit' + digit;
}
const keyboardHolds = new Map();
function mappedKey(event) {
  if (current?.platform !== 'mobile') return keyMap[event.code];
  if (event.key === '*') return 'star';
  if (event.key === '#') return 'hash';
  return phoneKeyMap[event.code];
}
const editable = (target) =>
  target instanceof Element &&
  (target.matches('input,select,textarea') || target.isContentEditable);
document.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || editable(event.target) || !current) return;
  if (['Enter', 'Space'].includes(event.code) && event.target.closest('button,a,summary')) return;
  if (event.code === 'Space' && !event.repeat) {
    event.preventDefault();
    togglePlayback();
    return;
  }
  const key = mappedKey(event);
  if (!key) return;
  // Tab retains normal browser navigation outside the LCD/controls; Menu also has a touch button.
  if (event.code === 'Tab' && (event.target !== canvas || event.shiftKey)) return;
  event.preventDefault();
  audio.unlock();
  keyboardHolds.set(event.code, key);
  if (!event.repeat || ['up', 'down', 'left', 'right'].includes(key))
    sendKey(key, true, 'keyboard', event.repeat);
});
document.addEventListener('keyup', (event) => {
  const key = keyboardHolds.get(event.code);
  keyboardHolds.delete(event.code);
  if (key && held.get(key)?.has('keyboard')) {
    event.preventDefault();
    sendKey(key, false, 'keyboard');
  }
});
window.addEventListener('blur', releaseAll);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) releaseAll();
});
document.querySelectorAll('[data-key]').forEach((button) => {
  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    audio.unlock();
    button.setPointerCapture(event.pointerId);
    sendKey(button.dataset.key, true, `pointer:${event.pointerId}`);
  });
  const release = (event) => sendKey(button.dataset.key, false, `pointer:${event.pointerId}`);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
  // Keyboard activation for focused on-screen controls.
  button.addEventListener('click', (event) => {
    if (event.detail === 0) {
      sendKey(button.dataset.key, true, 'accessible');
      setTimeout(() => sendKey(button.dataset.key, false, 'accessible'), 80);
    }
  });
});

class BrowserAudio {
  constructor() {
    this.context = null;
    this.node = null;
    this.buffer = null;
    this.offset = 0;
    this.started = 0;
    this.loop = false;
    this.generation = 0;
    this.paused = false;
  }
  unlock() {
    if (!soundEnabled) return;
    try {
      this.context ||= new (window.AudioContext || window.webkitAudioContext)();
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    } catch (error) {
      log(`Аудио недоступно: ${error.message}`, true);
    }
  }
  async receive(message) {
    const action = message.action || 'play';
    if (action === 'volume') {
      this.volume = Math.max(0, Math.min(1, Number(message.value) || 0));
      if (this.gain) this.gain.gain.value = this.volume;
      return;
    }
    if (action === 'stop') {
      this.stop();
      return;
    }
    if (action === 'pause') {
      this.pause();
      return;
    }
    if (action === 'resume') {
      this.resume();
      return;
    }
    if (action !== 'play') return;
    this.stop();
    this.paused = false;
    const generation = this.generation;
    if (!this.context) {
      $('diagAudio').textContent = 'Нажмите кнопку';
      return;
    }
    try {
      let bytes =
        message.bytes instanceof ArrayBuffer
          ? message.bytes.slice(0)
          : new Uint8Array(message.bytes).buffer;
      if (message.mime === 'audio/x-smaf') {
        this.smaf ||= new SmafDecoder();
        const decoded = await this.smaf.decode(bytes);
        if (generation !== this.generation) return;
        bytes = decoded.wave.buffer;
        message.format = 'SMAF · FM синтез';
        if (decoded.truncated) log('Длинная SMAF-дорожка ограничена тремя минутами.');
      }
      const buffer = await this.context.decodeAudioData(bytes);
      if (generation !== this.generation) return;
      this.buffer = buffer;
      this.loop = Boolean(message.loop);
      this.offset = 0;
      if (!this.paused && running) this.resume();
      $('diagAudio').textContent = message.format || message.mime || 'Воспроизведение';
    } catch (error) {
      if (generation !== this.generation || error.name === 'AbortError') return;
      log(`Звук: ${message.format || 'формат'} не воспроизводится (${error.message}).`, true);
      $('diagAudio').textContent = 'Формат недоступен';
    }
  }
  pause() {
    if (this.node) {
      this.offset += this.context.currentTime - this.started;
      if (this.loop && this.buffer) this.offset %= this.buffer.duration;
      this.node.onended = null;
      try {
        this.node.stop();
      } catch {
        /* Already ended. */
      }
      this.node.disconnect();
      this.node = null;
    }
    this.paused = true;
  }
  resume() {
    this.paused = false;
    if (!soundEnabled || !this.context || !this.buffer || this.node) return;
    if (this.offset >= this.buffer.duration) {
      if (!this.loop) return;
      this.offset %= this.buffer.duration;
    }
    this.unlock();
    const node = this.context.createBufferSource();
    if (!this.gain) {
      this.gain = this.context.createGain();
      this.gain.connect(this.context.destination);
    }
    this.gain.gain.value = this.volume ?? 1;
    node.buffer = this.buffer;
    node.loop = this.loop;
    node.connect(this.gain);
    node.onended = () => {
      if (this.node === node) {
        this.node = null;
        this.offset = this.buffer?.duration || 0;
      }
    };
    this.node = node;
    this.started = this.context.currentTime;
    this.paused = false;
    node.start(0, this.offset);
  }
  stop() {
    this.generation++;
    this.smaf?.cancel();
    this.pause();
    this.buffer = null;
    this.offset = 0;
    this.paused = false;
  }
}
class BrowserAudioMixer {
  constructor() {
    this.channels = new Map([[0, new BrowserAudio()]]);
    this.volume = 1;
  }
  track(channel = 0) {
    if (!Number.isInteger(channel) || channel < 0 || channel > 4)
      throw Error('Invalid audio channel');
    if (!this.channels.has(channel)) {
      const track = new BrowserAudio();
      track.context = this.context;
      track.volume = this.volume;
      this.channels.set(channel, track);
    }
    return this.channels.get(channel);
  }
  unlock() {
    this.track().unlock();
    this.context = this.track().context;
    for (const track of this.channels.values()) track.context = this.context;
  }
  receive(message) {
    if (message.action === 'volume') {
      if (message.channel == null) {
        this.volume = Math.max(0, Math.min(1, Number(message.value) || 0));
        for (const track of this.channels.values()) track.receive(message);
      } else this.track(message.channel).receive(message);
    } else if (message.action !== 'play' && message.channel == null) {
      for (const track of this.channels.values()) track.receive(message);
    } else this.track(message.channel ?? 0).receive(message);
  }
  stop() {
    for (const track of this.channels.values()) track.stop();
  }
  pause() {
    for (const track of this.channels.values()) track.pause();
  }
  resume() {
    for (const track of this.channels.values()) track.resume();
  }
  get buffer() {
    return [...this.channels.values()].some((track) => track.buffer);
  }
  get node() {
    return [...this.channels.values()].some((track) => track.node);
  }
  get paused() {
    return [...this.channels.values()].every((track) => track.paused);
  }
}
const audio = new BrowserAudioMixer();

async function addUpload(file, persist = true) {
  if (file.size > MAX_ASSET_BYTES) throw Error(`${file.name}: файл больше 32 МиБ.`);
  const bytes = await file.arrayBuffer();
  const hash = await sha256(bytes);
  const { kind, entry } = identifyAsset(catalog, file.name, bytes, hash);
  const target = kind === 'swerve' ? swerve : catalog[kind].find((item) => item.sha256 === hash);
  if (!target?.local) {
    const url = URL.createObjectURL(file);
    uploads.add(url);
    const imported = { ...entry, url, local: true, available: true };
    if (kind === 'swerve') swerve = imported;
    else if (target) Object.assign(target, imported);
    else catalog[kind].unshift(imported);
  }
  if (persist) {
    const saved = await storage.storeAsset({ sha256: hash, name: file.name, blob: file });
    if (!saved) {
      $('localNote').textContent =
        'Файлы доступны до закрытия вкладки: браузер не сохранил их на диск.';
      log(
        'Не удалось сохранить локальные файлы. Они доступны в этой вкладке до её закрытия.',
        true,
      );
    }
  }
  return entry.title;
}

async function addFiles(files) {
  if (importing || !files.length) return;
  importing = true;
  $('uploadAssets').disabled = true;
  $('uploadAssets').textContent = 'Добавляем…';
  let added = 0;
  try {
    await libraryReady;
    await storageReady;
    for (const file of files) {
      try {
        const title = await addUpload(file);
        added++;
        log(`Добавлен локальный файл: ${title}`);
      } catch (error) {
        log(error.message, true);
        toast(error.message);
      }
    }
    populateCatalog();
    if (added) toast(`Добавлено файлов: ${added}. Выберите игру в библиотеке.`);
  } finally {
    importing = false;
    $('uploadAssets').disabled = false;
    $('uploadAssets').textContent = 'Добавить файлы';
  }
}

$('librarySearch').addEventListener('input', renderLibrary);
document.querySelectorAll('[data-tab]').forEach((button) =>
  button.addEventListener('click', () => {
    libraryTab = button.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach((tab) => {
      tab.classList.toggle('selected', tab === button);
      tab.setAttribute('aria-selected', String(tab === button));
    });
    $('libraryList').setAttribute('aria-labelledby', button.id);
    $('librarySearch').value = '';
    $('librarySearch').placeholder = {
      games: 'Найти игру…',
      samples: 'Найти пример…',
      firmwares: 'Найти прошивку…',
    }[libraryTab];
    renderLibrary();
  }),
);
$('firmwareSelect').addEventListener('change', (event) =>
  chooseRom(catalog.firmwares.find((rom) => rom.id === event.target.value)),
);
$('bootFirmware').addEventListener('click', bootFirmware);
$('playPause').addEventListener('click', togglePlayback);
$('reset').addEventListener('click', () => {
  releaseAll();
  audio.stop();
  machineOff = false;
  $('errorBanner').hidden = true;
  post({ type: 'reset' });
  $('sourceLabel').textContent = sourceText(current);
  log('Повторный запуск текущего сеанса.');
});
$('step').addEventListener('click', () => {
  releaseAll();
  post({ type: 'step' });
});
$('sound').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  if (!soundEnabled) audio.pause();
  else {
    audio.unlock();
    if (running) audio.resume();
  }
  $('sound')
    .querySelector('use')
    .setAttribute('href', soundEnabled ? '#i-volume' : '#i-muted');
  $('sound').setAttribute('aria-pressed', String(soundEnabled));
  $('sound').title = soundEnabled ? 'Выключить звук' : 'Включить звук';
  $('sound').setAttribute('aria-label', $('sound').title);
  $('diagAudio').textContent = soundEnabled ? 'Включён' : 'Выключен';
});
$('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $('player').requestFullscreen();
  } catch {
    toast('Полноэкранный режим недоступен в этом браузере.');
  }
});
document.addEventListener('fullscreenchange', resizeScreen);
$('screenshot').addEventListener('click', () => {
  if (!hasFrame) return;
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Reunion-${(current?.title || 'screen').replace(/[^\p{L}\p{N}._-]/gu, '_')}-${Date.now()}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
});
$('uploadAssets').addEventListener('click', () => $('assetFile').click());
$('assetFile').addEventListener('change', async (event) => {
  const files = [...event.target.files];
  event.target.value = '';
  await addFiles(files);
});
$('screenArea').addEventListener('dragover', (event) => {
  event.preventDefault();
  $('screenArea').classList.add('drag-over');
});
$('screenArea').addEventListener('dragleave', () => $('screenArea').classList.remove('drag-over'));
$('screenArea').addEventListener('drop', async (event) => {
  event.preventDefault();
  $('screenArea').classList.remove('drag-over');
  await addFiles([...event.dataTransfer.files]);
});
window.addEventListener('pagehide', () => {
  releaseAll();
  audio.stop();
});
window.addEventListener('beforeunload', () => {
  for (const url of uploads) URL.revokeObjectURL(url);
});
new ResizeObserver(resizeScreen).observe($('screenArea'));
window.addEventListener('resize', resizeScreen);
updateTransport();
connectWorker();
const libraryReady = (async () => {
  const response = await fetch(new URL('./data/catalog.json', import.meta.url));
  if (!response.ok) throw Error(`Каталог: HTTP ${response.status}`);
  const data = await response.json();
  let ids = [];
  try {
    const availability = await fetch(new URL('./data/availability.json', import.meta.url));
    if (availability.ok) ids = (await availability.json()).assets || [];
  } catch {
    // A catalogue without an availability manifest starts with local imports only.
  }
  catalog = assetCatalog(data, ids);
  swerve.available = ids.includes(swerve.id);
  await storageReady;
  for (const record of await storage.listAssets()) {
    try {
      await addUpload(new File([record.blob], record.name), false);
    } catch (error) {
      log(`Локальный файл не восстановлен: ${error.message}`, true);
    }
  }
  populateCatalog();
  const gameCount = catalog.games.filter((entry) => entry.available).length;
  const romCount = catalog.firmwares.filter((entry) => entry.available).length;
  log(
    gameCount || romCount
      ? `Библиотека готова: ${gameCount} SGS и ${romCount} ROM.`
      : 'Добавьте свои ROM и SGS, чтобы начать игру.',
  );
})().catch((error) => {
  $('libraryList').textContent = 'Не удалось загрузить каталог.';
  fail(error.message, 'Каталог недоступен');
});
