import test from 'node:test';
import assert from 'node:assert/strict';
import { VirtualFileSystem } from '../../web/engine/vfs.js';
test('virtual file create/write/seek/read and save restore preserve real bytes', () => {
  const v = new VirtualFileSystem(),
    h = v.open('save.dat', 2);
  assert.equal(h, 0);
  assert.equal(v.write(h, Uint8Array.of(1, 2, 3)), 3);
  assert.equal(v.seek(h, 6, 1), 1);
  assert.equal(v.write(h, Uint8Array.of(9)), 1);
  assert.equal(v.close(h), 1);
  const w = new VirtualFileSystem();
  w.restore(v.serialize());
  const r = w.open('SAVE.DAT', 3);
  assert.deepEqual([...w.read(r, 20)], [1, 2, 3, 0, 0, 0, 9]);
  assert.equal(w.write(r, Uint8Array.of(7)), -1);
  assert.throws(() => w.open('../host/path', 2), /Invalid virtual path/);
  assert.equal(w.seek(r, -1, 1), -1);
  assert.equal(w.seek(r, -1, 3), 1);
  assert.deepEqual([...w.read(r, 1)], [9]);
});
test('corrupt saved data cannot partially overwrite a valid save', () => {
  const v = new VirtualFileSystem(),
    h = v.open('test.dat', 2);
  v.write(h, Uint8Array.of(6));
  v.close(h);
  assert.throws(() => v.restore({ version: 1, files: { 'test.dat': '@@@' } }), /base64/);
  assert.deepEqual([...v.read(v.open('test.dat', 3), 1)], [6]);
});
