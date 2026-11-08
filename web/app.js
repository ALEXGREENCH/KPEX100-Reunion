import { createInputControls } from './input-controls.js';
import { devices, deviceFor, fitFrame } from './presentation.js';
import { SmafDecoder } from './smaf-decoder.js';
import { SWERVE, MAX_ASSET_BYTES, assetCatalog, identifyAsset, sha256 } from './local-assets.js';
import { libraryEntries, libraryCounts } from './library.js';

const $ = (id) => document.getElementById(id);
const canvas = $('screen');
const context = canvas.getContext('2d', { alpha: false });
context.imageSmoothingEnabled = false;

let inputControls = null;
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
let pendingCommand = null;
let toastTimer = 0;
let loadSequence = 0;
let sessionCounter = 0;
let soundEnabled = true;
let userVolume = 75;
let lastVolume = 75;
try {
  const saved = localStorage.getItem('reunion-volume');
  if (saved !== null && Number.isFinite(Number(saved)))
    userVolume = Math.max(0, Math.min(100, Math.round(Number(saved) / 5) * 5));
  const previous = Number(localStorage.getItem('reunion-last-volume'));
  if (previous > 0 && previous <= 100) lastVolume = previous;
} catch {
  /* Optional browser preference. */
}
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

let skinOverride = 'auto';
try {
  skinOverride = localStorage.getItem('reunion-device') || 'auto';
} catch {
  /* optional preference */
}
let skinCatalog = {};
function showDialog(id) {
  releaseAll();
  const dialog = $(id);
  if (!dialog.open) dialog.showModal();
}
function applyDevice() {
  releaseAll();
  const device = deviceFor(current, skinOverride);
  $('screenArea').dataset.device = device.id;
  $('screenArea').dataset.kind = device.type;
  $('deviceLabel').textContent = device.title;
  const skin = skinCatalog[device.id];
  $('controls').replaceChildren(
    ...device.keys
      .filter(([key]) => current?.kind === 'firmware' || !['mode', 'rec'].includes(key))
      .map(([key, title], index) => {
        const button = document.createElement('button');
        button.dataset.key = key;
        button.textContent = title;
        button.setAttribute('aria-label', title);
        const playerPositions = {
          menu: [118, 89],
          up: [124, 198],
          left: [66, 261],
          down: [141, 332],
          right: [184, 261],
          a: [809, 130],
          b: [809, 220],
          start: [809, 440],
          mode: [425, 66],
          rec: [535, 66],
        };
        const cell = device.id === 'anycall' && key === 'digit0' ? index + 1 : index;
        const [x, y, width, height] =
          skin?.buttonZones?.[key] ||
          (device.type === 'phone'
            ? [350 + (cell % 3) * 103, 510 + Math.floor(cell / 3) * 39, 94, 35.7]
            : [...playerPositions[key], 80, 51]);
        Object.assign(button.style, {
          left: `${x / 10}%`,
          top: `${y / 8.5}%`,
          width: `${width / 10}%`,
          height: `${height / 8.5}%`,
        });
        return button;
      }),
  );
  bindControls();
  $('deviceShell').replaceChildren();
  $('screenArea').classList.toggle('has-photo', Boolean(skin));
  if (skin) renderShell(skin);
  $('skinCredit').textContent = skin
    ? skin.credit
    : 'Универсальное оформление. Фотография модели не используется.';
  inputControls?.refreshHints();
  updateTransport();
}
function renderShell(skin) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 1000 850');
  svg.setAttribute('preserveAspectRatio', 'none');
  const [x, y, w, h] = skin.lcd;
  const [left, top, right, bottom] = skin.body;
  const [dl, dt, dr, db] = skin.destination;
  const defs = document.createElementNS(ns, 'defs');
  const clip = document.createElementNS(ns, 'clipPath');
  clip.id = 'shell-clip';
  const outline = document.createElementNS(ns, 'rect');
  for (const [key, value] of Object.entries({
    x: dl,
    y: dt,
    width: dr - dl,
    height: db - dt,
    rx: skin.mask?.radius ?? 48,
  }))
    outline.setAttribute(key, value);
  clip.append(outline);
  defs.append(clip);
  svg.append(defs);
  const sx = [left, x, x + w, right],
    sy = [top, y, y + h, bottom];
  const dx = [dl, 280, 720, dr],
    dy = [dt, 110, 462, db];
  // Eight photographic slices preserve the fixed LCD. Original bytes stay untouched.
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 3; col++) {
      if (row === 1 && col === 1) continue;
      const tile = document.createElementNS(ns, 'svg');
      for (const [key, value] of Object.entries({
        x: dx[col],
        y: dy[row],
        width: dx[col + 1] - dx[col],
        height: dy[row + 1] - dy[row],
        viewBox: `${sx[col]} ${sy[row]} ${sx[col + 1] - sx[col]} ${sy[row + 1] - sy[row]}`,
        preserveAspectRatio: 'none',
      }))
        tile.setAttribute(key, value);
      const image = document.createElementNS(ns, 'image');
      image.setAttribute('href', new URL(skin.url, import.meta.url));
      image.setAttribute('width', skin.width);
      image.setAttribute('height', skin.height);
      if (skin.transform) image.setAttribute('transform', skin.transform);
      tile.append(image);
      const group = document.createElementNS(ns, 'g');
      group.setAttribute('clip-path', 'url(#shell-clip)');
      group.append(tile);
      svg.append(group);
    }
  $('deviceShell').append(svg);
}
for (const device of devices) {
  const option = document.createElement('option');
  option.value = device.id;
  option.textContent = device.title;
  $('deviceSelect').append(option);
}
if (!devices.some((device) => device.id === skinOverride)) skinOverride = 'auto';
$('deviceSelect').value = skinOverride;
$('deviceSelect').addEventListener('change', (event) => {
  skinOverride = event.target.value;
  try {
    localStorage.setItem('reunion-device', skinOverride);
  } catch {
    /* optional preference */
  }
  applyDevice();
});
for (const [id, dialog] of [
  ['openLibrary', 'libraryDrawer'],
  ['emptyLibrary', 'libraryDrawer'],
  ['openMenu', 'settings'],
  ['showError', 'errorDetails'],
])
  $(id).addEventListener('click', () => showDialog(dialog));
$('importAssets').addEventListener('click', () => $('assetFile').click());
$('showHelp').addEventListener('click', () => {
  $('settings').close();
  inputControls.refresh();
  showDialog('help');
});
document
  .querySelectorAll('[data-close]')
  .forEach((button) => button.addEventListener('click', () => $(button.dataset.close).close()));
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('close', releaseAll);
  dialog.addEventListener('click', (event) => {
    const rect = dialog.getBoundingClientRect();
    if (
      event.target === dialog &&
      (event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom)
    )
      dialog.close();
  });
}
async function loadSkins() {
  try {
    const response = await fetch(new URL('./devices/catalog.json', import.meta.url));
    if (!response.ok) throw Error('No skin catalogue');
    const data = await response.json();
    const manifest = await fetch(new URL('./data/availability.json', import.meta.url));
    const ids = manifest.ok ? (await manifest.json()).assets || [] : [];
    skinCatalog = Object.fromEntries(
      data.skins
        .filter((skin) => !skin.disabled && ids.includes(skin.id))
        .map((skin) => [skin.device, skin]),
    );
    applyDevice();
  } catch {
    /* Source-only builds keep the functional universal shell. */
  }
}

function sourceText(details) {
  return details.research ? 'Совместимость этой игры ещё проверяется.' : '';
}

function beginSession(details, command) {
  releaseAll();
  audio.stop();
  current = { ...details, sessionId: ++sessionCounter };
  command = { ...command, sessionId: current.sessionId };
  running = false;
  machineOff = false;
  hasFrame = false;
  $('errorBanner').hidden = true;
  $('screenEmpty').hidden = false;
  $('emptyTitle').textContent = 'Загружаем оригинальный код';
  $('emptyHint').textContent = details.title;
  context.fillStyle = '#000';
  context.fillRect(0, 0, canvas.width, canvas.height);
  $('screenshot').disabled = true;
  $('nowPlaying').textContent = details.title;
  $('sourceLabel').textContent = sourceText(details);
  $('gameHint').textContent = details.startHint || '';
  $('gameHint').hidden = !details.startHint;
  applyDevice();
  $('libraryDrawer').close();
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
  const ads = game.engine === 'ads';
  const rom =
    !ads &&
    (catalog.firmwares.find((item) => item.id === 'kingston-2.12') ||
      catalog.firmwares.find((item) => /kingston.*2[._ -]?12/i.test(`${item.title} ${item.id}`)));
  if (!ads && !rom?.available) {
    toast('Для SGS добавьте оригинальный ROM Kingston 2.12.');
    $('assetFile').click();
    return;
  }
  if (game.format === 36 && !swerve.available) {
    toast('Для этой 3D-игры добавьте оригинальный swv21brew.mod (Swerve 2.1).');
    $('assetFile').click();
    return;
  }
  let saveData;
  if (!ads) {
    await storageReady;
    try {
      saveData = await storage.loadSave(game.id);
    } catch (error) {
      log(`Не удалось прочитать сохранение: ${error.message}`, true);
    }
  }
  if (sequence !== loadSequence) return;
  beginSession(
    {
      kind: 'game',
      id: game.id,
      title: game.title,
      rom,
      engine: game.engine,
      platform: game.platform,
      applicationType: game.applicationType,
      research:
        game.applicationType !== 'sample' &&
        !['verified', 'playable', 'utility'].includes(game.compatibility),
      startHint: game.startHint,
    },
    {
      type: 'loadGame',
      engine: game.engine,
      romUrl: rom?.url,
      romTitle: rom?.title,
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
      diskGames: catalog.games.filter((game) => game.available && game.engine !== 'ads'),
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
          : 'Оригинальные игры · GNEX и Anycall'
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
  const games = catalog.games.filter((entry) => entry.available);
  const adsCount = games.filter((entry) => entry.engine === 'ads').length;
  const sgsCount = games.length - adsCount;
  const roms = catalog.firmwares.filter((entry) => entry.available);
  const gnexReady = roms.some((entry) => entry.id === 'kingston-2.12');
  const canPlay = adsCount > 0 || (gnexReady && sgsCount > 0);
  const counts = libraryCounts(catalog);
  for (const [tab, id] of Object.entries({
    games: 'gamesCount',
    samples: 'samplesCount',
    firmwares: 'romsCount',
  })) {
    const { available, total } = counts[tab];
    $(id).textContent = available === total ? String(total) : `${available} / ${total}`;
  }
  $('collectionCount').textContent = String(games.length + roms.length);
  $('setupHint').hidden = canPlay;
  $('assetStatus').textContent =
    `${sgsCount} SGS · ${roms.length} ROM${adsCount ? ` · ${adsCount} MBIN` : ''}${swerve.available ? ' · Swerve 2.1' : ''}`;
  if (!current) {
    $('emptyTitle').textContent = canPlay ? 'Выберите игру' : 'Добавьте файлы';
    $('emptyHint').textContent = canPlay
      ? 'Откройте игру или пример из библиотеки'
      : 'SGS с ROM Kingston 2.12 или проверенный MBIN';
    $('nowPlaying').textContent = $('emptyTitle').textContent;
    $('sourceLabel').textContent = '';
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
  const box = $('lcdWindow').getBoundingClientRect();
  const fitted = fitFrame(canvas.width, canvas.height, box.width, box.height);
  canvas.style.width = `${fitted.width}px`;
  canvas.style.height = `${fitted.height}px`;
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
  canvas.setAttribute('aria-label', `Экран эмулятора, ${width} на ${height} пикселей`);
  context.putImageData(new ImageData(pixels, width, height), 0, 0);
  hasFrame = true;
  $('screenEmpty').hidden = true;
  $('screenshot').disabled = false;
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
      state === 'loading' ? 'Загрузка' : running ? 'Запущено' : current ? 'Пауза' : 'Ожидание',
      running ? 'running' : '',
    );
  }
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

      fail(
        event.message ||
          'Не удалось загрузить WebAssembly. Проверьте соединение и обновите страницу.',
        'Не удалось запустить эмулятор',
      );
    });
  } catch (error) {
    fail(error.message, 'Не удалось запустить эмулятор');
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
    if (first || repeat) post({ type: 'key', key, pressed: true, ...(repeat ? { repeat } : {}) });
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
  inputControls?.release();
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
  setStatus(running ? 'Запущено' : 'Пауза', running ? 'running' : '');
  updateTransport();
}

window.addEventListener('blur', releaseAll);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) releaseAll();
});
function bindControls() {
  document.querySelectorAll('[data-key]').forEach((button) => {
    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      audio.unlock();
      button.setPointerCapture(event.pointerId);
      sendKey(button.dataset.key, true, `pointer:${event.pointerId}`);
    });
    const release = (event) => sendKey(button.dataset.key, false, `pointer:${event.pointerId}`);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
      button.addEventListener(type, release);
    button.addEventListener('click', (event) => {
      if (event.detail !== 0) return;
      const key = button.dataset.key;
      sendKey(key, true, 'accessible');
      setTimeout(() => sendKey(key, false, 'accessible'), 80);
    });
  });
}

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
    this.masterVolume = 1;
  }
  updateGain() {
    if (this.gain) this.gain.gain.value = (this.volume ?? 1) * this.masterVolume;
  }
  unlock() {
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
      this.updateGain();
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
      return;
    }
    try {
      let bytes =
        message.bytes instanceof ArrayBuffer
          ? message.bytes.slice(0)
          : new Uint8Array(message.bytes).buffer;
      if (['audio/x-smaf', 'audio/x-gvm-buzzer', 'audio/x-gvm-ma1'].includes(message.mime)) {
        this.smaf ||= new SmafDecoder();
        const decoded = await this.smaf.decode(bytes, message.mime);
        if (generation !== this.generation) return;
        if (decoded.frames === 0) return;
        bytes = decoded.wave.buffer;
        message.format =
          message.mime === 'audio/x-gvm-buzzer'
            ? 'GVM · зуммер'
            : message.mime === 'audio/x-gvm-ma1'
              ? 'GVM · MA1'
              : 'SMAF · FM синтез';
        if (decoded.truncated) log('Длинная звуковая дорожка ограничена тремя минутами.');
      }
      const buffer = await this.context.decodeAudioData(bytes);
      if (generation !== this.generation) return;
      this.buffer = buffer;
      this.loop = Boolean(message.loop);
      this.offset = 0;
      if (!this.paused && running) this.resume();
    } catch (error) {
      if (generation !== this.generation || error.name === 'AbortError') return;
      log(`Звук: ${message.format || 'формат'} не воспроизводится (${error.message}).`, true);
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
    if (!this.context || !this.buffer || this.node) return;
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
    this.updateGain();
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
    this.masterVolume = 1;
  }
  setMasterVolume(value) {
    this.masterVolume = Math.max(0, Math.min(1, Number(value) || 0));
    for (const track of this.channels.values()) {
      track.masterVolume = this.masterVolume;
      track.updateGain();
    }
  }
  track(channel = 0) {
    if (!Number.isInteger(channel) || channel < 0 || channel > 4)
      throw Error('Invalid audio channel');
    if (!this.channels.has(channel)) {
      const track = new BrowserAudio();
      track.context = this.context;
      track.volume = this.volume;
      track.masterVolume = this.masterVolume;
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
inputControls = createInputControls({
  getSession: () => current,
  sendKey,
  togglePause: togglePlayback,
  unlock: () => audio.unlock(),
  releaseAll,
});

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
function setUserVolume(value, activate = true) {
  userVolume = Math.max(0, Math.min(100, Math.round(Number(value) / 5) * 5));
  if (userVolume > 0) lastVolume = userVolume;
  soundEnabled = userVolume > 0;
  audio.setMasterVolume(userVolume / 100);
  $('volume').value = String(userVolume);
  $('volumeValue').textContent = `${userVolume}%`;
  $('sound')
    .querySelector('use')
    .setAttribute('href', soundEnabled ? '#i-volume' : '#i-muted');
  $('sound').setAttribute('aria-pressed', String(soundEnabled));
  $('sound').title = soundEnabled ? 'Выключить звук' : 'Включить звук';
  $('sound').setAttribute('aria-label', $('sound').title);
  try {
    localStorage.setItem('reunion-volume', String(userVolume));
    localStorage.setItem('reunion-last-volume', String(lastVolume));
  } catch {
    /* Optional browser preference. */
  }
  // Muting keeps playback position advancing. Restoring gain does not restart music.
  if (activate) {
    audio.unlock();
    if (running) audio.resume();
  }
}
$('sound').addEventListener('click', () => setUserVolume(soundEnabled ? 0 : lastVolume));
$('volume').addEventListener('input', (event) => setUserVolume(event.target.value));
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
new ResizeObserver(resizeScreen).observe($('lcdWindow'));
window.addEventListener('resize', resizeScreen);
setUserVolume(userVolume, false);
applyDevice();
resizeScreen();
loadSkins();
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
      ? `Библиотека готова. Игр и примеров: ${gameCount}. Прошивок: ${romCount}.`
      : 'Добавьте файлы, чтобы начать игру.',
  );
})().catch((error) => {
  $('libraryList').textContent = 'Не удалось загрузить каталог.';
  fail(error.message, 'Каталог недоступен');
});
