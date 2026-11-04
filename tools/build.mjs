#!/usr/bin/env node
/** Build a static, original-free GitHub Pages artifact, even after local asset imports. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { isPublicWebFile, walkFiles } from './public-files.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'web');
const target = path.resolve(root, 'site');
// Only this generated directory can be removed. Do not follow a junction/symlink.
if (path.dirname(target) !== path.resolve(root) || path.basename(target) !== 'site')
  throw Error('Invalid build target');
if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink())
  throw Error('site must not be a symlink');
fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target);
function copy(from, name) {
  const destination = path.join(target, name);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(from, destination);
}
for (const file of walkFiles(source).filter(isPublicWebFile)) copy(path.join(source, file), file);
fs.writeFileSync(
  path.join(target, 'data/availability.json'),
  JSON.stringify({ version: 1, assets: [] }) + '\n',
);
fs.writeFileSync(path.join(target, '.nojekyll'), '');
// Serve the corresponding sources alongside redistributed runtime binaries.
for (const file of walkFiles(path.join(root, 'vendor')))
  copy(path.join(root, 'vendor', file), 'sources/vendor/' + file);
for (const file of ['build-smaf.py', 'smaf-wrapper.cpp'])
  copy(path.join(root, 'tools', file), 'sources/tools/' + file);
for (const file of ['LICENSE', 'THIRD_PARTY.md']) copy(path.join(root, file), 'licenses/' + file);
const sourceArchives = walkFiles(path.join(root, 'vendor/unicorn-sources'));
fs.writeFileSync(
  path.join(target, 'licenses/index.html'),
  `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Reunion — licenses and sources</title>
<style>body{font:18px/1.6 system-ui;max-width:54rem;margin:3rem auto;padding:0 1rem}a{color:#1661ba}</style>
<h1>Licenses and corresponding sources</h1><p><a href="../">Back to Reunion</a></p>
<p>Original Reunion code: <a href="LICENSE">MIT</a>. <a href="THIRD_PARTY.md">Third-party notices</a>.</p>
<ul><li>Unicorn.js ARM 1.0.3 — <a href="../engine/vendor/LICENSE">GPL-2.0</a>,
<a href="../engine/vendor/unicorn-provenance.json">exact revisions and hashes</a>.
Corresponding source: ${sourceArchives.map((name) => `<a href="../sources/vendor/unicorn-sources/${name}">${name}</a>`).join(', ')}.</li>
<li>Yamaha SMAF Player — <a href="../sources/vendor/yamaha-smaf-player/LICENSE">Apache-2.0</a>.
<a href="../sources/vendor/yamaha-smaf-player/PATCHES.md">Modifications</a>,
<a href="../sources/tools/build-smaf.py">build script</a>, <a href="../sources/tools/smaf-wrapper.cpp">wrapper</a>,
<a href="../sources/files.json">source file index</a>.</li>
<li>fflate 0.8.2 — <a href="../vendor/fflate-LICENSE.txt">MIT</a>.</li></ul>
<p>No original firmware, SGS games, native quickstates, GNEX SDK installers, or Swerve binary are included.</p></html>\n`,
);
fs.writeFileSync(
  path.join(target, 'sources/files.json'),
  JSON.stringify(walkFiles(path.join(target, 'sources')), null, 2) + '\n',
);
const indexFile = path.join(target, 'index.html');
fs.writeFileSync(
  indexFile,
  fs
    .readFileSync(indexFile, 'utf8')
    .replace(
      '</body>',
      '<footer style="text-align:center;padding:1rem"><a href="./licenses/">Licenses &amp; sources</a></footer>\n</body>',
    ),
);
const files = walkFiles(target).map((name) => {
  const bytes = fs.readFileSync(path.join(target, name));
  return {
    path: name,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
});
fs.writeFileSync(
  path.join(target, 'build-manifest.json'),
  JSON.stringify({ schema: 1, historicalAssets: false, files }, null, 2) + '\n',
);
console.log(
  `Built site/ — ${files.length + 1} files, no historical assets. Preview: npm run preview`,
);
