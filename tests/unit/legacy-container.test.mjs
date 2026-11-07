import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLegacy } from '../../web/engine/legacy.js';

function fixture(version = 2) {
  const header = version === 1 ? 52 : 100;
  const a = header + 4,
    b = a + 4,
    c = b + 2,
    d = c + 4;
  const data = Buffer.alloc(d + 4);
  data[0] = version;
  data.writeUInt16LE(header, 28);
  for (const [i, value] of [a, b, c, d].entries()) data.writeUInt16LE(value, 44 + i * 2);
  data[a + 1] = 1;
  data.writeUInt16LE(2, c);
  data.writeUInt16LE(4, c + 2);
  data.set(Buffer.from('ABCD'), d);
  return data;
}

test('legacy v2 retains a bounded CRLF suffix outside the complete resource extent', () => {
  const prefix = fixture(),
    body = Buffer.concat([prefix, Buffer.from([13, 10])]);
  for (const wrapper of [0, 32])
    for (const mask of [0, 165]) {
      const raw = Buffer.alloc(wrapper + body.length);
      if (wrapper) raw[0] = 32;
      raw.set(
        body.map((value) => value ^ mask),
        wrapper,
      );
      const before = Buffer.from(raw),
        parsed = parseLegacy(raw);
      assert.deepEqual(raw, before);
      assert.deepEqual(Buffer.from(parsed.body), body);
      assert.equal(parsed.declaredSize, prefix.length);
      assert.equal(parsed.trailingBytes, 2);
      assert.equal(parsed.wrapperBytes, wrapper);
      assert.equal(parsed.xorMask, mask);
      assert.deepEqual(Buffer.from(parsed.resources[0].data), Buffer.from('ABCD'));
    }
});

test('legacy suffix admission rejects other bytes, repeated newlines and v1', () => {
  for (const suffix of [[13], [10], [10, 13], [0, 0], [255, 255], [13, 10, 0], [13, 10, 13, 10]])
    assert.throws(() => parseLegacy(Buffer.concat([fixture(), Buffer.from(suffix)])), /cover file/);
  assert.throws(
    () => parseLegacy(Buffer.concat([fixture(1), Buffer.from([13, 10])])),
    /cover file/,
  );
});

test('CRLF cannot hide truncated resources or an invalid legacy section layout', () => {
  const raw = Buffer.concat([fixture(), Buffer.from([13, 10])]),
    broken = Buffer.from(raw),
    c = raw.readUInt16LE(48);
  broken.writeUInt16LE(7, c + 2);
  assert.throws(() => parseLegacy(broken), /exceeds file/);
  broken.set(raw);
  broken.writeUInt16LE(99, 44);
  assert.throws(() => parseLegacy(broken), /section layout/);
  broken.set(raw);
  broken.writeUInt16LE(0xffff, 28);
  assert.throws(() => parseLegacy(broken), /entry outside bytecode/);
  const clean = fixture();
  assert.equal(parseLegacy(clean).declaredSize, clean.length);
  assert.equal(parseLegacy(clean).trailingBytes, 0);
});
