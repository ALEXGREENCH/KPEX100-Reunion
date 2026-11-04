"""Differential checks: optimized idle versus unmodified ARM instruction execution."""

from pathlib import Path
import struct
import pytest

pytestmark = pytest.mark.originals
from unicorn import arm_const as ar
from kpex.firmware import FirmwareMachine, REG_IDS

ROM = Path(__file__).resolve().parents[1] / "data/firmware/Kingston-2.12.rom"
COUNTER = 0x205F6010


@pytest.fixture(scope="module")
def machines():
    if not ROM.exists():
        pytest.skip("Bundled original firmware unavailable")
    rom = ROM.read_bytes()
    pair = [FirmwareMachine(rom, fast_idle=enabled) for enabled in (False, True)]
    for machine in pair:
        machine.cpu.mem_write(0x20010000, rom[0x724:0x100000])
        # Minimal IRQ/FIQ vectors return to the interrupted instruction, restoring
        # SPSR; this isolates delivery timing from the unrelated RTOS scheduler.
        machine.cpu.mem_write(0x18, bytes.fromhex("04f05ee204f05ee2"))
        machine._test_context = machine.cpu.context_save()
        machine._test_mmio = machine.mmio.copy()
    return pair


def prepare(
    machine, *, flags, counter, offset=0, timer=False, interrupt="irq", mode=0x13
):
    machine.cpu.context_restore(machine._test_context)
    machine.mmio = machine._test_mmio.copy()
    machine._deferred_writes.clear()
    machine._instruction_cache.clear()
    machine.instructions = offset
    machine.timer_last = offset - offset % 256
    machine.fast_forwarded_instructions = 0
    machine.timer_counts = [0.0] * 6
    machine.timer_pending = machine.pending = machine.irq_count = 0
    machine.status, machine.stop_reason = "ready", ""
    machine.trace.clear()
    machine.cpu.reg_write(ar.UC_ARM_REG_CPSR, flags | mode)
    for i, register in enumerate(REG_IDS):
        machine.cpu.reg_write(register, 0x01010101 * i)
    machine.cpu.reg_write(ar.UC_ARM_REG_R4, COUNTER - 16)
    machine.cpu.reg_write(ar.UC_ARM_REG_SP, 0x20BFF000)
    machine.cpu.reg_write(ar.UC_ARM_REG_PC, 0x20072C64)
    machine.cpu.mem_write(COUNTER, struct.pack("<I", counter))
    if timer:
        machine.mmio[0x80000424] = 0x20  # Nonzero timer clock phase.
        machine.mmio[0x80000200] = 9  # Timer 0, periodic, enabled with interrupt.
        machine.mmio[0x80000208] = 200
        machine.mmio[0x80000100] = 1 << 6
        machine.mmio[0x8000010C] = (1 << 6) if interrupt == "irq" else 0


def check_equivalent(machines, budget, **options):
    results = []
    for machine in machines:
        prepare(machine, **options)
        result = machine.run(budget)
        assert result["status"] == "paused", result
        results.append(
            dict(
                registers=result["registers"],
                instructions=machine.instructions,
                counter=machine.read_memory(COUNTER, 4),
                timer_counts=machine.timer_counts.copy(),
                timer_last=machine.timer_last,
                pending=machine.pending,
                timer_pending=machine.timer_pending,
                irq_count=machine.irq_count,
                mmio=machine.mmio.copy(),
            )
        )
    assert results[0] == results[1], dict(
        budget=budget, options=options, results=results
    )
    assert results[0]["instructions"] == budget + options.get("offset", 0)
    return results[0]


@pytest.mark.parametrize(
    "budget", [1, 2, 3, 16, 17, 18, 19, 255, 256, 257, 1000, 65537]
)
def test_idle_budget_flags_and_counter_wrap(machines, budget):
    for flags, counter in [
        (0, 0),
        (0xF0000000, 0xFFFFFFFE),
        (0x60000000, 0xFFFFFFFF),
        (0x08000080, 0x7FFFFFFF),
    ]:
        check_equivalent(machines, budget, flags=flags, counter=counter)


def test_idle_does_not_assume_privileged_cpsr_in_user_mode(machines):
    check_equivalent(machines, 64, flags=0, counter=0, mode=0x10)


@pytest.mark.parametrize("interrupt", ["irq", "fiq"])
@pytest.mark.parametrize("budget", [17, 18, 19, 255, 256, 257, 1000, 2000, 65537])
def test_idle_preserves_timer_and_interrupt_boundaries(machines, budget, interrupt):
    for offset in [0, 5, 250, 255]:
        result = check_equivalent(
            machines,
            budget,
            flags=0x08000000,
            counter=0xFFFFFFFE,
            offset=offset,
            timer=True,
            interrupt=interrupt,
        )
        if budget >= 1000:
            assert result["irq_count"] > 0
