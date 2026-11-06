#!/usr/bin/env node
/** Exercise the real settings UI and source-aware releases with an isolated Worker. */
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
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
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.testMessages = [];
    window.testPads = [];
    Object.defineProperty(navigator, 'getGamepads', { value: () => window.testPads });
    const Original = Worker;
    window.Worker = class extends Original {
      postMessage(data, ...args) {
        testMessages.push(data);
        super.postMessage(data, ...args);
      }
    };
  });
  await page.route('**/worker.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `
    postMessage({type:'ready'});
    onmessage=({data})=>{if(data.type==='loadGame'){
      postMessage({type:'status',status:'running',running:true,sessionId:data.sessionId});
      postMessage({type:'frame',width:220,height:176,pixels:new Uint8ClampedArray(220*176*4),sessionId:data.sessionId});
    }};
  `,
    }),
  );
  await page.goto(`http://127.0.0.1:${server.address().port}/KPEX100-Reunion/`);
  await page.waitForFunction(() => document.querySelectorAll('.library-item').length > 20);
  async function load(title) {
    await page.locator('#openLibrary').click();
    await page.locator('#librarySearch').fill(title);
    await page
      .locator('.library-item')
      .filter({ has: page.getByText(title, { exact: true }) })
      .click();
    await page.waitForFunction(
      (title) => document.querySelector('#nowPlaying').textContent === title,
      title,
    );
    await page.waitForFunction(
      () => document.querySelector('#playPause span').textContent === 'Пауза',
    );
    await page.locator('#screen').focus();
  }
  async function settings() {
    await page.locator('#openMenu').click();
    await page.locator('#showHelp').click();
  }
  async function close() {
    await page.locator('[data-close=help]').click();
    await page.locator('#screen').focus();
  }
  const row = (label) =>
    page
      .locator('.binding-row')
      .filter({ has: page.locator('.binding-action').getByText(label, { exact: true }) });
  async function clear() {
    await page.evaluate(() => (testMessages.length = 0));
  }
  async function keys() {
    return page.evaluate(() =>
      testMessages.filter((m) => m.type === 'key').map(({ key, pressed }) => [key, pressed]),
    );
  }
  await load('Battle Armor: Counter Attack');
  await settings();
  await row('OK / SELECT')
    .getByRole('button', { name: 'Добавить назначение: OK / SELECT', exact: true })
    .click();
  await page.keyboard.press('f');
  await close();
  await clear();
  await page.keyboard.down('z');
  await page.keyboard.down('f');
  await page.keyboard.up('z');
  assert.deepEqual(
    await keys(),
    [['a', true]],
    'releasing one alternative must keep the other held',
  );
  await page.keyboard.up('f');
  assert.deepEqual(await keys(), [
    ['a', true],
    ['a', false],
  ]);
  await settings();
  await page.locator('#bindingGame').check();
  await row('OK / SELECT').getByRole('button', { name: 'Заменить', exact: true }).click();
  await page.locator('#capturePad').click({ button: 'left' });
  await close();
  await clear();
  await page.keyboard.press('z');
  assert.deepEqual(await keys(), []);
  await page.locator('#screen').click();
  assert.deepEqual(await keys(), [
    ['a', true],
    ['a', false],
  ]);
  // A bound key can be moved to a different action, with an explicit conflict choice.
  await settings();
  await row('Вниз').getByRole('button', { name: 'Заменить', exact: true }).click();
  await page.keyboard.press('ArrowUp');
  assert.equal(await page.locator('#bindingConflict').isVisible(), true);
  await page.locator('#conflictConfirm').click();
  await close();
  await clear();
  await page.keyboard.press('ArrowUp');
  assert.deepEqual(await keys(), [
    ['down', true],
    ['down', false],
  ]);
  // A second game inherits the profile, not the first game's override.
  await load('Hell Fire');
  await clear();
  await page.keyboard.press('f');
  assert.deepEqual(await keys(), [
    ['a', true],
    ['a', false],
  ]);
  await settings();
  await row('ESC').getByRole('button', { name: 'Добавить назначение: ESC', exact: true }).click();
  await page.locator('#capturePad').hover();
  await page.mouse.wheel(0, 100);
  await close();
  await clear();
  await page.locator('#screen').hover();
  await page.mouse.wheel(0, 100);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(100);
  assert.deepEqual(
    await keys(),
    [
      ['b', true],
      ['b', false],
    ],
    'wheel releases immediately on blur, once',
  );
  await clear();
  await page.evaluate(() =>
    testPads.push({
      index: 0,
      id: 'Test pad',
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
      axes: [0, 0],
    }),
  );
  await page.waitForTimeout(50);
  await page.evaluate(() => {
    testPads[0].buttons[0] = { pressed: true, value: 1 };
    testPads[0].axes[0] = 0.8;
  });
  await page.waitForTimeout(50);
  assert.deepEqual(await keys(), [
    ['a', true],
    ['right', true],
  ]);
  await page.evaluate(() => (testPads.length = 0));
  await page.waitForTimeout(50);
  assert.deepEqual(await keys(), [
    ['a', true],
    ['right', true],
    ['a', false],
    ['right', false],
  ]);
  // Capture a non-default button and ensure it stays silent until neutral after the dialog closes.
  await settings();
  await row('REC').getByRole('button', { name: 'Заменить', exact: true }).click();
  await page.evaluate(() =>
    testPads.push({
      index: 1,
      id: 'Test pad 2',
      buttons: Array.from({ length: 18 }, (_, i) => ({
        pressed: i === 17,
        value: i === 17 ? 1 : 0,
      })),
      axes: [],
    }),
  );
  await page.waitForFunction(() => document.querySelector('#bindingCapture').hidden);
  await close();
  await clear();
  await page.waitForTimeout(50);
  assert.deepEqual(await keys(), []);
  await page.evaluate(() => {
    testPads[0].buttons[17] = { pressed: false, value: 0 };
  });
  await page.waitForTimeout(50);
  await page.evaluate(() => {
    testPads[0].buttons[17] = { pressed: true, value: 1 };
  });
  await page.waitForTimeout(50);
  assert.deepEqual(await keys(), [['rec', true]]);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.deepEqual(await keys(), [
    ['rec', true],
    ['rec', false],
  ]);
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('.library-item').length > 20);
  await load('Battle Armor: Counter Attack');
  await clear();
  await page.keyboard.press('z');
  assert.deepEqual(await keys(), []);
  await page.locator('#screen').click();
  assert.deepEqual(await keys(), [
    ['a', true],
    ['a', false],
  ]);
  await settings();
  await page.locator('#bindingGame').check();
  await page.locator('#bindingReset').click();
  await close();
  await clear();
  await page.keyboard.press('f');
  assert.deepEqual(await keys(), [
    ['a', true],
    ['a', false],
  ]);
  assert.deepEqual(errors, []);
  const result = {
    ok: true,
    checks: [
      'alternative overlap',
      'per-game replacement',
      'conflict transfer',
      'profile inheritance',
      'mouse capture',
      'wheel cancellation',
      'gamepad axes/buttons/disconnect',
      'gamepad capture neutral',
      'blur release',
      'persistence',
      'scoped reset',
    ],
    errors,
  };
  if (process.env.REUNION_INPUT_OUTPUT)
    fs.writeFileSync(process.env.REUNION_INPUT_OUTPUT, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
