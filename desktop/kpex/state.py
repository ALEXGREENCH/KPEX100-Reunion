"""Portable machine checkpoints: validated ZIP data, never pickle/native pointers.

CPU state contains architectural ARM registers including every bank and SPSR.
Call only on the machine's owner thread, between run() calls.
"""

from __future__ import annotations

from collections import Counter, deque
import hashlib
import json
from pathlib import Path
import zipfile

from PIL import Image
from unicorn import arm_const as ar

FORMAT = "reunion-machine-state"
VERSION = 1
MAX_EXPANDED = 384 * 1024 * 1024
EXCLUDED = {
    "cpu",
    "_ram_backing",
    "_ram_words",
    "_instruction_cache",
    "_run_end",
    "rom",
    "rom_info",
    "disk_image",
    "firmware_sectors",
    "framebuffer",
}
MODES = (0x10, 0x11, 0x12, 0x13, 0x17, 0x1B)
GENERAL = [getattr(ar, f"UC_ARM_REG_R{i}") for i in range(13)] + [
    ar.UC_ARM_REG_SP,
    ar.UC_ARM_REG_LR,
]


class StateError(ValueError):
    pass


def _cpu_state(cpu):
    original = cpu.context_save()
    cpsr = cpu.reg_read(ar.UC_ARM_REG_CPSR)
    result = {
        "cpsr": cpsr,
        "pc": cpu.reg_read(ar.UC_ARM_REG_PC),
        "shared": [cpu.reg_read(r) for r in GENERAL[:8]],
        "banks": [],
    }
    try:
        for mode in MODES:
            cpu.reg_write(ar.UC_ARM_REG_CPSR, 0xC0 | mode)
            result["banks"].append(
                {
                    "mode": mode,
                    "registers": [cpu.reg_read(r) for r in GENERAL[8:]],
                    "spsr": cpu.reg_read(ar.UC_ARM_REG_SPSR) if mode != 0x10 else None,
                }
            )
    finally:
        cpu.context_restore(original)
    return result


def _restore_cpu(cpu, state):
    for bank in state["banks"]:
        cpu.reg_write(ar.UC_ARM_REG_CPSR, 0xC0 | bank["mode"])
        for reg, value in zip(GENERAL[8:], bank["registers"]):
            cpu.reg_write(reg, value)
        if bank["spsr"] is not None:
            cpu.reg_write(ar.UC_ARM_REG_SPSR, bank["spsr"])
    for reg, value in zip(GENERAL[:8], state["shared"]):
        cpu.reg_write(reg, value)
    cpu.reg_write(ar.UC_ARM_REG_CPSR, state["cpsr"])
    cpu.reg_write(ar.UC_ARM_REG_PC, state["pc"])


def _attributes(machine):
    return {k: v for k, v in machine.__dict__.items() if k not in EXCLUDED}


def save_state(machine, path):
    """Atomically save an actual reached state without changing the guest."""
    path = Path(path)
    blobs = {}

    def blob(data):
        name = f"blobs/{len(blobs):04d}.bin"
        blobs[name] = bytes(data)
        return name

    def encode(value):
        if value is None or type(value) in (bool, int, float, str):
            return value
        if isinstance(value, (bytes, bytearray)):
            return {"type": type(value).__name__, "blob": blob(value)}
        if isinstance(value, deque):
            return {
                "type": "deque",
                "maxlen": value.maxlen,
                "items": [encode(x) for x in value],
            }
        if isinstance(value, dict):
            return {
                "type": "Counter" if isinstance(value, Counter) else "dict",
                "items": [[encode(k), encode(v)] for k, v in value.items()],
            }
        if isinstance(value, (list, tuple, set)):
            return {"type": type(value).__name__, "items": [encode(x) for x in value]}
        raise StateError(f"Unsupported machine state value: {type(value).__name__}")

    memories = []
    for start, end, perms in machine.cpu.mem_regions():
        # Shared SDRAM mirror and immutable NOR need no duplicate bytes.
        if start in (0x21000000, 0x70000000):
            continue
        memories.append(
            {
                "start": start,
                "size": end - start + 1,
                "permissions": perms,
                "blob": blob(machine.cpu.mem_read(start, end - start + 1)),
            }
        )
    manifest = {
        "format": FORMAT,
        "version": VERSION,
        "rom_sha256": machine.rom_info["sha256"],
        "cpu": _cpu_state(machine.cpu),
        "memory": memories,
        "peripherals": encode(_attributes(machine)),
        "framebuffer": {
            "size": list(machine.framebuffer.size),
            "blob": blob(machine.framebuffer.convert("RGB").tobytes()),
        },
    }
    manifest["blobs"] = {
        name: {"size": len(data), "sha256": hashlib.sha256(data).hexdigest()}
        for name, data in blobs.items()
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    try:
        with zipfile.ZipFile(
            temporary, "w", zipfile.ZIP_DEFLATED, compresslevel=3
        ) as out:
            out.writestr("manifest.json", json.dumps(manifest, separators=(",", ":")))
            for name, data in blobs.items():
                out.writestr(name, data)
        temporary.replace(path)
    finally:
        if temporary.exists():
            temporary.unlink()


def load_state(machine, path):
    """Validate all data before restoring into the same ROM/machine revision."""
    try:
        with zipfile.ZipFile(path) as source:
            entries = source.infolist()
            names = [e.filename for e in entries]
            if len(names) != len(set(names)) or len(entries) > 4096:
                raise StateError("Duplicate or excessive checkpoint entries")
            if sum(e.file_size for e in entries) > MAX_EXPANDED:
                raise StateError("Checkpoint exceeds the expanded size limit")
            if source.getinfo("manifest.json").file_size > 8 * 1024 * 1024:
                raise StateError("Checkpoint manifest is too large")
            manifest = json.loads(source.read("manifest.json"))
            if manifest["format"] != FORMAT or manifest["version"] != VERSION:
                raise StateError("Unsupported checkpoint format")
            if manifest["rom_sha256"] != machine.rom_info["sha256"]:
                raise StateError("Checkpoint requires a different ROM")
            if set(names) != {"manifest.json", *manifest["blobs"]}:
                raise StateError("Unexpected checkpoint entries")
            blobs = {}
            for name, info in manifest["blobs"].items():
                data = source.read(name)
                if (
                    len(data) != info["size"]
                    or hashlib.sha256(data).hexdigest() != info["sha256"]
                ):
                    raise StateError("Checkpoint blob checksum mismatch")
                blobs[name] = data

        def decode(value, depth=0):
            if depth > 32:
                raise StateError("Checkpoint data is nested too deeply")
            if value is None or type(value) in (bool, int, float, str):
                return value
            kind = value["type"]
            if kind in ("bytes", "bytearray"):
                return (
                    bytes(blobs[value["blob"]])
                    if kind == "bytes"
                    else bytearray(blobs[value["blob"]])
                )
            if kind in ("dict", "Counter"):
                pairs = [
                    (decode(k, depth + 1), decode(v, depth + 1))
                    for k, v in value["items"]
                ]
                result = dict(pairs)
                if len(result) != len(pairs):
                    raise StateError("Duplicate checkpoint dictionary key")
                return Counter(result) if kind == "Counter" else result
            values = [decode(x, depth + 1) for x in value["items"]]
            if kind == "deque":
                limit = value["maxlen"]
                if limit is not None and (
                    type(limit) is not int or not 0 <= limit <= 65536
                ):
                    raise StateError("Invalid trace length")
                return deque(values, maxlen=limit)
            if kind not in ("list", "tuple", "set"):
                raise StateError("Unknown checkpoint data type")
            return {"list": list, "tuple": tuple, "set": set}[kind](values)

        state = decode(manifest["peripherals"])
        if type(state) is not dict or set(state) != set(_attributes(machine)):
            raise StateError("Checkpoint machine revision does not match")
        if len(state["lcd_pixels"]) != 220 * 176 * 2:
            raise StateError("Invalid LCD memory size")
        cpu = manifest["cpu"]
        if len(cpu["shared"]) != 8 or [b["mode"] for b in cpu["banks"]] != list(MODES):
            raise StateError("Invalid ARM register banks")
        values = [cpu["cpsr"], cpu["pc"], *cpu["shared"]]
        for bank in cpu["banks"]:
            if len(bank["registers"]) != 7:
                raise StateError("Invalid bank register count")
            values += bank["registers"]
            if bank["spsr"] is not None:
                values.append(bank["spsr"])
        if any(type(v) is not int or not 0 <= v <= 0xFFFFFFFF for v in values):
            raise StateError("Invalid ARM register value")
        if cpu["cpsr"] & 31 not in (*MODES, 0x1F):
            raise StateError("Invalid ARM processor mode")
        existing = {
            a: (b - a + 1, p)
            for a, b, p in machine.cpu.mem_regions()
            if a not in (0x21000000, 0x70000000) and a not in machine._open_bus_pages
        }
        expected = dict(existing)
        for page in state["_open_bus_pages"]:
            if (
                type(page) is not int
                or not 0xF0001000 <= page <= 0xFFFFE000
                or page % 4096
            ):
                raise StateError("Invalid open bus mapping")
            expected[page] = (4096, 7)
        actual = {m["start"]: (m["size"], m["permissions"]) for m in manifest["memory"]}
        if actual != expected or len(actual) != len(manifest["memory"]):
            raise StateError("Checkpoint memory map does not match")
        for mem in manifest["memory"]:
            if len(blobs[mem["blob"]]) != mem["size"]:
                raise StateError("Invalid memory blob size")
        frame = manifest["framebuffer"]
        if frame["size"] != [220, 176] or len(blobs[frame["blob"]]) != 220 * 176 * 3:
            raise StateError("Invalid framebuffer")
        image = Image.frombytes("RGB", (220, 176), blobs[frame["blob"]])
    except StateError:
        raise
    except (
        KeyError,
        TypeError,
        ValueError,
        IndexError,
        OverflowError,
        RecursionError,
        zipfile.BadZipFile,
        EOFError,
    ) as exc:
        raise StateError(f"Invalid checkpoint: {exc}") from exc

    # All external data has been parsed, checked and allocated before mutation.
    for page in machine._open_bus_pages - state["_open_bus_pages"]:
        machine.cpu.mem_unmap(page, 4096)
    for page in state["_open_bus_pages"] - machine._open_bus_pages:
        machine.cpu.mem_map(page, 4096)
    for mem in manifest["memory"]:
        machine.cpu.mem_write(mem["start"], blobs[mem["blob"]])
    machine.__dict__.update(state)
    machine._instruction_cache = {}
    machine._run_end = machine.instructions
    machine.framebuffer = image
    machine.cpu.ctl_flush_tb()
    _restore_cpu(machine.cpu, cpu)
    if machine.status == "running":
        machine.status = "paused"
