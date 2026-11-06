"""Inspect hash-locked GVM2X chat bytecode and optionally emulate one callback.

No Windows executable is launched. --reference executes only the verified
25-byte x86 LockChatMode callback in private Unicorn memory, with no OS/imports.
Dependencies for that mode: unicorn==2.1.4; static disassembly: capstone==5.0.9.
"""

import argparse
import hashlib
import json
from pathlib import Path
import struct

from pe_reader import Pe32

IDENTITY = "2bcc2554605bc277a99ff1220db1a509f875c207221647f806d0fff3efd66f88"
TABLE = 0x494A68
LOCK = 0x527639
MODE = 0x527638
TOP = 0x527708
STACK = 0x52770C
RANGES = {
    "byte_dispatch": (0x41E3B0, 0x41E41D),
    "lock_chat_mode": (0x41C280, 0x41C299),
    "set_chat_mode_selection": (0x41C2A0, 0x41C2E7),
    "chat_screen_redraw": (0x41C2F0, 0x41C3AF),
    "chat_initial_values": (0x41E331, 0x41E38C),
    "call_key_and_standalone_gate": (0x41E500, 0x41E550),
}


def inspect(source):
    data = source.read_bytes()
    if len(data) != 1056768 or hashlib.sha256(data).hexdigest() != IDENTITY:
        raise ValueError("Expected the exact preserved GVM2X PE identity")
    from capstone import Cs, CS_ARCH_X86, CS_MODE_32

    pe = Pe32(data)
    disassembler = Cs(CS_ARCH_X86, CS_MODE_32)
    callbacks = list(struct.unpack_from("<243I", data, pe.va_offset(TABLE)))
    for callback in callbacks:
        pe.va_offset(callback)
    if callbacks[0xBA] != 0x41C280 or callbacks[0xBB] != 0x41C2A0:
        raise ValueError("Unexpected legacy chat dispatch targets")
    ranges = {}
    for label, (start, end) in RANGES.items():
        body = data[pe.va_offset(start) : pe.va_offset(end)]
        instructions = list(disassembler.disasm(body, start))
        if sum(instruction.size for instruction in instructions) != len(body):
            raise ValueError("Incomplete instruction boundary: " + label)
        ranges[label] = {
            "va": hex(start),
            "endExclusive": hex(end),
            "bytesHex": body.hex(),
            "sha256": hashlib.sha256(body).hexdigest(),
            "instructions": [
                {
                    "va": hex(i.address),
                    "bytes": i.bytes.hex(),
                    "mnemonic": i.mnemonic,
                    "operands": i.op_str,
                }
                for i in instructions
            ],
        }
    return data, {
        "schema": 1,
        "sourceSha256": IDENTITY,
        "sourceBytes": len(data),
        "dispatchTableVA": hex(TABLE),
        "callbacks": [
            {"opcode": opcode, "va": hex(address)}
            for opcode, address in enumerate(callbacks)
        ],
        "ranges": ranges,
        "interpretation": "Opcode BA pops one 16-bit VM slot and stores its low byte verbatim. No return slot. BB and native phone-call-key behavior use this state; only the BA callback is executed by the optional reference. Standalone service mode 1 initializes the lock to 1 and gates off call-key chat entry.",
        "limits": "Addresses apply only to this received PE hash. The original filename does not prove an untouched vendor release. No full Windows program, GUI, network or phone is executed; this does not prove full-game equivalence to every OEM interpreter.",
    }


def reference(data):
    import unicorn
    from unicorn import Uc, UC_ARCH_X86, UC_MODE_32
    from unicorn.x86_const import UC_X86_REG_EIP, UC_X86_REG_ESP

    pe = Pe32(data)
    cpu = Uc(UC_ARCH_X86, UC_MODE_32)
    cpu.mem_map(0x41C000, 0x1000)
    start, end = RANGES["lock_chat_mode"]
    cpu.mem_write(start, data[pe.va_offset(start) : pe.va_offset(end)])
    cpu.mem_map(0x527000, 0x2000)
    cpu.mem_map(0x1000000, 0x2000)
    host_sp, stop = 0x1000800, 0x1001000
    cpu.mem_write(host_sp, struct.pack("<I", stop))

    def call(value, top, previous):
        cpu.mem_write(TOP, struct.pack("<i", top))
        cpu.mem_write(STACK + top * 2, struct.pack("<H", value & 0xFFFF))
        cpu.mem_write(LOCK, bytes([previous]))
        cpu.reg_write(UC_X86_REG_ESP, host_sp)
        before = bytes(cpu.mem_read(0x527000, 0x2000))
        cpu.emu_start(start, stop, count=32)
        if (
            cpu.reg_read(UC_X86_REG_EIP) != stop
            or cpu.reg_read(UC_X86_REG_ESP) != host_sp + 4
        ):
            raise ValueError("Callback did not return to its isolated sentinel")
        after = bytes(cpu.mem_read(0x527000, 0x2000))
        top_after = struct.unpack_from("<i", after, TOP - 0x527000)[0]
        lock_after = after[LOCK - 0x527000]
        expected = bytearray(before)
        struct.pack_into("<i", expected, TOP - 0x527000, top - 1)
        expected[LOCK - 0x527000] = value & 255
        if after != expected:
            raise ValueError("Unexpected VM memory effect")
        return {
            "inputSigned16": value,
            "topBefore": top,
            "lockBefore": previous,
            "topAfter": top_after,
            "lockAfter": lock_after,
            "allOtherVmBytesUnchanged": True,
        }

    values = [-32768, -257, -256, -1, 0, 1, 2, 255, 256, 257, 32767]
    vectors = [
        call(value, top, previous)
        for top in (0, 3, 63)
        for previous in (0, 1, 255)
        for value in values
    ]
    # The original callback has no branches: exhaustive inputs also verify that
    # the stored byte is not normalized to a boolean. Keep a compact digest.
    digest = hashlib.sha256()
    for value in range(65536):
        cpu.mem_write(TOP, struct.pack("<i", 0))
        cpu.mem_write(STACK, struct.pack("<H", value))
        cpu.reg_write(UC_X86_REG_ESP, host_sp)
        cpu.emu_start(start, stop, count=32)
        top_after = struct.unpack("<i", cpu.mem_read(TOP, 4))[0]
        lock_after = cpu.mem_read(LOCK, 1)[0]
        if (
            top_after != -1
            or lock_after != value & 255
            or cpu.reg_read(UC_X86_REG_EIP) != stop
        ):
            raise ValueError("Exhaustive callback mismatch")
        digest.update(struct.pack("<HBi", value, lock_after, top_after))
    return {
        "unicornVersion": unicorn.__version__,
        "vectors": vectors,
        "exhaustiveUnsigned16Inputs": 65536,
        "exhaustiveResultSha256": digest.hexdigest(),
        "digestRecord": "Little-endian uint16 input, uint8 actualLock, int32 actualTopAfter for ascending inputs 0..65535, SHA256.",
        "isolation": "Only the verified 25-byte callback is mapped as code. Private VM data and a return sentinel, 32-instruction cap, no OS/import callbacks, no Windows loader.",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--reference", action="store_true")
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Output must be new")
    data, result = inspect(args.source)
    if args.reference:
        result["isolatedReference"] = reference(data)
    with args.output.open("x", encoding="utf8") as stream:
        stream.write(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(
        json.dumps(
            {
                "sourceSha256": IDENTITY,
                "ranges": len(result["ranges"]),
                "reference": args.reference,
            }
        )
    )


if __name__ == "__main__":
    main()
