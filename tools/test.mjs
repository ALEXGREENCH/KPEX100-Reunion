#!/usr/bin/env node
// Explicit suites work on Windows shells and do not silently skip missing originals.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const suite = process.argv[2] || 'unit';
if (!['unit', 'integration'].includes(suite)) throw Error('Expected unit or integration');
const unit = ['browser-audio.test.mjs', 'cpu-isolation.test.mjs', 'timers.test.mjs'];
const tests = fs.readdirSync(path.join(root, 'tests')).filter((name) => name.endsWith('.test.mjs'));
if (suite === 'integration') {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'web/data/catalog.json')));
  const entries = [
    ...catalog.firmwares,
    ...catalog.games,
    ...catalog.states,
    {
      url: 'engine/vendor/swerve/swv21brew.mod',
      sha256: '1e76412e158bc3948bf6ad173b181368e0f0d554d6b0e1488a29402d96b0cdab',
    },
  ];
  const missing = entries.filter((entry) => {
    const file = path.join(root, 'web', entry.url);
    return (
      !fs.existsSync(file) ||
      createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== entry.sha256
    );
  });
  if (missing.length) {
    console.error(
      `Integration tests need ${missing.length} missing/changed original files.\nImport with: python tools/assets.py import /path/to/originals\nUse npm test for the asset-free suite.`,
    );
    process.exit(1);
  }
}
const files = (suite === 'unit' ? unit : tests.filter((name) => !unit.includes(name))).map((name) =>
  path.join(root, 'tests', name),
);
if (suite === 'unit')
  files.push(
    ...fs
      .readdirSync(path.join(root, 'tests/unit'))
      .filter((name) => name.endsWith('.test.mjs'))
      .map((name) => path.join(root, 'tests/unit', name)),
  );
const result = spawnSync(process.execPath, ['--test', ...files.sort()], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
