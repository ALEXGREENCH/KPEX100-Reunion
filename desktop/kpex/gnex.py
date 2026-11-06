"""Run Kingston's original GNEX interpreter under Unicorn ARM emulation.

This executes ROM opcode handlers, not a reimplementation of SGS instructions.
Display, input, timers and sound requests are bridged to the desktop host.
The address profile is deliberately SHA-256 pinned to Kingston firmware 2.12.
"""

from __future__ import annotations
import hashlib
import struct
from datetime import datetime, timedelta, timezone
from collections import Counter, deque
from PIL import Image
from unicorn import Uc, UcError, UC_ARCH_ARM, UC_MODE_ARM, UC_HOOK_CODE
from unicorn.arm_const import (
    UC_ARM_REG_SP,
    UC_ARM_REG_LR,
    UC_ARM_REG_R0,
    UC_ARM_REG_R1,
    UC_ARM_REG_R2,
    UC_ARM_REG_R3,
    UC_ARM_REG_R12,
    UC_ARM_REG_PC,
)
from .sgs import SgsFile
from .vfs import VirtualFileSystem

ROM_SHA256 = "743d0b9a377dc6a3f0a80b7816cee575ad2f8249643876367c4bfaac54ddd19a"
RELOC = 0x2000F8DC
SGS_BASE = 0x21000000
STOP = 0x23FFF000
TOP = 0x20B3ED28
STACK = 0x20B3F5A0
VM_PC = 0x20B3EB84


class GnexError(RuntimeError):
    pass


def signed(v):
    return v if v < 0x80000000 else v - 0x100000000


class GnexRuntime:
    def __init__(
        self,
        rom: bytes,
        sgs: bytes,
        width=220,
        height=176,
        save_path=None,
        audio=None,
        key_release_event=True,
    ):
        if hashlib.sha256(rom).hexdigest() != ROM_SHA256:
            raise GnexError("GNEX native profile requires unmodified Kingston 2.12 ROM")
        self.sgs = SgsFile(sgs)
        self.vfs = VirtualFileSystem(self.sgs, save_path)
        self.audio = audio
        if len(self.sgs.body) > 0xC00000:
            raise GnexError("SGS exceeds the 12 MiB guest content region")
        self.width, self.height = width, height
        self.timer_ms = None
        self.timer_repeat = False
        self.timer_revision = 0
        self.held_keys = set()
        self.key_release_event = key_release_event
        self.status = "ready"
        self.error = None
        self.syscalls = Counter()
        self.trace = deque(maxlen=60)
        self.event_count = 0
        self.audio_requests = deque(maxlen=256)
        self._heap_next = 0x23200000
        self._heap_allocations = {}
        self._heap_free = []
        self.frame_count = 0
        self._lcd_presented = False
        self._exception = None
        self.u = Uc(UC_ARCH_ARM, UC_MODE_ARM)
        self.u.mem_map(0x20000000, 0x4000000)
        self.u.mem_write(0x20010000, rom[0x724:])
        self.u.mem_write(0x21C00000, rom[0x100000:0x49A600])
        self.u.mem_write(SGS_BASE, self.sgs.body)
        self.u.reg_write(UC_ARM_REG_SP, 0x23FF0000)
        for func in (0x39220, 0x4D464, 0x45020, 0x45094, 0x45108):
            self.u.reg_write(UC_ARM_REG_LR, STOP)
            self.u.emu_start(RELOC + func, STOP, count=10000)
            if self.u.reg_read(UC_ARM_REG_PC) != STOP:
                raise GnexError("ROM dispatch initializer did not return")
        s = self.sgs
        for addr, value in (
            (0x20B3EB7C, SGS_BASE),
            (0x20B405A0, len(s.variables)),
            (0x20B405A4, (s.c - s.b) // 4),
            (0x20B405A8, SGS_BASE + s.a),
            (0x20B405AC, SGS_BASE + s.b),
            (0x20B405B0, SGS_BASE + s.c),
            (0x20B3ED20, len(s.resources)),
            (0x20B405B8, len(s.resources)),
            (0x20B405B4, SGS_BASE + s.c),
        ):
            self._write(addr, value)
        self.var_addresses = []
        pos = SGS_BASE + s.b
        for i, (kind, count, reserved) in enumerate(s.variables):
            self._write(SGS_BASE + s.a + i * 8 + 4, pos)
            self.var_addresses.append(pos)
            pos += count * 4
        for i, resource in enumerate(s.resources):
            self._write(SGS_BASE + s.c + i * 12 + 8, SGS_BASE + resource.offset)
        self.u.mem_write(0x200FEFB8, b"\xff\x00")
        self._set_var(4, width)
        self._set_var(5, height)
        for addr in (0x336BC, 0x4E1E8, 0x3CF1C, 0x3CF4C, 0x3CC30):
            self.u.hook_add(
                UC_HOOK_CODE, self._hook, begin=RELOC + addr, end=RELOC + addr
            )
        # The native display adapter and SaveLCD/RestoreLCD use these geometry
        # shadows independently of the drawing context initialized below.
        for address in (0x20B40E6C, 0x20B3F144, 0x20B3F14C):
            self._write(address, width)
            self._write(address + 4, height)
        self.u.reg_write(UC_ARM_REG_SP, 0x23FF0000)
        self.u.reg_write(UC_ARM_REG_LR, STOP)
        self.u.reg_write(UC_ARM_REG_R0, width)
        self.u.reg_write(UC_ARM_REG_R1, height)
        self.u.reg_write(UC_ARM_REG_R2, 0x23000000)
        self.u.emu_start(RELOC + 0x45BFC, STOP, count=5_000_000)
        if self._exception or self.u.reg_read(UC_ARM_REG_PC) != STOP:
            raise GnexError(f"Native display initialization failed: {self._exception}")
        self._refresh_lcd()

    @property
    def framebuffer(self):
        return self._native_image

    def _refresh_lcd(self):
        # Compatibility for scripts that never request a presentation. Once a
        # Flush occurs, later drawing/RestoreLCD must not change the visible LCD.
        if not self._lcd_presented:
            self._native_image = self._read_lcd_image()

    def _read_lcd_image(self):
        pointer = self._read(0x20B41260)
        data = bytes(self.u.mem_read(pointer, self.width * self.height * 2))
        return Image.frombytes("RGB", (self.width, self.height), data, "raw", "BGR;16")

    def _present_lcd(self, rectangle=None):
        # Mobile C reference: Flush presents the drawing buffer; RestoreLCD
        # only restores that buffer and has no effect on the physical LCD.
        self._lcd_presented = True
        if rectangle is None:
            self._native_image = self._read_lcd_image()
            return
        x1, y1, x2, y2 = rectangle
        x1, x2 = min(x1, x2), max(x1, x2)
        y1, y2 = min(y1, y2), max(y1, y2)
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(self.width - 1, x2), min(self.height - 1, y2)
        if x1 > x2 or y1 > y2:
            return
        # GNEX rectangles use inclusive end coordinates; Pillow uses exclusive.
        box = (x1, y1, x2 + 1, y2 + 1)
        self._native_image.paste(self._read_lcd_image().crop(box), (x1, y1))

    @property
    def diagnostics(self):
        pc = self._read(VM_PC)
        return dict(
            status=self.status,
            error=self.error,
            title=self.sgs.title,
            engine="Original Kingston 2.12 ARM GNEX interpreter / Unicorn",
            events=self.event_count,
            timer_ms=self.timer_ms,
            bytecode_pc=(
                f"0x{pc-SGS_BASE:08x}"
                if SGS_BASE <= pc < SGS_BASE + len(self.sgs.body)
                else None
            ),
            interpreter_pc=f"0x{pc:08x}",
            syscalls={f"0x{k:03x}": v for k, v in self.syscalls.items()},
            trace=list(self.trace),
            audio=self.audio.diagnostics if self.audio else "Headless: audio disabled",
            filesystem=self.vfs.diagnostics,
            graphics=["Original ROM RGB565 renderer, palette, ASCII and Korean fonts"],
        )

    def _read(self, addr):
        return struct.unpack("<I", self.u.mem_read(addr, 4))[0]

    def _write(self, addr, value):
        self.u.mem_write(addr, struct.pack("<I", value & 0xFFFFFFFF))

    def _set_var(self, index, value):
        if index < len(self.var_addresses):
            self._write(self.var_addresses[index], value)

    def _args(self, n):
        top = signed(self._read(TOP))
        if top < n - 1 or top > 1023:
            raise GnexError(f"GNEX stack bounds error: top={top}, need={n}")
        args = [signed(self._read(STACK + i * 4)) for i in range(top - n + 1, top + 1)]
        self._write(TOP, top - n)
        return args

    def _push(self, value):
        top = signed(self._read(TOP)) + 1
        if top >= 1024:
            raise GnexError("GNEX stack overflow")
        self._write(TOP, top)
        self._write(STACK + top * 4, value)

    def _return(self):
        self.u.reg_write(UC_ARM_REG_PC, self.u.reg_read(UC_ARM_REG_LR))

    def resource_bytes(self, index):
        self.sgs.resource(index)  # Validates the descriptor index.
        descriptor = SGS_BASE + self.sgs.c + index * 12
        size, pointer = self._read(descriptor + 4), self._read(descriptor + 8)
        if size > 32 * 1024 * 1024:
            raise GnexError("Guest resource allocation is too large")
        return bytes(self.u.mem_read(pointer, size))

    def _hook(self, u, addr, size, user_data):
        try:
            if addr == RELOC + 0x3CC30:
                # GetDisplayInfo feeds native copy lengths and row strides.
                # Match the configured screen, including portrait phone games.
                for register, value in zip(
                    (UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3),
                    (self.width, self.height, 0, 0),
                ):
                    self._write(u.reg_read(register), value)
                u.reg_write(UC_ARM_REG_R0, 0)
                u.reg_write(UC_ARM_REG_R12, self.width)
                self._return()
                return
            if addr == RELOC + 0x3CF1C:
                length = u.reg_read(UC_ARM_REG_R0)
                if not 0 < length <= 8 * 1024 * 1024:
                    raise GnexError(f"Guest allocation size {length} is invalid")
                length = (length + 15) & ~15
                pointer = None
                for i, (candidate, capacity) in enumerate(self._heap_free):
                    if capacity >= length:
                        pointer, length = self._heap_free.pop(i)
                        break
                if pointer is None:
                    pointer = self._heap_next
                    if pointer + length > 0x23E00000:
                        raise GnexError("Guest heap exhausted (12 MiB)")
                    self._heap_next += length
                self._heap_allocations[pointer] = length
                u.mem_write(pointer, bytes(length))
                u.reg_write(UC_ARM_REG_R0, pointer)
                self._return()
                return
            if addr == RELOC + 0x3CF4C:
                pointer = u.reg_read(UC_ARM_REG_R0)
                length = self._heap_allocations.pop(pointer, None)
                if length is not None:
                    self._heap_free.append((pointer, length))
                self._return()
                return
            if addr == RELOC + 0x336BC:
                raise GnexError(
                    f"Original GNEX exception {u.reg_read(UC_ARM_REG_R0)} at SGS 0x{self._read(VM_PC)-SGS_BASE:08x}"
                )
            number = u.reg_read(UC_ARM_REG_R0)
            self.syscalls[number] += 1
            self.trace.append(
                f"calls 0x{number:03x} @ SGS 0x{self._read(VM_PC)-SGS_BASE:08x}"
            )
            if self._syscall(number):
                self._return()
        except Exception as exc:
            self._exception = exc
            u.emu_stop()

    def _syscall(self, number):
        if self.vfs.syscall(self, number):
            return True
        a = self._args
        if number == 0x005:
            # GetTime(int[4]), native wrapper 0x53594 -> adapter 0x3D214.
            # Keep the original pointer checks and halfword stores. The adapter
            # reads seconds/minutes/hours from this firmware RTC shadow and
            # reports milliseconds=0, exactly as on the Kingston platform.
            now = datetime.now(timezone(timedelta(hours=3)))
            self.u.mem_write(
                0x2098541C,
                bytes(
                    (
                        now.second,
                        now.minute,
                        now.hour,
                        now.day,
                        now.month,
                        now.year & 255,
                        now.year >> 8,
                    )
                ),
            )
            return False
        if 0x20 <= number <= 0x5E:
            return False  # Original ROM graphics, fonts, clipping and image operations.
        if 0x9D <= number <= 0xE0 or 0x8E <= number <= 0x94:
            return (
                False  # Original string/array/mathematics and firmware media adapters.
            )
        if number == 0xE1:
            return False  # Native Exit writes state=3 and redirects VM_PC to END.
        if number == 0x5F:
            self._present_lcd()
        elif number == 0x60:
            self._present_lcd(a(4))
        elif number == 0x82:
            resource = a(1)[0]
            self.sgs.resource(resource)
            self.audio_requests.append(resource)
            if self.audio:
                self.audio.play(self.resource_bytes(resource))
        elif number == 0x83:
            if self.audio:
                self.audio.stop()
        elif number == 0x84:
            if self.audio:
                self.audio.pause()
        elif number == 0x85:
            if self.audio:
                self.audio.resume()
        elif number == 0x95:
            delay, repeat = a(2)
            self.timer_ms = delay if delay > 0 else None
            self.timer_repeat = bool(repeat)
            self.timer_revision += 1
        elif number == 0x98:
            self.timer_ms = None
            self.timer_revision += 1
        else:
            raise GnexError(
                f"Unsupported syscall 0x{number:03x}; stopped without inventing behavior"
            )
        return True

    def event(self, name, value=0, instruction_budget=20_000_000):
        name = name.upper()
        if name not in self.sgs.entries:
            raise ValueError(f"Unknown GNEX event: {name}")
        if self.status in ("error", "exited"):
            return self.diagnostics
        entry = self.sgs.entries[name]
        if not entry:
            return self.diagnostics
        self._set_var(0, value)
        if name == "TIMEOUT":
            self.frame_count += 1
            self._set_var(6, self.frame_count)
            for index, modulus in ((7, 2), (8, 3), (9, 6)):
                self._set_var(index, self.frame_count % modulus)
            if not self.timer_repeat:
                self.timer_ms = None
        self._exception = None
        self.u.reg_write(UC_ARM_REG_R0, entry)
        self.u.reg_write(UC_ARM_REG_LR, STOP)
        self.u.reg_write(UC_ARM_REG_SP, 0x23FF0000)
        self.status = "running"
        try:
            self.u.emu_start(RELOC + 0x399BC, STOP, count=instruction_budget)
            if self._exception:
                raise self._exception
            if self.u.reg_read(UC_ARM_REG_PC) != STOP:
                raise GnexError(
                    f"Event {name} exceeded {instruction_budget} ARM instructions"
                )
            self.event_count += 1
            self.status = "exited" if self._read(0x20B3ECE4) == 3 else "idle"
            if self.status == "exited":
                self.timer_ms = None
                if self.audio:
                    self.audio.stop()
        except Exception as exc:
            self.error = str(exc)
            self.status = "error"
        self._refresh_lcd()
        return self.diagnostics

    def set_key(self, code, pressed):
        if pressed:
            self.held_keys.add(code)
            return self.event("KEYPRESS", code)
        released = code in self.held_keys
        self.held_keys.discard(code)
        # Original Kingston firmware sends KEYPRESS 255 after each real release.
        if (
            released
            and self.key_release_event
            and self.status not in ("error", "exited", "closed")
        ):
            return self.event("KEYPRESS", 0xFF)
        return self.diagnostics
