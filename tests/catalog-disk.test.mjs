import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createDisk } from '../web/engine/disk.js';
const asset = (path) => new Uint8Array(readFileSync(new URL('../web/' + path, import.meta.url)));
const catalog = JSON.parse(new TextDecoder().decode(asset('data/catalog.json')));
const digest = (data) => createHash('sha256').update(data).digest('hex');

test('all catalogue ROMs, SGS and reached states retain original bytes', () => {
  assert.equal(catalog.firmwares.length, 9);
  assert.equal(catalog.games.length, 91);
  assert.equal(catalog.states.length, 3);
  for (const group of [catalog.firmwares, catalog.games, catalog.states]) {
    assert.equal(new Set(group.map((x) => x.id)).size, group.length);
    for (const entry of group) {
      const data = asset(entry.url);
      assert.equal(data.length, entry.bytes);
      assert.equal(digest(data), entry.sha256, entry.url);
    }
  }
});
test('browser FAT16 disk is byte-for-byte equal to the verified native disk', () => {
  const aliases = {
    hellfire: 'HELLFIRE.SGS',
    kpetris: 'KPETRIS.SGS',
    ikaria: 'IKARIA.SGS',
    godori: 'GODORI.SGS',
  };
  const files = catalog.games
    .filter((g) => g.compatibility === 'verified')
    .map((g) => ({ name: aliases[g.id], data: asset(g.url) }));
  const disk = createDisk(files, asset('data/firmware/Kingston-2.12.rom'));
  assert.equal(digest(disk), 'e94efcedd5294f121ab721fd69e80b7919d64488d0a1623a9d429d791dc24017');
});
test('all catalogue apps can be read from FAT chains without changing raw ROM resources', () => {
  const files = catalog.games.map((g, i) => ({
    name: `R${String(i).padStart(7, '0')}.SGS`,
    data: asset(g.url),
  }));
  const rom = asset('data/firmware/Kingston-2.12.rom'),
    disk = createDisk(files, rom),
    view = new DataView(disk.buffer);
  const start = view.getUint32(454, true),
    base = start * 512,
    spc = disk[base + 13],
    fatSize = view.getUint16(base + 22, true),
    fat = (start + 1) * 512;
  const root = (start + 1 + 2 * fatSize) * 512,
    dataStart = root + 512 * 32,
    gameCluster = view.getUint16(root + 32 + 26, true);
  function readChain(first) {
    const parts = [],
      visited = new Set();
    let cluster = first;
    while (cluster >= 2 && cluster < 0xfff8) {
      assert(!visited.has(cluster), 'FAT cycle');
      visited.add(cluster);
      const at = dataStart + (cluster - 2) * spc * 512;
      parts.push(disk.subarray(at, at + spc * 512));
      cluster = view.getUint16(fat + cluster * 2, true);
    }
    assert.equal(cluster, 0xffff, 'Chain terminates with EOC');
    return Buffer.concat(parts);
  }
  const directory = readChain(gameCluster);
  assert.equal(directory.length, 4096, 'GAME spans two clusters');
  const directoryView = new DataView(directory.buffer, directory.byteOffset, directory.byteLength);
  assert.deepEqual(
    disk.subarray(fat, fat + fatSize * 512),
    disk.subarray(fat + fatSize * 512, fat + 2 * fatSize * 512),
  );
  assert.equal(view.getUint16(base + 510, true), 0xaa55);
  for (let i = 0; i < files.length; i++) {
    const entry = (i + 2) * 32,
      size = directoryView.getUint32(entry + 28, true),
      cluster = directoryView.getUint16(entry + 26, true),
      data = readChain(cluster).subarray(0, size);
    assert.equal(
      directory.subarray(entry, entry + 11).toString('ascii'),
      files[i].name.replace('.', ''),
    );
    assert.equal(digest(data), digest(files[i].data));
  }
  assert.deepEqual(
    disk.subarray(4096 * 512, 4096 * 512 + 0x1000),
    rom.subarray(0x100000, 0x101000),
  );
});
