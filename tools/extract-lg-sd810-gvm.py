"""Recover seven original GVM applications from one hash-locked LG SD810 dump.

Usage: python extract-lg-sd810-gvm.py INPUT.bin NEW_OUTPUT_DIRECTORY
Python 3.11+, standard library. Does not execute firmware.
This is a targeted page reconstruction, not a general LG filesystem reader.
Only five game SGS, two music applications, their INF descriptors and four
associated image containers are written. No user saves are exported.
"""

from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import struct
import sys

BASE = Path(__file__).resolve().parent
EXPECTED = "8a37f6e81780d36f9ff1bf8c9537f32c1b2c8c004703ccb0948bf0669b1cf189"
TARGETS = [
    (111, 0xE80000, "music-street-sd810-v1.sgs"),
    (419, 0xE89E00, "after-that-day-sd810-v2.sgs"),
    (98, 0xF25400, "zzayo-zzayo-tycoon-sd810-v2.sgs"),
    (123, 0x1007200, "sword-master-chronicle-sd810-v2.sgs"),
    (182, 0x107F600, "tetris-classic-sd810-v2.sgs"),
    (394, 0x1091C00, "rolling-fry-sd810-v2.sgs"),
    (214, 0x10D5A00, "shrek-2-sd810-v1.sgs"),
]
ICON_TARGETS = [
    (4, 116, 0x1007000),
    (5, 181, 0x107F400),
    (6, 209, 0x10D5800),
    (7, 393, 0x1090800),
]
CONTENT_KINDS = {
    111: "music / mood-questionnaire application; original text resources, not counted as a game",
    419: "music / karaoke application; confirmed original song text resources and displayed karaoke interface",
    98: "game; original help resources describe gameplay and controls",
    123: "game; original text resources describe attacks and skills",
    182: "game; original menu/help resources describe starting Tetris and scoring",
    394: "game; original help resources describe directional controls and stages",
    214: "game; original help resources describe story mode, attacks, transformations and stages",
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def recover_icon(raw, pages, slot, file_id, metadata):
    header = struct.unpack_from("<6H", raw, metadata)
    assert header[:4] == (0xDB, file_id, 0, 2)
    name_length = raw[metadata + 28]
    name = raw[metadata + 29 : metadata + 29 + name_length]
    assert name == f"skp/c/GVM/{slot}/{slot}.res\0".encode("ascii")
    start = metadata + 29 + name_length
    assert start + header[5] <= metadata + 508
    data = raw[start : start + header[5]]
    mapping = [
        {
            "logical_index": 0,
            "physical_page": metadata,
            "payload_offset": start,
            "bytes": header[5],
        }
    ]
    selected = {}
    for offset, part in pages:
        if part[0] == 0xFE and part[1] == file_id:
            assert part[3] == 1 and 1 <= part[2] <= 32 and 0 < part[5] <= 496
            assert part[2] not in selected, "Ambiguous icon data-page version"
            selected[part[2]] = (offset, part[5])
    assert selected and sorted(selected) == list(range(1, max(selected) + 1))
    for index, (offset, length) in sorted(selected.items()):
        data += raw[offset + 12 : offset + 12 + length]
        mapping.append(
            {
                "logical_index": index,
                "physical_page": offset,
                "payload_offset": offset + 12,
                "bytes": length,
            }
        )
    assert data[:5] == bytes.fromhex("ce fa ad de 02")
    assert data[5] == 2 and data[10] == 0
    first = struct.unpack_from("<I", data, 6)[0]
    second = struct.unpack_from("<I", data, 11)[0]
    assert first == 15 and data[first : first + 8] == bytes([3, 36, 36, 8, 0, 0, 0, 0])
    frames = data[first + 8]
    assert 1 <= frames <= 8 and first + 9 + 36 * 36 * frames == second
    assert data[second : second + 4] == bytes([2, 23, 23, 8])
    assert second + 8 + 23 * 23 == len(data)
    record = {
        "filesystem_name": name[:-1].decode("ascii"),
        "file_id": file_id,
        "output": f"slot-{slot}.res",
        "bytes": len(data),
        "sha256": digest(data),
        "pages": mapping,
        "container_magic": "DEADFACE",
        "image_entries": [
            {
                "directory_kind": 2,
                "offset": first,
                "format": 3,
                "width": 36,
                "height": 36,
                "frames": frames,
                "bytes_per_pixel": 1,
            },
            {
                "directory_kind": 0,
                "offset": second,
                "format": 2,
                "width": 23,
                "height": 23,
                "frames": 1,
                "bytes_per_pixel": 1,
            },
        ],
        "unexplained_payload_bytes": 0,
        "limits": "Complete associated image containers, consistent with launcher icons. Palette/header flags and exact native consumer remain unconfirmed.",
    }
    return record, data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("out_dir", type=Path)
    args = parser.parse_args()
    if (
        args.input.is_symlink()
        or not args.input.is_file()
        or args.input.stat().st_size != 31406032
    ):
        raise ValueError("Expected a regular 31,406,032-byte source dump")
    if args.out_dir.exists() or args.out_dir.is_symlink():
        raise FileExistsError("Output already exists; refusing overwrite")
    if not args.out_dir.parent.is_dir():
        raise ValueError("Output parent must already be a directory")
    raw = args.input.read_bytes()
    if digest(raw) != EXPECTED:
        raise ValueError("Input SHA-256 does not match the investigated dump")
    spec = importlib.util.spec_from_file_location(
        "scanner", BASE / "scan-firmware-games.py"
    )
    scanner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(scanner)

    # Every selected file has 512-byte physical pages. Its metadata page holds
    # its filename and the initial payload. Subsequent pages have a 12-byte
    # header and up to 496 payload bytes. Last four bytes are not file content.
    pages = []
    for off in range(0, len(raw) - 511, 512):
        header = struct.unpack_from("<6H", raw, off)
        if header[0] in (0xDB, 0x5B, 0xFE):
            pages.append((off, header))

    report = {
        "source": {
            "model_from_archive_directory": "LG SD810",
            "build_observed": "SXS2V309",
            "file": args.input.name,
            "bytes": len(raw),
            "sha256": EXPECTED,
            "archive_url": "https://archive.sunderland93.ru/Firmwares/LG/SD810/SXS2V309%20%5BMemory%20Dump%5D.7z",
            "archive_sha256": "72ed35d213efabc56cf2a3cdf0f8ceeb093e12b26b49f65131e1bc5f70eb677d",
        },
        "method": "Hash-locked 512-byte LG EFS pages; exact unique logical indices, original payload lengths, SGS complete structural validation; no repair, padding, or user saves.",
        "limits": [
            "Downloaded games in a memory dump do not prove factory preinstallation.",
            "Filesystem footer/checksum semantics are not established; independent complete SGS structure is validated instead.",
            "English filenames are descriptive transliterations/translations, not verified official English releases.",
            "Structural validity does not establish emulator playability.",
        ],
        "applications": [],
        "auxiliaryResources": [],
    }
    outputs = {}
    for file_id, metadata_offset, filename in TARGETS:
        header = struct.unpack_from("<6H", raw, metadata_offset)
        assert header[:4] == (0xDB, file_id, 0, 2)
        name_length = raw[metadata_offset + 28]
        name = raw[metadata_offset + 29 : metadata_offset + 29 + name_length]
        assert name.startswith(b"skp/c/GVM/") and name.endswith(b".sgs\0")
        start = metadata_offset + 29 + name_length
        assert start + header[5] <= metadata_offset + 508
        payload = raw[start : start + header[5]]
        mapping = [
            {
                "logical_index": 0,
                "physical_page": metadata_offset,
                "payload_offset": start,
                "bytes": header[5],
                "revision": 2,
            }
        ]
        selected = {}
        for off, h in pages:
            if h[0] == 0xFE and h[1] == file_id:
                assert h[3] == 1 and 1 <= h[2] <= 4096 and 0 < h[5] <= 496
                assert h[2] not in selected, "Ambiguous data-page version"
                selected[h[2]] = (off, h)
        assert selected and sorted(selected) == list(range(1, max(selected) + 1))
        for index in sorted(selected):
            off, h = selected[index]
            payload += raw[off + 12 : off + 12 + h[5]]
            mapping.append(
                {
                    "logical_index": index,
                    "physical_page": off,
                    "payload_offset": off + 12,
                    "bytes": h[5],
                    "revision": h[3],
                }
            )
        parsed = scanner.parse_candidate(payload, 0)
        assert parsed is not None and parsed["declared_body_bytes"] == len(payload)
        outputs[filename] = payload
        record = {
            "output": filename,
            "filesystem_name": name[:-1].decode("ascii"),
            "file_id": file_id,
            "bytes": len(payload),
            "sha256": digest(payload),
            "content_classification": CONTENT_KINDS[file_id],
            "validation": parsed,
            "pages": mapping,
            "associated_inf": [],
        }

        # INF is an operator's public game-download descriptor, kept separate
        # from the SGS. Record all surviving versions without inventing order.
        inf_name = name[:-5] + b".inf\0"
        for off, h in pages:
            if h[0] not in (0xDB, 0x5B):
                continue
            n = raw[off + 28]
            if raw[off + 29 : off + 29 + n] != inf_name or not h[5]:
                continue
            assert off + 29 + n + h[5] <= off + 508
            data = raw[off + 29 + n : off + 29 + n + h[5]]
            assert len(data) >= 68 and struct.unpack_from("<I", data, 40)[0] == len(
                payload
            ), "Original INF size disagrees with recovered SGS"
            desc_name = filename.removesuffix(".sgs") + f"-inf-{off:08x}.bin"
            outputs[desc_name] = data
            record["associated_inf"].append(
                {
                    "output": desc_name,
                    "physical_page": off,
                    "header": list(h),
                    "bytes": len(data),
                    "sha256": digest(data),
                }
            )
        report["applications"].append(record)

    for slot, file_id, metadata in ICON_TARGETS:
        record, payload = recover_icon(raw, pages, slot, file_id, metadata)
        application = next(
            a
            for a in report["applications"]
            if a["filesystem_name"].removesuffix(".sgs") + ".res"
            == record["filesystem_name"]
        )
        record["associatedSgs"] = application["output"]
        outputs[record["output"]] = payload
        report["auxiliaryResources"].append(record)

    out = args.out_dir
    out.mkdir()
    created = []
    try:
        for name, payload in outputs.items():
            target = out / name
            with target.open("xb") as stream:
                created.append(target)
                stream.write(payload)
        target = out / "recovery-evidence.json"
        with target.open("x", encoding="utf-8") as stream:
            created.append(target)
            json.dump(report, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
    except BaseException:
        for target in reversed(created):
            target.unlink(missing_ok=True)
        out.rmdir()
        raise
    print(
        json.dumps(
            {
                "applications": len(report["applications"]),
                "auxiliaryResources": len(report["auxiliaryResources"]),
                "out": str(out),
                "sha256": {g["output"]: g["sha256"] for g in report["applications"]},
            },
            ensure_ascii=True,
            indent=2,
        )
    )


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, AssertionError, struct.error) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
