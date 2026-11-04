"""Experimental K-PEX 100 / TCC76x firmware execution backend.

Runs original ARM/Thumb instructions using Unicorn's ARMv4T TI925T core.
The ARM940T CP15 register file is shadowed, caches/MPU protection are not
cycle accurate. See limitations in snapshot(). Unknown hardware reads stop
in strict mode; no splash artwork is substituted for LCD output.

Evidence: TCC760 specification Rev 0.07, chapters 2, 5, 6, 8, 12 and 15,
and the supplied reverse/rom_layout/findings.md.
"""

from __future__ import annotations

from collections import Counter, deque
from pathlib import Path
import hashlib
import ctypes
import struct
from typing import Any

from PIL import Image

try:
    import unicorn as uc
    from unicorn import arm_const as ar
except ImportError as exc:
    raise ImportError("Firmware execution requires: pip install unicorn") from exc

MASK = 0xFFFFFFFF
REG_IDS = [getattr(ar, f"UC_ARM_REG_R{i}") for i in range(13)] + [
    ar.UC_ARM_REG_SP,
    ar.UC_ARM_REG_LR,
    ar.UC_ARM_REG_PC,
]
IDLE_PC = (
    0x20072C64,
    0x200A1B08,
    0x200A1B0C,
    0x200A1B10,
    0x200A1B14,
    0x200A1B18,
    0x200A1B1C,
    0x200A1B20,
    0x200A1B24,
    0x20072C68,
    0x20072C6C,
    0x20072C70,
    0x20072C74,
    0x200A1B28,
    0x200A1B2C,
    0x20072C78,
    0x200819B4,
    0x20072C7C,
)


def _word(data: bytes, offset: int) -> int:
    return struct.unpack_from("<I", data, offset)[0]


def inspect_rom(source: bytes | str | Path) -> dict[str, Any]:
    """Validate the executable header and all appended section checksums."""
    data = (
        bytes(source)
        if isinstance(source, (bytes, bytearray))
        else Path(source).read_bytes()
    )
    if len(data) < 0x100000 or len(data) % 4:
        raise ValueError("ROM must contain an aligned 1 MiB executable image")
    if data[:4] != bytes.fromhex("08f69fe5") or data[8:16] != b"Ver:1234":
        raise ValueError("Not a supported K-PEX / GMP-M6 ROM header")
    count = _word(data, 0x14)
    if count != 3:
        raise ValueError(f"Unexpected ROM section count: {count}")
    sections = []
    expected = 0x100000
    for index in range(count):
        offset, start, sectors, checksum = struct.unpack_from(
            "<IIII", data, 0x20 + index * 16
        )
        length = sectors * 512
        if offset != expected or not length or offset + length > len(data):
            raise ValueError(f"Invalid or noncontiguous ROM section {index}")
        payload = data[offset : offset + length]
        valid = (
            sum(v[0] for v in struct.iter_unpack("<I", payload)) + checksum
        ) & MASK == 0
        sections.append(
            dict(
                index=index,
                offset=offset,
                start_sector=start,
                sectors=sectors,
                length=length,
                checksum=checksum,
                checksum_valid=valid,
            )
        )
        expected = offset + length
    if expected != len(data):
        raise ValueError("Unaccounted trailing bytes in ROM")
    first_valid = (
        sum(v[0] for v in struct.iter_unpack("<I", data[:0x100000])) & MASK == 0
    )
    loads = []
    for i in range(5):
        src, dst, size, zero_size, zero_address = struct.unpack_from(
            "<IIIII", data, 0x61C + 20 * i
        )
        if not 0x70000000 <= src <= 0x70100000 or src - 0x70000000 + size > 0x100000:
            raise ValueError("Invalid executable load descriptor")
        loads.append(
            dict(
                source=src,
                destination=dst,
                size=size,
                zero_size=zero_size,
                zero_address=zero_address,
            )
        )
    return dict(
        size=len(data),
        sha256=hashlib.sha256(data).hexdigest(),
        entry=_word(data, 0x610),
        checksum_valid=first_valid and all(s["checksum_valid"] for s in sections),
        executable_checksum_valid=first_valid,
        sections=sections,
        loads=loads,
    )


class FirmwareMachine:
    """Incremental machine; one owner thread must access each instance.

    strict_mmio=True stops at unimplemented device reads. Setting False is
    an explicit diagnostic experiment: unimplemented registers read back
    their last write, are recorded, and never count as hardware support.
    """

    width, height = 220, 176
    limitations = [
        "ARM940T modeled with ARMv4T instruction core; CP15 shadow, no cache/MPU timing",
        "Timer time uses one virtual CPU cycle per instruction, not measured instruction timing",
        "Low-address SRAM/cache overlays use independent backing; full alias/cache behavior is pending",
        "HX8309 panel register subset and ATA vendor drive selection inferred from ROM; codec unimplemented",
        "ATA drive0 is a RAM-backed user disk; vendor device serial is a synthetic emulator identity",
        "ADC0 key ladder is recovered for default keyboard config2; simultaneous analog keys select most recent press",
        "ADC levels are configurable simulated inputs, not measurements from the original device",
        "Undocumented 0x80000A10 challenge responses are inferred from ROM comparisons, not chip measurements",
    ]

    def __init__(
        self,
        rom: bytes | str | Path,
        *,
        strict_mmio: bool = True,
        disk_image: bytes | str | Path | None = None,
        fast_idle: bool = True,
    ):
        self.rom = (
            bytes(rom)
            if isinstance(rom, (bytes, bytearray))
            else Path(rom).read_bytes()
        )
        self.rom_info = inspect_rom(self.rom)
        if not self.rom_info["checksum_valid"]:
            raise ValueError("ROM checksum mismatch")
        self.strict_mmio = strict_mmio
        self.fast_idle = fast_idle
        self.disk_image = (
            (
                bytes(disk_image)
                if isinstance(disk_image, (bytes, bytearray))
                else Path(disk_image).read_bytes()
            )
            if disk_image is not None
            else None
        )
        self.reset()

    def reset(self) -> None:
        self.cpu = uc.Uc(uc.UC_ARCH_ARM, uc.UC_MODE_ARM)
        self.cpu.ctl_set_cpu_model(ar.UC_CPU_ARM_TI925T)
        # SDCFG 6268A020: 16-bit bus, 9 CAS bits, 12 RAS bits, four banks =16MiB.
        # Firmware loads resources at20C00000 and dereferences their21C00000 mirror.
        self._ram_backing = ctypes.create_string_buffer(0x1000000)
        ram_pointer = ctypes.addressof(self._ram_backing)
        self.cpu.mem_map_ptr(0x20000000, 0x1000000, uc.UC_PROT_ALL, ram_pointer)
        self.cpu.mem_map_ptr(0x21000000, 0x1000000, uc.UC_PROT_ALL, ram_pointer)
        for base, size in [
            (0, 0x100000),
            (0x30000000, 0x10000),
            (0x40000000, 0x1000),
            (0x50000000, 0x1000),
            (0x70000000, 0x100000),
            (0x80000000, 0x1000),
            (0xF0000000, 0x1000),
            (0xFFFFF000, 0x1000),
        ]:
            self.cpu.mem_map(base, size)
        self.cpu.mem_write(0x70000000, self.rom[:0x100000])
        self.cpu.reg_write(ar.UC_ARM_REG_CPSR, 0xD3)
        self.cpu.reg_write(ar.UC_ARM_REG_PC, 0x70000000)
        self.instructions = 0
        self.fast_forwarded_instructions = 0
        self._run_end = None
        self.status = "ready"
        self.stop_reason = ""
        self.trace = deque(maxlen=512)
        self.mmio_trace = deque(maxlen=512)
        self.mmio_counts = Counter()
        self.unsupported = {}
        self.milestones = ["ROM checksum verified"]
        self.cp15 = {(15, 0, 0, 0, 0): 0x41009400, (15, 0, 1, 0, 0): 0x70}
        self.mmio = {}
        self.pending = 0
        self.timer_pending = 0
        self.timer_counts = [0.0] * 6
        self.timer_last = 0
        self.irq_count = 0
        self.key_states = {}
        self._held_keys = []
        # Unpressed/unlocked digital inputs are high; direction register selects latch vs pin.
        self.gpio_inputs = {
            0x80000300: 0xFFFFFFFF,
            0x80000310: 0x3FFFFFFF,
            0x80000320: 0xFFFF,
            0x80000330: 0xFFFF,
        }
        self.adc_inputs = {i: 1023 for i in range(8)}
        # ROM 2001A600 uses channel4 >500 to detect external USB power.
        self.adc_inputs[4] = 0
        self.adc_channel = 0
        self.adc_started = False
        self.pll_enable_at = 0
        self.framebuffer = Image.new("RGB", (self.width, self.height), (0, 0, 0))
        self.lcd_writes = 0
        self.lcd_source = None
        self.lcd_command = 0
        self.lcd_registers = {0: 0x8309, 0x44: 0xAF00, 0x45: 0xDB00}
        self.lcd_pixels = bytearray(220 * 176 * 2)
        self.lcd_x = self.lcd_y = 0
        self.lcd_pixel_writes = 0
        self.lcd_frames = 0
        self._lcd_rendered_count = -1
        self.ata_registers = {0x1C: 0x40, 0x04: 0}
        self.ata_drive = 0
        self.ata_buffer = bytearray()
        self.ata_position = 0
        self.ata_write_target = None
        self.ata_trace = deque(maxlen=256)
        self.ata_disks = {0: bytearray(self.disk_image or bytes(16 * 1024 * 1024))}
        self.firmware_sectors = self.rom[0x100000:]
        self._instruction_cache = {}
        self._deferred_writes = {}
        self._open_bus_pages = set()
        reset = {
            0x80000040: 0,
            0x80000044: 0,
            0x80000300: 0xFFFFFFFF,
            0x80000304: 0,
            0x80000310: 0x3FFFFFFF,
            0x80000314: 0xFF,
            0x80000318: 0x3C0000FF,
            0x80000320: 0xFFFF,
            0x80000330: 0x7FFF,
            0x80000400: 0x7FFE,
            0x80000404: 0x2E02,
            0x80000408: 0x82000,
            0x8000040C: 0x800,
            0x80000418: 0x1BE,
            0x8000043C: 0xFEFF,
            0x80000130: 0x7C0,
            0x80000280: 0x7FFF,
            0x80000A00: 0x18,
            0x80000A80: 0x18,
            0x80000A88: 0x2400,
            0x80000A14: 4,
            0x80000A2C: 0x3C0000,
            0x80000F00: 6,
            0x80000F48: 7,
            0x80000D00: 0x10,
            0x80000D34: 0x2EDF,
            0x80000D44: 0x628,
            0x80000D48: 0x02001202,
            0x80000D54: 0x100,
            0x80000D58: 0x100,
            0xF0000000: 0x62E97010,
            0xF0000008: 0x8002,
            0xF0000010: 0x0B405649,
            0xF0000014: 0x0150569A,
            0xF0000018: 0x006056BA,
            0xF000001C: 0x0A70569A,
        }
        for i in range(6):
            reset[0x80000208 + i * 16] = 0xFFFF if i < 4 else 0xFFFFF
        for address, value in reset.items():
            self._write_mmio(address, value)
        self.cpu.hook_add(uc.UC_HOOK_CODE, self._code)
        self.cpu.hook_add(
            uc.UC_HOOK_MEM_READ | uc.UC_HOOK_MEM_WRITE,
            self._memory,
            begin=0x80000000,
            end=0x80000FFF,
        )
        self.cpu.hook_add(
            uc.UC_HOOK_MEM_READ | uc.UC_HOOK_MEM_WRITE,
            self._memory,
            begin=0xF0000000,
            end=0xF0000FFF,
        )
        self.cpu.hook_add(
            uc.UC_HOOK_MEM_READ | uc.UC_HOOK_MEM_WRITE,
            self._memory,
            begin=0xFFFFF000,
            end=0xFFFFFFFF,
        )
        self.cpu.hook_add(
            uc.UC_HOOK_MEM_READ | uc.UC_HOOK_MEM_WRITE,
            self._lcd_memory,
            begin=0x50000000,
            end=0x50000FFF,
        )
        self.cpu.hook_add(
            uc.UC_HOOK_MEM_READ | uc.UC_HOOK_MEM_WRITE,
            self._ata_memory,
            begin=0x40000000,
            end=0x40000FFF,
        )
        self.cpu.hook_add(uc.UC_HOOK_MEM_INVALID, self._invalid_memory)
        self.cpu.hook_add(uc.UC_HOOK_INTR, self._cpu_exception)

    @property
    def registers(self) -> dict[str, int]:
        result = {f"r{i}": self.cpu.reg_read(reg) for i, reg in enumerate(REG_IDS)}
        result.update(
            sp=result["r13"],
            lr=result["r14"],
            pc=result["r15"],
            cpsr=self.cpu.reg_read(ar.UC_ARM_REG_CPSR),
            spsr=self.cpu.reg_read(ar.UC_ARM_REG_SPSR),
        )
        return result

    def read_memory(self, address: int, length: int) -> bytes:
        if length < 0 or length > 0x100000:
            raise ValueError("Memory inspection is limited to 1 MiB per request")
        return bytes(self.cpu.mem_read(address, length))

    def key(self, name: str, pressed: bool) -> None:
        name = str(name).lower()
        aliases = {
            "a": "select",
            "b": "esc",
            "start": "play",
            "enter": "select",
            "return": "select",
            "escape": "esc",
            "back": "esc",
            "record": "rec",
            "volume_down": "vol-",
            "volume_up": "vol+",
        }
        name = aliases.get(name, name)
        self.key_states[name] = bool(pressed)
        if name == "hold":
            if pressed:
                self.gpio_inputs[0x80000330] &= ~(1 << 15)
            else:
                self.gpio_inputs[0x80000330] |= 1 << 15
            return
        # ROM raw ladder106C8 -> firmware keys204A4 -> GNEX keys53C0C.
        levels = {
            "play": 20,
            "esc": 75,
            "select": 150,
            "rec": 230,
            "aux": 310,
            "mode": 390,
            "menu": 465,
            "up": 545,
            "down": 620,
            "right": 675,
            "left": 740,
            "vol-": 815,
            "vol+": 915,
        }
        if name not in levels:
            return
        if name in self._held_keys:
            self._held_keys.remove(name)
        if pressed:
            self._held_keys.append(name)
        self.adc_inputs[0] = levels[self._held_keys[-1]] if self._held_keys else 1023

    def _stop(self, reason: str, status: str = "blocked") -> None:
        self.status, self.stop_reason = status, reason
        self.cpu.emu_stop()

    def _write_mmio(self, address: int, value: int) -> None:
        self.mmio[address] = value & MASK
        self.cpu.mem_write(address, struct.pack("<I", value & MASK))

    @staticmethod
    def _condition(cond: int, cpsr: int) -> bool:
        n, z, c, v = (bool(cpsr & (1 << bit)) for bit in (31, 30, 29, 28))
        return [
            z,
            not z,
            c,
            not c,
            n,
            not n,
            v,
            not v,
            c and not z,
            not c or z,
            n == v,
            n != v,
            not z and n == v,
            z or n != v,
            True,
            False,
        ][cond]

    def _code(self, cpu, address: int, size: int, _):
        # Complete W1C and read-only register semantics after Unicorn's write.
        if self._deferred_writes:
            for a, v in self._deferred_writes.items():
                self._write_mmio(a, v)
            self._deferred_writes.clear()
        if self._run_end is not None and self.instructions >= self._run_end:
            cpu.emu_stop()
            return
        if (
            self.fast_idle
            and self._run_end is not None
            and address == 0x20072C64
            and self.rom_info["sha256"]
            == "743d0b9a377dc6a3f0a80b7816cee575ad2f8249643876367c4bfaac54ddd19a"
        ):
            if self._fast_idle_replay(cpu):
                return
        self.instructions += 1
        self.trace.append(address)
        if (
            0x20000000 <= address < 0x22000000
            and "Entered SDRAM executable" not in self.milestones
        ):
            self.milestones.append("Entered SDRAM executable")
        if self.instructions % 256 == 0:
            self._advance_timers()
            psr = cpu.reg_read(ar.UC_ARM_REG_CPSR)
            enabled = self.pending & self.mmio.get(0x80000100, 0)
            irq = enabled & self.mmio.get(0x8000010C, 0)
            fiq = enabled & ~self.mmio.get(0x8000010C, 0)
            if fiq and not psr & 0x40:
                self._enter_interrupt(address, psr, True)
                return
            if irq and not psr & 0x80:
                self._enter_interrupt(address, psr, False)
                return
        if size != 4:
            return
        # Only static NOR / main ROM code can safely use this decode cache.
        word = self._instruction_cache.get(address)
        if word is None:
            word = _word(cpu.mem_read(address, 4), 0)
            if 0x70000000 <= address < 0x70100000 or 0x20010000 <= address < 0x20100000:
                self._instruction_cache[address] = word
        if word & 0x0F000010 != 0x0E000010:
            return
        cop = word >> 8 & 15
        if cop not in (14, 15):
            self._stop(f"Unimplemented coprocessor p{cop} at 0x{address:08X}")
            return
        if not self._condition(word >> 28, cpu.reg_read(ar.UC_ARM_REG_CPSR)):
            return
        key = (cop, word >> 21 & 7, word >> 16 & 15, word & 15, word >> 5 & 7)
        rn = word >> 12 & 15
        if word & (1 << 20):
            value = self.cp15.get(key, 0)
            if rn == 15:
                cpsr = cpu.reg_read(ar.UC_ARM_REG_CPSR)
                cpu.reg_write(
                    ar.UC_ARM_REG_CPSR, (cpsr & 0x0FFFFFFF) | (value & 0xF0000000)
                )
            else:
                cpu.reg_write(REG_IDS[rn], value)
        else:
            self.cp15[key] = cpu.reg_read(REG_IDS[rn])
            if key[:3] == (15, 0, 7):
                # Cache maintenance is a no-op on this coherent backing store.
                self._instruction_cache.clear()
        cpu.reg_write(ar.UC_ARM_REG_PC, address + 4)

    def _fast_idle_replay(self, cpu) -> bool:
        """Replay the verified K2.12 idle loop through every timer boundary.

        Whole 18-instruction iterations are arithmetic. Partial iterations
        preserve IRQ masking, flags and registers. Timers advance at precisely
        the same virtual instructions; an interrupt immediately returns control
        to Unicorn. No timer event or run-budget boundary is skipped.
        """
        psr = cpu.reg_read(ar.UC_ARM_REG_CPSR)
        counter_address = cpu.reg_read(ar.UC_ARM_REG_R4) + 16
        if (
            psr & 0x20
            or psr & 0x1F == 0x10
            or counter_address & 3
            or not 0x20000000 <= counter_address <= 0x21FFFFFC
        ):
            return False
        counter = _word(cpu.mem_read(counter_address, 4), 0)
        r0 = cpu.reg_read(ar.UC_ARM_REG_R0)
        r1 = cpu.reg_read(ar.UC_ARM_REG_R1)
        lr = cpu.reg_read(ar.UC_ARM_REG_LR)
        phase = 0
        initial_count = self.instructions
        if "Entered SDRAM executable" not in self.milestones:
            self.milestones.append("Entered SDRAM executable")

        def flush():
            cpu.mem_write(counter_address, struct.pack("<I", counter))
            cpu.reg_write(ar.UC_ARM_REG_R0, r0)
            cpu.reg_write(ar.UC_ARM_REG_R1, r1)
            cpu.reg_write(ar.UC_ARM_REG_LR, lr)
            cpu.reg_write(ar.UC_ARM_REG_CPSR, psr)
            cpu.reg_write(ar.UC_ARM_REG_PC, IDLE_PC[phase])
            self.fast_forwarded_instructions += self.instructions - initial_count
            self.trace.append(IDLE_PC[phase])

        while self.instructions < self._run_end:
            available = min(
                255 - self.instructions % 256, self._run_end - self.instructions
            )
            if phase == 0 and available >= 18:
                loops = available // 18
                final_psr = (psr & 0x0FFFFFFF) | 0x60000000
                r0 = psr if loops == 1 else final_psr
                r1 = counter = (counter + loops) & MASK
                psr = final_psr
                lr = IDLE_PC[17]
                self.instructions += loops * 18
                continue

            # _code counts and checks interrupts BEFORE executing this opcode.
            self.instructions += 1
            if self.instructions % 256 == 0:
                self._advance_timers()
                enabled = self.pending & self.mmio.get(0x80000100, 0)
                irq = enabled & self.mmio.get(0x8000010C, 0)
                fiq = enabled & ~self.mmio.get(0x8000010C, 0)
                if (fiq and not psr & 0x40) or (irq and not psr & 0x80):
                    flush()
                    self._enter_interrupt(
                        IDLE_PC[phase], psr, bool(fiq and not psr & 0x40)
                    )
                    return True

            if phase == 0:
                lr = IDLE_PC[9]
            elif phase == 1:
                r0 = psr
            elif phase == 2:
                r1 = r0 | 0x80
            elif phase == 3:
                psr = (psr & ~0xFF) | (r1 & 0xFF)
            elif phase == 4:
                r1 = psr
            elif phase == 5:
                r1 &= 0x80
            elif phase == 6:
                psr = (psr & 0x0FFFFFFF) | 0x60000000
            elif phase == 9:
                r1 = counter
            elif phase == 10:
                r1 = (r1 + 1) & MASK
            elif phase == 11:
                counter = r1
            elif phase == 12:
                lr = IDLE_PC[15]
            elif phase == 13:
                psr = (psr & ~0xFF) | (r0 & 0xFF)
            elif phase == 15:
                lr = IDLE_PC[17]
            phase = (phase + 1) % 18
        flush()
        cpu.emu_stop()
        return True

    def _enter_interrupt(self, address: int, psr: int, fiq: bool):
        mode = 0xD1 if fiq else 0x92
        self.cpu.reg_write(ar.UC_ARM_REG_CPSR, (psr & ~0xFF) | mode | (psr & 0x40))
        self.cpu.reg_write(ar.UC_ARM_REG_SPSR, psr)
        self.cpu.reg_write(ar.UC_ARM_REG_LR, address + 4)
        self.cpu.reg_write(ar.UC_ARM_REG_PC, 0x1C if fiq else 0x18)
        self.irq_count += 1
        if "Delivered hardware timer interrupt" not in self.milestones:
            self.milestones.append("Delivered hardware timer interrupt")

    def _clock_ratio(self) -> float:
        pll = self.mmio.get(0x80000404, 0x2E02)
        m, p, s = pll >> 8 & 63, pll & 63, pll >> 16 & 3
        pll_hz = 12_000_000 * 8 * (m + 2) / ((p + 2) * (1 << s))
        div = self.mmio.get(0x80000444, 0)
        sys = self.mmio.get(0x80000408, 0x82000)
        tclk = self.mmio.get(0x80000424, 0)
        source = pll_hz if pll & (1 << 18) else 12_000_000
        fphase = sys & 63
        cpu_hz = source / (fphase + 1) if div & 1 else source * max(fphase, 1) / 64
        tsource = [source, 12_000_000, 32768, 0][tclk >> 8 & 3]
        tphase = tclk & 63
        timer_hz = tsource / (tphase + 1) if div & (1 << 8) else tsource * tphase / 64
        return timer_hz / max(1, cpu_hz)

    def _advance_timers(self):
        elapsed = self.instructions - self.timer_last
        self.timer_last = self.instructions
        ticks = elapsed * self._clock_ratio()
        for n in range(6):
            base = 0x80000200 + n * 16
            cfg = self.mmio.get(base, 0)
            if not cfg & 1:
                continue
            select = cfg >> 4 & 7
            if select == 7:  # External clock has no injected edges.
                continue
            divisor = 1 << (select + 1 if select <= 4 else 2 * select)
            previous = self.timer_counts[n]
            current = previous + ticks / divisor
            ref = max(1, self.mmio.get(base + 8, 0xFFFF))
            crossed = int(current // ref) != int(previous // ref)
            if crossed and cfg & 8:
                self.timer_pending |= 1 << n
                self.pending |= 1 << 6
            if not cfg & 2:
                current %= ref
            current %= 1 << (16 if n < 4 else 20)
            self.timer_counts[n] = current
            self._write_mmio(base + 4, int(current))
        self._write_mmio(0x80000260, self.timer_pending)

    def _known_mmio(self, a: int) -> bool:
        if a in (0x80000040, 0x80000044):
            return True  # TCC760 table4.1: DAI mode and volume configuration.
        if 0xF0000000 <= a <= 0xF0000024:
            return a % 4 == 0
        if 0x80000100 <= a <= 0x80000138 or 0x80000200 <= a <= 0x80000298:
            return a % 4 == 0
        if 0x80000300 <= a <= 0x80000334 or 0x80000400 <= a <= 0x80000448:
            return a % 4 == 0
        if a in (
            0x80000A00,
            0x80000A04,
            0x80000A10,
            0x80000A80,
            0x80000A84,
            0x80000A88,
        ):
            return True
        if 0x80000D00 <= a <= 0x80000D58:
            return a % 4 == 0
        if 0x80000A14 <= a <= 0x80000A60 or 0x80000F00 <= a <= 0x80000F60:
            return a % 4 == 0
        return False

    def _memory(self, cpu, access, address, size, value, _):
        a = address & ~3
        is_write = access == uc.UC_MEM_WRITE
        pc = cpu.reg_read(ar.UC_ARM_REG_PC)
        self.mmio_counts[(a, "write" if is_write else "read")] += 1
        if len(self.mmio_trace) == 0 or self.mmio_trace[-1].get("pc") != pc or is_write:
            self.mmio_trace.append(
                dict(
                    pc=pc,
                    address=address,
                    size=size,
                    write=is_write,
                    value=value if is_write else self.mmio.get(a, 0),
                )
            )
        known = self._known_mmio(a)
        if not known:
            self.unsupported.setdefault(
                f"0x{a:08X}", dict(pc=pc, access="write" if is_write else "read")
            )
            if not is_write and self.strict_mmio:
                self._stop(f"Unimplemented MMIO read 0x{a:08X} at PC 0x{pc:08X}")
                return
        if is_write:
            old = self.mmio.get(a, 0)
            shift = (address & 3) * 8
            mask = ((1 << (size * 8)) - 1) << shift
            value = (old & ~mask) | ((value << shift) & mask)
            self.mmio[a] = value & MASK
            if a in (0x80000040, 0x80000044):
                mask = 0xFFFF if a == 0x80000040 else 0xF
                self._write_mmio(a, value & mask)
                self._deferred_writes[a] = value & mask
            elif a == 0x80000104:
                self.pending &= ~value
                if self.timer_pending:
                    self.pending |= 64
            elif a == 0x80000260:
                self.timer_pending &= ~value
                self._deferred_writes[a] = self.timer_pending
            elif 0x80000200 <= a <= 0x80000250 and (a & 15) == 0:
                if value & 0x100:
                    self.timer_counts[(a - 0x80000200) // 16] = 0
                self._deferred_writes[a] = value & ~0x100
            elif a == 0x80000400:
                if old & 0x800 and not value & 0x800:
                    self.pll_enable_at = self.instructions
            elif a in (0x80000A00, 0x80000A80):
                self.adc_channel, self.adc_started = value & 7, not bool(value & 16)
            elif a == 0x80000D08:
                # OHCI HostControllerReset self-clears; no endpoints are attached.
                self._deferred_writes[a] = 0
            elif a == 0x80000D0C:
                self._deferred_writes[a] = old & ~value
            elif a == 0x80000D10:
                self._deferred_writes[a] = old | value
            elif a == 0x80000D14:
                self._write_mmio(0x80000D10, self.mmio.get(0x80000D10, 0) & ~value)
            elif a in (0x80000D54, 0x80000D58):
                self._deferred_writes[a] = 0x100  # powered port with no device
            elif 0x80000F00 <= a <= 0x80000F60:
                self.lcd_writes += 1
            return
        value = self.mmio.get(a, 0)
        if a == 0x80000404:
            if not self.mmio.get(0x80000400, 0) & 0x800:
                # Deterministic PLL stabilization; no wall-clock dependency.
                value |= 1 << 20
            else:
                value &= ~(1 << 20)
        elif a in (
            0x80000108,
            0x80000114,
            0x80000120,
            0x80000124,
            0x80000128,
            0x8000012C,
        ):
            value = self.pending
            if a in (0x80000120, 0x80000128):
                value &= self.mmio.get(0x8000010C, 0)
            elif a in (0x80000124, 0x8000012C):
                value &= ~self.mmio.get(0x8000010C, 0)
            if a in (0x80000114, 0x80000128, 0x8000012C):
                value &= self.mmio.get(0x80000100, 0)
        elif a in self.gpio_inputs:
            direction = self.mmio.get(a + 4, 0)
            value = (value & direction) | (self.gpio_inputs[a] & ~direction)
        elif a == 0x80000260:
            value = self.timer_pending
        elif a == 0x80000A10:
            # ROM 2.12 at 20072F94 writes B1 then compares the response to 8.
            # This narrow challenge response is inferred, not a general device model.
            if value in (0xB0, 0xB1, 0xB2, 0xB3, 0x82, 0x85, 0x8B):
                value = 8
            elif value == 8:
                value = 4
            else:
                self._stop(f"Unknown chip challenge 0x{value:X} at 0x80000A10")
                return
        elif a == 0x80000A84:
            value = (
                ((1 << 24) | self.adc_channel << 16 | self.adc_inputs[self.adc_channel])
                if self.adc_started
                else 0
            )
        elif a == 0x80000A04:
            value = (self.adc_inputs[self.adc_channel] << 1) | int(self.adc_started)
        elif a == 0xF0000008:
            value |= 0x8000  # READY signal: no attached NAND operation is busy.
        self._write_mmio(a, value)

    def _ata_memory(self, cpu, access, address, size, value, _):
        port = address - 0x40000000
        if port not in (0, 4, 8, 12, 16, 20, 24, 28, 56):
            self._stop(f"Unsupported ATA port 0x{address:08X}")
            return
        if access == uc.UC_MEM_READ:
            if port == 0:
                end = self.ata_position + size
                if end > len(self.ata_buffer):
                    self._stop("ATA data FIFO underflow")
                    return
                data = bytes(self.ata_buffer[self.ata_position : end])
                self.ata_position = end
                if end == len(self.ata_buffer):
                    self.ata_registers[28] = 0x40
                cpu.mem_write(address, data)
            else:
                result = self.ata_registers.get(28 if port == 56 else port, 0)
                cpu.mem_write(address, result.to_bytes(size, "little"))
            return
        if port == 0:
            if self.ata_write_target is None:
                self._stop("ATA data write without WRITE SECTORS command")
                return
            self.ata_buffer.extend(int(value).to_bytes(size, "little"))
            drive, offset, length = self.ata_write_target
            if len(self.ata_buffer) >= length:
                self.ata_disks[drive][offset : offset + length] = self.ata_buffer[
                    :length
                ]
                self.ata_write_target = None
                self.ata_registers[28] = 0x40
            return
        self.ata_registers[port] = value & 255
        if port != 28:
            return
        command = value & 255
        self.ata_position = 0
        self.ata_registers[28] = 0x40
        self.ata_trace.append(
            dict(
                command=command,
                drive=self.ata_drive,
                instructions=self.instructions,
                fast_forwarded_instructions=self.fast_forwarded_instructions,
                pc=cpu.reg_read(ar.UC_ARM_REG_PC),
            )
        )
        if command in (0x61, 0x62):
            # Vendor logical-drive select/status, inferred from ROM 2006F4E0.
            selected = self.ata_registers.get(4, 0)
            if selected in self.ata_disks:
                self.ata_drive = selected
                self.ata_registers[4] = 0
            else:
                self.ata_registers[4] = 0x20
            return
        disk = self.ata_disks.get(self.ata_drive, bytearray())
        sectors = len(disk) // 512
        if command == 0x63:
            # Vendor device-serial query consumed by ROM 2003F448. Synthetic identity.
            self.ata_buffer = bytearray(512)
            self.ata_buffer[1:17] = b"REUNION000000001"
            self.ata_registers[28] = 0x48
            return
        if command == 0xEC:
            self.ata_buffer = bytearray(512)
            fields = {
                0: 0x0040,
                1: min(16383, max(1, sectors // (16 * 63))),
                3: 16,
                6: 63,
                47: 0x8001,
                49: 0x0200,
                53: 1,
                60: sectors & 65535,
                61: sectors >> 16,
            }
            for word, val in fields.items():
                struct.pack_into("<H", self.ata_buffer, word * 2, val)
            model = b"REUNION VIRTUAL FLASH".ljust(40, b" ")
            self.ata_buffer[54:94] = b"".join(
                model[i : i + 2][::-1] for i in range(0, 40, 2)
            )
            self.ata_registers[28] = 0x48
            return
        if command in (0x20, 0x21, 0x30, 0x31):
            lba = (
                self.ata_registers.get(12, 0)
                | self.ata_registers.get(16, 0) << 8
                | self.ata_registers.get(20, 0) << 16
                | (self.ata_registers.get(24, 0) & 15) << 24
            )
            count = self.ata_registers.get(8, 0) or 256
            offset, length = lba * 512, count * 512
            self.ata_trace[-1].update(lba=lba, count=count)
            if offset + length > len(disk):
                self.ata_registers[4] = 0x10
                self.ata_registers[28] = 0x41
                return
            self.ata_registers[28] = 0x48
            if command in (0x20, 0x21):
                self.ata_buffer = bytearray(disk[offset : offset + length])
            else:
                self.ata_buffer = bytearray()
                self.ata_write_target = (self.ata_drive, offset, length)
            return
        if command in (0x64, 0xE7, 0xEF, 0x91, 0xE0, 0xE1):
            return  # Flush/features/geometry/power do not change this RAM disk.
        self._stop(f"Unsupported ATA command 0x{command:02X}")

    def _lcd_memory(self, cpu, access, address, size, value, _):
        # CS1 LCD bus proved by firmware 2003A698 and 20041568..20041594.
        # IDs accepted by ROM: 8309, 8306, 9220; select its 220x176 HX8309 path.
        port = address - 0x50000000
        if port not in (0, 2) or size != 2:
            self._stop(f"Unsupported LCD bus access at 0x{address:08X}, size={size}")
            return
        if access == uc.UC_MEM_READ:
            result = (
                0x8309
                if self.lcd_command == 0
                else self.lcd_registers.get(self.lcd_command, 0)
            )
            cpu.mem_write(address, struct.pack("<H", result & 0xFFFF))
            return
        self.lcd_writes += 1
        if port == 0:
            self.lcd_command = value & 0xFFFF
            if value == 0x22:
                self.lcd_x = self.lcd_registers.get(0x45, 0) & 255
                self.lcd_y = self.lcd_registers.get(0x44, 0) & 255
            return
        if self.lcd_command != 0x22:
            self.lcd_registers[self.lcd_command] = value & 0xFFFF
            return
        if 0 <= self.lcd_x < 220 and 0 <= self.lcd_y < 176:
            offset = (self.lcd_y * 220 + self.lcd_x) * 2
            self.lcd_pixels[offset : offset + 2] = struct.pack("<H", value & 0xFFFF)
            self.lcd_pixel_writes += 1
            self.lcd_source = 0x50000002
            if "Firmware wrote LCD pixels" not in self.milestones:
                self.milestones.append("Firmware wrote LCD pixels")
        self.lcd_x += 1
        xend = min(219, self.lcd_registers.get(0x45, 0xDB00) >> 8)
        yend = min(175, self.lcd_registers.get(0x44, 0xAF00) >> 8)
        if self.lcd_x > xend:
            self.lcd_x = self.lcd_registers.get(0x45, 0) & 255
            self.lcd_y += 1
            if self.lcd_y > yend:
                self.lcd_y = self.lcd_registers.get(0x44, 0) & 255
                self.lcd_frames += 1

    def _invalid_memory(self, cpu, access, address, size, value, _):
        pc = cpu.reg_read(ar.UC_ARM_REG_PC)
        # The original boot writes 0xFFFFFFFC after its delay counter. TCC76x
        # CFGSYS.CFGRSPERR resets to zero: undefined writes need not abort.
        if access == uc.UC_MEM_WRITE_UNMAPPED and 0xF0000028 <= address <= 0xFFFFFFFF:
            if not self.mmio.get(0x80000A60, 0) & 0x10000:
                page = address & ~0xFFF
                if page not in self._open_bus_pages:
                    cpu.mem_map(page, 0x1000)
                    self._open_bus_pages.add(page)
                self.unsupported.setdefault(
                    f"0x{address:08X}", dict(pc=pc, access="ignored undefined write")
                )
                return True
        self._stop(f"Unmapped memory access {access} at 0x{address:08X}, PC 0x{pc:08X}")
        return False

    def _cpu_exception(self, cpu, number, _):
        self._stop(
            f"CPU exception {number} at PC 0x{cpu.reg_read(ar.UC_ARM_REG_PC):08X}"
        )

    def _refresh_lcd(self):
        if self.lcd_pixel_writes:
            if self._lcd_rendered_count == self.lcd_pixel_writes:
                return
            self._lcd_rendered_count = self.lcd_pixel_writes
            rgb = bytearray(220 * 176 * 3)
            for i, (v,) in enumerate(struct.iter_unpack("<H", self.lcd_pixels)):
                r, g, b = v >> 11 & 31, v >> 5 & 63, v & 31
                rgb[i * 3 : i * 3 + 3] = bytes(
                    ((r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2))
                )
            self.framebuffer = Image.frombytes("RGB", (220, 176), bytes(rgb))
            return
        # TCC761 integrated LCD path. K-PEX's external panel path is still
        # unidentified; this only displays pixels when firmware configures it.
        control = self.mmio.get(0x80000F00, 0)
        base = self.mmio.get(0x80000F54, 0)
        dimensions = self.mmio.get(0x80000F50, 0)
        w, h = dimensions & 0x7FF, dimensions >> 16 & 0x7FF
        if not control & 1 or not base or not w or not h:
            return
        if (control >> 24 & 15) != 4:
            self.unsupported.setdefault("lcd_format", dict(value=control >> 24 & 15))
            return
        if w > 1024 or h > 1024:
            self._stop(f"Invalid LCD dimensions {w}x{h}")
            return
        try:
            pixels = self.read_memory(base, w * h * 2)
        except (uc.UcError, ValueError):
            self._stop(f"LCD framebuffer points outside mapped RAM: 0x{base:08X}")
            return
        rgb = bytearray(w * h * 3)
        for i, (v,) in enumerate(struct.iter_unpack("<H", pixels)):
            r, g, b = v >> 11 & 31, v >> 5 & 63, v & 31
            rgb[i * 3 : i * 3 + 3] = bytes(
                ((r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2))
            )
        self.framebuffer = Image.frombytes("RGB", (w, h), bytes(rgb))
        self.lcd_source = base

    def run(self, instruction_budget: int = 100_000) -> dict[str, Any]:
        if instruction_budget < 1 or instruction_budget > 10_000_000:
            raise ValueError("Instruction budget must be between 1 and 10,000,000")
        if self.status in ("blocked", "error"):
            return self.snapshot()
        self.status = "running"
        self._run_end = self.instructions + instruction_budget
        pc = self.cpu.reg_read(ar.UC_ARM_REG_PC)
        thumb = bool(self.cpu.reg_read(ar.UC_ARM_REG_CPSR) & 0x20)
        try:
            self.cpu.emu_start(pc | int(thumb), 0xFFFFFFFF, count=instruction_budget)
        except uc.UcError as exc:
            if self.status not in ("blocked", "error"):
                self.status, self.stop_reason = "error", str(exc)
        finally:
            self._run_end = None
        self._refresh_lcd()
        if self.status == "running":
            self.status = "paused"
        return self.snapshot()

    def snapshot(self) -> dict[str, Any]:
        return dict(
            status=self.status,
            stop_reason=self.stop_reason,
            instructions=self.instructions,
            fast_forwarded_instructions=self.fast_forwarded_instructions,
            pc=self.cpu.reg_read(ar.UC_ARM_REG_PC),
            registers=self.registers,
            irq_count=self.irq_count,
            lcd_writes=self.lcd_writes,
            lcd_source=self.lcd_source,
            lcd_pixel_writes=self.lcd_pixel_writes,
            lcd_frames=self.lcd_frames,
            milestones=list(self.milestones),
            strict_mmio=self.strict_mmio,
            unsupported=dict(self.unsupported),
            limitations=list(self.limitations),
            firmware_resources_loaded=bytes(self.cpu.mem_read(0x21C00000, 4))
            == bytes.fromhex("78563412"),
            ata_commands=len(self.ata_trace),
            ata_last=list(self.ata_trace)[-8:],
            rom_sha256=self.rom_info["sha256"],
            checksum_valid=self.rom_info["checksum_valid"],
        )
