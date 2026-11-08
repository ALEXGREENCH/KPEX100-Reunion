import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildHomebrewPack } from '../tools/homebrew-pack.mjs';
import { cartridgeDiskFiles } from '../web/engine/cartridge-disk.js';
import { createDisk } from '../web/engine/disk.js';
import { unzipSync } from '../web/vendor/fflate.js';

const web = new URL('../web/', import.meta.url);
const read = (path) => new Uint8Array(readFileSync(new URL(path, web)));
const catalog = JSON.parse(new TextDecoder().decode(read('data/catalog.json')));

test('cold boot and the player pack contain the same homebrew launchers and cartridges', async () => {
  const entries = catalog.games.filter((entry) => entry.cartridge);
  const disks = [];
  for (const entry of entries) {
    const sgs = read(entry.url);
    const files = await cartridgeDiskFiles(entry.cartridge, sgs);
    disks.push({ name: entry.cartridge.launcher, data: sgs }, ...files);
  }
  const zip = unzipSync(await buildHomebrewPack(fileURLToPath(web)));
  const image = createDisk(disks, read('data/firmware/Kingston-2.12.rom'));
  const view = new DataView(image.buffer);
  const start = view.getUint32(454, true) * 512;
  const clusterBytes = image[start + 13] * 512;
  const root = start + (1 + 2 * view.getUint16(start + 22, true)) * 512;
  const dataStart = root + view.getUint16(start + 17, true) * 32;
  const clusterAt = (n) => dataStart + (n - 2) * clusterBytes;
  const scan = (at, length) => {
    const result = new Map();
    for (let p = at; p < at + length && image[p] !== 0; p += 32) {
      const raw = new TextDecoder().decode(image.subarray(p, p + 11));
      const ext = raw.slice(8).trimEnd();
      const name = raw.slice(0, 8).trimEnd() + (ext ? '.' + ext : '');
      result.set(name, {
        cluster: view.getUint16(p + 26, true),
        size: view.getUint32(p + 28, true),
        directory: image[p + 11] === 0x10,
      });
    }
    return result;
  };
  const game = scan(root, 512 * 32).get('GAME');
  assert.ok(game?.directory);
  const contents = scan(clusterAt(game.cluster), clusterBytes);
  const folders = new Map();
  for (const folder of ['NES', 'GB', 'GBC', 'GG']) {
    const entry = contents.get(folder);
    assert.ok(entry?.directory, folder);
    const inside = scan(clusterAt(entry.cluster), clusterBytes);
    assert.equal(inside.get('.')?.cluster, entry.cluster);
    assert.equal(inside.get('..')?.cluster, game.cluster);
    assert.ok(inside.size > 2, folder + ' must contain a cartridge');
    folders.set(folder, inside);
  }
  for (const file of disks) {
    const entry = (file.folder ? folders.get(file.folder) : contents).get(file.name);
    const zipName = 'GAME/' + (file.folder ? file.folder + '/' : '') + file.name;
    assert.equal(entry?.size, file.data.length, zipName);
    const at = clusterAt(entry.cluster);
    assert.deepEqual(image.subarray(at, at + entry.size), file.data, zipName);
    assert.deepEqual(zip[zipName], file.data, zipName);
  }
});
