/** Browser asset identities and profiles. Files stay on the user's device. */
import { detectVersion } from './engine/sgs.js';

export const SWERVE = Object.freeze({
  id: 'swerve-2.1',
  title: 'Swerve 2.1',
  url: 'engine/vendor/swerve/swv21brew.mod',
  sha256: '1e76412e158bc3948bf6ad173b181368e0f0d554d6b0e1488a29402d96b0cdab',
  bytes: 273188,
});
export const MAX_ASSET_BYTES = 32 * 1024 * 1024;

export async function sha256(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export function assetCatalog(data, availableIds = []) {
  const ids = new Set(availableIds);
  return Object.fromEntries(
    ['firmwares', 'games', 'states'].map((kind) => [
      kind,
      (data[kind] || []).map((entry) => ({ ...entry, available: ids.has(entry.id) })),
    ]),
  );
}

function cartridgeFormat(name, bytes) {
  const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (/\.gbc?$/i.test(name)) {
    if (raw.length !== 32768 || raw[0x147] !== 0 || raw[0x148] !== 0)
      throw Error(`${name}: нужен 32-КиБ картридж Game Boy без контроллера банков.`);
    return raw[0x143] & 128 ? 'GBC' : 'GB';
  }
  if (/\.nes$/i.test(name)) {
    if (
      raw[0] !== 78 ||
      raw[1] !== 69 ||
      raw[2] !== 83 ||
      raw[3] !== 26 ||
      ![1, 2].includes(raw[4]) ||
      raw[5] !== 1 ||
      raw[6] & 254 ||
      raw[7] !== 0 ||
      raw.length !== 16 + raw[4] * 16384 + 8192
    )
      throw Error(`${name}: нужен iNES mapper 0 с PRG 16/32 КиБ и CHR 8 КиБ.`);
    return 'NES';
  }
  if (
    raw.length !== 32768 ||
    new TextDecoder().decode(raw.subarray(0x7ff0, 0x7ff8)) !== 'TMR SEGA' ||
    ![0x5c, 0x6c, 0x7c].includes(raw[0x7fff])
  )
    throw Error(`${name}: нужен 32-КиБ картридж Game Gear с заголовком TMR SEGA.`);
  return 'GG';
}

// Match bytes before filenames. Renaming an original must never lose its device profile.
export function identifyAsset(catalog, name, bytes, digest) {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_ASSET_BYTES)
    throw Error('Нужен непустой файл размером до 32 МиБ.');
  for (const kind of ['firmwares', 'games', 'states']) {
    const known = catalog[kind].find((entry) => entry.sha256 === digest);
    if (known) return { kind, entry: { ...known } };
  }
  if (digest === SWERVE.sha256) return { kind: 'swerve', entry: { ...SWERVE } };
  const entry = {
    id: `local-${digest}`,
    title: name.replace(/\.(sgs|rom|bin|gbc?|nes|gg)$/i, ''),
    sha256: digest,
    bytes: bytes.byteLength,
    compatibility: 'research',
  };
  if (/\.(gbc?|nes|gg)$/i.test(name)) {
    const known = catalog.games.find((game) => game.cartridge?.sha256 === digest);
    const folder = known?.cartridge.path.split('/')[0] ?? cartridgeFormat(name, bytes);
    const templates = {
      GB: 'demo-pocket-lab',
      GBC: 'demo-prism-relay',
      NES: 'demo-orbital-courier',
      GG: 'demo-prism-vault',
    };
    return {
      kind: 'games',
      entry: {
        ...entry,
        format: 4,
        platform: 'kpex',
        runtime: { profile: 'kpex' },
        cartridgeTemplate: known?.id ?? templates[folder],
        cartridgeFolder: folder,
        startHint:
          known?.startHint ?? 'Локальный картридж. Поддержка зависит от его команд и видеорежима.',
      },
    };
  }
  if (/\.sgs$/i.test(name)) {
    const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const format = detectVersion(raw);
    if (raw.length < 128 || ![1, 2, 4, 36].includes(format))
      throw Error(`${name}: не распознан контейнер SGS v1/v2/v4/v36.`);
    const offset = raw[0] === 32 && raw[1] === 0 && raw[2] === 0 && raw[3] === 0 ? 32 : 0;
    const kpex = [1, 2, 4, 36].includes(raw[offset] ^ 165);
    return {
      kind: 'games',
      entry: {
        ...entry,
        format,
        platform: kpex ? 'kpex' : 'mobile',
        runtime: kpex ? { profile: 'kpex' } : { profile: 'phone', width: 176, height: 220 },
        startHint: 'Неизвестная SGS: выбран базовый профиль. Совместимость не проверена.',
      },
    };
  }
  if (/\.(rom|bin)$/i.test(name) && bytes.byteLength >= 128) return { kind: 'firmwares', entry };
  if (/\.mod$/i.test(name))
    throw Error(`${name}: нужен неизменённый модуль swv21brew.mod (Swerve 2.1).`);
  if (/\.reunion-state$/i.test(name))
    throw Error(`${name}: это состояние не входит в проверенный каталог Kingston 2.12.`);
  if (/\.mbin$/i.test(name))
    throw Error(`${name}: эта версия игры Anycall отсутствует в проверенном каталоге.`);
  throw Error(`${name}: выберите SGS, ROM, GB/GBC/NES/GG, проверенный MBIN или состояние Reunion.`);
}
