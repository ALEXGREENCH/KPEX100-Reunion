// Reproducible FAT16 media with the ROM's raw resource area at LBA 4096.
const encoder = new TextEncoder();
export function createDisk(files, rom) {
  const total = 131072,
    start = 32768,
    reserved = 1,
    roots = 512,
    spc = 4,
    part = total - start,
    rootSectors = 32;
  let fatSectors = 1,
    clusters;
  while (true) {
    clusters = Math.floor((part - reserved - 2 * fatSectors - rootSectors) / spc);
    const needed = Math.ceil((2 * (clusters + 2)) / 512);
    if (needed <= fatSectors) break;
    fatSectors = needed;
  }
  const image = new Uint8Array(total * 512),
    view = new DataView(image.buffer),
    bpb = start * 512;
  const u16 = (at, value) => view.setUint16(at, value, true),
    u32 = (at, value) => view.setUint32(at, value, true);
  image.set([0x80, 0xfe, 0xff, 0xff, 0x06, 0xfe, 0xff, 0xff], 446);
  u32(454, start);
  u32(458, part);
  image.set([0x55, 0xaa], 510);
  image.set([0xeb, 0x3c, 0x90], bpb);
  image.set(encoder.encode('MSDOS5.0'), bpb + 3);
  u16(bpb + 11, 512);
  image[bpb + 13] = spc;
  u16(bpb + 14, reserved);
  image[bpb + 16] = 2;
  u16(bpb + 17, roots);
  u16(bpb + 19, part < 65536 ? part : 0);
  image[bpb + 21] = 0xf8;
  u16(bpb + 22, fatSectors);
  u16(bpb + 24, 63);
  u16(bpb + 26, 255);
  u32(bpb + 28, start);
  u32(bpb + 32, part >= 65536 ? part : 0);
  image.set([0x80, 0, 0x29], bpb + 36);
  u32(bpb + 39, 0x4b504558);
  image.set(encoder.encode('KPEX REUNION'.slice(0, 11)), bpb + 43);
  image.set(encoder.encode('FAT16   '), bpb + 54);
  image.set([0x55, 0xaa], bpb + 510);
  const rootLba = start + reserved + 2 * fatSectors,
    dataLba = rootLba + rootSectors;
  const fat = new Uint8Array(fatSectors * 512),
    fv = new DataView(fat.buffer);
  fv.setUint16(0, 0xfff8, true);
  fv.setUint16(2, 0xffff, true);
  let next = 2;
  function allocate(payload) {
    if (!payload.length) return 0;
    const n = Math.ceil(payload.length / 2048),
      first = next;
    if (first + n > clusters + 2) throw new Error('Игры не помещаются на виртуальный диск');
    for (let i = 0; i < n; i++) {
      const cluster = next++;
      fv.setUint16(cluster * 2, i === n - 1 ? 0xffff : cluster + 1, true);
      image.set(payload.subarray(i * 2048, (i + 1) * 2048), (dataLba + (cluster - 2) * spc) * 512);
    }
    return first;
  }
  function entry(at, name, attr, cluster = 0, size = 0) {
    image.set(encoder.encode(name), at);
    image[at + 11] = attr;
    const date = ((2026 - 1980) << 9) | (11 << 5) | 4;
    u16(at + 16, date);
    u16(at + 18, date);
    u16(at + 24, date);
    u16(at + 26, cluster);
    u32(at + 28, size);
  }
  entry(rootLba * 512, 'KPEX REUNIO', 8);
  const directories = {};
  ['GAME', 'MUSIC', 'PHOTO', 'VIDEO', 'TEXT'].forEach((name, i) => {
    const cluster = allocate(new Uint8Array(2048));
    directories[name] = cluster;
    const at = (dataLba + (cluster - 2) * spc) * 512;
    entry(at, '.          ', 0x10, cluster);
    entry(at + 32, '..         ', 0x10);
    entry(rootLba * 512 + (i + 1) * 32, name.padEnd(11), 0x10, cluster);
  });
  const gameOffset = (dataLba + (directories.GAME - 2) * spc) * 512;
  if (files.length > 62) throw new Error('Слишком много файлов в каталоге GAME');
  const used = new Set();
  [...files]
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((file, i) => {
      const name = file.name.toUpperCase();
      if (!/^[A-Z0-9_-]{1,8}\.[A-Z0-9_-]{1,3}$/.test(name) || used.has(name))
        throw new Error('Invalid DOS alias: ' + name);
      used.add(name);
      const [base, ext] = name.split('.'),
        cluster = allocate(file.data);
      entry(
        gameOffset + (i + 2) * 32,
        base.padEnd(8) + ext.padEnd(3),
        0x20,
        cluster,
        file.data.length,
      );
    });
  for (let n = 0; n < 2; n++) image.set(fat, (start + reserved + n * fatSectors) * 512);
  if (rom) {
    const rv = new DataView(rom.buffer, rom.byteOffset, rom.byteLength);
    if (rom.length < 0x100000 || rv.getUint32(0x14, true) !== 3)
      throw new Error('Invalid ROM resource header');
    for (let n = 0; n < 3; n++) {
      const at = 0x20 + 16 * n,
        source = rv.getUint32(at, true),
        sector = rv.getUint32(at + 4, true),
        length = rv.getUint32(at + 8, true) * 512,
        target = (4096 + sector) * 512;
      if (source < 0x100000 || source + length > rom.length || target + length > start * 512)
        throw new Error('Invalid ROM resource mapping');
      image.set(rom.subarray(source, source + length), target);
    }
  }
  return image;
}
