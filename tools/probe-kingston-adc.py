"""Replay Kingston 2.12's ADC scanner and key translators in isolated ARM memory."""

import argparse
from hashlib import sha256
import json
from pathlib import Path
from struct import pack, unpack_from

from unicorn import Uc, UC_ARCH_ARM, UC_MODE_ARM
from unicorn.arm_const import (
    UC_ARM_REG_LR,
    UC_ARM_REG_PC,
    UC_ARM_REG_R0,
    UC_ARM_REG_R1,
    UC_ARM_REG_SP,
)

ROM_SHA256 = "743d0b9a377dc6a3f0a80b7816cee575ad2f8249643876367c4bfaac54ddd19a"
BASE = 0x2000F8DC
STOP = 0x20FFF000
RELEASE_FIX = {
    0x10598: (0xE3500003, 0xE2400003),
    0x1059C: (0x13500004, 0xE3500002),
    0x105A0: (0x05C3C000, 0x95C3C000),
    0x105A4: (0x05C31002, 0x95C31002),
    0x105A8: (0x15C32002, 0x85C32002),
}


def call(cpu, offset, first=0, second=0):
    cpu.reg_write(UC_ARM_REG_SP, 0x20FFE000)
    cpu.reg_write(UC_ARM_REG_LR, STOP)
    cpu.reg_write(UC_ARM_REG_R0, first)
    cpu.reg_write(UC_ARM_REG_R1, second)
    cpu.emu_start(BASE + offset, STOP, count=100_000)
    if cpu.reg_read(UC_ARM_REG_PC) != STOP:
        raise RuntimeError(f"ARM call at {offset:#x} did not return")
    return cpu.reg_read(UC_ARM_REG_R0)


def replay(rom, hold, drain_every, release_fix):
    cpu = Uc(UC_ARCH_ARM, UC_MODE_ARM)
    cpu.mem_map(0x20000000, 0x1000000)
    cpu.mem_map(0x80000000, 0x10000)
    cpu.mem_write(BASE + 0x724, rom[0x724:0x100000])
    cpu.mem_write(0x80000330, pack("<I", 1 << 15))
    if release_fix:
        for offset, (before, after) in RELEASE_FIX.items():
            if unpack_from("<I", rom, offset)[0] != before:
                raise ValueError(f"Unexpected instruction at {offset:#x}")
            cpu.mem_write(BASE + offset, pack("<I", after))
    call(cpu, 0x102C4)
    cpu.mem_write(0x205F5005, b"\x01")
    cpu.mem_write(0x200DF8ED, b"\x04")
    trace = []
    for tick, adc in enumerate([675] * hold + [1023] * 6):
        cpu.mem_write(0x80000A84, pack("<I", 0x07000000 | adc))
        call(cpu, 0x106C8)
        if (tick % drain_every == 0 or tick >= hold) and call(cpu, 0x103D0):
            raw = call(cpu, 0x103F0)
            kind = call(cpu, 0x103FC)
            trace.append(
                {
                    "tick": tick,
                    "adc": adc,
                    "raw": raw,
                    "kind": kind,
                    "firmwareKey": call(cpu, 0x204A4, raw, kind),
                }
            )
    result = {
        "holdSamples": hold,
        "drainEvery": drain_every,
        "finalRaw": cpu.mem_read(0x205F5006, 1)[0],
        "releaseEvents": sum(event["firmwareKey"] == 30 for event in trace),
        "repeatEvents": sum(event["kind"] == 5 for event in trace),
        "trace": trace,
    }
    expected = int(release_fix or hold < 80)
    if result["finalRaw"] != 255 or result["releaseEvents"] != expected:
        raise RuntimeError(f"Unexpected release sequence for {hold}, {drain_every}")
    if hold == 80 and not result["repeatEvents"]:
        raise RuntimeError("The long hold did not exercise autorepeat")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("rom", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument(
        "--release-fix",
        action="store_true",
        help="test an experimental five-word release fix in the ARM test instance",
    )
    args = parser.parse_args()
    if args.output and args.output.resolve() == args.rom.resolve():
        parser.error("The output must differ from the input ROM")
    rom = args.rom.read_bytes()
    if sha256(rom).hexdigest() != ROM_SHA256:
        parser.error("The verified original Kingston 2.12 ROM is required")
    scope = "Original ADC scanner and translators in GNEX mode 4, isolated from the OS main loop."
    if args.release_fix:
        scope = (
            "Experimental five-word release predicate fix in isolated ARM memory. "
            "Boot and physical player behavior remain untested."
        )
    report = {
        "scope": scope,
        "firmware": ROM_SHA256,
        "cases": [
            replay(rom, hold, drain, args.release_fix)
            for hold in (4, 20, 40, 80)
            for drain in (1, 4, 20)
        ],
    }
    if args.release_fix:
        for case in report["cases"]:
            original = replay(rom, case["holdSamples"], case["drainEvery"], False)
            before = [e for e in original["trace"] if e["firmwareKey"] != 30]
            after = [e for e in case["trace"] if e["firmwareKey"] != 30]
            if before != after:
                raise RuntimeError("The experimental fix changed press/repeat events")
        report["otherEventsMatchOriginal"] = True
        report["patchWords"] = [
            {"offset": hex(offset), "before": hex(before), "after": hex(after)}
            for offset, (before, after) in RELEASE_FIX.items()
        ]
    text = json.dumps(report, indent=2) + "\n"
    if args.output:
        args.output.write_text(text, encoding="utf-8")
    else:
        print(text, end="")


if __name__ == "__main__":
    main()
