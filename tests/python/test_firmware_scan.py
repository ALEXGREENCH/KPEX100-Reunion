"""Synthetic fixtures exercise firmware scanning without proprietary game data."""

import importlib.util
from pathlib import Path
import struct
import zlib

import pytest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location(
    "firmware_scan", ROOT / "tools/scan-firmware-games.py"
)
scanner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scanner)


def game(version=4):
    header = 128 if version >= 4 else (52 if version == 1 else 100)
    a = header + 16
    if version >= 4:
        b, c, d = a + 8, a + 12, a + 24
    else:
        b, c, d = a + 4, a + 6, a + 10
    data = bytearray(d + 4)
    data[0] = version
    data[10:14] = b"Demo"
    data[header:a] = b"\x0f" * 16
    if version >= 4:
        struct.pack_into("<I", data, 28, header)
        struct.pack_into("<4I", data, 72, a, b, c, d)
        struct.pack_into("<I", data, 120, len(data))
        struct.pack_into("<HHI", data, a, 0, 1, 0)
        struct.pack_into("<III", data, c, 2, 4, 0)
    else:
        struct.pack_into("<H", data, 28, header)
        struct.pack_into("<4H", data, 44, a, b, c, d)
        data[a : a + 4] = bytes([0, 1, 1, 0])
        struct.pack_into("<HH", data, c, 2, 4)
    data[d:] = b"ABCD"
    return bytes(data)


@pytest.mark.parametrize("version", [1, 2, 4, 36])
@pytest.mark.parametrize("mask", [0, 165])
@pytest.mark.parametrize("wrapper", [0, 32])
def test_detects_original_body_at_unaligned_offset(version, mask, wrapper):
    body = game(version)
    encoded = bytes(value ^ mask for value in body)
    prefix = b"before!"
    wrapped = (b" \0\0\0" + bytes(28) if wrapper else b"") + encoded
    report = scanner.scan_bytes(prefix + wrapped + b"unknown trailer")
    assert len(report["containers"]) == 1
    hit = report["containers"][0]
    assert hit["version"] == version
    assert hit["body_offset"] == len(prefix) + wrapper
    assert hit["source_offset"] == len(prefix)
    assert hit["xor_mask"] == mask
    assert hit["wrapper_bytes"] == wrapper
    assert hit["raw_sha256"] == scanner.digest(wrapped)
    assert hit["decoded_body_sha256"] == scanner.digest(body)
    assert hit["extracted_bytes"] == len(wrapped)


@pytest.mark.parametrize("version", [1, 2, 4, 36])
def test_rejects_truncated_payload_and_out_of_range_entry(version):
    body = game(version)
    assert scanner.scan_bytes(body[:-1])["containers"] == []
    bad = bytearray(body)
    struct.pack_into("<I" if version >= 4 else "<H", bad, 28, 1)
    assert scanner.scan_bytes(bad)["containers"] == []


def test_rejects_inconsistent_variable_or_resource_tables():
    body = bytearray(game())
    a, _, c, _ = struct.unpack_from("<4I", body, 72)
    struct.pack_into("<H", body, a + 2, 2)
    assert scanner.scan_bytes(body)["containers"] == []
    body = bytearray(game())
    struct.pack_into("<I", body, c + 4, 5)
    assert scanner.scan_bytes(body)["containers"] == []


def test_type2_extracts_stored_stream_and_rejects_a_bad_checksum(tmp_path):
    source = bytearray(game())
    c, d = struct.unpack_from("<2I", source, 80)
    del source[d:]
    payload = b"A" * 256
    source[26] = 2
    struct.pack_into("<I", source, c + 4, len(payload))
    struct.pack_into("<I", source, 108, d + len(payload))
    source.extend(payload[:18] + zlib.compress(payload[18:]) + b"\xff")
    struct.pack_into("<I", source, 120, len(source))
    image = b"prefix" + source + b"trailer"
    (hit,) = scanner.scan_bytes(image)["containers"]
    assert hit["expanded_body_bytes"] == d + len(payload)
    assert hit["declared_body_bytes"] == len(source)
    (file,) = scanner.extract_hits(image, [hit], tmp_path)
    assert (tmp_path / file).read_bytes() == source
    source[-2] ^= 1
    assert scanner.scan_bytes(source)["containers"] == []


def test_extracts_unchanged_representation_once_and_refuses_overwrite(tmp_path):
    body = game()
    encoded = body.translate(scanner.XOR_TABLE)
    first = b" \0\0\0" + bytes(28) + encoded
    image = b"prefix!" + first + b"gap!" + body + b"trailer"
    hits = scanner.scan_bytes(image)["containers"]
    assert len(hits) == 2
    files = scanner.extract_hits(image, hits, tmp_path)
    assert len(files) == 1
    target = tmp_path / files[0]
    assert target.read_bytes() == first
    with pytest.raises(ValueError, match="replace"):
        scanner.extract_hits(image, hits, tmp_path)
    assert target.read_bytes() == first


def test_empty_and_arbitrary_inputs_produce_no_game():
    for image in [b"", bytes(1024), b"GAME\\HELLFIRE.SGS\0" * 10]:
        assert scanner.scan_bytes(image)["containers"] == []
