"""Physical inputs pass through the unmodified firmware scanner and translators."""

from pathlib import Path
import pytest

pytestmark = pytest.mark.originals
from unicorn import arm_const as ar
from kpex.firmware import FirmwareMachine

ROM = Path(__file__).resolve().parents[1] / "data/firmware/Kingston-2.12.rom"
RELOC = 0x2000F8DC
STOP = 0x2000F000


@pytest.fixture(scope="module")
def machine():
    if not ROM.exists():
        pytest.skip("Bundled original firmware unavailable")
    rom = ROM.read_bytes()
    result = FirmwareMachine(rom)
    # Isolate the key routines; complete cold boot is tested separately.
    result.cpu.mem_write(0x20010000, rom[0x724:0x100000])
    return result


def call(machine, offset, r0=0, r1=0, stop=STOP):
    cpu = machine.cpu
    cpu.reg_write(ar.UC_ARM_REG_SP, 0x20BFF000)
    cpu.reg_write(ar.UC_ARM_REG_LR, STOP)
    cpu.reg_write(ar.UC_ARM_REG_R0, r0)
    cpu.reg_write(ar.UC_ARM_REG_R1, r1)
    cpu.emu_start(RELOC + offset, stop, count=20000)
    assert cpu.reg_read(ar.UC_ARM_REG_PC) == stop, machine.snapshot()
    return cpu.reg_read(ar.UC_ARM_REG_R0)


def test_real_adc_scan_and_key_release_translation(machine):
    keys = [
        ("play", 0x15),
        ("esc", 0x0A),
        ("select", 0x14),
        ("rec", 0x0C),
        ("aux", 0x16),
        ("mode", 0x0B),
        ("menu", 0x0D),
        ("up", 0x12),
        ("down", 0x13),
        ("right", 0x11),
        ("left", 0x10),
        ("volume_down", 0x19),
        ("volume_up", 0x1A),
    ]
    for name, expected in keys:
        machine.cpu.mem_write(0x205F5000, bytes(0x80))
        call(machine, 0x102C4)  # Original keyboard initialization.
        # Match the already-unlocked physical switch without invoking its LCD UI.
        machine.cpu.mem_write(0x205F5005, b"\x01")
        machine.key(name, True)
        for _ in range(4):
            call(machine, 0x106C8)
        assert call(machine, 0x103D0) == 0, name  # Short keys wait for release.
        machine.key(name, False)
        for _ in range(2):
            call(machine, 0x106C8)
        assert call(machine, 0x103D0) == 1, name
        raw = call(machine, 0x103F0)
        kind = call(machine, 0x103FC)
        assert kind == 3, name
        firmware_key = call(machine, 0x204A4, raw, kind)
        call(machine, 0x53C0C, firmware_key, stop=RELOC + 0x3C8D4)
        assert machine.cpu.reg_read(ar.UC_ARM_REG_R1) == expected, name
    assert machine.status != "blocked", machine.stop_reason


def test_analog_key_priority_and_physical_hold_switch(machine):
    machine.key("left", True)
    left = machine.adc_inputs[0]
    machine.key("right", True)
    assert machine.adc_inputs[0] != left
    machine.key("right", False)
    assert machine.adc_inputs[0] == left
    machine.key("left", False)
    assert machine.adc_inputs[0] == 1023
    machine.key("hold", True)
    assert not machine.gpio_inputs[0x80000330] & (1 << 15)
    machine.key("hold", False)
    assert machine.gpio_inputs[0x80000330] & (1 << 15)
