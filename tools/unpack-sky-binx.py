"""Decode a SKY feature-phone BINX update into its PDL image."""

import argparse
import hashlib
import io
import json
from pathlib import Path
import sys
import zipfile


KEY = b"mobileLeader Ins"
BLOCK_SIZE = 0x40000
MAX_PACKED_SIZE = 0x100000


def decode_block(packed, aes):
    # Each chunk resets CBC and leaves a short tail outside the cipher.
    aligned = len(packed) // aes.block_size * aes.block_size
    cipher = aes.new(KEY, aes.MODE_CBC, iv=bytes(aes.block_size))
    archive = cipher.decrypt(packed[:aligned]) + packed[aligned:]
    with zipfile.ZipFile(io.BytesIO(archive)) as block:
        entries = block.infolist()
        if len(entries) != 1 or entries[0].is_dir():
            raise ValueError("expected one ZIP file member")
        entry = entries[0]
        if not 0 < entry.file_size <= BLOCK_SIZE:
            raise ValueError("unexpected unpacked block size")
        data = block.read(entry)
        if len(data) != entry.file_size:
            raise ValueError("incorrect unpacked block size")
        return data


def unpack(source, output, aes):
    source_hash = hashlib.sha256()
    output_hash = hashlib.sha256()
    chunks = input_bytes = output_bytes = 0
    previous_size = BLOCK_SIZE
    while header := source.read(4):
        packed_size = int.from_bytes(header, "little")
        if len(header) != 4 or not 0 < packed_size <= MAX_PACKED_SIZE:
            raise ValueError(f"invalid block length at {input_bytes:#x}")
        if previous_size != BLOCK_SIZE:
            raise ValueError(f"short non-final block before {input_bytes:#x}")
        packed = source.read(packed_size)
        if len(packed) != packed_size:
            raise ValueError(f"truncated block at {input_bytes:#x}")
        try:
            decoded = decode_block(packed, aes)
        except (
            ValueError,
            RuntimeError,
            zipfile.BadZipFile,
            NotImplementedError,
        ) as error:
            raise ValueError(f"invalid ZIP at {input_bytes:#x}: {error}") from error
        output.write(decoded)
        source_hash.update(header)
        source_hash.update(packed)
        output_hash.update(decoded)
        previous_size = len(decoded)
        input_bytes += 4 + packed_size
        output_bytes += previous_size
        chunks += 1
    if chunks == 0:
        raise ValueError("empty BINX")
    return {
        "chunks": chunks,
        "inputBytes": input_bytes,
        "inputSha256": source_hash.hexdigest(),
        "outputBytes": output_bytes,
        "outputSha256": output_hash.hexdigest(),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    try:
        from Crypto.Cipher import AES
    except ImportError:
        parser.exit(1, "Install PyCryptodome with python -m pip install pycryptodome\n")

    created = False
    try:
        with args.input.open("rb") as source, args.output.open("xb") as output:
            created = True
            result = unpack(source, output, AES)
    except (OSError, ValueError, KeyboardInterrupt) as error:
        if created:
            args.output.unlink(missing_ok=True)
        print(error, file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
