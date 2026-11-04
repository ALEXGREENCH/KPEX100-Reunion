import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export function historicalAssets(webRoot) {
  const catalog = JSON.parse(fs.readFileSync(path.join(webRoot, 'data/catalog.json')));
  const entries = [
    ...catalog.firmwares,
    ...catalog.games,
    ...catalog.states,
    {
      id: 'swerve-2.1',
      url: 'engine/vendor/swerve/swv21brew.mod',
      bytes: 273188,
      sha256: '1e76412e158bc3948bf6ad173b181368e0f0d554d6b0e1488a29402d96b0cdab',
    },
  ];
  for (const entry of entries) {
    if (
      !/^[\w./-]+$/.test(entry.url) ||
      entry.url.split('/').some((part) => part === '..' || !part) ||
      path.isAbsolute(entry.url)
    )
      throw Error(`Invalid catalogue path: ${entry.id}`);
  }
  return entries;
}

export function verifyAsset(root, entry) {
  const file = path.join(root, entry.url);
  if (!fs.existsSync(file))
    throw Error(
      `Missing ${entry.url}. Restore the bundled collection or use npm run build:source-only.`,
    );
  if (fs.lstatSync(file).isSymbolicLink()) throw Error(`Asset is a symlink: ${entry.url}`);
  const bytes = fs.readFileSync(file);
  if (
    bytes.length !== entry.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== entry.sha256
  )
    throw Error(`Original asset checksum mismatch: ${entry.url}`);
}
