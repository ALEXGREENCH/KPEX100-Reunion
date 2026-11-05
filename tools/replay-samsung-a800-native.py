"""Replay the three native games in Samsung SGH-A800 A80XDWBD.AXF."""

import argparse
from collections import Counter
from hashlib import sha256
import json
from pathlib import Path

from PIL import Image
from unicorn import Uc, UcError, UC_ARCH_ARM, UC_HOOK_CODE, UC_MODE_THUMB
from unicorn.arm_const import (
    UC_ARM_REG_LR,
    UC_ARM_REG_PC,
    UC_ARM_REG_R0,
    UC_ARM_REG_R1,
    UC_ARM_REG_SP,
)


FIRMWARE_SHA256 = "22abb85d7a2599eba0d3a01f7b0ec0ef4c97bf1dbfbd16d1dde044bdb909e4a6"
RO_END = 0x360F7C
RW_END = 0x36ED98
RAM = 0x1000000
RETURN = 0x3DF000
LCD = 0x11E4604
GAMES = {"fortress": 0x150F90, "space-war": 0x1529EC, "x-flighter": 0x158528}
HOST = {
    0xFC2A8: "lcd-bitmap",
    0xFC6BC: "lcd-present",
    0xFC7D4: "timer-register",
    0x10C25C: "timer-stop",
    0x10C160: "sound-start",
    0x10C174: "sound-stop",
    0x10C17C: "sound-pause",
    0x10C184: "sound-resume",
}
INIT = [(0, 0), (1, 0), (3, 0)]
TICK = (4, 0)
SCENARIOS = {
    "fortress": INIT
    + [TICK] * 4
    + [(5, 5)]
    + [TICK] * 28
    + [(5, 4), TICK, (5, 5)]
    + [TICK] * 7,
    "space-war": INIT + [TICK, (5, 5), TICK, (5, 4), TICK, (5, 2), TICK],
    "x-flighter": INIT
    + [TICK, (5, 9), TICK, (5, 9)]
    + [TICK] * 20
    + [(5, 4), TICK, (5, 5), TICK],
}


class Machine:
    def __init__(self, rom):
        self.uc = Uc(UC_ARCH_ARM, UC_MODE_THUMB)
        self.uc.mem_map(0, 0x3E0000)
        self.uc.mem_map(RAM, 0x210000)
        self.uc.mem_write(0, rom[:RO_END])
        # Copy initialized data to the MAP's RW region and leave ZI zeroed.
        self.uc.mem_write(RAM, rom[RO_END:RW_END])
        self.calls = Counter()
        for address in HOST:
            self.uc.hook_add(
                UC_HOOK_CODE, self.on_host_call, begin=address, end=address
            )
        self.call(0x10C64C, 0, 0)

    def on_host_call(self, uc, address, _size, _context):
        self.calls[HOST[address]] += 1
        uc.reg_write(UC_ARM_REG_R0, 0)
        uc.reg_write(UC_ARM_REG_PC, uc.reg_read(UC_ARM_REG_LR))

    def call(self, address, event, argument):
        self.uc.reg_write(UC_ARM_REG_LR, RETURN | 1)
        self.uc.reg_write(UC_ARM_REG_SP, 0x120E000)
        self.uc.reg_write(UC_ARM_REG_R0, event)
        self.uc.reg_write(UC_ARM_REG_R1, argument)
        try:
            self.uc.emu_start(address | 1, RETURN, count=12_000_000)
        except UcError as error:
            pc = self.uc.reg_read(UC_ARM_REG_PC)
            raise RuntimeError(
                f"{address:#x} event {event}:{argument}, PC {pc:#x}: {error}"
            ) from error
        if self.uc.reg_read(UC_ARM_REG_PC) != RETURN:
            raise RuntimeError(
                f"{address:#x} event {event}:{argument} reached the instruction limit"
            )

    def frame(self, path):
        raw = bytes(self.uc.mem_read(LCD, 4096))
        # Each LCD page holds eight vertical 2-bit pixels per column.
        pixels = bytearray()
        for y in range(128):
            page = (y // 8) * 256 + (y // 4) % 2
            shift = 2 * (y % 4)
            pixels.extend(
                255 - 85 * ((raw[page + 2 * x] >> shift) & 3) for x in range(128)
            )
        Image.frombytes("L", (128, 128), bytes(pixels)).save(path)
        return {"lcdSha256": sha256(raw).hexdigest(), "shades": len(set(pixels))}


def replay(rom, game, events, output):
    machine = Machine(rom)
    frames = []
    for index, (event, argument) in enumerate(events):
        machine.call(GAMES[game], event, argument)
        path = output / f"{game}-{index:03}-{event}-{argument}.png"
        frames.append(
            {"event": [event, argument], "file": path.name, **machine.frame(path)}
        )
    return {
        "entry": hex(GAMES[game]),
        "frames": frames,
        "hostCalls": dict(machine.calls),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("firmware", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--game", choices=GAMES)
    parser.add_argument(
        "--events", help="Override with comma-separated event:argument pairs"
    )
    args = parser.parse_args()
    rom = args.firmware.read_bytes()
    if sha256(rom).hexdigest() != FIRMWARE_SHA256:
        parser.error("expected original A80XDWBD.AXF")
    events = None
    if args.events is not None:
        try:
            events = [
                tuple(map(int, entry.split(":"))) for entry in args.events.split(",")
            ]
        except ValueError:
            parser.error("--events must contain integer event:argument pairs")
        if any(
            len(pair) != 2 or not all(0 <= value <= 0xFFFFFFFF for value in pair)
            for pair in events
        ):
            parser.error("--events must contain unsigned 32-bit event:argument pairs")
    args.output.mkdir(parents=True)
    games = [args.game] if args.game else GAMES
    result = {
        "firmwareSha256": FIRMWARE_SHA256,
        "lcd": [128, 128],
        "games": {
            game: replay(rom, game, events or SCENARIOS[game], args.output)
            for game in games
        },
    }
    (args.output / "report.json").write_text(
        json.dumps(result, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
