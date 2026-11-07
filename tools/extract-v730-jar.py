"""Recover the two Java MIDlets from the archived V730 8 MiB flash image."""

import argparse
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import struct
from zipfile import ZipFile


IMAGE_BYTES = 8 * 1024 * 1024
IMAGE_SHA256 = "6b7ef0420349a0b7712249988d2d7caa35fc4026f1801d29f9a8daa4f6a9365d"
FIRST_SLOT = 0x5E0000
SLOT_BYTES = 1024
PAYLOAD_LIMIT = SLOT_BYTES - 4
TARGETS = {
    0x36: "I/0/0.jar",
    0x38: "I/0/DESC.jad",
    0x3F: "I/1/1.jar",
    0x40: "I/1/DESC.jad",
}


def restore(image):
    slots = {file_id: {} for file_id in TARGETS}
    for offset in range(FIRST_SLOT, len(image), SLOT_BYTES):
        marker, file_id, index, word6, word8, length = struct.unpack_from(
            "<6H", image, offset
        )
        if file_id not in TARGETS or not length:
            continue
        if marker == 0xFFDB and index == 0:
            name_length = image[offset + 28]
            start = 29 + name_length
            name = image[offset + 29 : offset + start]
            if name != TARGETS[file_id].encode("ascii") + b"\0":
                continue
        elif marker == 0xFFFE and index > 0:
            start = 12
        else:
            continue
        if start + length > PAYLOAD_LIMIT:
            raise ValueError(f"Invalid payload length at 0x{offset:x}")
        data = image[offset + start : offset + start + length]
        slots[file_id].setdefault(index, []).append(
            (word6, word8, offset + start, data)
        )

    restored = {}
    for file_id, path in TARGETS.items():
        by_index = slots[file_id]
        if not by_index or set(by_index) != set(range(len(by_index))):
            raise ValueError(f"Missing flash records for {path}")
        chunks = []
        records = []
        for index in range(len(by_index)):
            candidates = by_index[index]
            rank = max(entry[:2] for entry in candidates)
            best = [entry for entry in candidates if entry[:2] == rank]
            if len({entry[3] for entry in best}) > 1:
                raise ValueError(f"Ambiguous flash record {index} for {path}")
            word6, word8, offset, data = min(best, key=lambda entry: entry[2])
            chunks.append(data)
            records.append(
                {
                    "payloadOffset": offset,
                    "bytes": len(data),
                    "word6": word6,
                    "word8": word8,
                    "candidates": len(candidates),
                }
            )
        restored[path] = (b"".join(chunks), records)
    return restored


def jar_members(data):
    if not data.startswith(b"PK\x03\x04") or data[-22:-18] != b"PK\x05\x06":
        raise ValueError("JAR boundaries do not match the ZIP records")
    central_size, central_offset, comment_length = struct.unpack_from(
        "<IIH", data, len(data) - 10
    )
    if central_offset + central_size != len(data) - 22 or comment_length:
        raise ValueError("Invalid JAR central directory")
    with ZipFile(BytesIO(data)) as archive:
        members = archive.infolist()
        names = {member.filename for member in members}
        if len(names) != len(members) or "META-INF/MANIFEST.MF" not in names:
            raise ValueError("Unexpected JAR member names")
        corrupt = archive.testzip()
        if corrupt:
            raise ValueError(f"JAR member failed CRC validation: {corrupt}")
        return [
            {
                "path": member.filename,
                "bytes": member.file_size,
                "crc32": f"{member.CRC:08x}",
                "sha256": sha256(archive.read(member)).hexdigest(),
            }
            for member in members
        ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", type=Path)
    parser.add_argument("output", type=Path, help="new output directory")
    args = parser.parse_args()
    if args.image.stat().st_size != IMAGE_BYTES:
        parser.error("expected the archived 8 MiB V730 image")
    image = args.image.read_bytes()
    if sha256(image).hexdigest() != IMAGE_SHA256:
        parser.error("image SHA-256 does not match V730 AOne R-UIM 19.03.19")
    restored = restore(image)
    manifest = {
        "schema": 1,
        "image": {
            "path": "AOne_RUIM_8M_Ver_19.03.19.bin",
            "bytes": IMAGE_BYTES,
            "sha256": IMAGE_SHA256,
        },
        "firstSlotOffset": FIRST_SLOT,
        "slotBytes": SLOT_BYTES,
        "files": {},
    }
    for file_id, path in TARGETS.items():
        data, records = restored[path]
        info = {
            "fileId": file_id,
            "bytes": len(data),
            "sha256": sha256(data).hexdigest(),
            "records": records,
        }
        if path.endswith(".jar"):
            info["members"] = jar_members(data)
        manifest["files"][path] = info

    args.output.mkdir()
    for path, (data, _) in restored.items():
        destination = args.output / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
    (args.output / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
