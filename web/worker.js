import { GnexRuntime } from './engine/gnex.js';
import { LegacyRuntime } from './engine/legacy.js';
import { detectVersion } from './engine/sgs.js';
import { TimerScheduler } from './engine/timers.js';
import { FirmwareMachine } from './engine/firmware.js';
import { createDisk } from './engine/disk.js';
import { AdsRuntime } from './engine/ads.js';

const keys = {
  left: 0x10,
  right: 0x11,
  up: 0x12,
  down: 0x13,
  a: 0x14,
  select: 0x14,
  b: 0x0a,
  esc: 0x0a,
  menu: 0x0d,
  start: 0x15,
  play: 0x15,
  mode: 0x0b,
  rec: 0x0c,
};
const phoneKeys = {
  ...keys,
  b: 0x0d,
  esc: 0x0d,
  menu: 0x15,
  start: 0x17,
  play: 0x17,
  f1: 0x15,
  f2: 0x16,
  clear: 0x0d,
  send: 0x0e,
  end: 0x0f,
  star: 0x0b,
  hash: 0x0c,
  digit0: 0x0a,
};
for (let digit = 1; digit <= 9; digit++) phoneKeys['digit' + digit] = digit;
const adsKeys = {
  left: 10,
  right: 11,
  up: 12,
  down: 13,
  a: 19,
  start: 19,
  select: 19,
  play: 19,
};
for (let digit = 0; digit <= 9; digit++) adsKeys['digit' + digit] = digit;
const cache = new Map(),
  saves = new Map(),
  nativeStarts = new Map(),
  nativeReleases = new Map(),
  adsHeld = new Map();
let machine = null,
  mode = 'none',
  isAds = false,
  running = false,
  lastLoad = null,
  gameId = null,
  romTitle = '',
  gameTitle = '';
let timers = new TimerScheduler(),
  pausedAt = null,
  lastFrame = 0,
  framePending = false,
  lastDisplayUpdate = null,
  lastStatus = 0,
  firmwareBudget = 100000;
const frameInterval = 1000 / 60;
const adsTimers = [{ channel: 0, delay: frameInterval, repeat: true, revision: 1 }];
let queue = Promise.resolve();
let activeSession = null;
function emit(message, transfers = []) {
  postMessage({ ...message, sessionId: activeSession }, transfers);
}
const audio = {
  play(bytes, mime = 'audio/mpeg', loop = false, channel = 0) {
    const copy = new Uint8Array(bytes).slice();
    emit({ type: 'audio', action: 'play', bytes: copy, mime, loop, channel }, [copy.buffer]);
  },
  stop(channel = null) {
    emit({ type: 'audio', action: 'stop', channel });
  },
  pause(channel = null) {
    emit({ type: 'audio', action: 'pause', channel });
  },
  resume(channel = null) {
    emit({ type: 'audio', action: 'resume', channel });
  },
  setVolume(value, channel = null) {
    emit({ type: 'audio', action: 'volume', value, channel });
  },
};
async function fetchBytes(url) {
  if (!cache.has(url))
    cache.set(
      url,
      fetch(url)
        .then(async (response) => {
          if (!response.ok) throw Error(`Не удалось загрузить файл (${response.status}): ${url}`);
          return new Uint8Array(await response.arrayBuffer());
        })
        .catch((error) => {
          cache.delete(url);
          throw error;
        }),
    );
  return cache.get(url);
}
function status(extra = {}) {
  const diagnostics = machine
    ? typeof machine.snapshot === 'function'
      ? machine.snapshot()
      : machine.diagnostics
    : {};
  emit({
    type: 'status',
    mode,
    running,
    status: machine?.status || 'ready',
    romTitle,
    gameTitle,
    instructions: machine?.instructions || 0,
    events: machine?.eventCount || 0,
    diagnostics,
    ...extra,
  });
  lastStatus = performance.now();
}
function frame(force = false) {
  if (!machine) return;
  const displayUpdate = mode === 'firmware' ? machine.lcd_pixel_writes : machine.framebuffer;
  if (!force && displayUpdate !== undefined && displayUpdate === lastDisplayUpdate) {
    framePending = false;
    return;
  }
  framePending = true;
  if (!force && performance.now() - lastFrame < frameInterval) return;
  const original = machine.framebufferRGBA || machine.framebuffer?.data;
  if (!original) return;
  const pixels = new Uint8ClampedArray(original);
  emit({ type: 'frame', width: machine.width || 220, height: machine.height || 176, pixels }, [
    pixels.buffer,
  ]);
  lastDisplayUpdate = displayUpdate;
  framePending = false;
  lastFrame = performance.now();
}
function fail(error) {
  running = false;
  audio.stop();
  status({
    status: 'error',
    error: String(error.message || error),
    message: String(error.message || error),
  });
  frame(true);
}
function syncTimer(firedChannel = null, now = performance.now()) {
  if (mode === 'game') timers.sync(isAds ? adsTimers : machine.timerStates, now, firedChannel);
}
function fireTimer(channel) {
  const started = performance.now();
  if (isAds) machine.tick();
  else machine.event('TIMEOUT', channel);
  // Guest execution consumes the interval; do not add another full delay after it.
  syncTimer(channel, started);
}
function setAdsKey(key, pressed, repeat) {
  const code = adsKeys[key];
  if (!Number.isInteger(code)) return;
  // Multiple confirmation actions can address the same guest key.
  const aliases = adsHeld.get(code);
  if (pressed && running) {
    if (!aliases) {
      adsHeld.set(code, new Set([key]));
      machine.setKey(code, true);
    } else if (aliases.has(key)) {
      if (repeat) machine.setKey(code, true, true);
    } else aliases.add(key);
  } else if (!pressed && aliases?.delete(key) && !aliases.size) {
    adsHeld.delete(code);
    machine.setKey(code, false);
  }
}
function releaseAds() {
  adsHeld.clear();
  machine.releaseKeys();
}
function checkState() {
  if (['blocked', 'error', 'exited', 'stopped', 'closed', 'off'].includes(machine?.status)) {
    running = false;
    audio.stop();
  }
}
function releaseNative(force = false) {
  if (force) {
    for (const key of new Set([...nativeStarts.keys(), ...nativeReleases.keys()]))
      machine.key(key, false);
    nativeStarts.clear();
    nativeReleases.clear();
    return;
  }
  for (const [key, at] of nativeReleases)
    if (machine.instructions >= at) {
      machine.key(key, false);
      nativeReleases.delete(key);
    }
}
async function catalog() {
  return fetch('./data/catalog.json').then((r) => {
    if (!r.ok) throw Error('Каталог недоступен');
    return r.json();
  });
}
async function diskFiles(entries = null) {
  const data = entries === null ? await catalog() : { games: entries },
    aliases = {
      hellfire: 'HELLFIRE.SGS',
      kpetris: 'KPETRIS.SGS',
      ikaria: 'IKARIA.SGS',
      godori: 'GODORI.SGS',
    };
  let research = 0;
  const jobs = data.games
    .filter((entry) => entry.engine !== 'ads')
    .map((entry) => ({
      entry,
      name: aliases[entry.id] || `R${String(++research).padStart(7, '0')}.SGS`,
    }));
  return Promise.all(
    jobs.map(async ({ entry, name }) => ({ name, data: await fetchBytes(entry.url) })),
  );
}
async function load(message) {
  running = false;
  audio.stop();
  audio.setVolume(1);
  machine?.close?.();
  machine = null;
  framePending = false;
  lastDisplayUpdate = null;
  firmwareBudget = 100000;
  timers = new TimerScheduler();
  nativeStarts.clear();
  nativeReleases.clear();
  adsHeld.clear();
  activeSession = message.sessionId ?? null;
  lastLoad = { ...message };
  gameId = message.gameId || message.gameUrl || null;
  romTitle = message.romTitle || message.romUrl?.split('/').pop() || '';
  gameTitle = message.gameTitle || message.title || message.gameUrl?.split('/').pop() || '';
  mode = message.type === 'loadGame' ? 'game' : 'firmware';
  isAds = mode === 'game' && message.engine === 'ads';
  status({
    status: 'loading',
    message: isAds
      ? 'Загрузка игры Samsung Anycall…'
      : mode === 'game'
        ? 'Загрузка оригинального GNEX…'
        : 'Подготовка полной машины…',
  });
  // ROM, disk files and quickstate downloads are independent. Start them
  // together, including blob URLs for originals imported in the main thread.
  const [rom, content, swerveBinary] = await Promise.all([
    isAds ? undefined : fetchBytes(message.romUrl),
    mode === 'game'
      ? fetchBytes(message.gameUrl)
      : message.type === 'boot'
        ? diskFiles(message.diskGames ?? null)
        : fetchBytes(message.stateUrl),
    !isAds && message.swerveUrl ? fetchBytes(message.swerveUrl) : undefined,
  ]);
  if (isAds) {
    try {
      machine = await AdsRuntime.create(content, { id: message.gameId, audio });
    } catch (error) {
      // A successful HTTP response can still fail the MBIN integrity check.
      cache.delete(message.gameUrl);
      throw error;
    }
    gameTitle = message.gameTitle || machine.title;
    syncTimer();
  } else if (mode === 'game') {
    const game = content;
    const Runtime = detectVersion(game) < 4 ? LegacyRuntime : GnexRuntime;
    machine = await Runtime.create(rom, game, {
      ...message.runtime,
      ...(swerveBinary ? { swerve: { binary: swerveBinary } } : {}),
      audio,
      saveData: saves.get(gameId) ?? message.saveData ?? null,
      onSave(data) {
        saves.set(gameId, data);
        emit({ type: 'save', gameId, data });
      },
    });
    const started = performance.now();
    machine.event('START');
    gameTitle = message.gameTitle || machine.title;
    syncTimer(null, started);
  } else {
    const diskImage = message.type === 'boot' ? createDisk(content, rom) : undefined;
    machine = await FirmwareMachine.create(rom, {
      diskImage,
      adoptDiskImage: !!diskImage,
      fastIdle: true,
      traceInstructions: false,
    });
    if (message.type === 'loadState') {
      await machine.loadState(content);
      for (const key of ['up', 'down', 'left', 'right', 'a', 'b', 'menu', 'start', 'mode', 'rec'])
        machine.key(key, false);
    }
  }
  running = true;
  pausedAt = null;
  checkState();
  frame(true);
  status({ message: 'Загружено' });
}
async function command(message) {
  if (['loadGame', 'boot', 'loadState'].includes(message.type)) {
    await load(message);
    return;
  }
  if (message.sessionId != null && message.sessionId !== activeSession) return;
  if (!machine) return;
  if (message.type === 'key') {
    const key = message.key,
      pressed = !!message.pressed;
    if (isAds) setAdsKey(key, pressed, message.repeat);
    else if (mode === 'game') {
      const mapping = machine.profile === 'phone' ? phoneKeys : keys;
      const started = performance.now();
      if ((running || !pressed) && mapping[key] !== undefined)
        machine.setKey(mapping[key], pressed);
      syncTimer(null, started);
    } else if (pressed) {
      nativeStarts.set(key, nativeStarts.get(key) ?? machine.instructions);
      nativeReleases.delete(key);
      machine.key(key, true);
    } else {
      const at = nativeStarts.get(key);
      nativeStarts.delete(key);
      if (running && at !== undefined && machine.instructions < at + 7000000)
        nativeReleases.set(key, at + 7000000);
      else {
        nativeReleases.delete(key);
        machine.key(key, false);
      }
    }
    checkState();
    frame();
    status();
  } else if (message.type === 'pause') {
    if (running) pausedAt = performance.now();
    running = false;
    if (mode === 'firmware') releaseNative(true);
    else if (isAds) releaseAds();
    machine.vfs?.flush();
    audio.pause();
    status();
  } else if (message.type === 'resume') {
    if (pausedAt !== null) timers.shift(performance.now() - pausedAt);
    pausedAt = null;
    running = true;
    checkState();
    if (running) audio.resume();
    status();
  } else if (message.type === 'step') {
    running = false;
    if (mode === 'firmware') machine.run(1, { snapshot: false });
    else {
      if (isAds) releaseAds();
      const timer = timers.next();
      if (timer) fireTimer(timer.channel);
    }
    pausedAt = performance.now();
    checkState();
    frame(true);
    status();
  } else if (message.type === 'reset' && lastLoad) {
    machine.vfs?.flush();
    await load({ ...lastLoad, sessionId: message.sessionId ?? lastLoad.sessionId });
  } else if (message.type === 'flush') machine.vfs?.flush();
}
onmessage = (event) => {
  queue = queue.then(() => command(event.data)).catch(fail);
};
function tick() {
  try {
    if (running && machine) {
      if (mode === 'firmware') {
        const started = performance.now();
        let budget = firmwareBudget;
        for (const at of nativeReleases.values())
          budget = Math.min(budget, Math.max(1, at - machine.instructions));
        machine.run(budget, { snapshot: false });
        releaseNative();
        const elapsed = Math.max(1, performance.now() - started);
        firmwareBudget = Math.max(2000, Math.min(1000000, Math.round((budget * 20) / elapsed)));
        checkState();
        frame();
      } else {
        const timer = timers.next();
        if (timer && performance.now() >= timer.at) {
          fireTimer(timer.channel);
          checkState();
          frame();
        }
      }
      if (performance.now() - lastStatus > 250) status();
    }
    // A short key event may finish before the display deadline and arm no timer.
    // Keep its latest pixels pending instead of waiting for another guest event.
    if (framePending) frame();
  } catch (error) {
    fail(error);
  }
  let delay = running ? 1 : 25;
  if (running && isAds) {
    const due = Math.min(
      timers.next()?.at ?? Infinity,
      framePending ? lastFrame + frameInterval : Infinity,
    );
    delay = Math.max(1, Math.min(25, due - performance.now()));
  }
  setTimeout(tick, delay);
}
postMessage({ type: 'ready' });
tick();
