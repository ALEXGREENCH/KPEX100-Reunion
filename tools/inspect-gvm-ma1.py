"""Trace the hash-locked GVM SDK MA1 parser and WinMM scheduling in Unicorn.

Only the recorded x86 routines run. MIDI, timers and allocation are intercepted;
there is no OS loader, native thread, driver, port I/O or physical sound output.
Requires unicorn==2.1.4. This is an SDK reference, not Yamaha chip emulation.
"""

import argparse
import hashlib
import heapq
import json
from pathlib import Path
import struct

from pe_reader import Pe32

IDENTITY = "2bcc2554605bc277a99ff1220db1a509f875c207221647f806d0fff3efd66f88"
SGS = "37a3310b683e47b90e070e8772ac3ad267be172d11799f1168a2350fe448eec8"
RESOURCE_HASHES = [
    "1a1aff36ad684dd4bf725e56a9764826bc7f6bf56c75b1c13087bac49df57a2c",
    "7a74fe8459179734bd49b70f5236d24104aaf7a13174514d7334cc8ac7d3c281",
    "9e6f1cbea65ca44d8c02c21caa40ab4be830772cfef4f4ba85aade61e1d3834c",
    "dcf4928a2019a996ff6bca16a47dfa1d2314507f953db2b1d20fe00cd8374644",
    "0d0bd18596cb212e68ed7c3ebb03e65297eb1d5ca140d14109e2dd04c0f9a167",
]


def synthetic(template, words):
    result = bytearray(template[:86]) + struct.pack("<" + "H" * len(words), *words)
    struct.pack_into("<H", result, 2, len(result) - 2)
    return result.hex()


def inspect(source, fixtures):
    from unicorn import Uc, UC_ARCH_X86, UC_MODE_32, UC_HOOK_CODE
    from unicorn.x86_const import (
        UC_X86_REG_ESP,
        UC_X86_REG_EAX,
        UC_X86_REG_ECX,
        UC_X86_REG_EIP,
    )

    data = source.read_bytes()
    if len(data) != 1056768 or hashlib.sha256(data).hexdigest() != IDENTITY:
        raise ValueError("Expected the exact preserved GVM2X PE")
    pe = Pe32(data)
    if fixtures.get("sgsSha256") != SGS or len(fixtures.get("resources", [])) != 5:
        raise ValueError("Expected five original WI-TOP MA1 resources")
    for i, row in enumerate(fixtures["resources"]):
        body = bytes.fromhex(row["hex"])
        if row["i"] != i + 45 or hashlib.sha256(body).hexdigest() != RESOURCE_HASHES[i]:
            raise ValueError("Original resource identity mismatch")
    template = bytes.fromhex(fixtures["resources"][0]["hex"])
    samples = [
        {"name": "resource" + str(row["i"]), "hex": row["hex"]}
        for row in fixtures["resources"]
    ]
    samples += [
        {
            "name": "all-blocks-pitch-codes-and-channels",
            "hex": synthetic(
                template,
                [
                    (block << 14) | (pitch << 10) | (channel << 8) | 8
                    for block in range(4)
                    for pitch in range(16)
                    for channel in range(4)
                ],
            ),
        },
        {
            "name": "all-interval-and-gate-codes",
            "hex": synthetic(
                template,
                [
                    0xBC00 | ((interval % 4) << 8) | (interval << 3) | gate
                    for interval in range(16)
                    for gate in range(8)
                ]
                + [0x3008],
            ),
        },
        {
            "name": "all-eight-voice-changes",
            "hex": synthetic(
                template,
                [
                    word
                    for voice in range(8)
                    for word in [
                        0x3088 | ((voice % 4) << 8) | voice,
                        0xBC08 | ((voice % 4) << 8),
                    ]
                ],
            ),
        },
    ]
    results = []
    for fixture in samples:
        cpu = Uc(UC_ARCH_X86, UC_MODE_32)
        for address, size in [
            (0x403000, 0x1000),
            (0x462000, 0x1000),
            (0x46D000, 0x2000),
            (0x48C000, 0x1000),
            (0x499000, 0x2000),
            (0x600000, 0x40000),
            (0x700000, 0x1000),
            (0x1000000, 0x2000),
        ]:
            cpu.mem_map(address, size)
        for address, size in [
            (0x403000, 0x1000),
            (0x46D000, 0x2000),
            (0x499000, 0x1000),
            (0x48C000, 0x1000),
        ]:
            offset = pe.va_offset(address)
            if pe.va_offset(address + size - 1) != offset + size - 1:
                raise ValueError("Reference image range is not contiguous")
            cpu.mem_write(address, data[offset : offset + size])
        imports = [
            (0x46D54C, "open", 20),
            (0x46D548, "midi", 8),
            (0x46D554, "close", 4),
            (0x46D550, "kill", 4),
            (0x46D558, "timer", 20),
            (0x46D588, "caps", 8),
            (0x46D584, "begin", 4),
            (0x46D570, "end", 4),
        ]
        stubs = {}
        for i, (iat, name, extra) in enumerate(imports):
            address = 0x700000 + i * 16
            cpu.mem_write(iat, struct.pack("<I", address))
            stubs[address] = (name, extra)
        timers, pending, events, words, timer_calls = {}, [], [], [], []
        state = {"now": 0, "next": 1, "malloc": 0x610000, "steps": 0}

        def u32(address):
            return struct.unpack("<I", cpu.mem_read(address, 4))[0]

        def ret(extra=0, result=0):
            sp = cpu.reg_read(UC_X86_REG_ESP)
            target = u32(sp)
            cpu.reg_write(UC_X86_REG_ESP, sp + 4 + extra)
            cpu.reg_write(UC_X86_REG_EAX, result)
            cpu.reg_write(UC_X86_REG_EIP, target)

        def hook(_, address, size, user):
            state["steps"] += 1
            if state["steps"] > 2000000:
                raise ValueError("Native fixture instruction limit")
            sp = cpu.reg_read(UC_X86_REG_ESP)
            if address == 0x4034EA:
                words.append(
                    {
                        "index": u32(0x499BC8),
                        "block": cpu.reg_read(UC_X86_REG_ECX) & 3,
                        "noteCode": u32(sp + 0x34) & 255,
                        "channel": u32(sp + 0x18) & 255,
                        "intervalCode": u32(sp + 0x20) & 255,
                        "gateCode": u32(sp + 0x1C) & 255,
                        "sdkGateTicks": u32(sp + 0x2C) & 255,
                        "sdkIntervalTicks": u32(sp + 0x14) & 255,
                    }
                )
            elif address == 0x462DCE:
                size = u32(sp + 4)
                if size > 0x10000 or state["malloc"] + size > 0x640000:
                    raise ValueError("Native allocation limit")
                ret(result=state["malloc"])
                state["malloc"] += ((size + 15) // 16) * 16
            elif address == 0x462DF7:
                ret()
            elif address in stubs:
                name, extra = stubs[address]
                args = [u32(sp + 4 + i * 4) for i in range(extra // 4)]
                result = 0
                if name == "open":
                    cpu.mem_write(args[0], struct.pack("<I", 0x1234))
                elif name == "midi":
                    msg = args[1]
                    events.append(
                        {
                            "atMs": state["now"],
                            "status": msg & 0xF0,
                            "channel": msg & 15,
                            "a": (msg >> 8) & 255,
                            "b": (msg >> 16) & 255,
                        }
                    )
                elif name == "timer":
                    delay, resolution, callback, param, flags = args
                    if callback != 0x403340 or param > 4 or flags != 0:
                        raise ValueError("Unexpected native timer request")
                    result = state["next"]
                    state["next"] += 1
                    timers[result] = (state["now"] + delay, param)
                    heapq.heappush(pending, (state["now"] + delay, result))
                    timer_calls.append(
                        {
                            "atMs": state["now"],
                            "delayMs": delay,
                            "resolutionMs": resolution,
                            "user": param,
                        }
                    )
                elif name == "kill":
                    timers.pop(args[0], None)
                elif name == "caps":
                    cpu.mem_write(args[0], struct.pack("<II", 1, 1000000))
                ret(extra, result)

        cpu.hook_add(UC_HOOK_CODE, hook)

        def call(address, args):
            cpu.mem_write(0x1000000, bytes(0x2000))
            cpu.mem_write(
                0x1000800, struct.pack("<" + "I" * (len(args) + 1), 0x1001000, *args)
            )
            cpu.reg_write(UC_X86_REG_ESP, 0x1000800)
            cpu.emu_start(address, 0x1001000, count=200000)
            if cpu.reg_read(UC_X86_REG_EIP) != 0x1001000:
                raise ValueError("Native call exceeded its instruction bound")

        body = bytes.fromhex(fixture["hex"])
        cpu.mem_write(0x600000, body)
        call(0x403750, [0x600002, (len(body) - 2) // 2, 2])
        init = {
            "wholeNoteMs": u32(0x499B6C),
            "timerMinimumMs": u32(0x499B00),
            "sequenceWords": u32(0x499BC4),
            "baseNotes": list(cpu.mem_read(0x499B14, 0x50))[::20],
            "voiceSlots": list(cpu.mem_read(0x499B16, 0x50))[::20],
        }
        callbacks = 0
        while pending:
            now, identity = heapq.heappop(pending)
            if identity not in timers:
                continue
            _, param = timers.pop(identity)
            state["now"] = now
            callbacks += 1
            if callbacks > 10000 or now > 180000:
                raise ValueError("Native scheduler limit")
            call(0x403340, [identity, 0, param, 0, 0])
        if u32(0x499BC0) != 0 or len(words) != (len(body) - 86) // 2:
            raise ValueError("Native player did not consume and release its score")
        results.append(
            {
                "name": fixture["name"],
                "payloadHex": body.hex(),
                "payloadSha256": hashlib.sha256(body).hexdigest(),
                "init": init,
                "words": words,
                "midi": events,
                "timers": timer_calls,
                "durationMs": state["now"],
                "callbacks": callbacks,
                "instructions": state["steps"],
            }
        )
    return {
        "schema": 1,
        "sourceSha256": IDENTITY,
        "sgsSha256": SGS,
        "initializationVA": "0x403750",
        "timerCallbackVA": "0x403340",
        "wordObservationVA": "0x4034ea",
        "endianArgument": 2,
        "windowsTimerCaps": {"minimum": 1, "maximum": 1000000},
        "sdkIntervalTicks": list(data[pe.va_offset(0x46DA90) : pe.va_offset(0x46DAA0)]),
        "sdkGateTicks": list(data[pe.va_offset(0x46DAA0) : pe.va_offset(0x46DAB0)]),
        "vectors": results,
        "scope": "Original x86 SDK code chooses fields, GM programs, MIDI notes and WinMM delays. Imports and allocation are intercepted, with deterministic timer ordering. No Windows loader, driver, thread or physical audio runs. Reserved pitch/block combinations in synthetic fixtures characterize SDK parsing only. The results do not establish Yamaha FM timbre, hardware timing, or real Windows timer jitter.",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("fixtures", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Output must be new")
    result = inspect(args.source, json.loads(args.fixtures.read_text("utf8")))
    args.output.write_text(json.dumps(result, indent=2) + "\n", "utf8")
    print(
        json.dumps(
            {
                "vectors": len(result["vectors"]),
                "words": sum(len(row["words"]) for row in result["vectors"]),
                "sourceSha256": IDENTITY,
            }
        )
    )


if __name__ == "__main__":
    main()
