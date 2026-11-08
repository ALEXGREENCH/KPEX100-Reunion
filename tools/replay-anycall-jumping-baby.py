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
}
ADDITIONAL_STUB_SLOTS = {0x2C, 0x30, 0x34, 0x5C, 0x9C}
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
        self.height = 144 if game_id == "pocket-billiards" else HEIGHT
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
        self.cpu.emu_start(TEXT | 1, RETURN, count=25000)
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


def replay_game(original, output, game_id):
    game = Replay(original, game_id=game_id)
    control = Replay(original, game_id=game_id)
    captures = []
    if game_id == "pocket-billiards":
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
        "schema": 1,
        "game": game_id,
        "originalMember": ADDITIONAL_GAMES[game_id][0],
        "mbinSha256": game.original_sha256,
        "mbinBytes": len(original),
        "size": [WIDTH, game.height],
        "palette": "provisional RGB332",
        "hostCallCounts": {
            f"0x{slot:02x}": count for slot, count in sorted(game.calls.items())
        },
        "stubSlots": [f"0x{slot:02x}" for slot in sorted(game.stub_slots)],
        "commonSequence": [{"ticks": ticks, "key": key} for ticks, key, _ in sequence],
        "gameplayInput": {"key": input_key, "ticks": ticks, "inputTicks": input_ticks},
        "changedPixels": changed,
        "captures": captures,
        "mqRecords": [game.resources[offset] for offset in sorted(game.resources)],
    }
    (output / "replay.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"{game_id}: {len(game.resources)} MQ records, {game.frames} presentations, {changed} pixels changed"
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
