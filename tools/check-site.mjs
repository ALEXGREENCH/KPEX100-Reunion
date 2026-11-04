#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { walkFiles } from './public-files.mjs';

const root = fileURLToPath(new URL('../site/', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'build-manifest.json')));
assert.equal(manifest.historicalAssets, false);
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'data/availability.json'))).assets, []);
assert.deepEqual(fs.readdirSync(path.join(root, 'data')).sort(), [
  'availability.json',
  'catalog.json',
]);
const files = walkFiles(root);
assert.equal(files.length, manifest.files.length + 1);
for (const entry of manifest.files) {
  assert.ok(!/\.(?:rom|sgs|mod|exe|dll|kps|sav|pdf)$/i.test(entry.path), entry.path);
  const bytes = fs.readFileSync(path.join(root, entry.path));
  assert.equal(bytes.length, entry.bytes, entry.path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, entry.path);
  if (/\.(?:html|css)$/.test(entry.path)) {
    assert.ok(
      !/(?:src|href)\s*=\s*["']\/(?!\/)/i.test(bytes.toString()),
      `Root-absolute URL: ${entry.path}`,
    );
  }
}
for (const file of [
  'index.html',
  'worker.js',
  'smaf-worker.js',
  'engine/vendor/unicorn_arm.wasm',
  'engine/vendor/smaf.wasm',
  'licenses/index.html',
])
  assert.ok(files.includes(file), `Missing ${file}`);
console.log(
  `Verified ${files.length} static files, hashes, relative HTML URLs and empty asset manifest.`,
);
