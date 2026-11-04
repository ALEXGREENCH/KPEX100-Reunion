from pathlib import Path
import json
import zipfile
import pytest

pytestmark = pytest.mark.originals
from unicorn import arm_const as ar

from kpex.firmware import FirmwareMachine
from kpex.state import save_state, load_state, StateError, _cpu_state, MODES, GENERAL

ROOT = Path(__file__).resolve().parents[1]


def machine():
    return FirmwareMachine(ROOT / "data/firmware/Kingston-2.12.rom")


def test_checkpoint_restores_all_arm_banks_aliases_and_peripherals(tmp_path):
    m = machine()
    for mode in MODES:
        m.cpu.reg_write(ar.UC_ARM_REG_CPSR, 0xC0 | mode)
        for n, reg in enumerate(GENERAL[8:]):
            m.cpu.reg_write(reg, (mode << 16) + n * 0x10)
        if mode != 0x10:
            m.cpu.reg_write(ar.UC_ARM_REG_SPSR, (mode << 24) | 0xD3)
    m.cpu.reg_write(ar.UC_ARM_REG_CPSR, 0xA00000D3)
    m.cpu.reg_write(ar.UC_ARM_REG_PC, 0x70000084)
    m.cpu.mem_write(0x20C00000, b"alias-state")
    m.ata_disks[0][512:516] = b"DISK"
    m.key("select", True)
    m.timer_counts[2] = 1.5
    m.pending = 0x40
    registers = _cpu_state(m.cpu)
    path = tmp_path / "menu.reunion-state"
    save_state(m, path)
    assert _cpu_state(m.cpu) == registers, "Saving changed CPU registers"
    fresh = machine()
    load_state(fresh, path)
    assert _cpu_state(fresh.cpu) == registers
    assert bytes(fresh.cpu.mem_read(0x21C00000, 11)) == b"alias-state"
    assert fresh.ata_disks[0][512:516] == b"DISK"
    assert fresh.adc_inputs[0] == 150
    assert fresh.timer_counts[2] == 1.5
    assert fresh.pending == 0x40


def test_checkpoint_resumes_original_rom_deterministically(tmp_path):
    m = machine()
    m.run(3000)
    path = tmp_path / "boot.reunion-state"
    save_state(m, path)
    m.run(4000)
    expected = m.snapshot()
    expected_ram = m.read_memory(0x20010000, 0x8000)
    fresh = machine()
    load_state(fresh, path)
    fresh.run(4000)
    assert fresh.snapshot() == expected
    assert fresh.read_memory(0x20010000, 0x8000) == expected_ram


def test_malformed_checkpoint_rejected_before_mutating_machine(tmp_path):
    m = machine()
    good = tmp_path / "good.state"
    bad = tmp_path / "bad.state"
    save_state(m, good)
    with (
        zipfile.ZipFile(good) as source,
        zipfile.ZipFile(bad, "w", zipfile.ZIP_DEFLATED) as dest,
    ):
        for entry in source.infolist():
            data = source.read(entry)
            if entry.filename == "manifest.json":
                manifest = json.loads(data)
                manifest["cpu"]["banks"][0]["registers"][0] = -1
                data = json.dumps(manifest).encode()
            dest.writestr(entry.filename, data)
    before = m.snapshot()
    with pytest.raises(StateError, match="register value"):
        load_state(m, bad)
    assert m.snapshot() == before


def test_checkpoint_from_other_rom_is_rejected(tmp_path):
    m = machine()
    path = tmp_path / "k212.state"
    save_state(m, path)
    other = FirmwareMachine(ROOT / "data/firmware/Kingston-2.09.rom")
    with pytest.raises(StateError, match="different ROM"):
        load_state(other, path)


def test_desktop_worker_loads_checkpoint_paused_and_releases_keys(tmp_path):
    from kpex.app import EmulatorWorker

    worker = EmulatorWorker()
    worker.machine = machine()
    worker.mode = "firmware"
    worker.machine.run(3000)
    worker.machine.key("left", True)
    state = tmp_path / "desktop.reunion-state"
    worker._command("save_state", (state,))
    worker._command("load_state", (ROOT / "data/firmware/Kingston-2.12.rom", state))
    assert worker.machine.instructions == 3000
    assert not worker.running
    assert worker.machine.adc_inputs[0] == 1023
    assert not worker.machine._held_keys
    worker._command("run", ())
    assert worker.running
