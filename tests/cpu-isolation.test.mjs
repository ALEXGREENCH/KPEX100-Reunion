import test from 'node:test';
import assert from 'node:assert/strict';
import { createARM } from '../web/engine/cpu.js';

test('a nested ARM backend has independent WASM globals and preserves caller registers', async () => {
  const caller = await createARM(),
    backend = await createARM({ isolated: true });
  try {
    assert.notEqual(caller.uc, backend.uc);
    for (const cpu of [caller, backend]) {
      cpu.map(0x1000, 0x1000);
      cpu.regWrite('r0', 0);
    }
    // ADD r0,r0,#1. Caller executes 100 instructions; its hook invokes one backend instruction.
    const code = new Uint8Array(400),
      view = new DataView(code.buffer);
    for (let offset = 0; offset < 400; offset += 4) view.setUint32(offset, 0xe2800001, true);
    caller.write(0x1000, code);
    backend.write(0x1000, Uint8Array.of(1, 0, 128, 226, 30, 255, 47, 225));
    backend.regWrite('lr', 0x1800);
    let calls = 0;
    caller.onCode(
      () => {
        calls++;
        backend.run(0x1000, 0x1800, 10);
      },
      { begin: 0x1000, end: 0x118c },
    );
    caller.run(0x1000, 0x1190, 100);
    assert.equal(calls, 100);
    assert.equal(caller.regRead('r0'), 100);
    assert.equal(backend.regRead('r0'), 100);
    assert.equal(caller.regRead('pc'), 0x1190);
    assert.equal(backend.regRead('pc'), 0x1800);
  } finally {
    caller.close();
    backend.close();
  }
});
