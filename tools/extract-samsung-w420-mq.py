"""Extract Mini Game Heaven sprites using the SCH-W420 guest descriptor table."""

import argparse
from hashlib import sha256
import json
from pathlib import Path
import struct
from zlib import crc32


EADS_SHA256 = "ce0b74b65888f24aa0cd55e3cd4d9a4409145a0442017258b0f78d381f14f0d4"
TABLE_SHA256 = "1154f24035b9c568173d534da968d6c06b20d7cfe27d70c2752b12aef86032d4"
TEXT_BASE = 0xF4000000
BSS_BASE = 0xF5000000
EADS_HEADER_BYTES = 48
FIRMWARE_OFFSET = 0x12E7A3C
DESCRIPTOR = struct.Struct("<IHHIIB3x")
MQ_HEADER = struct.Struct("<2sHH")


def identity(data):
    return {
        "bytes": len(data),
        "sha256": sha256(data).hexdigest(),
        "crc32": f"{crc32(data):08x}",
    }


def decode(record, pixel_count, initial_index):
    packed = iter(record[MQ_HEADER.size :])
    history = bytearray([initial_index]) * 4096
    pixels = bytearray()
    try:
        while len(pixels) < pixel_count:
            flags = next(packed)
            for bit in range(7, -1, -1):
                if flags & (1 << bit):
                    value = next(packed)
                    history[len(pixels) % 4096] = value
                    pixels.append(value)
                else:
                    token = (next(packed) << 8) | next(packed)
                    start, length = token >> 4, (token & 15) + 3
                    for offset in range(min(length, pixel_count - len(pixels))):
                        value = history[(start + offset) % 4096]
                        history[len(pixels) % 4096] = value
                        pixels.append(value)
                if len(pixels) == pixel_count:
                    return bytes(pixels)
    except StopIteration as error:
        raise ValueError("truncated MQ pixel stream") from error
    raise ValueError("empty MQ pixel stream")


def extract(eads, table, output):
    if sha256(eads).hexdigest() != EADS_SHA256:
        raise ValueError("unexpected Mini Game Heaven EADS SHA-256")
    if sha256(table).hexdigest() != TABLE_SHA256:
        raise ValueError("unexpected guest descriptor table SHA-256")

    count, table_address = struct.unpack_from("<II", eads, EADS_HEADER_BYTES + 0xFF98)
    if len(table) != count * DESCRIPTOR.size:
        raise ValueError("unexpected guest descriptor table size")
    files = {}
    images = []
    empty = []
    previous_end = EADS_HEADER_BYTES
    ranges = []
    for index, (_, width, height, pointer, key, flag) in enumerate(
        DESCRIPTOR.iter_unpack(table)
    ):
        if pointer == 0 and flag == 0:
            empty.append(index)
            continue
        offset = pointer - TEXT_BASE + EADS_HEADER_BYTES
        if flag != 1 or not EADS_HEADER_BYTES <= offset <= len(eads) - MQ_HEADER.size:
            raise ValueError(f"invalid source for descriptor {index}")
        magic, pixel_count, size = MQ_HEADER.unpack_from(eads, offset)
        end = offset + size
        if (
            magic != b"MQ"
            or not width
            or not height
            or pixel_count != width * height
            or not offset + MQ_HEADER.size < end <= len(eads)
        ):
            raise ValueError(f"invalid MQ record for descriptor {index}")
        ranges.append((offset, end))
        original = eads[offset:end]
        pixels = decode(original, pixel_count, key & 0xFF)
        stem = f"{index:03d}-{offset:05x}"
        original_path = f"originals/{stem}.mq"
        pixel_path = f"indices/{stem}.idx"
        files[original_path] = original
        files[pixel_path] = pixels
        images.append(
            {
                "descriptor": index,
                "eadsOffset": offset,
                "firmwareOffset": FIRMWARE_OFFSET + offset,
                "width": width,
                "height": height,
                "transparencyField": key,
                "initialHistoryIndex": key & 0xFF,
                "original": {"path": original_path, **identity(original)},
                "indices": {"path": pixel_path, **identity(pixels)},
            }
        )
    for start, end in sorted(ranges):
        if start < previous_end:
            raise ValueError("overlapping MQ records")
        previous_end = end

    manifest = {
        "schema": 1,
        "eads": identity(eads),
        "guestDescriptorTable": {
            "address": table_address,
            "bssOffset": table_address - BSS_BASE,
            "entries": count,
            "stride": DESCRIPTOR.size,
            **identity(table),
        },
        "emptyDescriptors": empty,
        "images": images,
    }
    files["resources.json"] = (json.dumps(manifest, indent=2) + "\n").encode()
    for path, data in files.items():
        target = output / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    print(f"{len(images)} MQ records, {len(empty)} empty descriptors")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("eads", type=Path)
    parser.add_argument("descriptor_table", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    extract(args.eads.read_bytes(), args.descriptor_table.read_bytes(), args.output)


if __name__ == "__main__":
    main()
