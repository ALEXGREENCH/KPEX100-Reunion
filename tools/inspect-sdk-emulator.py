"""Disassemble hash-locked SDK 2.12 VM/event/timer evidence without execution.

Optional dependency: capstone==5.0.7. Reads a PE as data, never loads its DLLs.
Addresses are valid only for the preserved SDK 2.12 Emulator.exe hash below.
"""

import argparse
import hashlib
import json
from pathlib import Path

from pe_reader import Pe32

IDENTITY = "81ed4493f5b50748b332f63476634bd7ba82c96f059e816b741eb4bb4f918e0a"
RANGES = {
    "loader_vm_version_branch": (0x442D25, 0x442DCE),
    "modern_vm_event_interpreter": (0x41B6C0, 0x41B78E),
    "modern_keypress_entry": (0x41B790, 0x41B7AD),
    "legacy_release_filter": (0x443BB8, 0x443BE1),
    "host_key_callback": (0x44BF90, 0x44BFBF),
    "event_dispatch_entry": (0x442820, 0x442884),
    "queue_full": (0x4485A0, 0x4485BC),
    "queue_empty": (0x4485C0, 0x4485D4),
    "queue_pop": (0x4485E0, 0x448614 + 1),
    "queue_push": (0x448620, 0x448665),
    "set_timer0": (0x421D80, 0x421DBC),
    "set_timer1": (0x421DC0, 0x421DFC),
    "set_timer2": (0x421E00, 0x421E3C),
    "reset_timer0": (0x414530, 0x414543),
    "reset_timer1": (0x414550, 0x414563),
    "reset_timer2": (0x414570, 0x414583),
    "timer_minimum_gate": (0x42FEA0, 0x42FEE4),
    "timer_reset_bridge": (0x42FEF0, 0x42FF22),
    "windows_timer_bridge": (0x407B90, 0x407BE8),
    "windows_timer_callback_channels": (0x407C2B, 0x407CFA),
}


def inspect(source):
    if source.stat().st_size != 1228800:
        raise ValueError("Expected the exact SDK 2.12 Emulator.exe size")
    data = source.read_bytes()
    if hashlib.sha256(data).hexdigest() != IDENTITY:
        raise ValueError("Unexpected Emulator.exe SHA-256; fixed addresses are invalid")
    from capstone import Cs, CS_ARCH_X86, CS_MODE_32
    from capstone.x86 import X86_OP_IMM, X86_OP_MEM

    pe = Pe32(data)
    disassembler = Cs(CS_ARCH_X86, CS_MODE_32)
    disassembler.detail = True
    snippets = {}
    for label, (start, end) in RANGES.items():
        offset = pe.va_offset(start)
        pe.require(offset, end - start)
        raw = data[offset : offset + end - start]
        instructions = list(disassembler.disasm(raw, start))
        if sum(item.size for item in instructions) != len(raw):
            raise ValueError("Incomplete instruction boundary: " + label)
        snippets[label] = {
            "va": hex(start),
            "endExclusive": hex(end),
            "fileOffset": offset,
            "bytes": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest(),
            "instructions": [
                {
                    "va": hex(item.address),
                    "bytes": item.bytes.hex(),
                    "mnemonic": item.mnemonic,
                    "operands": item.op_str,
                }
                for item in instructions
            ],
        }
    # Initializer instructions, not a guessed file-backed pointer table.
    start, end = 0x41D070, 0x41E5B0
    offset = pe.va_offset(start)
    initializers = []
    for item in disassembler.disasm(data[offset : offset + end - start], start):
        if item.mnemonic != "mov" or len(item.operands) != 2:
            continue
        dest, value = item.operands
        if (
            dest.type != X86_OP_MEM
            or value.type != X86_OP_IMM
            or dest.mem.base
            or dest.mem.index
        ):
            continue
        index, remainder = divmod(dest.mem.disp - 0x53B3C4, 4)
        if remainder or not 0 <= index < 908:
            continue
        pe.va_offset(value.imm)
        initializers.append(
            {
                "syscall": index,
                "handler": hex(value.imm),
                "assignmentVa": hex(item.address),
            }
        )
    by_id = {item["syscall"]: item["handler"] for item in initializers}
    for number, expected in [
        (2, "0x41e710"),
        (0x95, "0x421d80"),
        (0x96, "0x421dc0"),
        (0x97, "0x421e00"),
    ]:
        if by_id.get(number) != expected:
            raise ValueError("Known syscall initializer changed")
    return {
        "schema": 1,
        "source": {
            "name": "SDK 2.12 Emulator.exe",
            "bytes": len(data),
            "sha256": IDENTITY,
        },
        "method": "Static Capstone x86 disassembly of bounded ranges and immediate assignments in the syscall initializer; no historical native code execution.",
        "limits": "SDK Windows behavior does not prove all phone/OEM firmware behavior. Immediate assignments are a partial handler inventory, not proof of which functions work.",
        "releaseMapping": {
            "tableVa": "0x50f254",
            "buttonIndex": 47,
            "value": pe.u32(pe.va_offset(0x50F254 + 47 * 4)),
        },
        "immediateSyscallInitializers": initializers,
        "snippets": snippets,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("emulator", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Output must be new")
    report = inspect(args.emulator)
    with args.output.open("x", encoding="utf8", newline="\n") as stream:
        stream.write(json.dumps(report, indent=2) + "\n")
    print(
        json.dumps(
            {
                "ranges": len(report["snippets"]),
                "immediateInitializers": len(report["immediateSyscallInitializers"]),
                "release": report["releaseMapping"]["value"],
            }
        )
    )


if __name__ == "__main__":
    main()
