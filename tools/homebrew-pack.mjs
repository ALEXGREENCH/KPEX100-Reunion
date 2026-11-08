#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cartridgeDiskFiles } from '../web/engine/cartridge-disk.js';
import { strToU8, zipSync } from '../web/vendor/fflate.js';
import { verifyAsset } from './catalog-assets.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

export async function buildHomebrewPack(webRoot) {
  const { games } = JSON.parse(fs.readFileSync(path.join(webRoot, 'data/catalog.json'), 'utf8'));
  const files = {
    'README.txt': strToU8(
      'Reunion homebrew for Kingston K-PEX 100\r\n' +
        'Merge the GAME folder into the player storage. Keep the SGS launchers and their flat\r\n' +
        'cartridges together. The NES, GB, GBC and GG folders hold separate cartridge copies.\r\n' +
        'Use a launcher from the GAME menu. LICENSE.txt covers Reunion; see LICENSES for\r\n' +
        'third-party ROMs. Compatibility and build sources:\r\n' +
        'https://github.com/ALEXGREENCH/KPEX100-Reunion/tree/main/demos/kpex\r\n',
    ),
    'LICENSE.txt': new Uint8Array(fs.readFileSync(path.join(root, 'LICENSE'))),
  };
  function add(relativePath, bytes) {
    if (Object.hasOwn(files, relativePath)) throw Error('Duplicate homebrew file: ' + relativePath);
    files[relativePath] = bytes;
  }
  for (const entry of games.filter((item) => item.cartridge)) {
    verifyAsset(webRoot, entry);
    const bytes = fs.readFileSync(path.join(webRoot, entry.url));
    const cartridgeFiles = await cartridgeDiskFiles(entry.cartridge, bytes);
    add('GAME/' + entry.cartridge.launcher, bytes);
    for (const file of cartridgeFiles)
      add('GAME/' + (file.folder ? file.folder + '/' : '') + file.name, file.data);
    if (entry.cartridge.licenseFile) {
      const license = path.resolve(root, entry.cartridge.licenseFile);
      if (!license.startsWith(path.join(root, 'demos') + path.sep))
        throw Error('Invalid homebrew license path: ' + entry.id);
      add(
        'LICENSES/' + entry.cartridge.launcher.replace(/\.SGS$/, '.txt'),
        fs.readFileSync(license),
      );
    }
  }
  return zipSync(files, { mtime: new Date(2026, 10, 8) });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.argv[2];
  if (!output || process.argv.length !== 3)
    throw Error('Usage: node tools/homebrew-pack.mjs output.zip');
  fs.writeFileSync(output, await buildHomebrewPack(path.join(root, 'web')));
}
