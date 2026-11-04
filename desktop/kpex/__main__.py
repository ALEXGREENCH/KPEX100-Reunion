"""Reproducible headless execution and desktop entry point."""

from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path


def main(argv=None):
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description="K-PEX 100 Reunion")
    commands = parser.add_subparsers(dest="command")
    commands.add_parser("gui", help="Open the desktop emulator")
    inspect = commands.add_parser("inspect", help="Validate and inspect a ROM/SGS")
    inspect.add_argument("file", type=Path)
    game = commands.add_parser("game", help="Run original GNEX event handlers")
    game.add_argument("sgs", type=Path)
    game.add_argument(
        "--rom", type=Path, default=root / "data/firmware/Kingston-2.12.rom"
    )
    game.add_argument(
        "--frames",
        type=int,
        default=0,
        help="Number of TIMEOUT events after START/keys",
    )
    game.add_argument(
        "--key",
        action="append",
        default=[],
        help="Key code (0x14 SELECT, 0x15 PLAY); repeatable",
    )
    game.add_argument("--png", type=Path, help="Save the final real framebuffer")
    game.add_argument("--report", type=Path, help="Save diagnostic JSON")
    boot = commands.add_parser("boot", help="Execute the complete firmware from reset")
    boot.add_argument("rom", type=Path)
    boot.add_argument("--instructions", type=int, default=1_000_000)
    boot.add_argument(
        "--disk",
        type=Path,
        help="Use a virtual ATA disk image; default builds the bundled FAT16 media",
    )
    boot.add_argument(
        "--load-state",
        type=Path,
        help="Resume a saved machine checkpoint for the selected ROM",
    )
    boot.add_argument(
        "--save-state", type=Path, help="Save the reached machine state after execution"
    )
    boot.add_argument("--png", type=Path)
    boot.add_argument("--report", type=Path)
    args = parser.parse_args(argv)
    if args.command in (None, "gui"):
        from .app import main as gui

        gui()
        return 0
    if args.command == "inspect":
        raw = args.file.read_bytes()
        if args.file.suffix.lower() == ".sgs":
            from .sgs import SgsFile

            s = SgsFile(raw)
            report = dict(
                title=s.title,
                version=s.version,
                bytes=len(raw),
                sha256=hashlib.sha256(raw).hexdigest(),
                entries=s.entries,
                variables=len(s.variables),
                resources=len(s.resources),
            )
        else:
            from .firmware import inspect_rom

            report = inspect_rom(raw)
    elif args.command == "game":
        if args.frames < 0:
            parser.error("--frames must be nonnegative")
        from .gnex import GnexRuntime

        machine = GnexRuntime(args.rom.read_bytes(), args.sgs.read_bytes())
        machine.event("START")
        for key in args.key:
            machine.set_key(int(key, 0), True)
            machine.set_key(int(key, 0), False)
        for _ in range(args.frames):
            if machine.status in ("error", "exited") or not machine.timer_ms:
                break
            machine.event("TIMEOUT")
        report = machine.diagnostics
    else:
        if args.instructions <= 0:
            parser.error("--instructions must be positive")
        from .firmware import FirmwareMachine
        from .disk import bundled_disk

        rom_bytes = args.rom.read_bytes()
        disk = (
            args.disk
            if args.disk
            else (
                None
                if args.load_state
                else bundled_disk(root / "data/games", rom_bytes)
            )
        )
        machine = FirmwareMachine(rom_bytes, disk_image=disk)
        from .state import load_state, save_state

        if args.load_state:
            load_state(machine, args.load_state)
        remaining = args.instructions
        while remaining > 0:
            budget = min(100_000, remaining)
            report = machine.run(budget)
            remaining -= budget
            if machine.status in (
                "error",
                "unsupported",
                "halted",
                "blocked",
                "stopped",
            ):
                break
        if args.save_state:
            save_state(machine, args.save_state)
    if args.command in ("game", "boot"):
        report = dict(report)
        report["framebuffer_sha256"] = hashlib.sha256(
            machine.framebuffer.tobytes()
        ).hexdigest()
        if args.png:
            args.png.parent.mkdir(parents=True, exist_ok=True)
            machine.framebuffer.save(args.png)
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(
                json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
            )
    # JSON escapes keep diagnostics usable on legacy Windows code pages too.
    print(json.dumps(report, ensure_ascii=True, indent=2))
    return int(
        bool(report.get("error"))
        or report.get("status") in ("unsupported", "error", "blocked")
    )


if __name__ == "__main__":
    raise SystemExit(main())
