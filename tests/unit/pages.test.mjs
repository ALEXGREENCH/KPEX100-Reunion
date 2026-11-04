import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from '../../tools/serve.mjs';
import { isPublicWebFile } from '../../tools/public-files.mjs';

test('Pages selection excludes original data and imported binary modules', () => {
  for (const file of [
    'data/games/HELLFIRE.SGS',
    'data/firmware/Kingston-2.12.rom',
    'data/states/menu.reunion-state',
    'data/unrecognized.bin',
    'data/availability.json',
    'engine/vendor/swerve/swv21brew.mod',
    '.openai/state.json',
    'engine/game.sgs',
  ])
    assert.equal(isPublicWebFile(file), false, file);
  for (const file of [
    'index.html',
    'app.js',
    'local-assets.js',
    'data/catalog.json',
    'engine/vendor/unicorn_arm.wasm',
    'engine/vendor/LICENSE',
    'engine/vendor/smaf.mjs',
  ])
    assert.equal(isPublicWebFile(file), true, file);
});

test('static preview serves a project prefix and WASM without falling back to HTML', async () => {
  const server = createStaticServer(
    fileURLToPath(new URL('../../web/', import.meta.url)),
    '/KPEX100-Reunion/',
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(origin + '/KPEX100-Reunion/');
    assert.equal(response.status, 200);
    assert.match(await response.text(), /app\.js/);
    const wasm = await fetch(origin + '/KPEX100-Reunion/engine/vendor/unicorn_arm.wasm');
    assert.equal(wasm.headers.get('content-type'), 'application/wasm');
    assert.deepEqual([...new Uint8Array(await wasm.arrayBuffer()).slice(0, 4)], [0, 97, 115, 109]);
    const module = await fetch(origin + '/KPEX100-Reunion/local-assets.js');
    assert.match(module.headers.get('content-type'), /javascript/);
    assert.equal((await fetch(origin + '/app.js')).status, 404);
    assert.equal((await fetch(origin + '/KPEX100-Reunion/absent.js')).status, 404);
    assert.equal((await fetch(origin + '/KPEX100-Reunion/%2e%2e%2fpackage.json')).status, 403);
    const redirect = await fetch(origin + '/KPEX100-Reunion', { redirect: 'manual' });
    assert.equal(redirect.headers.get('location'), '/KPEX100-Reunion/');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
