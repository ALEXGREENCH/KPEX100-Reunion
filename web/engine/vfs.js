/** Bounded application-local saves; guest names never become browser URLs. */
import { bytes, decodeKorean } from './sgs.js';
const MAX_FILE = 16 * 1024 * 1024,
  MAX_TOTAL = 64 * 1024 * 1024;
const b64encode = (data) => {
  let s = '';
  for (let p = 0; p < data.length; p += 8192)
    s += String.fromCharCode(...data.subarray(p, p + 8192));
  return btoa(s);
};
const b64decode = (s) => {
  if (
    typeof s !== 'string' ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s)
  )
    throw Error('Invalid saved base64');
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};
export class VirtualFileSystem {
  constructor(
    sgs = null,
    {
      saveKey = null,
      storage = null,
      saveData = null,
      onSave = null,
      clock = () => new Date(),
    } = {},
  ) {
    this.saveKey = saveKey;
    this.storage = storage;
    this.onSave = onSave;
    this.files = new Map();
    this.directories = new Set(['']);
    this.readonly = new Set();
    this.handles = new Map();
    this.created = new Map();
    this.userNV = new Uint8Array();
    this.clock = clock;
    this.operations = 0;
    this.persistenceError = null;
    if (sgs) this.mountAppended(sgs);
    let saved = saveData;
    if (saved === null && storage && saveKey) {
      try {
        saved = storage.getItem(saveKey);
      } catch (e) {
        this.persistenceError = String(e);
      }
    }
    if (saved !== null) this.restore(saved);
  }
  restore(saved) {
    if (typeof saved === 'string') {
      if (saved.length > MAX_TOTAL * 2) throw Error('Save store too large');
      saved = JSON.parse(saved);
    }
    if (!saved || saved.version !== 1) throw Error('Unknown save store version');
    const userNV = saved.userNV ? b64decode(saved.userNV) : new Uint8Array();
    if (userNV.length > MAX_FILE) throw Error('Invalid user NV size');
    let total = 0;
    const loaded = new Map(),
      dates = new Map();
    for (const [key, payload] of Object.entries(saved.files || {})) {
      const name = this.normalize(key),
        data = b64decode(payload);
      total += data.length;
      if (data.length > MAX_FILE || total > MAX_TOTAL) throw Error('Save file/store too large');
      const date = saved.created?.[key] ?? this.clock().getTime();
      if (!Number.isFinite(date) || Math.abs(date) > 8640000000000000)
        throw Error('Invalid saved creation date');
      if (!this.readonly.has(name)) {
        loaded.set(name, data);
        dates.set(name, date);
      }
    }
    const directories = new Set(['']);
    for (const name of saved.directories || []) directories.add(this.normalize(name, true));
    for (const name of this.readonly) {
      const parts = name.split('/');
      for (let i = 1; i < parts.length; i++) directories.add(parts.slice(0, i).join('/'));
    }
    for (const name of this.files.keys())
      if (!this.readonly.has(name)) {
        this.files.delete(name);
        this.created.delete(name);
      }
    for (const [name, data] of loaded) {
      this.files.set(name, data);
      this.created.set(name, dates.get(name));
    }
    this.directories = directories;
    this.userNV = userNV;
    this.handles.clear();
    return this;
  }
  normalize(name, allowRoot = false) {
    if (name instanceof Uint8Array) name = decodeKorean(name, true);
    if (typeof name !== 'string' || name.includes('\0') || name.length > 512)
      throw Error('Invalid virtual filename');
    name = name.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
    if (
      name
        .split('/')
        .some((p) => name && (p === '' || p === '.' || p === '..' || p.includes(':'))) ||
      (!name && !allowRoot)
    )
      throw Error('Invalid virtual path');
    return name.toLowerCase();
  }
  mountAppended(sgs) {
    const b = sgs.body,
      base = sgs.declaredSize;
    if (b.length - base < 8) return;
    const v = new DataView(b.buffer, b.byteOffset, b.length),
      size = v.getUint32(base, true),
      count = v.getUint32(base + 4, true),
      end = base + 8 + size;
    if (count > 10000 || end > b.length) throw Error('Invalid appended SGS table');
    let p = base + 8;
    for (let i = 0; i < count; i++) {
      if (p + 4 > end) throw Error('Truncated appended filename');
      const n = v.getUint32(p, true);
      p += 4;
      if (n < 1 || n > 512 || p + n + 8 > end) throw Error('Invalid appended filename length');
      const name = this.normalize(b.subarray(p, p + n));
      p += n;
      const off = v.getUint32(p, true),
        len = v.getUint32(p + 4, true);
      p += 8;
      if (off < end || off + len > b.length || len > MAX_FILE || this.files.has(name))
        throw Error('Invalid appended resource');
      this.files.set(name, b.slice(off, off + len));
      this.readonly.add(name);
      this.created.set(name, this.clock().getTime());
      const parts = name.split('/');
      for (let i = 1; i < parts.length; i++) this.directories.add(parts.slice(0, i).join('/'));
    }
    if (p !== end) throw Error('Appended table length mismatch');
  }
  get diagnostics() {
    return {
      files: [...this.files.keys()].sort(),
      openHandles: this.handles.size,
      readonlyFiles: this.readonly.size,
      operations: this.operations,
      persistence: this.saveKey || 'memory only',
      persistenceError: this.persistenceError,
    };
  }
  serialize() {
    return JSON.stringify({
      version: 1,
      files: Object.fromEntries(
        [...this.files].filter(([n]) => !this.readonly.has(n)).map(([n, b]) => [n, b64encode(b)]),
      ),
      created: Object.fromEntries([...this.created].filter(([n]) => !this.readonly.has(n))),
      userNV: b64encode(this.userNV),
      directories: [...this.directories].sort(),
    });
  }
  flush() {
    if (!this.onSave && !(this.saveKey && this.storage)) return;
    try {
      const saved = this.serialize();
      if (this.storage && this.saveKey) this.storage.setItem(this.saveKey, saved);
      this.onSave?.(saved);
      this.persistenceError = null;
    } catch (e) {
      this.persistenceError = String(e);
    }
  }
  open(name, mode) {
    name = this.normalize(name);
    if (
      ![1, 2, 3, 4].includes(mode) ||
      this.handles.size >= 15 ||
      (this.readonly.has(name) && mode !== 3)
    )
      return -1;
    if (mode === 2) {
      if (
        this.files.has(name) ||
        this.directories.has(name) ||
        !this.directories.has(name.includes('/') ? name.slice(0, name.lastIndexOf('/')) : '')
      )
        return -1;
      this.files.set(name, new Uint8Array());
      this.created.set(name, this.clock().getTime());
      this.flush();
    } else if (!this.files.has(name)) return -1;
    let handle = 0;
    while (this.handles.has(handle)) handle++;
    this.handles.set(handle, {
      name,
      mode,
      position: mode === 4 ? this.files.get(name).length : 0,
    });
    return handle;
  }
  close(h) {
    if (!this.handles.delete(h)) return -1;
    this.flush();
    return 1;
  }
  delete(name) {
    name = this.normalize(name);
    if (
      !this.files.has(name) ||
      this.readonly.has(name) ||
      [...this.handles.values()].some((h) => h.name === name)
    )
      return -1;
    this.files.delete(name);
    this.created.delete(name);
    this.flush();
    return 1;
  }
  seek(h, off, origin) {
    const f = this.handles.get(h);
    if (!f || ![1, 2, 3].includes(origin)) return -1;
    const p = [0, f.position, this.files.get(f.name).length][origin - 1] + off;
    if (p < 0 || p > MAX_FILE) return -1;
    f.position = p;
    return 1;
  }
  write(h, data) {
    const f = this.handles.get(h);
    if (!f || f.mode === 3 || this.readonly.has(f.name)) return -1;
    let target = this.files.get(f.name);
    const end = f.position + data.length,
      growth = Math.max(0, end - target.length);
    const total = [...this.files]
      .filter(([n]) => !this.readonly.has(n))
      .reduce((n, [, v]) => n + v.length, 0);
    if (end > MAX_FILE || total + growth > MAX_TOTAL) return -1;
    if (growth) {
      const next = new Uint8Array(end);
      next.set(target);
      target = next;
      this.files.set(f.name, target);
    }
    target.set(data, f.position);
    f.position = end;
    this.flush();
    return data.length;
  }
  read(h, n) {
    const f = this.handles.get(h);
    if (!f || n < 0 || n > MAX_FILE) return null;
    const data = this.files.get(f.name).slice(f.position, f.position + n);
    f.position += data.length;
    return data;
  }
  intPointer(r, encoded, n) {
    encoded >>>= 0;
    let base, capacity, index;
    if (encoded & 0x80000000) {
      const raw = encoded & 0x7fffffff,
        slot = raw >>> 20;
      index = raw & 0xfffff;
      if (slot >= 1024) throw Error('Dynamic pointer slot out of bounds');
      const d = 0x20b41e1c + slot * 12;
      base = r._read(d);
      capacity = r._read(d + 4);
    } else {
      base = r._read(0x20b405ac);
      capacity = r._read(0x20b405a4);
      index = encoded;
    }
    if (!base || index * 4 + n > capacity * 4) throw Error('Integer transfer bounds');
    return base + index * 4;
  }
  mediaPointer(r, index, offset, n) {
    r.sgs.resource(index);
    const d = 0x21000000 + r.sgs.c + index * 12,
      size = r._read(d + 4),
      p = r._read(d + 8);
    if (offset < 0 || offset + n > size || (n && !p)) throw Error('Media transfer bounds');
    return p + offset;
  }
  syscall(r, number) {
    if (number === 0x61) {
      r._push(
        MAX_TOTAL -
          [...this.files]
            .filter(([n]) => !this.readonly.has(n))
            .reduce((n, [, v]) => n + v.length, 0),
      );
      this.operations++;
      return true;
    }
    if (number === 0x62) {
      const [resource, pointer] = r._args(2);
      let result = -1;
      this.operations++;
      try {
        const name = this.normalize(r.resourceBytes(resource)),
          data = this.files.get(name);
        if (data) {
          const p = this.intPointer(r, pointer, 16),
            date = new Date(this.created.get(name));
          [data.length, date.getFullYear(), date.getMonth() + 1, date.getDate()].forEach((v, i) =>
            r._write(p + i * 4, v),
          );
          result = 1;
        }
      } catch {}
      r._push(result);
      return true;
    }
    if (number < 0x63 || number > 0x6e) return false;
    const argc = [2, 1, 1, 3, 3, 4, 3, 4, 1, 1, 1, 1][number - 0x63],
      a = r._args(argc);
    this.operations++;
    let result = -1;
    try {
      let name;
      if ([0x63, 0x65, 0x6b, 0x6c, 0x6d, 0x6e].includes(number))
        name = this.normalize(r.resourceBytes(a[0]), number === 0x6c);
      if (number === 0x63) result = this.open(name, a[1]);
      else if (number === 0x64) result = this.close(a[0]);
      else if (number === 0x65) result = this.delete(name);
      else if (number === 0x66) result = this.seek(...a);
      else if (number >= 0x67 && number <= 0x6a) {
        const n = a.at(-1) * ([0x67, 0x69].includes(number) ? 4 : 1);
        if (n < 0 || n > MAX_FILE) throw Error('Invalid transfer length');
        const p = [0x67, 0x69].includes(number)
          ? this.intPointer(r, a[1], n)
          : this.mediaPointer(r, a[1], a[2], n);
        if (number <= 0x68) result = this.write(a[0], r.cpu.read(p, n));
        else {
          const data = this.read(a[0], n);
          if (data !== null) {
            if (data.length) r.cpu.write(p, data);
            result = data.length;
          }
        }
      } else if (number === 0x6b) result = this.files.has(name) ? 1 : -1;
      else if (number === 0x6c) result = this.directories.has(name) ? 1 : -1;
      else if (number === 0x6d) {
        const parent = name.includes('/') ? name.slice(0, name.lastIndexOf('/')) : '';
        if (!this.directories.has(name) && !this.files.has(name) && this.directories.has(parent)) {
          this.directories.add(name);
          this.flush();
          result = 1;
        }
      } else if (number === 0x6e) {
        if (
          this.directories.has(name) &&
          ![...this.files.keys(), ...this.directories].some((p) => p.startsWith(name + '/'))
        ) {
          this.directories.delete(name);
          this.flush();
          result = 1;
        }
      }
    } catch (e) {
      result = -1;
    }
    r._push(result);
    return true;
  }
}
