import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../web/', import.meta.url));
function waitMessage(worker, predicate, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.off('message', listen);
      reject(Error('Worker did not reach expected state'));
    }, timeout);
    function listen(message) {
      if (predicate(message)) {
        clearTimeout(timer);
        worker.off('message', listen);
        resolve(message);
      }
    }
    worker.on('message', listen);
  });
}
test('real worker supports game input, pause, step and rapid session changes', async () => {
  const requests = [];
  let corruptMbin = true;
  const mbinUrl = '/data/games/anycall/merry-christmas.mbin';
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    requests.push(pathname);
    const retry = pathname === '/retry.mbin';
    const file = path.join(root, retry ? mbinUrl : pathname);
    fs.readFile(file, (error, data) => {
      if (!error && retry && corruptMbin) data[0] ^= 1;
      response.writeHead(error ? 404 : 200);
      response.end(error ? 'Missing' : data);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}/`;
  const worker = new Worker(new URL('./worker-harness.mjs', import.meta.url), {
    workerData: { origin },
  });
  try {
    await waitMessage(worker, (m) => m.type === 'ready');
    const loaded = waitMessage(
      worker,
      (m) => m.type === 'status' && m.status === 'idle' && m.sessionId === 1,
    );
    worker.postMessage({
      type: 'loadGame',
      sessionId: 1,
      gameId: 'kpetris',
      romUrl: 'data/firmware/Kingston-2.12.rom',
      gameUrl: 'data/games/kpetris.sgs',
    });
    const title = await loaded;
    assert.equal(title.events, 1);
    const playing = waitMessage(
      worker,
      (m) => m.type === 'status' && m.sessionId === 1 && m.events >= 2,
    );
    worker.postMessage({ type: 'key', sessionId: 1, key: 'a', pressed: true });
    worker.postMessage({ type: 'key', sessionId: 1, key: 'a', pressed: false });
    const started = await playing;
    assert.equal(started.diagnostics.timer_ms, 1000);
    const paused = waitMessage(
      worker,
      (m) => m.type === 'status' && m.sessionId === 1 && m.running === false,
    );
    worker.postMessage({ type: 'pause', sessionId: 1 });
    const before = await paused;
    const stepped = waitMessage(
      worker,
      (m) => m.type === 'status' && m.sessionId === 1 && m.events === before.events + 1,
    );
    worker.postMessage({ type: 'step', sessionId: 1 });
    assert.equal((await stepped).running, false);
    const changed = waitMessage(
      worker,
      (m) => m.type === 'status' && m.sessionId === 3 && m.status === 'idle',
    );
    for (const [sessionId, gameId] of [
      [2, 'godori'],
      [3, 'hellfire'],
    ])
      worker.postMessage({
        type: 'loadGame',
        sessionId,
        gameId,
        romUrl: 'data/firmware/Kingston-2.12.rom',
        gameUrl: `data/games/${gameId}.sgs`,
      });
    worker.postMessage({ type: 'pause', sessionId: 1 });
    assert.equal((await changed).running, true, 'Old session commands affected the new game');

    const newRequests = requests.length;
    const adsFrame = waitMessage(worker, (m) => m.type === 'frame' && m.sessionId === 4);
    worker.postMessage({
      type: 'loadGame',
      engine: 'ads',
      sessionId: 4,
      gameId: 'merry-christmas',
      gameUrl: mbinUrl.slice(1),
    });
    const { width, height } = await adsFrame;
    assert.deepEqual([width, height], [120, 128]);
    assert.deepEqual(requests.slice(newRequests), [mbinUrl]);

    const adsPaused = waitMessage(
      worker,
      (m) => m.type === 'status' && m.sessionId === 4 && m.running === false,
    );
    worker.postMessage({ type: 'pause', sessionId: 4 });
    const adsEvents = (await adsPaused).events;
    const adsStepped = waitMessage(
      worker,
      (m) => m.type === 'status' && m.sessionId === 4 && m.events === adsEvents + 1,
    );
    worker.postMessage({ type: 'step', sessionId: 4 });
    assert.equal((await adsStepped).running, false);

    const adsLoad = {
      type: 'loadGame',
      engine: 'ads',
      gameId: 'merry-christmas',
      gameUrl: 'retry.mbin',
    };
    const corrupt = waitMessage(worker, (m) => m.status === 'error' && m.sessionId === 5);
    worker.postMessage({ ...adsLoad, sessionId: 5 });
    assert.match((await corrupt).error, /Контрольная сумма/);
    corruptMbin = false;
    const recovered = waitMessage(worker, (m) => m.type === 'frame' && m.sessionId === 6);
    worker.postMessage({ ...adsLoad, sessionId: 6 });
    assert.equal((await recovered).width, 120);
    assert.equal(requests.filter((pathname) => pathname === '/retry.mbin').length, 2);
  } finally {
    await worker.terminate();
    await new Promise((resolve) => server.close(resolve));
  }
});
