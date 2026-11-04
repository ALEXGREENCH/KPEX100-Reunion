/** GNEX 3D ABI bridge to the original Swerve 2.1 ARM software renderer. */
import { SwerveMachine } from './m3g-native.js';
import { HELPERS, API } from './m3g-api.js';
const signatures = Object.entries(API).map(([id, s]) => ({ id: Number(id), ...s }));
const methods = Object.fromEntries(
  signatures.filter((s) => s.offset !== undefined).map((s) => [s.name, s]),
);
export async function createSwerve(runtime, { binary = null } = {}) {
  if (!binary) {
    const response = await fetch(new URL('./vendor/swerve/swv21brew.mod', import.meta.url));
    if (!response.ok) throw Error('Cannot load original Swerve engine: ' + response.status);
    binary = new Uint8Array(await response.arrayBuffer());
  }
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', binary))]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
  if (digest !== '1e76412e158bc3948bf6ad173b181368e0f0d554d6b0e1488a29402d96b0cdab')
    throw Error('Unrecognized Swerve ARM binary');
  return new SwerveBridge(runtime, await SwerveMachine.create(binary, HELPERS));
}
export class SwerveBridge {
  constructor(runtime, machine) {
    this.runtime = runtime;
    this.machine = machine;
    this.log = [];
    this.graphics = 0;
    this.buffers = new Map();
    this.params = 0x09100000;
    this.signatures = new Map(signatures.map((s) => [s.id, s]));
  }
  pointerLength(name, index, args) {
    if (/Orientation|preRotate/.test(name)) return 16;
    if (/Translation|Scale/.test(name)) return 12;
    if (name.endsWith('getProjectionParams')) return index === 2 ? 16 : 4;
    if (name.endsWith('getPositions')) return index === 2 ? 16 : 4;
    if (name.endsWith('getRay')) return 24;
    if (name.endsWith('pickNode')) return index === 2 || index === 3 ? 12 : 4;
    if (name.endsWith('transformPoints')) return args[1] * 4;
    if (name.endsWith('_transform')) return args[2] * 4;
    return 4;
  }
  syscall(id) {
    const sig = this.signatures.get(id);
    if (!sig) return false;
    const r = this.runtime,
      m = this.machine,
      c = m.cpu,
      a = r._args(sig.argc),
      q = { id: id.toString(16), name: sig.name, args: [...a] };
    this.log.push(q);
    if (this.log.length > 500) this.log.shift();
    let rc = 0;
    if (id === 0x231) {
      rc = m.initialize();
    } else if (id === 0x233) {
      m.uninitialize();
      this.graphics = 0;
      for (const buffer of this.buffers.values()) m.free(buffer.p);
      this.buffers.clear();
    } else if (id === 0x232) {
      rc = m.method(a[0] >>> 0, 1);
    } else if ([0x203, 0x241, 0x2b6, 0x2e0].includes(id)) {
      const type = { 0x203: 4, 0x241: 8, 0x2b6: 21, 0x2e0: 26 }[id],
        obj = id === 0x241 && this.graphics ? this.graphics : m.createObject(type);
      if (id === 0x241) this.graphics = obj;
      r._write(r.vfs.intPointer(r, a[0], 4), obj);
    } else if (id === 0x312) {
      const name = r.vfs.normalize(r.resourceBytes(a[0])),
        data = r.vfs.files.get(name);
      if (!data) throw Error('Missing M3G ' + name);
      const loader = m.createObject(14),
        p = m.alloc(data.length);
      c.write(p, data);
      rc = m.method(loader, 3, data.length, p);
      m.free(p);
      if (!rc) {
        const out = this.params;
        m.method(loader, 5, out);
        const count = c.read32(out);
        let slot = 0;
        while (slot < 1024 && r._read(0x20b41e1c + slot * 12 + 4)) slot++;
        if (slot === 1024) throw Error('GNEX integer slots exhausted');
        const p = r._allocate(count * 4);
        r._write(0x20b41e1c + slot * 12, p);
        r._write(0x20b41e1c + slot * 12 + 4, count);
        r._write(0x20b41e1c + slot * 12 + 8, 0);
        for (let i = 0; i < count; i++) {
          m.method(loader, 6, i, out);
          r._write(p + i * 4, c.read32(out));
        }
        r._write(r.vfs.intPointer(r, a[1], 4), count);
        rc = (0x80000000 | (slot << 20)) >>> 0;
        let next = slot + 1;
        while (next < 1024 && r._read(0x20b41e1c + next * 12 + 4)) next++;
        if (slot === r._read(0x20b41e18)) r._write(0x20b41e18, next);
      }
      m.method(loader, 1);
    } else if (id === 0x22c) {
      const inner = c.read32((a[0] >>> 0) + 4),
        vt = c.read32(inner);
      r._write(r.vfs.intPointer(r, a[1], 4), m.call((vt + c.read32(vt + 4)) >>> 0, inner));
    } else if (id === 0x24a) {
      const pitch = a[3] || a[1] * 2,
        size = pitch * a[2];
      if (size < 1 || size > 4 * 1024 * 1024) throw Error('Invalid backbuffer');
      const p = m.alloc(size);
      let source = a[4] ? r.resourceBytes(a[4]) : r.cpu.read(r._read(0x20b41260), size);
      c.write(p, source.subarray(0, size));
      const old = this.buffers.get(a[0]);
      this.buffers.set(a[0], { p, size, resource: a[4] || null, width: a[1], height: a[2], pitch });
      rc = m.call(0x4000000 + methods[sig.name].offset, a[0], a[1], a[2], pitch, p);
      if (old) m.free(old.p);
    } else if (id === 0x2a3) {
      const fn = 0x4000000 + methods[sig.name].offset,
        out = this.params;
      m.call(fn, a[0], a[1], 0, 0, out);
      const length = c.read32(out) | 0;
      if (length >= 0) {
        if (length > 1024 * 1024) throw Error('Invalid M3G user parameter length');
        const p = m.alloc(length);
        m.call(fn, a[0], a[1], length, p, out);
        r.setResourceBytes(a[3], c.read(p, length));
        m.free(p);
      }
      r._write(r.vfs.intPointer(r, a[4], 4), length);
    } else if (id === 0x243) {
      const out = this.params;
      m.call(0x4000000 + methods[sig.name].offset, a[0], out);
      const buffer = this.buffers.get(a[0]);
      if (!buffer) throw Error('No 3D backbuffer');
      const p = c.read32(out);
      r.setResourceBytes(a[1], c.read(p, buffer.size));
    } else {
      const method = methods[sig.name];
      if (!method) throw Error('Missing native Swerve method ' + sig.name);
      const args = [...a],
        copy = [];
      sig.argument_type_codes.forEach((type, i) => {
        if (type === 12) {
          const n = this.pointerLength(sig.name, i, a),
            guest = r.vfs.intPointer(r, a[i], n),
            native = this.params + 256 + i * 65536;
          if (n > 65536) throw Error('3D array exceeds transfer scratch');
          c.write(native, r.cpu.read(guest, n));
          const bool =
            (id === 0x258 && i === 5) || (id === 0x294 && i === 3) || (id === 0x296 && i === 1);
          if (bool) c.write32(native, 0);
          args[i] = native;
          copy.push([guest, native, n]);
        } else if (type === 5) {
          const data = r.resourceBytes(a[i]),
            p = m.alloc(Math.max(16, data.length));
          c.write(p, data);
          args[i] = p;
          copy.push([null, p, data.length, a[i]]);
        }
      });
      rc = m.call(0x4000000 + method.offset, ...args.map((x) => x >>> 0));
      for (const [g, p, n, res] of copy) {
        if (g !== null) r.cpu.write(g, c.read(p, n));
        else {
          r.setResourceBytes(res, c.read(p, n));
          m.free(p);
        }
      }
    }
    if (id === 0x248)
      for (const buffer of this.buffers.values()) {
        const p =
          buffer.resource === null
            ? r._read(0x20b41260)
            : r.vfs.mediaPointer(r, buffer.resource, 0, buffer.size);
        r.cpu.write(p, c.read(buffer.p, buffer.size));
      }
    q.result = rc;
    if (sig.return_type_code === 1) r._push(rc);
    return true;
  }
  get diagnostics() {
    return {
      engine: 'Original Swerve 2.1.0.364 ARM software renderer',
      nativeCalls: this.machine.nativeCalls,
      lastCalls: this.log.slice(-20),
      width: this.runtime.width,
      height: this.runtime.height,
    };
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.buffers.clear();
    this.machine.close();
  }
}
