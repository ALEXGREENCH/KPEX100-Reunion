"""Evidence probe: execute the unmodified K2.12 ADC key decoder and translators."""

from pathlib import Path
import argparse
import hashlib
import json
from unicorn import Uc, UC_ARCH_ARM, UC_MODE_ARM
from unicorn.arm_const import (
    UC_ARM_REG_SP,
    UC_ARM_REG_LR,
    UC_ARM_REG_PC,
    UC_ARM_REG_R0,
    UC_ARM_REG_R1,
)

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--rom", type=Path, required=True)
args = parser.parse_args()
ROM = args.rom.read_bytes()
if (
    hashlib.sha256(ROM).hexdigest()
    != "743d0b9a377dc6a3f0a80b7816cee575ad2f8249643876367c4bfaac54ddd19a"
):
    parser.error("This probe requires unmodified Kingston 2.12")
BASE = 0x2000F8DC
STOP = 0x20FFF000
KEYS = [
    ("play", 20, 0x15),
    ("esc", 75, 0x0A),
    ("select", 150, 0x14),
    ("rec", 230, 0x0C),
    ("aux", 310, 0x16),
    ("mode", 390, 0x0B),
    ("menu", 465, 0x0D),
    ("up", 545, 0x12),
    ("down", 620, 0x13),
    ("right", 675, 0x11),
    ("left", 740, 0x10),
    ("volume_down", 815, 0x19),
    ("volume_up", 915, 0x1A),
]


def make():
    u = Uc(UC_ARCH_ARM, UC_MODE_ARM)
    u.mem_map(0x20000000, 0x1000000)
    u.mem_map(0x80000000, 0x10000)
    u.mem_write(BASE + 0x724, ROM[0x724:0x100000])
    u.mem_write(0x80000330, (1 << 15).to_bytes(4, "little"))
    return u


def call(u, offset, r0=0, r1=0, stop=STOP):
    u.reg_write(UC_ARM_REG_SP, 0x20FFE000)
    u.reg_write(UC_ARM_REG_LR, STOP)
    u.reg_write(UC_ARM_REG_R0, r0)
    u.reg_write(UC_ARM_REG_R1, r1)
    u.emu_start(BASE + offset, stop, count=100000)
    assert u.reg_read(UC_ARM_REG_PC) == stop, hex(u.reg_read(UC_ARM_REG_PC))
    return u.reg_read(UC_ARM_REG_R0)


def sample(u, adc):
    u.mem_write(0x80000A84, (0x07000000 | adc).to_bytes(4, "little"))
    call(u, 0x106C8)


results = []
for name, adc, gnex in KEYS:
    u = make()
    call(u, 0x102C4)
    u.mem_write(
        0x205F5005, b"\x01"
    )  # Already-unlocked HOLD state, no display side-effect.
    for _ in range(4):
        sample(u, adc)
    raw = u.mem_read(0x205F5006, 1)[0]
    for _ in range(2):
        sample(u, 1023)
    assert call(u, 0x103D0) == 1, name
    assert call(u, 0x103F0) == raw, name
    event_kind = call(u, 0x103FC)
    assert event_kind == 3, (name, event_kind)
    firmware_key = call(u, 0x204A4, raw, event_kind)
    call(u, 0x53C0C, firmware_key, stop=BASE + 0x3C8D4)
    actual = u.reg_read(UC_ARM_REG_R1)
    assert actual == gnex, (name, actual, gnex)
    results.append(
        dict(
            name=name,
            adc0=adc,
            raw_key=raw,
            event_kind=event_kind,
            firmware_key=firmware_key,
            gnex_key=actual,
        )
    )
print(json.dumps(results, indent=2))
