"""Record buzzer timing from a hash-locked GVM PE in isolated x86 Unicorn.

Only the bounded SDK tone-loop instructions run. Windows Beep/stop/wait calls
are intercepted as event records; no OS loader, device, thread or port I/O runs.
Optional dependencies: capstone==5.0.9 and unicorn==2.1.4.
"""

import argparse
import hashlib
import json
from pathlib import Path
import struct

from pe_reader import Pe32

IDENTITY = "2bcc2554605bc277a99ff1220db1a509f875c207221647f806d0fff3efd66f88"


def inspect(source, fixtures):
    from capstone import Cs, CS_ARCH_X86, CS_MODE_32
    from unicorn import Uc, UC_ARCH_X86, UC_MODE_32, UC_HOOK_CODE
    from unicorn.x86_const import UC_X86_REG_EIP, UC_X86_REG_ESP, UC_X86_REG_EAX

    data = source.read_bytes()
    if len(data) != 1056768 or hashlib.sha256(data).hexdigest() != IDENTITY:
        raise ValueError("Expected the exact preserved GVM2X executable")
    pe = Pe32(data)
    start, end = 0x401030, 0x4010F7
    raw = data[pe.va_offset(start) : pe.va_offset(end)]
    instructions = list(Cs(CS_ARCH_X86, CS_MODE_32).disasm(raw, start))
    if sum(i.size for i in instructions) != len(raw):
        raise ValueError("Incomplete loop instruction boundary")
    frequencies = list(struct.unpack_from("<37I", data, pe.va_offset(0x48C16C)))
    cpu = Uc(UC_ARCH_X86, UC_MODE_32)
    for address, size in [
        (0x401000, 0x1000),
        (0x46D000, 0x1000),
        (0x48C000, 0x1000),
        (0x600000, 0x10000),
        (0x700000, 0x1000),
        (0x1000000, 0x2000),
    ]:
        cpu.mem_map(address, size)
    cpu.mem_write(start, raw)
    cpu.mem_write(0x48C16C, struct.pack("<37I", *frequencies))
    cpu.mem_write(0x46D20C, struct.pack("<I", 0x700000))
    events = []
    state = {"atMs": 0, "ended": False}

    def ret(extra=0, result=0):
        sp = cpu.reg_read(UC_X86_REG_ESP)
        target = struct.unpack("<I", cpu.mem_read(sp, 4))[0]
        cpu.reg_write(UC_X86_REG_ESP, sp + 4 + extra)
        cpu.reg_write(UC_X86_REG_EAX, result)
        cpu.reg_write(UC_X86_REG_EIP, target)

    def hook(_, address, size, user):
        sp = cpu.reg_read(UC_X86_REG_ESP)
        if address == 0x401000:
            ret(result=1)  # Select native Windows Beep path; never query the OS.
        elif address == 0x700000:
            frequency, duration = struct.unpack("<II", cpu.mem_read(sp + 4, 8))
            events.append(
                {"atMs": state["atMs"], "frequency": frequency, "durationMs": duration}
            )
            state["atMs"] += duration
            ret(8, 1)
        elif address == 0x4011F0:
            duration = struct.unpack("<I", cpu.mem_read(sp + 4, 4))[0]
            events.append(
                {"atMs": state["atMs"], "frequency": 0, "durationMs": duration}
            )
            state["atMs"] += duration
            ret(4)
        elif address == 0x401310:
            ret()
        elif address == 0x4010F0:
            state["ended"] = True
            cpu.emu_stop()

    cpu.hook_add(UC_HOOK_CODE, hook)
    samples = fixtures + [
        {
            "name": "all-notes-rest-zero-and-byte-extremes",
            "hex": (
                b"\0\0"
                + b"".join(
                    bytes([note, duration])
                    for note in range(38)
                    for duration in [0, 1, 255]
                )
                + b"\x26\0"
            ).hex(),
        },
        {"name": "empty", "hex": "00002600"},
        {"name": "native-high-byte-terminator", "hex": "0000ff"},
    ]
    results = []
    for item in samples:
        payload = bytes.fromhex(item["hex"])
        if not 3 <= len(payload) <= 4096 or payload[:2] != b"\0\0":
            raise ValueError("Expected bounded subtype0 fixture")
        events.clear()
        state.update(atMs=0, ended=False)
        cpu.mem_write(0x600000, bytes(0x10000))
        cpu.mem_write(0x600008, struct.pack("<I", 0x600100))
        cpu.mem_write(0x600100, payload[2:])
        cpu.mem_write(0x1000800, struct.pack("<II", 0x1001000, 0x600000))
        cpu.reg_write(UC_X86_REG_ESP, 0x1000800)
        cpu.emu_start(start, 0x1001000, count=20000)
        if not state["ended"]:
            raise ValueError("Tone loop failed to reach its native terminator")
        results.append(
            {
                "name": item.get("name") or "resource" + str(item["i"]),
                "payloadHex": item["hex"],
                "payloadSha256": hashlib.sha256(payload).hexdigest(),
                "events": list(events),
                "durationMs": state["atMs"],
            }
        )
    return {
        "schema": 1,
        "sourceSha256": IDENTITY,
        "loopVA": hex(start),
        "loopEndExclusive": hex(end),
        "instructions": [
            {
                "va": hex(i.address),
                "bytes": i.bytes.hex(),
                "mnemonic": i.mnemonic,
                "operands": i.op_str,
            }
            for i in instructions
        ],
        "frequencyTableVA": "0x48c16c",
        "frequencies": frequencies,
        "vectors": results,
        "scope": "The hash-locked native loop selects frequency, multiplies duration and distinguishes notes, rest and terminator. Beep, waits and stop calls are intercepted; no Windows or speaker runs. This verifies events, not an exact physical speaker waveform or MA1 synthesis.",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("fixtures", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Output must be new")
    fixtures = json.loads(args.fixtures.read_text("utf8"))
    if (
        fixtures["sgsSha256"]
        != "37a3310b683e47b90e070e8772ac3ad267be172d11799f1168a2350fe448eec8"
    ):
        raise ValueError("Expected the original WI-TOP source identity")
    result = inspect(args.source, fixtures["resources"])
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf8")
    print(json.dumps({"vectors": len(result["vectors"]), "sourceSha256": IDENTITY}))


if __name__ == "__main__":
    main()
