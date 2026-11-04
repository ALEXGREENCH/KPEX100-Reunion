"""GNEX application-local filesystem and persistent save store.

Guest names are virtual keys, never host filesystem paths. Optional persistence
uses one bounded JSON file selected by the host. The syscall stack signatures
come from Kingston 2.12 handlers 0x4E4C8..0x4EA44. Seek origins follow the ROM
adapter at 0x3CE94: 1=SET, 2=CUR, 3=END.
"""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from pathlib import Path
import struct

SGS_BASE = 0x21000000
MAX_FILE = 16 * 1024 * 1024
MAX_TOTAL = 64 * 1024 * 1024


@dataclass
class OpenFile:
    name: str
    mode: int
    position: int = 0


class VirtualFileSystem:
    def __init__(self, sgs=None, save_path=None):
        self.save_path = Path(save_path) if save_path else None
        self.files: dict[str, bytearray] = {}
        self.directories = {""}
        self.readonly = set()
        self.handles: dict[int, OpenFile] = {}
        self.operations = 0
        if sgs is not None:
            self._mount_appended(sgs)
        if self.save_path and self.save_path.exists():
            if self.save_path.stat().st_size > MAX_TOTAL * 2:
                raise ValueError("Save store exceeds its size limit")
            saved = json.loads(self.save_path.read_text(encoding="utf-8"))
            if saved.get("version") != 1:
                raise ValueError("Unknown save store version")
            loaded = {}
            for name, payload in saved.get("files", {}).items():
                name = self.normalize(name)
                raw = base64.b64decode(payload, validate=True)
                if len(raw) > MAX_FILE:
                    raise ValueError("Saved file exceeds its size limit")
                if name not in self.readonly:
                    loaded[name] = bytearray(raw)
            if sum(map(len, loaded.values())) > MAX_TOTAL:
                raise ValueError("Save data exceeds its size limit")
            self.files.update(loaded)
            for directory in saved.get("directories", []):
                self.directories.add(self.normalize(directory, allow_root=True))

    @staticmethod
    def normalize(name, allow_root=False):
        if isinstance(name, bytes):
            name = name.split(b"\0", 1)[0].decode("cp949")
        if not isinstance(name, str) or "\0" in name or len(name) > 512:
            raise ValueError("Invalid virtual filename")
        name = name.replace("\\", "/").strip("/")
        parts = name.split("/") if name else []
        if any(p in ("", ".", "..") or ":" in p for p in parts):
            raise ValueError("Invalid virtual path component")
        if not name and not allow_root:
            raise ValueError("Empty virtual filename")
        return name.casefold()

    def _mount_appended(self, sgs):
        body, base = sgs.body, sgs.declared_size
        if len(body) - base < 8:
            return
        table_bytes, count = struct.unpack_from("<II", body, base)
        if count > 10000 or base + 8 + table_bytes > len(body):
            raise ValueError("Invalid appended SGS file table")
        pos = base + 8
        members = {}
        for _ in range(count):
            if pos + 4 > base + 8 + table_bytes:
                raise ValueError("Truncated appended SGS filename")
            length = struct.unpack_from("<I", body, pos)[0]
            pos += 4
            if not 1 <= length <= 512 or pos + length + 8 > base + 8 + table_bytes:
                raise ValueError("Invalid appended SGS filename length")
            name = self.normalize(body[pos : pos + length])
            pos += length
            offset, size = struct.unpack_from("<II", body, pos)
            pos += 8
            if (
                offset < base + 8 + table_bytes
                or offset + size > len(body)
                or size > MAX_FILE
            ):
                raise ValueError("Appended SGS member exceeds payload")
            if name in members:
                raise ValueError("Duplicate appended SGS member")
            members[name] = bytearray(body[offset : offset + size])
        if pos != base + 8 + table_bytes:
            raise ValueError("Appended SGS table length mismatch")
        self.files.update(members)
        self.readonly.update(members)
        for name in members:
            bits = name.split("/")
            for i in range(1, len(bits)):
                self.directories.add("/".join(bits[:i]))

    @property
    def diagnostics(self):
        return {
            "files": sorted(self.files),
            "open_handles": len(self.handles),
            "readonly_files": len(self.readonly),
            "operations": self.operations,
            "persistence": str(self.save_path) if self.save_path else "memory only",
        }

    def flush(self):
        if not self.save_path:
            return
        saved = {
            "version": 1,
            "files": {
                name: base64.b64encode(data).decode("ascii")
                for name, data in self.files.items()
                if name not in self.readonly
            },
            "directories": sorted(self.directories),
        }
        self.save_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.save_path.with_name(self.save_path.name + ".tmp")
        temporary.write_text(
            json.dumps(saved, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        temporary.replace(self.save_path)

    def open(self, name, mode):
        name = self.normalize(name)
        if mode not in (1, 2, 3, 4) or len(self.handles) >= 15:
            return -1
        if name in self.readonly and mode != 3:
            return -1
        if mode == 2:
            if name in self.files or name in self.directories:
                return -1
            parent = name.rpartition("/")[0]
            if parent not in self.directories:
                return -1
            self.files[name] = bytearray()
            self.flush()
        elif name not in self.files:
            return -1
        handle = next(i for i in range(15) if i not in self.handles)
        self.handles[handle] = OpenFile(
            name, mode, len(self.files[name]) if mode == 4 else 0
        )
        return handle

    def close(self, handle):
        if handle not in self.handles:
            return -1
        self.handles.pop(handle)
        self.flush()
        return 1

    def delete(self, name):
        name = self.normalize(name)
        if (
            name not in self.files
            or name in self.readonly
            or any(h.name == name for h in self.handles.values())
        ):
            return -1
        del self.files[name]
        self.flush()
        return 1

    def seek(self, handle, offset, origin):
        opened = self.handles.get(handle)
        if opened is None or origin not in (1, 2, 3):
            return -1
        start = (0, opened.position, len(self.files[opened.name]))[origin - 1]
        position = start + offset
        if not 0 <= position <= MAX_FILE:
            return -1
        opened.position = position
        return 1

    def write(self, handle, data):
        opened = self.handles.get(handle)
        if opened is None or opened.mode == 3 or opened.name in self.readonly:
            return -1
        target = self.files[opened.name]
        end = opened.position + len(data)
        total = sum(len(v) for k, v in self.files.items() if k not in self.readonly)
        growth = max(0, end - len(target))
        if end > MAX_FILE or total + growth > MAX_TOTAL:
            return -1
        if growth:
            target.extend(bytes(growth))
        target[opened.position : end] = data
        opened.position = end
        self.flush()
        return len(data)

    def read(self, handle, size):
        opened = self.handles.get(handle)
        if opened is None or not 0 <= size <= MAX_FILE:
            return None
        result = bytes(
            self.files[opened.name][opened.position : opened.position + size]
        )
        opened.position += len(result)
        return result

    @staticmethod
    def _int_pointer(runtime, encoded, byte_count):
        encoded &= 0xFFFFFFFF
        if encoded & 0x80000000:
            raw = encoded & 0x7FFFFFFF
            slot, index = raw >> 20, raw & 0xFFFFF
            if slot >= 1024:
                raise ValueError("Dynamic integer pointer slot out of bounds")
            descriptor = 0x20B41E1C + slot * 12
            base, capacity = runtime._read(descriptor), runtime._read(descriptor + 4)
        else:
            base, capacity = runtime._read(0x20B405AC), runtime._read(0x20B405A4)
            index = encoded
        if not base or index * 4 + byte_count > capacity * 4:
            raise ValueError("File transfer exceeds integer array bounds")
        return base + index * 4

    @staticmethod
    def _media_pointer(runtime, index, offset, byte_count):
        runtime.sgs.resource(index)
        descriptor = SGS_BASE + runtime.sgs.c + index * 12
        size, pointer = runtime._read(descriptor + 4), runtime._read(descriptor + 8)
        if offset < 0 or offset + byte_count > size or (byte_count and not pointer):
            raise ValueError("File transfer exceeds media resource bounds")
        return pointer + offset

    def syscall(self, runtime, number):
        if not 0x63 <= number <= 0x6E:
            return False
        argc = {
            0x63: 2,
            0x64: 1,
            0x65: 1,
            0x66: 3,
            0x67: 3,
            0x68: 4,
            0x69: 3,
            0x6A: 4,
            0x6B: 1,
            0x6C: 1,
            0x6D: 1,
            0x6E: 1,
        }[number]
        args = runtime._args(argc)
        self.operations += 1
        result = -1
        try:
            if number in (0x63, 0x65, 0x6B, 0x6C, 0x6D, 0x6E):
                name = self.normalize(
                    runtime.resource_bytes(args[0]), allow_root=number == 0x6C
                )
            if number == 0x63:
                result = self.open(name, args[1])
            elif number == 0x64:
                result = self.close(args[0])
            elif number == 0x65:
                result = self.delete(name)
            elif number == 0x66:
                result = self.seek(*args)
            elif number in (0x67, 0x68, 0x69, 0x6A):
                handle = args[0]
                byte_count = args[-1] * (4 if number in (0x67, 0x69) else 1)
                if not 0 <= byte_count <= MAX_FILE:
                    raise ValueError("Invalid file transfer length")
                if number in (0x67, 0x69):
                    pointer = self._int_pointer(runtime, args[1], byte_count)
                else:
                    pointer = self._media_pointer(runtime, args[1], args[2], byte_count)
                if number in (0x67, 0x68):
                    result = self.write(
                        handle, bytes(runtime.u.mem_read(pointer, byte_count))
                    )
                else:
                    data = self.read(handle, byte_count)
                    if data is not None:
                        if data:
                            runtime.u.mem_write(pointer, data)
                        result = len(data)
            elif number == 0x6B:
                result = 1 if name in self.files else -1
            elif number == 0x6C:
                result = 1 if name in self.directories else -1
            elif number == 0x6D:
                parent = name.rpartition("/")[0]
                if (
                    name not in self.directories
                    and name not in self.files
                    and parent in self.directories
                ):
                    self.directories.add(name)
                    self.flush()
                    result = 1
            elif number == 0x6E:
                prefix = name + "/"
                if name in self.directories and not any(
                    p.startswith(prefix) for p in set(self.files) | self.directories
                ):
                    self.directories.remove(name)
                    self.flush()
                    result = 1
        except (ValueError, UnicodeError):
            result = -1
        runtime._push(result)
        return True
