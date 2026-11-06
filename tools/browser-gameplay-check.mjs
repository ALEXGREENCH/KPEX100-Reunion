import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const { chromium } = await import(process.env.REUNION_PLAYWRIGHT || 'playwright');
const url = process.argv[2];
if (!url || !/^https?:/.test(url))
  throw Error('Usage: node tools/browser-gameplay-check.mjs URL NEW_OUTPUT_PREFIX');
const output = process.argv[3];
if (!output || fs.existsSync(output + '.json')) throw Error('New output prefix required');
const duration = Number(process.env.REUNION_CHECK_DURATION_MS || 65000);
if (!Number.isFinite(duration) || duration < 65000 || duration > 600000)
  throw Error('REUNION_CHECK_DURATION_MS must be 65000..600000');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.REUNION_CHROME ? { executablePath: process.env.REUNION_CHROME } : {}),
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
    errors = [],
    sourceRequests = [],
    fetchedSources = {},
    sourceErrors = [];
  page.on('response', (response) => {
    const source = new URL(response.url()),
      base = new URL('./', url);
    if (source.origin !== base.origin || !source.pathname.startsWith(base.pathname)) return;
    const name = source.pathname.slice(base.pathname.length);
    if (
      [
        'app.js',
        'worker.js',
        'engine/gnex.js',
        'engine/cpu.js',
        'engine/rom-accelerators.js',
      ].includes(name) ||
      /data\/(games\/battle-armor\.sgs|firmware\/Kingston-2\.12\.rom)$/.test(name)
    )
      sourceRequests.push(
        response
          .body()
          .then((body) => {
            assert.equal(response.status(), 200);
            fetchedSources[name] = {
              bytes: body.length,
              sha256: createHash('sha256').update(body).digest('hex'),
            };
          })
          .catch((error) => sourceErrors.push({ name, error: String(error) })),
      );
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.reunionCheck = { frames: 0, frameTimes: [], status: [], keys: [] };
    const Original = Worker;
    window.Worker = class extends Original {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', ({ data: m }) => {
          if (m.type === 'frame') {
            reunionCheck.frames++;
            reunionCheck.frameTimes.push(performance.now());
          }
          if (m.type === 'error') reunionCheck.status.push({ error: m.message || m.error });
          if (m.type === 'status')
            reunionCheck.status.push({
              at: performance.now(),
              events: m.events,
              status: m.status,
              error: m.diagnostics?.error,
              timers: m.diagnostics?.timers,
            });
        });
      }
      postMessage(m, ...args) {
        if (m.type === 'key') reunionCheck.keys.push({ key: m.key, pressed: m.pressed });
        super.postMessage(m, ...args);
      }
    };
  });
  await page.goto(url, { timeout: 45000 });
  await page.waitForFunction(() => document.querySelectorAll('.library-item').length > 20);
  const lcd = await page.locator('#lcdWindow').boundingBox();
  await page.locator('#openLibrary').click();
  await page.locator('#librarySearch').fill('Battle Armor');
  await page
    .locator('.library-item')
    .filter({ has: page.getByText('Battle Armor: Counter Attack', { exact: true }) })
    .click();
  await page.waitForFunction(
    () => document.querySelector('#playPause span').textContent === 'Пауза',
    null,
    { timeout: 45000 },
  );
  await page.waitForFunction(() => document.querySelector('#screenEmpty').hidden);
  assert.deepEqual(await page.locator('#lcdWindow').boundingBox(), lcd);
  await page.locator('#volume').fill('40');
  await page.locator('#sound').click();
  await page.locator('#sound').click();
  assert.equal(await page.locator('#volume').inputValue(), '40');
  await page.locator('#screen').focus();
  const start = Date.now();
  let count = 0;
  while (Date.now() - start < duration) {
    const key =
      count < 5 ? 'z' : ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'z'][count % 5];
    await page.keyboard.down(key);
    await page.waitForTimeout(count % 3 === 0 ? 450 : 120);
    await page.keyboard.up(key);
    await page.waitForTimeout(400);
    count++;
    assert.equal(await page.locator('#errorBanner').isVisible(), false);
  }
  await page.screenshot({ path: output + '.png' });
  const report = await page.evaluate(() => reunionCheck);
  await Promise.all(sourceRequests);
  assert.ok(report.frames > 10);
  assert.ok(report.keys.length > 50);
  assert.ok(report.status.at(-1).events > 20);
  assert.equal(
    report.status.some((s) => s.error || s.status === 'error'),
    false,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(sourceErrors, []);
  assert.ok(Object.keys(fetchedSources).length >= 7, 'actual runtime and original bodies captured');
  assert.deepEqual(await page.locator('#lcdWindow').boundingBox(), lcd);
  const result = {
    utc: new Date().toISOString(),
    url: page.url(),
    scope:
      'Original browser Worker, ROM and SGS, actual host timers and UI keyboard input. Scripted smoke, not a physical controller or full mission/freeze reproduction.',
    wallMs: Date.now() - start,
    lcd,
    errors,
    fetchedSources,
    sourceErrors,
    ...report,
    ok: true,
  };
  fs.writeFileSync(output + '.json', JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(
    JSON.stringify({
      ok: true,
      frames: result.frames,
      keys: result.keys.length,
      events: result.status.at(-1).events,
      wallMs: result.wallMs,
    }),
  );
} finally {
  await browser.close();
}
