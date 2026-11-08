#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { walkFiles } from './public-files.mjs';
import { historicalAssets, verifyAsset } from './catalog-assets.mjs';

const root = fileURLToPath(new URL('../site/', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'build-manifest.json')));
assert.equal(typeof manifest.historicalAssets, 'boolean');
const assets = manifest.historicalAssets ? historicalAssets(root) : [];
const allowedAssets = new Set(assets.map((entry) => entry.url));
assert.deepEqual(
  JSON.parse(fs.readFileSync(path.join(root, 'data/availability.json'))).assets,
  assets.map((entry) => entry.id),
);
for (const entry of assets) verifyAsset(root, entry);
const files = walkFiles(root);
assert.equal(files.length, manifest.files.length + 1);
for (const entry of manifest.files) {
  if (
    entry.path.startsWith('data/') &&
    !['data/catalog.json', 'data/availability.json'].includes(entry.path)
  )
    assert.ok(allowedAssets.has(entry.path), entry.path);
  if (/\.(?:rom|sgs|mbin|mod|exe|dll|kps|sav|pdf|reunion-state)$/i.test(entry.path))
    assert.ok(allowedAssets.has(entry.path), entry.path);
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
  'engine/block-monitor.wasm',
  'engine/vendor/unicorn_arm.wasm',
  'engine/vendor/smaf.wasm',
  'licenses/index.html',
  'sources/vendor/unicorn-sources/block-monitor.wat',
])
  assert.ok(files.includes(file), `Missing ${file}`);
console.log(
  `Verified ${files.length} static files, ${assets.length} original hashes, relative HTML URLs and asset availability.`,
);
