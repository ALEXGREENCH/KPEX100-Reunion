import fs from 'node:fs';
import path from 'node:path';

/** Select runtime files; bundled originals are copied separately after SHA-256 verification. */
export function isPublicWebFile(name) {
  const file = name.replaceAll('\\', '/');
  if (file === 'data/catalog.json') return true;
  if (file.startsWith('data/')) return false;
  if (file.startsWith('engine/vendor/swerve/')) return false;
  if (file.split('/').some((part) => part.startsWith('.') || part === '..')) return false;
  return /\.(?:html|css|js|mjs|json|wasm|svg|txt)$/.test(file) || file === 'engine/vendor/LICENSE';
}

export function walkFiles(directory, prefix = '') {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      if (entry.isSymbolicLink()) throw Error(`Symbolic links are not build inputs: ${entry.name}`);
      const name = prefix + entry.name;
      return entry.isDirectory() ? walkFiles(path.join(directory, entry.name), name + '/') : [name];
    });
}
