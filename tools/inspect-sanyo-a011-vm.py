"""Static constant propagation of the original pointer-table initializer only.

No CPU emulation or vendor program execution. R9/SB is represented as zero,
so stores are keyed by offsets relative to the unknown native data base.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import stat
import struct
import sys


SOURCE_BYTES = 14_614_532
SOURCE_SHA256 = "07fe2747ec2e4e9eadb4f32b79fb47d560249d13d50a228f6e0d73bccba29a80"


def read_source(path):
    """Bound the regular-file read and require the exact reviewed original."""
    if path.is_symlink():
        raise ValueError("Input must be a regular file, not a symbolic link")
    before = path.stat()
    if not stat.S_ISREG(before.st_mode) or before.st_size != SOURCE_BYTES:
        raise ValueError(f"Expected a regular {SOURCE_BYTES}-byte Sanyo A011 BIN")
    with path.open("rb") as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size != SOURCE_BYTES:
            raise ValueError(f"Expected a regular {SOURCE_BYTES}-byte Sanyo A011 BIN")
        raw = stream.read(SOURCE_BYTES + 1)
    if len(raw) != SOURCE_BYTES or hashlib.sha256(raw).hexdigest() != SOURCE_SHA256:
        raise ValueError(
            "Sanyo A011 source size/SHA-256 does not match the reviewed original"
        )
    return raw


def resolve(raw):
    try:
        import capstone
        from capstone.arm import ARM_OP_IMM, ARM_OP_MEM, ARM_OP_REG
    except ImportError as error:
        raise ValueError(
            "Capstone is required; install the desktop requirements"
        ) from error

    md = capstone.Cs(capstone.CS_ARCH_ARM, capstone.CS_MODE_THUMB)
    md.detail = True
    registers = {"sb": 0}
    stores = {}
    trace = []
    pc = 0x4D6640

    def operand_value(op, at):
        if op.type == ARM_OP_IMM:
            return op.imm
        if op.type != ARM_OP_REG:
            raise ValueError("Unexpected initializer operand")
        name = md.reg_name(op.reg)
        if name == "pc":
            return at + 4
        if name not in registers:
            raise ValueError("Initializer references an unresolved register: " + name)
        return registers[name]

    for _ in range(5000):
        ins = next(md.disasm(raw[pc : pc + 4], pc, count=1), None)
        if ins is None:
            raise ValueError("Cannot decode initializer at " + hex(pc))
        trace.append(
            {
                "offset": hex(pc),
                "bytes": ins.bytes.hex(),
                "instruction": ins.mnemonic + " " + ins.op_str,
            }
        )
        ops = ins.operands
        if ins.mnemonic == "ldr":
            if (
                ops[0].type != ARM_OP_REG
                or ops[1].type != ARM_OP_MEM
                or md.reg_name(ops[1].mem.base) != "pc"
            ):
                raise ValueError("Only literal loads are expected in this initializer")
            literal = ((pc + 4) & ~3) + ops[1].mem.disp
            if literal < 0 or literal + 4 > len(raw):
                raise ValueError("Initializer literal is outside the source")
            registers[md.reg_name(ops[0].reg)] = struct.unpack_from("<I", raw, literal)[
                0
            ]
            trace[-1]["literalOffset"] = hex(literal)
        elif ins.mnemonic in ("add", "adds", "mov", "movs", "lsls"):
            dest = md.reg_name(ops[0].reg)
            if dest == "pc":
                if ins.op_str != "pc, lr":
                    raise ValueError("Unexpected initializer return")
                break
            if ins.mnemonic.startswith("mov"):
                value = operand_value(ops[1], pc)
            elif ins.mnemonic == "lsls":
                value = operand_value(ops[1], pc) << operand_value(ops[2], pc)
            elif len(ops) == 3:
                value = operand_value(ops[1], pc) + operand_value(ops[2], pc)
            else:
                value = operand_value(ops[0], pc) + operand_value(ops[1], pc)
            registers[dest] = value & 0xFFFFFFFF
        elif ins.mnemonic == "str":
            if ops[1].type != ARM_OP_MEM:
                raise ValueError("Unexpected initializer store")
            base_register = md.reg_name(ops[1].mem.base)
            if base_register not in registers:
                raise ValueError("Initializer store base is unresolved")
            at = registers[base_register] + ops[1].mem.disp
            if at in stores:
                raise ValueError("Initializer writes a dispatch slot more than once")
            stores[at] = {
                "value": operand_value(ops[0], pc),
                "storeOffset": hex(pc),
                "storeBytes": ins.bytes.hex(),
            }
        elif ins.mnemonic == "b":
            destination = ops[0].imm
            if not 0x4D6640 <= destination <= 0x4D6EA8:
                raise ValueError("Initializer branch leaves the reviewed range")
            pc = destination
            continue
        else:
            raise ValueError(
                f"Unsupported static initializer instruction: {hex(pc)} {ins.mnemonic} {ins.op_str}"
            )
        pc += ins.size
    else:
        raise ValueError("Initializer trace did not return")

    base = 0x1CA8
    if pc != 0x4D6EA8 or set(stores) != set(range(base, base + 0xF0 * 4, 4)):
        raise ValueError("Initializer return or dispatch-slot coverage differs")
    entries = []
    for opcode in range(0xF0):
        record = stores[base + opcode * 4]
        if not record["value"] & 1:
            raise ValueError("Dispatch target does not carry the Thumb bit")
        offset = record["value"] & ~1
        if not 0x4C4000 <= offset < 0x4D8F00:
            raise ValueError("Dispatch target is outside the reviewed native code")
        entries.append(
            {
                "opcode": hex(opcode),
                "tableOffsetFromSb": hex(base + opcode * 4),
                "handlerFileOffset": hex(offset),
                "handlerThumbPointer": hex(record["value"]),
                **{k: v for k, v in record.items() if k != "value"},
            }
        )
    return {
        "sourceSha256": hashlib.sha256(raw).hexdigest(),
        "method": __doc__,
        "initializerFileOffset": "0x4d6640",
        "returnFileOffset": hex(pc),
        "tableOffsetFromSb": hex(base),
        "entries": entries,
        "trace": trace,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Exact SCP_A011_K2_V2000.bin")
    parser.add_argument(
        "output", type=Path, help="New JSON file in an existing directory"
    )
    args = parser.parse_args()
    if args.output.exists() or args.output.is_symlink():
        raise ValueError("Output already exists; choose a new JSON path")
    raw = read_source(args.input)
    report = resolve(raw)
    # Match repository LF normalization and produce the same bytes on any host.
    encoded = (json.dumps(report, indent=2) + "\n").encode("utf-8")
    # Exclusive creation is also required here to close a concurrent-create race.
    with args.output.open("xb") as stream:
        stream.write(encoded)
    print(
        json.dumps(
            {
                "tableEntries": len(report["entries"]),
                "instructions": len(report["trace"]),
                "return": report["returnFileOffset"],
            }
        )
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
