#!/usr/bin/env node
/** Browser layout/input contract. Run after build; install playwright separately for this optional check. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from './serve.mjs';
const { chromium } = await import(process.env.REUNION_PLAYWRIGHT || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const server = createStaticServer(path.join(root, 'site'), '/KPEX100-Reunion/');
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({
  headless: true,
  ...(process.env.REUNION_CHROME ? { executablePath: process.env.REUNION_CHROME } : {}),
});
const origin = `http://127.0.0.1:${server.address().port}/KPEX100-Reunion/`;
const output = process.env.REUNION_BROWSER_OUTPUT;
if (output) fs.mkdirSync(output, { recursive: true });
const results = [];
const fakeWorker = `
self.postMessage({type:'ready'});
self.onmessage=({data})=>{
 if(['loadGame','boot','loadState'].includes(data.type)) {
  const size=data.gameId?.includes('soccer')?[240,320]:data.gameId?.includes('sd1000')?[128,128]:data.gameId?.includes('sv130')?[176,204]:data.gameId?.includes('sd810')?[120,160]:[220,176];
  self.postMessage({type:'status',status:'running',running:true,sessionId:data.sessionId});
  self.postMessage({type:'frame',width:size[0],height:size[1],pixels:new Uint8ClampedArray(size[0]*size[1]*4).fill(128),sessionId:data.sessionId});
 }
};`;
async function prepare(viewport, mobile = false) {
  const context = await browser.newContext({ viewport, hasTouch: mobile });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.testMessages = [];
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      postMessage(data, ...rest) {
        window.testMessages.push(data);
        return super.postMessage(data, ...rest);
      }
    };
  });
  await page.route('**/worker.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: fakeWorker }),
  );
  await page.goto(origin);
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.library-item').length > 20 &&
      document.querySelector('#deviceShell image'),
  );
  return { context, page, errors };
}
function sameBox(a, b) {
  for (const key of ['x', 'y', 'width', 'height'])
    assert.ok(Math.abs(a[key] - b[key]) <= 1, `${key} moved: ${a[key]} -> ${b[key]}`);
}
async function load(page, title) {
  await page.locator('#openLibrary').click();
  await page.locator('#librarySearch').fill(title);
  await page
    .locator('.library-item')
    .filter({ has: page.getByText(title, { exact: true }) })
    .click();
  await page.waitForFunction(
    () => document.querySelector('#playPause span').textContent === 'Пауза',
  );
}
try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
    { width: 320, height: 740 },
  ]) {
    const { page, context, errors } = await prepare(viewport, viewport.width < 600);
    const initial = await page.locator('#lcdWindow').boundingBox();
    assert.ok(Math.abs(initial.width / initial.height - 1.25) < 0.001 && initial.width <= 440);
    for (const [title, device] of [
      ['Hell Fire', 'kingston'],
      ['Galaga (LG SD1000)', 'sd1000'],
      ['Bubble Bobble (LG SD1020)', 'sd1020'],
      ['English Vocabulary Quiz King (LG SV130)', 'sv130'],
      ['Shrek 2 (LG SD810)', 'sd810'],
      ['Com2Us Soccer 2006', 'gnex'],
    ]) {
      await load(page, title);
      await page.waitForFunction(
        (id) => document.querySelector('#screenArea').dataset.device === id,
        device,
      );
      sameBox(initial, await page.locator('#lcdWindow').boundingBox());
      const frame = await page.locator('#screen').boundingBox();
      assert.ok(frame.width <= initial.width + 1 && frame.height <= initial.height + 1);
    }
    // Choosing a shell must not send a new load or change native framebuffer dimensions.
    const loads = await page.evaluate(
      () => testMessages.filter((x) => ['loadGame', 'boot', 'loadState'].includes(x.type)).length,
    );
    const native = await page.locator('#screen').evaluate((c) => [c.width, c.height]);
    await page.locator('#openMenu').click();
    await page.locator('#deviceSelect').selectOption('cenix');
    await page.locator('[data-close=settings]').click();
    sameBox(initial, await page.locator('#lcdWindow').boundingBox());
    assert.deepEqual(await page.locator('#screen').evaluate((c) => [c.width, c.height]), native);
    assert.equal(
      await page.evaluate(
        () => testMessages.filter((x) => ['loadGame', 'boot', 'loadState'].includes(x.type)).length,
      ),
      loads,
    );
    await page.locator('#screen').focus();
    await page.keyboard.down('ArrowUp');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal(
      await page.evaluate(
        () => testMessages.filter((x) => x.type === 'key' && x.key === 'up').at(-1).pressed,
      ),
      false,
    );
    await page.locator('#openMenu').click();
    await page.locator('#deviceSelect').selectOption('auto');
    await page.locator('[data-close=settings]').click();
    // Desktop keyboard and mobile multi-touch both use the phone's keys only.
    if (viewport.width < 600) {
      const a = await page.locator('[data-key=digit2]').boundingBox(),
        b = await page.locator('[data-key=digit5]').boundingBox();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          { x: a.x + a.width / 2, y: a.y + a.height / 2, id: 1 },
          { x: b.x + b.width / 2, y: b.y + b.height / 2, id: 2 },
        ],
      });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      for (const key of ['digit2', 'digit5'])
        assert.equal(
          await page.evaluate(
            (key) => testMessages.filter((x) => x.type === 'key' && x.key === key).at(-1)?.pressed,
            key,
          ),
          false,
        );
    }
    await page.locator('#volume').fill('35');
    assert.equal(await page.locator('#volumeValue').textContent(), '35%');
    await page.locator('#sound').click();
    assert.equal(await page.locator('#volume').inputValue(), '0');
    await page.locator('#sound').click();
    assert.equal(await page.locator('#volume').inputValue(), '35');
    // Loading/error/long titles live in bounded boxes, with no diagnostic DOM.
    await page.evaluate(() => {
      document.querySelector('#nowPlaying').textContent = 'Очень длинное название '.repeat(30);
      document.querySelector('#errorBanner').hidden = false;
      document.querySelector('#errorTitle').textContent = 'Не удалось запустить игру';
    });
    sameBox(initial, await page.locator('#lcdWindow').boundingBox());
    assert.equal(await page.locator('#step,#diagnostics,#technicalData,#log').count(), 0);
    assert.equal(await page.locator('body').evaluate((e) => e.scrollWidth > innerWidth), false);
    if (output)
      await page.screenshot({
        path: path.join(output, `layout-${viewport.width}.png`),
        fullPage: true,
      });
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#volume').value === '35');
    if (viewport.width > 600) {
      await page.locator('#fullscreen').click();
      await page.waitForFunction(() => Boolean(document.fullscreenElement));
      const box = await page.locator('#lcdWindow').boundingBox();
      await page.locator('#openMenu').click();
      await page.locator('#deviceSelect').selectOption('sv130');
      await page.locator('[data-close=settings]').click();
      sameBox(box, await page.locator('#lcdWindow').boundingBox());
      await page.evaluate(() => document.exitFullscreen());
    }
    assert.deepEqual(errors, []);
    results.push({ viewport, lcd: initial, errors, ok: true });
    await context.close();
  }
  console.log(JSON.stringify({ ok: true, checks: results }, null, 2));
  if (output)
    fs.writeFileSync(
      path.join(output, 'browser-checks.json'),
      JSON.stringify({ ok: true, checks: results }, null, 2) + '\n',
    );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
