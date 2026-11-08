import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildHomebrewPack } from '../tools/homebrew-pack.mjs';
import { cartridgeDiskFiles, replaceCartridge } from '../web/engine/cartridge-disk.js';
import { createDisk } from '../web/engine/disk.js';
import { GnexRuntime } from '../web/engine/gnex.js';
import { SgsFile } from '../web/engine/sgs.js';
import { identifyAsset, sha256 } from '../web/local-assets.js';
import { unzipSync } from '../web/vendor/fflate.js';

const web = new URL('../web/', import.meta.url);
const read = (path) => new Uint8Array(readFileSync(new URL(path, web)));
const catalog = JSON.parse(new TextDecoder().decode(read('data/catalog.json')));

test('a local CGB cartridge changes the original GNEX scene without changing its interpreter', async () => {
  const entry = catalog.games.find((item) => item.id === 'demo-prism-relay');
  const original = read(entry.url);
  const [{ data }] = await cartridgeDiskFiles(entry.cartridge, original);
  // CGB palette zero, first color. The launcher draws the file's new RGB555 red.
  data[0xd00] = 31;
  data[0xd01] = 0;
  const replaced = replaceCartridge(original, entry.cartridge.sidecar, data);
  const oldFile = new SgsFile(original);
  const newFile = new SgsFile(replaced);
  assert.equal(newFile.xorMask, 165);
  assert.deepEqual(
    newFile.body.subarray(0, newFile.declaredSize),
    oldFile.body.subarray(0, oldFile.declaredSize),
  );
  const game = await GnexRuntime.create(read('data/firmware/Kingston-2.12.rom'), replaced, {
    profile: 'kpex',
  });
  try {
    game.event('START');
    for (let i = 0; i < 90; i++) game.event('TIMEOUT', 0);
    const pixel = (64 * 220 + 54) * 4;
    assert.deepEqual([...game.framebufferRGBA.slice(pixel, pixel + 4)], [255, 0, 0, 255]);
  } finally {
    game.close();
  }
});

test('cold boot and the player pack contain the same homebrew launchers and cartridges', async () => {
  const entries = catalog.games.filter((entry) => entry.cartridge);
  const disks = [];
  for (const entry of entries) {
    const sgs = read(entry.url);
    const files = await cartridgeDiskFiles(entry.cartridge, sgs);
    disks.push({ name: entry.cartridge.launcher, data: sgs }, ...files);
  }
  const zip = unzipSync(await buildHomebrewPack(fileURLToPath(web)));
  for (const { cartridge } of entries) {
    const name = cartridge.launcher.replace(/\.SGS$/, '');
    if (cartridge.licenseFile) {
      const license = readFileSync(new URL('../' + cartridge.licenseFile, import.meta.url));
      assert.deepEqual(zip['LICENSES/' + name + '.txt'], new Uint8Array(license));
    }
    if (cartridge.sourceArchive) {
      const source = readFileSync(new URL('../' + cartridge.sourceArchive.url, import.meta.url));
      assert.deepEqual(zip['SOURCES/' + name + '.zip'], new Uint8Array(source));
      const members = unzipSync(source);
      assert.ok(
        members.Makefile && Object.keys(members).some((file) => file.startsWith('source/')),
      );
    }
  }
  for (const { id, cartridge } of entries.filter((entry) => entry.cartridge.sha256)) {
    const name = cartridge.path.split('/')[1];
    const original = zip['GAME/' + cartridge.path];
    if (cartridge.licenseFile) {
      const path = cartridge.licenseFile.replace(/[^/]+$/, name);
      assert.deepEqual(
        original,
        new Uint8Array(readFileSync(new URL('../' + path, import.meta.url))),
      );
    }
    const digest = await sha256(original);
    assert.equal(digest, cartridge.sha256);
    const extension = name.slice(name.lastIndexOf('.'));
    assert.equal(
      identifyAsset(catalog, 'renamed' + extension, original, digest).entry.cartridgeTemplate,
      id,
    );
  }
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
