"""Replay both built-in 3D games from the exact SCH-S250 YD01 ROM with Unicorn."""

import argparse
from collections import Counter
from hashlib import sha256
import json
from pathlib import Path
from struct import iter_unpack, unpack

from PIL import Image
from unicorn import UC_ARCH_ARM, UC_HOOK_CODE, UC_MODE_ARM, Uc
from unicorn.arm_const import (
    UC_ARM_REG_LR,
    UC_ARM_REG_PC,
    UC_ARM_REG_R0,
    UC_ARM_REG_R1,
    UC_ARM_REG_SP,
)

ROM_SIZE = 19_300_352
ROM_SHA256 = "ea94aac903d463a943423d4b1e682da4de0c9010f41e06a9aaa0dedefa6fad7b"
ROM_OFFSET = 0x8000
ROM_LIMIT = 0x1000000
RETURN = 0xFF0000
STACK = 0x1FF0000
SCREEN = 0x17384C4
SELECTOR = 0x112C389
SCENE = 0x175DCCC + 0x28
WIDTH, HEIGHT = 240, 320
DISPATCH = 0x24B984
TICK = 0x24B9F6
INPUT = 0x24BA0A
CONFIRM = 0x53
FORWARD = 0x32
GAMES = {
    "haunted-school": (0x1BD508, 1, 66, 80, 10),
    "lost-planet-ii": (0x1BD4EC, 0, 45, 24, 9),
}
# Keys are offsets in the input file, including the 32 KiB boot segment.
SERVICES = {
    0x12B078: "diagnostic trace",
    0x1EEFFE: "NV read without saved data",
    0xA9A3A: "hardware time sample",
    0x2CDC4C: "external flash detection",
    0x257824: "LCD transfer",
    0x2D6D4A: "sound start",
    0x1F1ACC: "sound stop",
    0x26BCEC: "handset font drawing",
    0x23E882: "game arena allocation",
    0x23E51E: "game arena release",
}


class Machine:
    def __init__(self, rom):
        self.uc = Uc(UC_ARCH_ARM, UC_MODE_ARM)
        self.uc.mem_map(0, 0x2000000)
        self.uc.mem_write(0, rom[ROM_OFFSET : ROM_OFFSET + ROM_LIMIT])
        self.calls = Counter()
        self.arena = 0x1900000
        for raw in SERVICES:
            address = raw - ROM_OFFSET
            self.uc.hook_add(UC_HOOK_CODE, self.service, begin=address, end=address)

    def service(self, uc, address, _size, _data):
        raw = address + ROM_OFFSET
        self.calls[SERVICES[raw]] += 1
        result = 0
        if raw == 0x23E882:
            size = uc.reg_read(UC_ARM_REG_R0)
            result = self.arena
            self.arena += (size + 0xFFF) & ~0xFFF
            if not size or self.arena > 0x1F00000:
                raise ValueError("Game arena is outside the replay bounds")
        uc.reg_write(UC_ARM_REG_R0, result)
        uc.reg_write(UC_ARM_REG_PC, uc.reg_read(UC_ARM_REG_LR))

    def call(self, raw, r0=0, r1=0):
        uc = self.uc
        uc.reg_write(UC_ARM_REG_SP, STACK)
        uc.reg_write(UC_ARM_REG_LR, RETURN | 1)
        uc.reg_write(UC_ARM_REG_R0, r0)
        uc.reg_write(UC_ARM_REG_R1, r1)
        uc.emu_start((raw - ROM_OFFSET) | 1, RETURN, count=220_000_000)
        if uc.reg_read(UC_ARM_REG_PC) != RETURN:
            raise RuntimeError(f"Instruction limit in callback {raw:#x}")

    def tick(self, count):
        for _ in range(count):
            self.call(TICK)

    def press(self, key):
        self.call(INPUT, key, 1)
        self.tick(1)
        self.call(INPUT, key, 0)
        self.tick(1)

    def capture(self, directory, name):
        data = bytes(self.uc.mem_read(SCREEN, WIDTH * HEIGHT * 2))
        colors = set(value for (value,) in iter_unpack("<H", data))
        rgb = bytes(
            channel
            for (pixel,) in iter_unpack("<H", data)
            for channel in (
                ((pixel >> 11) & 31) * 255 // 31,
                ((pixel >> 5) & 63) * 255 // 63,
                (pixel & 31) * 255 // 31,
            )
        )
        path = directory / f"{name}.png"
        Image.frombytes("RGB", (WIDTH, HEIGHT), rgb).save(path)
        return {
            "png": path.name,
            "pngSha256": sha256(path.read_bytes()).hexdigest(),
            "rgb565Sha256": sha256(data).hexdigest(),
            "colors": len(colors),
            "scene": list(unpack("<II", self.uc.mem_read(SCENE, 8))),
        }


def replay(rom, game, directory, control):
    entry, selector, title_ticks, intro_ticks, level_scene = GAMES[game]
    machine = Machine(rom)
    machine.call(entry)
    if machine.uc.mem_read(SELECTOR, 1)[0] != selector:
        raise RuntimeError("Original menu callback selected a different game")
    machine.call(DISPATCH)
    machine.tick(title_ticks)
    frames = {"title": machine.capture(directory, "title")}
    machine.press(CONFIRM)
    machine.tick(8)
    frames["menu"] = machine.capture(directory, "menu")
    machine.press(CONFIRM)
    machine.tick(intro_ticks)
    frames["intro"] = machine.capture(directory, "intro")
    for _ in range(2):
        machine.press(CONFIRM)
        machine.tick(12)
    frames["level"] = machine.capture(directory, "level")
    if frames["level"]["scene"] != [level_scene, level_scene]:
        raise RuntimeError("The original game did not reach the expected level scene")
    if control:
        machine.tick(6)
    else:
        machine.press(FORWARD)
        machine.tick(4)
    frames["after"] = machine.capture(directory, "after")
    return {
        "game": game,
        "firmwareSha256": ROM_SHA256,
        "menuCallbackFileOffset": entry,
        "selector": selector,
        "control": control,
        "frames": frames,
        "hostServices": dict(sorted(machine.calls.items())),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("rom", type=Path)
    parser.add_argument("game", choices=GAMES)
    parser.add_argument(
        "output", type=Path, help="new directory for captures and report"
    )
    parser.add_argument("--control", action="store_true", help="omit forward input")
    args = parser.parse_args()
    with args.rom.open("rb") as source:
        rom = source.read(ROM_SIZE + 1)
    if len(rom) != ROM_SIZE or sha256(rom).hexdigest() != ROM_SHA256:
        parser.error("Unexpected SCH-S250 YD01 ROM size or SHA-256")
    args.output.mkdir()
    result = replay(rom, args.game, args.output, args.control)
    (args.output / "replay.json").write_text(
        json.dumps(result, indent=2) + "\n", "utf-8"
    )


if __name__ == "__main__":
    main()
