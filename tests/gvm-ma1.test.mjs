import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parseLegacy } from '../web/engine/legacy.js';
import { parseMa1 } from '../web/engine/ma1.js';

test('MA1 native references bind to unchanged original SGS and the inspection CLI', () => {
  const file = new URL('../web/data/games/hellfire-witop-v1.sgs', import.meta.url);
  const raw = fs.readFileSync(file);
  const reference = JSON.parse(
    fs.readFileSync(new URL('../validation/gvm-ma1-native-reference.json', import.meta.url)),
  );
  assert.equal(createHash('sha256').update(raw).digest('hex'), reference.sgsSha256);
  const sgs = parseLegacy(raw);
  let words = 0;
  for (let i = 0; i < 5; i++) {
    const resource = sgs.resources[i + 45].data;
    assert.equal(Buffer.from(resource).toString('hex'), reference.vectors[i].payloadHex);
    assert.equal(
      createHash('sha256').update(resource).digest('hex'),
      reference.vectors[i].payloadSha256,
    );
    words += parseMa1(resource).score.length;
  }
  assert.equal(words, 419);
  const result = spawnSync(
    process.execPath,
    ['tools/ma1-info.mjs', 'web/data/games/hellfire-witop-v1.sgs', '45'],
    { cwd: new URL('..', import.meta.url), encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.sourceSha256, reference.sgsSha256);
  assert.equal(report.payloadSha256, reference.vectors[0].payloadSha256);
  assert.equal(report.score.length, 361);
  const invalid = spawnSync(
    process.execPath,
    ['tools/ma1-info.mjs', 'web/data/games/hellfire-witop-v1.sgs', '40'],
    { cwd: new URL('..', import.meta.url), encoding: 'utf8' },
  );
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, '');
  assert.match(invalid.stderr, /Invalid raw GVM MA1/);
});
