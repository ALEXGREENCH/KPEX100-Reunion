"""Regression checks for instruction boundaries and peripheral ownership."""

from pathlib import Path

import pytest
import unicorn as uc
from unicorn import arm_const as ar

from kpex.firmware import FirmwareMachine

pytestmark = pytest.mark.originals
ROM = Path(__file__).resolve().parents[1] / "data/firmware/Kingston-2.12.rom"
START = 0x20010000


@pytest.fixture
def machine():
    return FirmwareMachine(ROM, disk_image=bytes(1024))


def program(machine, code, address=START):
    machine.cpu.mem_write(address, bytes.fromhex(code))
    machine.cpu.reg_write(ar.UC_ARM_REG_PC, address)


@pytest.mark.parametrize("budget", [0, -1, 10_000_001, 1.5, float("nan"), None, True])
def test_invalid_execution_budget_does_not_mutate_machine(machine, budget):
    before = machine.registers
    with pytest.raises(ValueError, match="Instruction budget"):
        machine.run(budget)
    assert machine.registers == before
    assert machine.status == "ready"


def test_instruction_boundary_preserves_pending_mmio_write(machine):
    program(machine, "010080e2fdffffea")  # ADD r0,#1; B back to ADD.
    machine.cpu.reg_write(ar.UC_ARM_REG_R0, 0)
    assert machine.run(1)["instructions"] == 1
    assert machine.cpu.reg_read(ar.UC_ARM_REG_R0) == 1
    assert machine.run(2)["instructions"] == 3
    assert machine.cpu.reg_read(ar.UC_ARM_REG_R0) == 2
    program(machine, "000081e50000a0e1", START + 0x100)  # STR; NOP.
    machine.cpu.reg_write(ar.UC_ARM_REG_R0, 0x12345678)
    machine.cpu.reg_write(ar.UC_ARM_REG_R1, 0x80000040)
    machine.run(1)
    assert machine.read_memory(0x80000040, 4) == bytes.fromhex("78563412")
    assert machine._deferred_writes[0x80000040] == 0x5678
    machine.run(1)
    assert machine.read_memory(0x80000040, 4) == bytes.fromhex("78560000")


def test_rewritten_arm_opcode_is_decoded_through_sdram_alias(machine):
    program(machine, "0000a0e1")  # Cacheable NOP in the old implementation.
    machine.run(1)
    machine.cpu.mem_write(START + 0x1000000, bytes.fromhex("100f10ee"))
    machine.cpu.ctl_flush_tb()
    machine.cpu.reg_write(ar.UC_ARM_REG_PC, START)
    machine.run(1)  # MRC p15,0,r0,c0,c0,0 uses the shadowed ARM940T ID.
    assert machine.cpu.reg_read(ar.UC_ARM_REG_R0) == 0x41009400


def test_poweroff_is_terminal_only_after_the_confirmed_instruction_boundary(machine):
    program(machine, "0000a0e1feffffea", 0x200279AC)
    machine.mmio[0x80000304] = 0xFFFF27FF
    machine.mmio[0x80000300] = 0x572
    assert machine.run(1)["status"] == "paused"
    assert machine.run(1)["status"] == "off"
    before = machine.instructions
    assert machine.run(10)["instructions"] == before
    machine.status = "paused"
    machine.mmio[0x80000300] = 0
    assert machine.run(3)["status"] == "paused"
    assert machine.instructions == before + 3


@pytest.mark.parametrize(
    "enabled,misc,pending,delivered",
    [
        (64, 0, 64, False),
        (0x8040, 0, 64, True),
        (0x8000, 0, 0x8000, False),
        (0x8000, 0x8000, 0x8000, True),
        (64, 0x8000, 64, True),
    ],
)
def test_interrupt_master_gate_and_ready_irq_selection(
    machine, enabled, misc, pending, delivered
):
    program(machine, "0000a0e1")
    machine.cpu.reg_write(ar.UC_ARM_REG_CPSR, 0x13)
    machine.instructions = machine.timer_last = 255
    machine.pending = pending
    machine.mmio[0x80000100] = enabled
    machine.mmio[0x8000010C] = pending
    machine.mmio[0x80000A1C] = misc
    machine.run(1)
    assert machine.irq_count == int(delivered)
    machine._memory(machine.cpu, uc.UC_MEM_READ, 0x80000128, 4, 0, None)
    assert (
        int.from_bytes(machine.read_memory(0x80000128, 4), "little")
        == pending & enabled
    )


@pytest.mark.parametrize("index", range(6))
def test_timer_counter_write_mask_and_reset_are_visible_to_guest(machine, index):
    program(machine, "000081e5002091e5")  # STR r0,[r1]; LDR r2,[r1].
    count = 0x80000204 + index * 16
    machine.cpu.reg_write(ar.UC_ARM_REG_R0, 0xFFFFFFFF)
    machine.cpu.reg_write(ar.UC_ARM_REG_R1, count)
    machine.run(2)
    expected = 0xFFFF if index < 4 else 0xFFFFF
    assert machine.timer_counts[index] == expected
    assert machine.cpu.reg_read(ar.UC_ARM_REG_R2) == expected
    program(machine, "000081e5042091e5", START + 0x100)  # STR TCFG; LDR TCNT.
    machine.cpu.reg_write(ar.UC_ARM_REG_R0, 0x100)
    machine.cpu.reg_write(ar.UC_ARM_REG_R1, count - 4)
    machine.run(2)
    assert machine.timer_counts[index] == 0
    assert machine.cpu.reg_read(ar.UC_ARM_REG_R2) == 0


def ata(machine, port, value=0, size=1, read=False):
    machine._ata_memory(
        machine.cpu,
        uc.UC_MEM_READ if read else uc.UC_MEM_WRITE,
        0x40000000 + port,
        size,
        value,
        None,
    )


def test_ata_new_command_cancels_previous_write_without_disk_mutation(machine):
    ata(machine, 8, 1)
    ata(machine, 28, 0x30)
    ata(machine, 0, 0xABCD, 2)
    ata(machine, 28, 0xEC)
    assert machine.ata_write_target is None
    assert len(machine.ata_buffer) == 512
    ata(machine, 0, 0x1234, 2)
    assert machine.status == "blocked"
    assert machine.ata_disks[0] == bytes(1024)


def test_ata_read_during_write_and_after_read_completion_are_rejected(machine):
    ata(machine, 8, 1)
    ata(machine, 28, 0x30)
    ata(machine, 0, size=2, read=True)
    assert machine.status == "blocked"
    assert not machine.ata_buffer
    assert machine.ata_position == 0
    machine.status = "ready"
    ata(machine, 28, 0xEC)
    for _ in range(128):
        ata(machine, 0, size=4, read=True)
    assert machine.ata_registers[28] == 0x40
    ata(machine, 0, size=2, read=True)
    assert machine.status == "blocked"
    assert machine.ata_position == 512


def test_ata_write_overflow_is_rejected_before_buffer_or_disk_mutation(machine):
    ata(machine, 8, 1)
    ata(machine, 28, 0x30)
    for _ in range(127):
        ata(machine, 0, 0x01020304, 4)
    ata(machine, 0, 0xFF, 1)
    before = bytes(machine.ata_buffer)
    ata(machine, 0, 0xFFFFFFFF, 4)
    assert machine.status == "blocked"
    assert bytes(machine.ata_buffer) == before
    assert machine.ata_disks[0] == bytes(1024)


def test_ata_failed_read_clears_old_transfer_and_select_preserves_incoming_drive(
    machine,
):
    ata(machine, 28, 0xEC)
    ata(machine, 8, 1)
    ata(machine, 12, 5)
    ata(machine, 28, 0x20)
    assert machine.ata_registers[4] == 0x10
    assert not machine.ata_buffer
    ata(machine, 0, size=2, read=True)
    assert machine.status == "blocked"
    machine.status = "ready"
    machine.ata_disks[3] = bytearray(512)
    ata(machine, 4, 3)
    ata(machine, 28, 0x61)
    assert machine.ata_drive == 3
    assert machine.ata_registers[4] == 0
