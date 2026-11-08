/** Fit a native framebuffer into a fixed LCD without changing its geometry. */
export function fitFrame(width, height, boxWidth, boxHeight) {
  const fit = Math.min(boxWidth / width, boxHeight / height);
  const scale = fit >= 1 ? Math.floor(fit) : fit;
  return { width: width * scale, height: height * scale };
}

const playerKeys = [
  ['menu', 'MENU'],
  ['up', '▲'],
  ['a', 'SELECT'],
  ['left', '◀'],
  ['down', '▼'],
  ['right', '▶'],
  ['b', 'ESC'],
  ['start', 'PLAY'],
  ['mode', 'MODE'],
  ['rec', 'REC'],
];
const phoneKeys = [
  ['f1', 'Меню'],
  ['up', '▲'],
  ['f2', 'Назад'],
  ['left', '◀'],
  ['a', 'OK'],
  ['right', '▶'],
  ['send', 'Вызов'],
  ['down', '▼'],
  ['end', 'Отбой'],
  ...Array.from({ length: 9 }, (_, i) => [`digit${i + 1}`, String(i + 1)]),
  ['star', '*'],
  ['digit0', '0'],
  ['hash', '#'],
  ['clear', 'CLR'],
  ['start', 'ENTER'],
];
const anycallKeys = [
  ['a', 'OK'],
  ['up', '▲'],
  ['start', 'ENTER'],
  ['left', '◀'],
  ['down', '▼'],
  ['right', '▶'],
  ...phoneKeys.filter(([key]) => /^digit[1-9]$/.test(key)),
  ['digit0', '0'],
];

export const devices = [
  { id: 'kingston', title: 'Kingston K-PEX100', type: 'player', keys: playerKeys },
  { id: 'cenix', title: 'Cenix GMP-M6', type: 'player', keys: playerKeys },
  ...['sd1000', 'sd1020', 'sv130', 'sd810'].map((id) => ({
    id,
    title: `LG ${id.toUpperCase()}`,
    type: 'phone',
    keys: phoneKeys,
  })),
  { id: 'gnex', title: 'GNEX · универсальный телефон', type: 'phone', keys: phoneKeys },
  {
    id: 'anycall',
    title: 'Samsung Anycall · универсальный телефон',
    type: 'phone',
    keys: anycallKeys,
  },
];

// Explicit provenance identities. A skin never changes the runtime handset profile.
const gameDevices = {
  'galaga-lg-sd1000': 'sd1000',
  'fortress-tournament-lg-sd1000': 'sd1000',
  'bubble-bobble-lg-sd1020': 'sd1020',
  'vocabulary-quiz-lg-sv130': 'sv130',
  ...Object.fromEntries(
    [
      'zzayo-zzayo-tycoon',
      'sword-master-chronicle',
      'tetris-classic',
      'rolling-fry',
      'shrek-2',
    ].map((id) => [`${id}-lg-sd810`, 'sd810']),
  ),
};

export function automaticDevice(session) {
  if (!session) return 'kingston';
  if (session.kind === 'game') {
    if (session.engine === 'ads') return 'anycall';
    return gameDevices[session.id] || (session.platform === 'mobile' ? 'gnex' : 'kingston');
  }
  return session.rom?.id?.startsWith('cenix-') ? 'cenix' : 'kingston';
}

export function deviceFor(session, override = 'auto') {
  const device =
    devices.find((device) => device.id === override) ||
    devices.find((device) => device.id === automaticDevice(session));
  if (
    device.id === 'anycall' &&
    session?.engine === 'ads' &&
    ['mr-ramen', 'bubble-monk'].includes(session.id)
  ) {
    return { ...device, keys: [...device.keys, ['hash', '#']] };
  }
  return device;
}
