import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
test('CLI replay records explicit manual timer steps separately from scheduled time', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'reunion-manual-'));
  try {
    const actions = path.join(temporary, 'actions.json');
    fs.writeFileSync(
      actions,
      JSON.stringify({
        actions: [
          ['manualTick', 3, 123],
          ['hold', 20],
          ['manualTick', 1, 456],
          ['release', 20],
        ],
      }),
    );
    const tool = fileURLToPath(new URL('../tools/replay-sgs.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [tool, 'hellfire', actions, temporary], {
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(fs.readFileSync(path.join(temporary, 'hellfire.json'), 'utf8'));
    assert.match(report.clockMode, /Explicit manual/);
    assert.equal(report.trace.at(-1).timeMs, 825);
    assert.equal(report.diagnostics.status, 'idle');
    assert.ok(report.diagnostics.events >= 5);
  } finally {
    assert.equal(path.dirname(fs.realpathSync(temporary)), fs.realpathSync(os.tmpdir()));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
