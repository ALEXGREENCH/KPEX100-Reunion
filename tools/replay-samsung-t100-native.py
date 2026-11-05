"""Replay the three Sinjisoft game entry points in Samsung T10AXVH1.AXF."""

import argparse
from collections import Counter, deque
from hashlib import sha256
import json
from pathlib import Path
from struct import pack

from PIL import Image
from unicorn import Uc, UcError, UC_ARCH_ARM, UC_MODE_THUMB, UC_HOOK_CODE
from unicorn.arm_const import (
    UC_ARM_REG_R0,
    UC_ARM_REG_R1,
    UC_ARM_REG_R2,
    UC_ARM_REG_LR,
    UC_ARM_REG_SP,
    UC_ARM_REG_PC,
)

ROM_LENGTH = 0x5D2584
RO_END = 0x5C65D4
RAM = 0x1000000
RETURN = 0x0600000
LCD = 0x113A690
WIDTH, HEIGHT = 128, 160
FIRMWARE_SHA256 = "afe4a9e93d6d68eae08d67285da5315153bf139fc804992a824cc66db41ba167"
EXTERNAL = {
    0x06C58: "trace",
    0x123EE: "nv-read",
    0x095CA4: "lcd-present",
    0x095D20: "sound-start",
    0x095D84: "sound-stop",
    0x095D98: "vibrator-start",
    0x095E00: "vibrator-stop",
    0x095E1C: "timer-start",
    0x095E80: "timer-stop",
    0x095F3C: "nv-write",
    0x096064: "sound-start-alt",
    0x0960B0: "pause-check",
}
GAMES = {"x-flighter": 0x0F1780, "space-war": 0x0F3098, "my-pet": 0x0F35E2}
INIT = [(0, 0), (1, 0), (3, 0)]
TICK = (4, 0)
SCENARIOS = {
    "x-flighter": INIT
    + [TICK, (5, 9), TICK, (5, 9)]
    + [TICK] * 22
    + [(5, 4), TICK, (5, 5), TICK],
    "space-war": INIT + [TICK, (5, 5), TICK, (5, 4), TICK, (5, 2), TICK],
    "my-pet": INIT
    + [TICK] * 4
    + [(5, 30), TICK, (5, 30), TICK, (5, 26), TICK, (5, 30), TICK],
}


class Machine:
    def __init__(self, rom):
        self.uc = Uc(UC_ARCH_ARM, UC_MODE_THUMB)
        self.uc.mem_map(0, 0x610000)
        self.uc.mem_map(RAM, 0x200000)
        self.uc.mem_write(0, rom[:RO_END])
        # MAP/SYM put initialized RW data immediately after the ROM section.
        self.uc.mem_write(RAM, rom[RO_END:])
        # Fixed 2004-01-01 date in the original mmi_GetCurrentDate fields.
        self.uc.mem_write(0x10BAAF8, pack("<HBB", 2004, 1, 1))
        self.calls = Counter()
        self.trace = deque(maxlen=16)
        self.timers = {}
        self.saved = {}
        self.uc.hook_add(UC_HOOK_CODE, self.on_instruction)

    def on_instruction(self, uc, address, _size, _context):
        self.trace.append(address)
        service = EXTERNAL.get(address)
        if service is None:
            return
        a, b, c = [
            uc.reg_read(reg) for reg in (UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2)
        ]
        self.calls[service] += 1
        if service == "timer-start":
            self.timers[a] = [b, c]
        elif service == "timer-stop":
            self.timers.pop(a, None)
        elif service == "nv-read":
            if a in self.saved:
                uc.mem_write(c, self.saved[a])
        elif service == "nv-write":
            self.saved[0x79D0 + 0x50 * a] = bytes(uc.mem_read(b, 0x4C))
        uc.reg_write(UC_ARM_REG_R0, 0)
        uc.reg_write(UC_ARM_REG_PC, uc.reg_read(UC_ARM_REG_LR))

    def call(self, address, a=0, b=0):
        self.trace.clear()
        self.uc.reg_write(UC_ARM_REG_SP, 0x11FF000)
        self.uc.reg_write(UC_ARM_REG_LR, RETURN | 1)
        self.uc.reg_write(UC_ARM_REG_R0, a)
        self.uc.reg_write(UC_ARM_REG_R1, b)
        try:
            self.uc.emu_start(address | 1, RETURN, count=16_000_000)
        except UcError as exc:
            raise RuntimeError(
                f"{address:06x}({a},{b}): {exc}; last PCs: {[hex(pc) for pc in self.trace]}"
            ) from exc
        if self.uc.reg_read(UC_ARM_REG_PC) != RETURN:
            raise RuntimeError(
                f"{address:06x}({a},{b}): budget reached; last PCs: {[hex(pc) for pc in self.trace]}"
            )

    def frame(self, path):
        raw = bytes(self.uc.mem_read(LCD, WIDTH * HEIGHT * 3 // 2))
        pixels = bytearray()
        # Two RGB444 pixels occupy three bytes.
        for x, y, z in zip(raw[0::3], raw[1::3], raw[2::3]):
            pixels.extend(
                n * 17 for n in (x >> 4, x & 15, y >> 4, y & 15, z >> 4, z & 15)
            )
        Image.frombytes("RGB", (WIDTH, HEIGHT), bytes(pixels)).save(path)
        colors = len(set(zip(pixels[0::3], pixels[1::3], pixels[2::3])))
        return {"lcdSha256": sha256(raw).hexdigest(), "colors": colors}


def run(rom, game, events, out):
    m = Machine(rom)
    m.call(0x0EB6D0)
    results = []
    for i, (event, argument) in enumerate(events):
        m.call(GAMES[game], event, argument)
        path = out / f"{game}-{i:03}-{event}-{argument}.png"
        results.append(
            {"event": event, "arg": argument, "file": path.name, **m.frame(path)}
        )
    return {
        "entry": hex(GAMES[game]),
        "events": results,
        "hooks": dict(m.calls),
        "timers": m.timers,
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
    if len(rom) != ROM_LENGTH or sha256(rom).hexdigest() != FIRMWARE_SHA256:
        parser.error("expected original T10AXVH1.AXF")
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
        "lcd": [WIDTH, HEIGHT],
        "games": {
            game: run(rom, game, events or SCENARIOS[game], args.output)
            for game in games
        },
    }
    (args.output / "report.json").write_text(
        json.dumps(result, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
