"""Exercise native libraries inside the shipped executable, without opening Tk."""

from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import sys

from unicorn import Uc, UC_ARCH_ARM, UC_MODE_ARM
from unicorn.arm_const import UC_ARM_REG_R0
from .gnex import GnexRuntime
from .firmware import FirmwareMachine
from .state import load_state


def arm_probe():
    cpu = Uc(UC_ARCH_ARM, UC_MODE_ARM)
    cpu.mem_map(0x10000, 0x1000)
    cpu.mem_write(0x10000, bytes.fromhex("2a00a0e3"))  # MOV r0, #42
    cpu.emu_start(0x10000, 0x10004)
    assert cpu.reg_read(UC_ARM_REG_R0) == 42
    return "ARM MOV executed"


def firmware_probe(root, rom, checkpoint_name, expected_origin=None):
    """Resume a real cold-boot checkpoint on the same owner thread as run()."""
    machine = FirmwareMachine(rom)
    checkpoint = root / "data/states" / checkpoint_name
    load_state(machine, checkpoint)
    before = machine.instructions
    if expected_origin is not None:
        assert before == expected_origin, "Unexpected bundled checkpoint origin"
    assert machine.framebuffer.getbbox(), "Checkpoint LCD is black"
    result = machine.run(instruction_budget=100_000)
    assert result["status"] == "paused", result.get("stop_reason")
    assert result["instructions"] == before + 100_000
    assert result["firmware_resources_loaded"], "Firmware resources missing"
    assert machine.framebuffer.getbbox(), "Resumed firmware LCD is black"
    return {
        "checkpoint": checkpoint.name,
        "instructions_before": before,
        "instructions_after": result["instructions"],
        "status": result["status"],
        "firmware_resources_loaded": result["firmware_resources_loaded"],
        "lcd_nonblack": True,
        "frame_sha256": hashlib.sha256(machine.framebuffer.tobytes()).hexdigest(),
    }


def run(output, *, with_originals=False):
    output = Path(output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    root = (
        Path(sys.executable).parent
        if getattr(sys, "frozen", False)
        else Path(__file__).resolve().parent.parent
    )
    report = {
        "executable": sys.executable,
        "frozen": bool(getattr(sys, "frozen", False)),
        "status": "started",
        "main_thread": None,
        "worker_thread": None,
        "games": [],
        "firmware": None,
        "native_gameplay": None,
        "originals_requested": with_originals,
    }
    # A native process crash leaves an explicit incomplete report.
    output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    try:
        report["main_thread"] = arm_probe()
        with ThreadPoolExecutor(max_workers=1) as executor:
            report["worker_thread"] = executor.submit(arm_probe).result()
            if not with_originals:
                report["status"] = "passed"
                output.write_text(json.dumps(report, indent=2), encoding="utf-8")
                return True
            rom = (root / "data/firmware/Kingston-2.12.rom").read_bytes()
            for game in sorted((root / "data/games").glob("*.sgs")):

                def play(path=game):
                    runtime = GnexRuntime(rom, path.read_bytes())
                    runtime.event("START")
                    runtime.set_key(0x14, True)
                    runtime.set_key(0x14, False)
                    for _ in range(8):
                        if not runtime.timer_ms or runtime.status != "idle":
                            break
                        runtime.event("TIMEOUT")
                    assert runtime.status == "idle", runtime.error
                    assert runtime.framebuffer.getextrema() != ((0, 0), (0, 0), (0, 0))
                    return {
                        "name": path.name,
                        "status": runtime.status,
                        "events": runtime.event_count,
                        "frame_sha256": hashlib.sha256(
                            runtime.framebuffer.tobytes()
                        ).hexdigest(),
                    }

                report["games"].append(executor.submit(play).result())
            for key, name, origin in (
                ("firmware", "Kingston-2.12-menu.reunion-state", 500_000_000),
                (
                    "native_gameplay",
                    "Kingston-2.12-HellFire-gameplay.reunion-state",
                    None,
                ),
            ):
                if (root / "data/states" / name).is_file():
                    report[key] = executor.submit(
                        firmware_probe, root, rom, name, origin
                    ).result()
        assert len(report["games"]) == 4, "Expected all four bundled SGS games"
        report["status"] = "passed"
    except Exception as exc:
        report.update(status="failed", error=f"{type(exc).__name__}: {exc}")
    output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return report["status"] == "passed"
