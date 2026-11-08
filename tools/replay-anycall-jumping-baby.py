"""Replay original Samsung Anycall ADS Thumb games with a partial host."""

import argparse
from collections import Counter
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import runpy
import struct
from zipfile import ZipFile
from zlib import crc32

from PIL import Image
from unicorn import UC_ARCH_ARM, UC_HOOK_CODE, UC_MODE_THUMB, Uc
from unicorn.arm_const import (
    UC_ARM_REG_LR,
    UC_ARM_REG_PC,
    UC_ARM_REG_R0,
    UC_ARM_REG_R1,
    UC_ARM_REG_R2,
    UC_ARM_REG_R3,
    UC_ARM_REG_SP,
)


MBIN_SHA256 = "f92939b286d004deff20782d15827c0c4e31a4ce0859239b7594551d741501a7"
HEADER_BYTES = 0x109
TEXT = 0xF4000000
BSS = 0xF5000000
FRAMEBUFFER = BSS + 0x40000
TABLE = 0xF6000000
STUBS = TABLE + 0x1000
RETURN = TABLE + 0x3000
STACK = 0x08000000
WIDTH, HEIGHT = 120, 128
ARGS = (UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3)
STUB_SLOTS = {0x18, 0x24, 0x3C, 0x40, 0x48, 0x68}
ADDITIONAL_GAMES = {
    "hungry-hunter": (
        "Hungry_Hunter.mbin",
        "be7a23f99e205ab13674706ad750cebb01558e6dd65835cfbdc31546b8c5a8be",
    ),
    "love-love": (
        "러브러브_뿅망치.mbin",
        "d976b7800d9ba20ebd726212afcfaa387240eace6a7892de4560c4c82479ceba",
    ),
    "oh-my-head": (
        "버전 다름/오마이_헤드.mbin",
        "53e0e20bc8e615eee973fae319b40ebbaccb6fdafc3d8a91d8e8c6228031e74f",
    ),
    "pocket-billiards": (
        "포켓_빌리어드.mbin",
        "ba8019b03d62389edb7c10137023e7a38d0c75fb0e8fa3415bd303e2f58655cc",
    ),
    "119-rescue": (
        "119_구조대.mbin",
        "982b6f0d3b66c8c4d4d9f3b73b16a3233fe71afee4a7b58a8e4e43ba4acdda73",
    ),
    "merry-christmas": (
        "버전 다름/메리_크리스마스.mbin",
        "7114c2494d25d708a3ebda216e090c0039c25f6bcbe0f3a1d83108a1e340895a",
    ),
    "mr-ramen": (
        "버전 다름/Mr_라면왕.mbin",
        "6b13f774d53bbf641e778a069b013cfd31555d84ec4af45504596a748629f0af",
    ),
    "udon-time": (
        "버전 다름/우동타임.mbin",
        "0d589cca6fc22e01f8e90f5fe7e43150cc2ce09317d5d822c5c438e439407672",
    ),
    "mobile-gostop": (
        "버전 다름/모바일 고스톱.mbin",
        "108f8d823825c936d782e0f0a1d4e090e5812bab5713c92c765cc42fc2a8c197",
    ),
    "cheombangjichuk-othello": (
        "버전 다름/천방지축_오델로.mbin",
        "30f98f626af9cdbeb2f57180c31040df60153a101f3388926b5a2086dee51bf2",
    ),
    "couple-bowling": (
        "버전 다름/커플볼링.mbin",
        "166f9c83d77e92b3bbd7ecaba470ebfb1fc1b679f7d89a8a6a7a53809bd96102",
    ),
    "bubble-monk-2": (
        "보글보글동자승2.mbin",
        "3ae1e04708000af39f87482c7d34e4e6ce8717f2c72eff2da7b044827cd72407",
    ),
}
ADDITIONAL_STUB_SLOTS = {0x2C, 0x30, 0x34, 0x5C, 0x9C}
DRAWING_TIMERS = {
    "119-rescue": 1,
    "merry-christmas": 0,
    "mr-ramen": 2,
    "udon-time": 2,
    "mobile-gostop": 1,
    "cheombangjichuk-othello": 1,
    "couple-bowling": 1,
    "bubble-monk-2": 1,
}
RANDOM_GAMES = ("udon-time", "mobile-gostop", "couple-bowling", "bubble-monk-2")
RGB332 = [
    bytes(
        ((value >> 5) * 255 // 7, ((value >> 2) & 7) * 255 // 7, (value & 3) * 255 // 3)
    )
    for value in range(256)
]
MQ = runpy.run_path(str(Path(__file__).with_name("extract-samsung-w420-mq.py")))


class Replay:
    def __init__(self, original, *, game_id="jumping-baby"):
        self.game_id = game_id
        self.instruction_budget = 1_000_000 if game_id == "bubble-monk-2" else 25_000
        self.original_sha256 = sha256(original).hexdigest()
        expected = (
            MBIN_SHA256 if game_id == "jumping-baby" else ADDITIONAL_GAMES[game_id][1]
        )
        if self.original_sha256 != expected:
            raise ValueError(f"unexpected {game_id} MBIN SHA-256")
        self.stub_slots = (
            STUB_SLOTS
            if game_id == "jumping-baby"
            else STUB_SLOTS | ADDITIONAL_STUB_SLOTS
        )
        self.height = (
            144
            if game_id
            in ("pocket-billiards", "cheombangjichuk-othello", "couple-bowling")
            else HEIGHT
        )
        self.body = original[HEADER_BYTES:]
        self.sprites = {}
        self.resources = {}
        self.calls = Counter()
        self.frames = 0
        self.error = None
        self.cpu = Uc(UC_ARCH_ARM, UC_MODE_THUMB)
        self.cpu.mem_map(TEXT, (len(self.body) + 0xFFF) & ~0xFFF)
        self.cpu.mem_write(TEXT, self.body)
        self.cpu.mem_map(BSS, 0x80000)
        self.cpu.mem_map(TABLE, 0x4000)
        self.cpu.mem_map(STACK, 0x10000)
        self.cpu.mem_write(
            TABLE, struct.pack("<128I", *(STUBS + 4 * i + 1 for i in range(128)))
        )
        self.cpu.mem_write(STUBS, bytes.fromhex("704700bf") * 128)
        self.cpu.hook_add(UC_HOOK_CODE, self.host, begin=STUBS, end=STUBS + 511)
        self.dispatch(0, TABLE)

    def dispatch(self, event, argument=0):
        for register, value in zip(ARGS, (event, argument, 0, 0)):
            self.cpu.reg_write(register, value)
        self.cpu.reg_write(UC_ARM_REG_LR, RETURN | 1)
        self.cpu.reg_write(UC_ARM_REG_SP, STACK + 0xFF00)
        self.cpu.emu_start(TEXT | 1, RETURN, count=self.instruction_budget)
        if self.error is not None:
            raise ValueError(self.error)
        if self.cpu.reg_read(UC_ARM_REG_PC) != RETURN:
            raise RuntimeError(f"event {event} exceeded its instruction budget")

    def host(self, cpu, address, _size, _data):
        slot = address - STUBS
        self.calls[slot] += 1
        a, b, c, d = (cpu.reg_read(register) for register in ARGS)
        if slot == 0x04:
            cpu.mem_write(a, struct.pack("<I", FRAMEBUFFER))
        elif slot == 0xB0:
            # This build passes an empty descriptor during resource loading.
            if self.game_id != "oh-my-head" or a or b or c or d:
                self.load_sprite(a, b, c, d)
            return
        elif slot == 0x70:
            self.blit(a, b)
            return
        elif slot == 0x74 and self.game_id == "pocket-billiards":
            self.plot_pixel(a, b, c, d)
            return
        elif slot == 0xA0:
            self.frames += 1
        elif slot not in self.stub_slots:
            self.error = f"unhandled ADS call at table offset {slot:#04x}"
            cpu.emu_stop()
        cpu.reg_write(UC_ARM_REG_R0, 0)

    def load_sprite(self, descriptor, geometry, address, transparency):
        width, height = geometry & 255, (geometry >> 8) & 255
        offset = address - TEXT
        header = MQ["MQ_HEADER"]
        magic, count, size = header.unpack_from(self.body, offset)
        if (
            magic != b"MQ"
            or count != width * height
            or not header.size < size <= len(self.body) - offset
        ):
            raise ValueError(f"invalid MQ record at guest address {address:#x}")
        record = self.body[offset : offset + size]
        key = transparency & 255
        pixels = MQ["decode"](record, count, key)
        self.sprites[descriptor] = (width, height, key, pixels)
        self.resources[offset] = {
            "mbinOffset": offset + HEADER_BYTES,
            "width": width,
            "height": height,
            "transparentIndex": key,
            "bytes": size,
            "sha256": sha256(record).hexdigest(),
        }

    def blit(self, position, descriptor):
        x, y = struct.unpack("<hh", struct.pack("<I", position))
        width, height, key, pixels = self.sprites[descriptor]
        left, right = max(0, -x), min(width, WIDTH - x)
        if left >= right:
            return
        for row in range(max(0, -y), min(height, self.height - y)):
            address = FRAMEBUFFER + (y + row) * WIDTH + x + left
            source = pixels[row * width + left : row * width + right]
            if key in source:
                background = self.cpu.mem_read(address, right - left)
                source = bytes(
                    dst if src == key else src for src, dst in zip(source, background)
                )
            self.cpu.mem_write(address, source)

    def plot_pixel(self, position, clip, color, target):
        if target != FRAMEBUFFER:
            raise ValueError(f"unexpected ADS pixel target {target:#x}")
        x, y = struct.unpack("<hh", struct.pack("<I", position))
        width, height = struct.unpack("<HH", struct.pack("<I", clip))
        if 0 <= x < min(width, WIDTH) and 0 <= y < min(height, self.height):
            self.cpu.mem_write(target + y * WIDTH + x, bytes([color & 255]))

    def tick(self, frames=1):
        for _ in range(frames):
            self.dispatch(5)

    def key(self, code):
        self.dispatch(4, code)

    def frame(self):
        return bytes(self.cpu.mem_read(FRAMEBUFFER, WIDTH * self.height))


class DrawingReplay(Replay):
    def __init__(self, original, game_id):
        self.color = 0
        self.random_state = 0x12345678
        self.empty_descriptor_calls = []
        self.special_calls = []
        self.events = 0
        super().__init__(original, game_id=game_id)
        if game_id == "cheombangjichuk-othello":
            self.stub_slots.remove(0x9C)
        else:
            self.stub_slots = (self.stub_slots | {0x08}) - {0x48}
        if game_id in RANDOM_GAMES:
            self.stub_slots -= {0x40}
        if game_id == "udon-time":
            self.stub_slots.add(0x0C)

    def tick(self, frames=1):
        for _ in range(frames):
            self.dispatch(5, DRAWING_TIMERS[self.game_id])

    def dispatch(self, event, argument=0):
        super().dispatch(event, argument)
        self.events += 1

    def output_address(self):
        stack = self.cpu.reg_read(UC_ARM_REG_SP)
        return struct.unpack("<I", self.cpu.mem_read(stack, 4))[0]

    def host(self, cpu, address, size, data):
        slot = address - STUBS
        if slot == 0x48 and self.game_id != "cheombangjichuk-othello":
            # A synthetic clock for this replay, in units of presented frames.
            cpu.mem_write(self.output_address() + 12, struct.pack("<I", self.frames))
            cpu.reg_write(UC_ARM_REG_R0, 0)
        elif slot == 0x40 and self.game_id in RANDOM_GAMES:
            bounds = cpu.reg_read(UC_ARM_REG_R0)
            low, high = bounds & 65535, bounds >> 16
            if low > high:
                raise ValueError("reversed ADS random bounds")
            self.random_state = (1664525 * self.random_state + 1013904223) & 0xFFFFFFFF
            choice = low + (self.random_state >> 16) % (high - low + 1)
            cpu.mem_write(self.output_address(), struct.pack("<H", choice))
            cpu.reg_write(UC_ARM_REG_R0, 0)
        elif slot == 0x74:
            self.plot_pixel(*(cpu.reg_read(register) for register in ARGS))
        elif slot == 0x7C:
            self.color = cpu.reg_read(UC_ARM_REG_R0) & 255
        elif slot in (0x8C, 0x98):
            first, second = (cpu.reg_read(register) for register in ARGS[:2])
            x, y = struct.unpack("<hh", struct.pack("<I", first))
            if slot == 0x8C:
                end_x, end_y = struct.unpack("<hh", struct.pack("<I", second))
                self.draw_line(x, y, end_x, end_y)
            else:
                width, height = struct.unpack("<HH", struct.pack("<I", second))
                self.fill_rect(x, y, width, height)
        elif slot in (0x90, 0x94) and self.game_id == "couple-bowling":
            position, endpoint = (cpu.reg_read(register) for register in ARGS[:2])
            x, y = struct.unpack("<hh", struct.pack("<I", position))
            end = struct.unpack("<h", struct.pack("<H", endpoint & 0xFFFF))[0]
            end_x, end_y = (x, end) if slot == 0x90 else (end, y)
            if self.calls[slot] < 2:
                self.record_special_call(
                    slot, segment=[x, y, end_x, end_y], color=self.color
                )
            self.draw_line(x, y, end_x, end_y)
        elif slot == 0x9C and self.game_id == "cheombangjichuk-othello":
            if (
                cpu.reg_read(UC_ARM_REG_LR) != TEXT + 0x42EB
                or cpu.reg_read(UC_ARM_REG_R0) != 255
            ):
                raise ValueError("unexpected ADS slot 0x9c screen clear")
            self.record_special_call(slot)
            cpu.mem_write(FRAMEBUFFER, bytes([255]) * WIDTH * self.height)
            cpu.reg_write(UC_ARM_REG_R0, 0)
        elif (
            slot == 0xB0
            and self.game_id == "cheombangjichuk-othello"
            and not any(cpu.reg_read(register) for register in ARGS)
        ):
            self.record_special_call(slot)
        elif slot == 0xC4 and self.game_id in ("mobile-gostop", "couple-bowling"):
            arguments = [cpu.reg_read(register) for register in ARGS]
            descriptor = arguments[1]
            caller = cpu.reg_read(UC_ARM_REG_LR)
            expected = (
                (0x132C, 0x5755) if self.game_id == "mobile-gostop" else (0xCEC, 0x5A05)
            )
            if descriptor != BSS + expected[0] or caller != TEXT + expected[1]:
                raise ValueError("unexpected ADS slot 0xc4 call site")
            descriptor_bytes = cpu.mem_read(descriptor, 12)
            if any(descriptor_bytes):
                raise ValueError("unexpected nonempty ADS slot 0xc4 descriptor")
            if self.game_id == "mobile-gostop":
                self.empty_descriptor_calls.append(
                    {
                        "presentation": self.frames,
                        "arguments": [f"0x{value:08x}" for value in arguments],
                        "linkRegister": f"0x{caller:08x}",
                        "descriptorHex": descriptor_bytes.hex(),
                    }
                )
            else:
                self.record_special_call(slot, descriptorHex=descriptor_bytes.hex())
            cpu.reg_write(UC_ARM_REG_R0, 0)
        else:
            super().host(cpu, address, size, data)
            return
        self.calls[slot] += 1

    def record_special_call(self, slot, **details):
        self.special_calls.append(
            {
                "slot": f"0x{slot:02x}",
                "completedEvents": self.events,
                "presentation": self.frames,
                "arguments": [
                    f"0x{self.cpu.reg_read(register):08x}" for register in ARGS
                ],
                "linkRegister": f"0x{self.cpu.reg_read(UC_ARM_REG_LR):08x}",
                **details,
            }
        )

    def fill_rect(self, x, y, width, height):
        left, right = max(0, x), min(WIDTH, x + width)
        if left >= right:
            return
        row = bytes([self.color]) * (right - left)
        for line in range(max(0, y), min(self.height, y + height)):
            self.cpu.mem_write(FRAMEBUFFER + line * WIDTH + left, row)

    def draw_line(self, x, y, end_x, end_y):
        dx, dy = abs(end_x - x), -abs(end_y - y)
        step_x, step_y = (1 if x < end_x else -1), (1 if y < end_y else -1)
        error = dx + dy
        color = bytes([self.color])
        while True:
            if 0 <= x < WIDTH and 0 <= y < self.height:
                self.cpu.mem_write(FRAMEBUFFER + y * WIDTH + x, color)
            if x == end_x and y == end_y:
                return
            twice = 2 * error
            if twice >= dy:
                error += dy
                x += step_x
            if twice <= dx:
                error += dx
                y += step_y


def save_frame(output, name, game):
    indices = game.frame()
    rgb = b"".join(RGB332[index] for index in indices)
    path = output / f"{name}.png"
    Image.frombytes("RGB", (WIDTH, game.height), rgb).save(path)
    return {
        "file": path.name,
        "presentation": game.frames,
        "indexedSha256": sha256(indices).hexdigest(),
        "pngSha256": sha256(path.read_bytes()).hexdigest(),
    }


def read_original(path, member="점핑!_베이비.mbin"):
    if path.suffix.lower() != ".zip":
        return path.read_bytes()
    with ZipFile(path) as preserved:
        original_zip = preserved.read("original/Anycall-Land-games.zip")
    with ZipFile(BytesIO(original_zip), metadata_encoding="cp949") as games:
        return games.read(member)


def replay_identity(game, original):
    return {
        "schema": 1,
        "game": game.game_id,
        "originalMember": ADDITIONAL_GAMES[game.game_id][0],
        "mbinSha256": game.original_sha256,
        "mbinBytes": len(original),
        "size": [WIDTH, game.height],
        "palette": "provisional RGB332",
        "hostCallCounts": {
            f"0x{slot:02x}": count for slot, count in sorted(game.calls.items())
        },
        "stubSlots": [f"0x{slot:02x}" for slot in sorted(game.stub_slots)],
    }


def replay_controls(original, output, game_id):
    sequence = [(520, None, "01-menu")]
    if game_id == "mr-ramen":
        sequence += [
            (40, 19, "02-counter-settings"),
            (40, 19, "03-recipe"),
            (200, None, None),
        ]
        keys, ticks = range(1, 10), 12
    elif game_id == "udon-time":
        keys, ticks = (2, 5, 8), 6
    else:
        keys, ticks = (2, 4, 6), 10
    sequence.append((40, 19, "04-before-input"))

    control = DrawingReplay(original, game_id)
    captures = []
    for count, key, name in sequence:
        if key is not None:
            control.key(key)
        control.tick(count)
        if name:
            captures.append(save_frame(output, name, control))
    before_input = control.frame()
    control.tick(ticks)
    baseline = control.frame()
    captures.append(save_frame(output, "05-no-input", control))

    inputs = []
    for button in keys:
        game = DrawingReplay(original, game_id)
        for count, key, _ in sequence:
            if key is not None:
                game.key(key)
            game.tick(count)
        if game.frame() != before_input:
            raise RuntimeError("control diverged before gameplay input")
        game.key(button)
        game.tick(ticks)
        changed = [i for i, (a, b) in enumerate(zip(game.frame(), baseline)) if a != b]
        if not changed:
            raise RuntimeError(f"no gameplay difference after key {button}")
        xs = [i % WIDTH for i in changed]
        inputs.append(
            {
                "key": button,
                "changedPixels": len(changed),
                "changedBounds": [
                    min(xs),
                    changed[0] // WIDTH,
                    max(xs) + 1,
                    changed[-1] // WIDTH + 1,
                ],
                "capture": save_frame(output, f"key-{button:02d}", game),
            }
        )
    if len({row["capture"]["indexedSha256"] for row in inputs}) != len(inputs):
        raise RuntimeError("some gameplay buttons produced identical frames")
    manifest = {
        **replay_identity(control, original),
        "timerArgument": DRAWING_TIMERS[game_id],
        "clock": "synthetic count of presented frames",
        "commonSequence": [{"ticks": count, "key": key} for count, key, _ in sequence],
        "pairedTimerEvents": ticks,
        "captures": captures,
        "inputs": inputs,
        "mqRecords": [
            control.resources[offset] for offset in sorted(control.resources)
        ],
    }
    if game_id == "udon-time":
        manifest["randomSeed"] = 0x12345678
    (output / "replay.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"{game_id}: {len(control.resources)} MQ records, {len(inputs)} verified input comparisons"
    )


def replay_game(original, output, game_id):
    if game_id == "119-rescue":
        game, control = DrawingReplay(original, game_id), DrawingReplay(
            original, game_id
        )
    else:
        game, control = Replay(original, game_id=game_id), Replay(
            original, game_id=game_id
        )
    captures = []
    if game_id == "119-rescue":
        sequence = [
            (120, None, "01-title"),
            (60, None, "02-menu"),
            (20, 19, "04-before-input"),
        ]
        input_key, ticks, input_ticks = 6, 10, [0]
    elif game_id == "pocket-billiards":
        sequence = [
            (100, None, "01-title"),
            (30, 19, "02-menu"),
            (20, 19, "04-before-input"),
        ]
        input_key, ticks, input_ticks = 19, 38, [0, 2]
    else:
        sequence = [(100, None, "01-title"), (20, 19, "02-menu")]
        if game_id == "oh-my-head":
            sequence.append((11, 19, "03-ready"))
        sequence.append(
            (11 if game_id == "hungry-hunter" else 12, 19, "04-before-input")
        )
        input_key = 2 if game_id == "hungry-hunter" else 10
        ticks = 5 if game_id == "hungry-hunter" else 20
        input_ticks = [0] if game_id == "hungry-hunter" else list(range(0, ticks, 3))
    for stage_ticks, key, name in sequence:
        for replay in (game, control):
            if key is not None:
                replay.key(key)
            replay.tick(stage_ticks)
        captures.append(save_frame(output, name, game))

    if game.frame() != control.frame():
        raise RuntimeError("control diverged before gameplay input")
    for index in range(ticks):
        if index in input_ticks:
            game.key(input_key)
        game.tick()
        control.tick()
    changed = sum(a != b for a, b in zip(game.frame(), control.frame()))
    if game.frames != control.frames or not changed:
        raise RuntimeError("expected distinct frames at the same gameplay tick")
    captures.append(save_frame(output, "05-no-input", control))
    captures.append(save_frame(output, "06-input", game))

    manifest = {
        **replay_identity(game, original),
        "commonSequence": [{"ticks": ticks, "key": key} for ticks, key, _ in sequence],
        "gameplayInput": {"key": input_key, "ticks": ticks, "inputTicks": input_ticks},
        "changedPixels": changed,
        "captures": captures,
        "mqRecords": [game.resources[offset] for offset in sorted(game.resources)],
    }
    if game_id == "119-rescue":
        manifest["timerArgument"] = 1
        manifest["clock"] = "synthetic count of presented frames"
    (output / "replay.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"{game_id}: {len(game.resources)} MQ records, {game.frames} presentations, {changed} pixels changed"
    )


def replay_mobile_gostop(original, output):
    game_id = "mobile-gostop"
    sequence = [(100, None)] + [(20, 19)] * 5
    timer_intervals = [20, 60]
    common_captures = []
    branches = []
    control_frames = []
    for key in (None, 1, 5, 7):
        game = DrawingReplay(original, game_id)
        for step, (ticks, button) in enumerate(sequence):
            if button is not None:
                game.key(button)
            game.tick(ticks)
            if key is None:
                common_captures.append(save_frame(output, f"start-{step + 1}", game))
            elif (
                sha256(game.frame()).hexdigest()
                != common_captures[step]["indexedSha256"]
            ):
                raise RuntimeError("control diverged before gameplay input")

        if key is not None:
            game.key(key)
        checkpoints = []
        label = "idle" if key is None else f"key-{key}"
        for index, ticks in enumerate(timer_intervals):
            game.tick(ticks)
            frame = game.frame()
            if key is None:
                control_frames.append(frame)
            changed = sum(
                a != b for a, b in zip(frame, control_frames[index], strict=True)
            )
            if key is not None and not changed:
                raise RuntimeError(f"no gameplay difference after key {key}")
            checkpoints.append(
                {
                    **save_frame(
                        output, f"{label}-{sum(timer_intervals[:index + 1])}", game
                    ),
                    "changedPixels": changed,
                }
            )
        branches.append({"key": key, "checkpoints": checkpoints})
        if key is None:
            identity = replay_identity(game, original)
            empty_descriptor_calls = game.empty_descriptor_calls

    if len(empty_descriptor_calls) != 1:
        raise RuntimeError("expected exactly one empty ADS slot 0xc4 call")
    manifest = {
        **identity,
        "timerArgument": DRAWING_TIMERS[game_id],
        "clock": "synthetic count of presented frames",
        "randomSeed": 0x12345678,
        "slotC4Calls": empty_descriptor_calls,
        "commonSequence": [
            {"ticks": ticks, "key": key, "capture": capture}
            for (ticks, key), capture in zip(sequence, common_captures, strict=True)
        ],
        "timerIntervals": timer_intervals,
        "branches": branches,
    }
    (output / "replay.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(
        f"{game_id}: {len(common_captures)} setup and {len(branches) * len(timer_intervals)} paired captures"
    )


def replay_paired_boards(original, output, game_id):
    if game_id == "cheombangjichuk-othello":
        setup_keys = [19, 19, 19, 19, 11, 11, 11, 11, 13, 13]
        intervals = [21, 80]
        inputs = [(None, "idle"), (19, "legal-move")]
        details = {
            "legalMove": {
                "key": 19,
                "column": 4,
                "row": 2,
                "coordinates": "zero-based",
            },
        }
    else:
        setup_keys = [19, 19, 19, 19, 19, 12, 19, 11, 19]
        intervals = [20, 20, 20, 40]
        inputs = [(None, "idle"), (11, "right"), (19, "confirm")]
        details = {
            "randomSeed": 0x12345678,
            "clock": "synthetic count of presented frames",
            "observations": {
                "idle": "Countdown auto-throws and the first shot scores 9.",
                "right": "Changes the ball trajectory. The first shot scores 9.",
                "confirm": "Opens the power meter early. The first shot scores 6.",
            },
        }
    sequence = [(None, 100)] + [(key, 20) for key in setup_keys]
    common = []
    branches = []
    idle_frames = []
    for key, label in inputs:
        game = DrawingReplay(original, game_id)
        for index, (button, ticks) in enumerate(sequence):
            if button is not None:
                game.key(button)
            game.tick(ticks)
            if key is None:
                common.append(
                    {
                        "key": button,
                        "ticks": ticks,
                        "capture": {
                            **save_frame(output, f"setup-{index:02d}", game),
                            "eventCount": game.events,
                        },
                    }
                )
            elif (
                sha256(game.frame()).hexdigest()
                != common[index]["capture"]["indexedSha256"]
            ):
                raise RuntimeError("control diverged before gameplay input")

        if key is not None:
            game.key(key)
        checkpoints = []
        elapsed = 0
        for index, ticks in enumerate(intervals):
            elapsed += ticks
            game.tick(ticks)
            frame = game.frame()
            if key is None:
                idle_frames.append(frame)
            changed = sum(
                a != b for a, b in zip(frame, idle_frames[index], strict=True)
            )
            if key is not None and not changed:
                raise RuntimeError(f"no gameplay difference after key {key}")
            checkpoints.append(
                {
                    **save_frame(output, f"{label}-{elapsed}", game),
                    "eventCount": game.events,
                    "changedPixels": changed,
                }
            )
        branches.append(
            {
                "key": key,
                "checkpoints": checkpoints,
                "specialCalls": game.special_calls,
            }
        )
        if key is None:
            identity = replay_identity(game, original)

    manifest = {
        **identity,
        "sourceArchive": "research/archives/Samsung-Anycall-ADS-MBIN.zip",
        "originalMemberCrc32": f"{crc32(original):08x}",
        "timerArgument": DRAWING_TIMERS[game_id],
        **details,
        "commonSequence": common,
        "timerIntervals": intervals,
        "branches": branches,
    }
    (output / "replay.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(
        f"{game_id}: {len(common)} setup and {len(branches) * len(intervals)} paired captures"
    )


def replay_bubble_monk(original, output):
    game_id = "bubble-monk-2"
    sequence = [(None, 140)] + [(key, 20) for key in (19, 19, 19, 14, 19, 5, 19)]
    input_ticks = 12
    direction_pairs = [[10, 4], [11, 6], [12, 2], [13, 5]]
    long_key, tap_every = 12, 10
    key_cycle = [12, 11, 12, 19, 10, 5]
    long_checkpoints = []
    common = []
    branches = []
    for key in (None, 1, 2, 3, 4, 5, 6, 10, 11, 12, 13, 19):
        game = DrawingReplay(original, game_id)
        for index, (button, ticks) in enumerate(sequence):
            if button is not None:
                game.key(button)
            game.tick(ticks)
            if key is None:
                common.append(
                    {
                        "key": button,
                        "ticks": ticks,
                        "capture": {
                            **save_frame(output, f"setup-{index:02d}", game),
                            "eventCount": game.events,
                        },
                    }
                )
            elif (
                sha256(game.frame()).hexdigest()
                != common[index]["capture"]["indexedSha256"]
            ):
                raise RuntimeError("control diverged before gameplay input")

        for _ in range(input_ticks):
            if key is not None:
                game.key(key)
            game.tick()
        frame = game.frame()
        if key is None:
            identity = replay_identity(game, original)
            idle = frame
        label = "idle" if key is None else f"key-{key:02d}"
        changed = sum(a != b for a, b in zip(frame, idle, strict=True))
        if key is not None and not changed:
            raise RuntimeError(f"no gameplay difference after key {key}")
        branches.append(
            {
                "key": key,
                "capture": {
                    **save_frame(output, label, game),
                    "eventCount": game.events,
                    "changedPixels": changed,
                },
            }
        )
        if key == long_key:
            for index in range(1800):
                if index % tap_every == 0:
                    game.key(key_cycle[index // tap_every % len(key_cycle)])
                game.tick()
                if index + 1 in (1450, 1800):
                    long_checkpoints.append(
                        {
                            "ticks": index + 1,
                            "capture": {
                                **save_frame(output, f"long-{index + 1}", game),
                                "eventCount": game.events,
                            },
                        }
                    )

    hashes = {branch["key"]: branch["capture"]["indexedSha256"] for branch in branches}
    for direction, number in direction_pairs:
        if hashes[direction] != hashes[number]:
            raise RuntimeError(
                f"direction {direction} diverged from numeric key {number}"
            )
    manifest = {
        **identity,
        "sourceArchive": "research/archives/Samsung-Anycall-ADS-MBIN.zip",
        "originalMemberCrc32": f"{crc32(original):08x}",
        "timerArgument": DRAWING_TIMERS[game_id],
        "randomSeed": 0x12345678,
        "clock": "synthetic count of presented frames",
        "commonSequence": common,
        "inputTicks": input_ticks,
        "directionPairs": direction_pairs,
        "branches": branches,
        "longPlay": {
            "key": long_key,
            "tapEvery": tap_every,
            "keyCycle": key_cycle,
            "checkpoints": long_checkpoints,
        },
    }
    (output / "replay.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(
        f"{game_id}: {len(common)} setup, {len(branches)} paired and 2 long-play captures"
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "source", type=Path, help="Original MBIN or Samsung-Anycall-ADS-MBIN.zip"
    )
    parser.add_argument("output", type=Path)
    parser.add_argument(
        "--game", choices=("jumping-baby", *ADDITIONAL_GAMES), default="jumping-baby"
    )
    args = parser.parse_args()
    if args.game != "jumping-baby":
        original = read_original(args.source, ADDITIONAL_GAMES[args.game][0])
        args.output.mkdir(parents=True, exist_ok=True)
        if args.game == "mobile-gostop":
            replay_mobile_gostop(original, args.output)
        elif args.game == "bubble-monk-2":
            replay_bubble_monk(original, args.output)
        elif args.game in ("cheombangjichuk-othello", "couple-bowling"):
            replay_paired_boards(original, args.output, args.game)
        elif args.game in DRAWING_TIMERS and args.game != "119-rescue":
            replay_controls(original, args.output, args.game)
        else:
            replay_game(original, args.output, args.game)
        return
    original = read_original(args.source)
    args.output.mkdir(parents=True, exist_ok=True)
    game = Replay(original)
    control = Replay(original)
    controls = Replay(original)
    captures = []

    def capture(name, source=game):
        captures.append(save_frame(args.output, name, source))

    for replay in (game, control, controls):
        replay.tick(5)
    capture("01-title")
    for replay in (game, control, controls):
        replay.key(14)
        replay.tick(30)
    capture("02-menu")

    for _ in range(2):
        controls.key(13)
        controls.tick()
    controls.key(19)
    controls.tick(5)
    capture("03-key-control", controls)

    for replay in (game, control):
        replay.key(19)
        replay.tick(40)
    capture("04-stage")
    if game.frame() != control.frame():
        raise RuntimeError("control diverged before jump input")
    for _ in range(10):
        game.key(7)
        game.tick()
        control.tick()
    changed = sum(a != b for a, b in zip(game.frame(), control.frame()))
    if game.frames != control.frames or not changed:
        raise RuntimeError("expected distinct same-time frames after jump input")
    capture("05-no-input", control)
    capture("06-jump")

    manifest = {
        "schema": 1,
        "mbinSha256": MBIN_SHA256,
        "size": [WIDTH, HEIGHT],
        "palette": "provisional RGB332",
        "hostCallCounts": {
            f"0x{slot:02x}": count for slot, count in sorted(game.calls.items())
        },
        "stubSlots": [f"0x{slot:02x}" for slot in sorted(STUB_SLOTS)],
        "jumpChangedPixels": changed,
        "captures": captures,
        "mqRecords": [game.resources[offset] for offset in sorted(game.resources)],
    }
    (args.output / "replay.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"{len(game.resources)} MQ records, {game.frames} presentations, {changed} pixels changed by jump"
    )


if __name__ == "__main__":
    main()
