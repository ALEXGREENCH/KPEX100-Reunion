"""Synthetic, asset-free checks for bounded gzip/JAR carving."""

import gzip
import importlib.util
import io
from pathlib import Path
import zipfile

import pytest

spec = importlib.util.spec_from_file_location(
    "carver", Path(__file__).resolve().parents[2] / "tools/carve-gzip-jars.py"
)
carver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(carver)


def make_jar():
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_STORED) as archive:
        archive.writestr("META-INF/MANIFEST.MF", "MIDlet-Name: Synthetic\n")
        archive.writestr("Main.class", b"\xca\xfe\xba\xbe" + bytes(12))
    return stream.getvalue()


def test_preserves_original_jar_and_deduplicates_streams():
    jar = make_jar()
    stream = gzip.compress(jar)
    data = b"prefix!" + stream + b"gap" + stream + b"trailer"
    report, payloads = carver.scan(data)
    assert report["jar_occurrences"] == 2
    assert report["unique_jar_files"] == 1
    assert report["jars"][0]["gzip_offset"] == 7
    assert report["jars"][0]["gzip_bytes"] == len(stream)
    assert list(payloads.values()) == [jar]


def test_rejects_truncated_gzip_and_nonjar():
    report, payloads = carver.scan(gzip.compress(make_jar())[:-1])
    assert report["complete_gzip_streams"] == 0
    assert payloads == {}
    report, payloads = carver.scan(gzip.compress(b"not a JAR"))
    assert report["complete_gzip_streams"] == 1
    assert payloads == {}


def test_rejects_corrupted_zip_even_with_valid_gzip_checksum():
    jar = make_jar().replace(b"Synthetic", b"Corrupted")
    report, payloads = carver.scan(gzip.compress(jar))
    assert report["jar_occurrences"] == 0
    assert payloads == {}


def test_rejects_duplicate_names_that_hide_a_corrupted_zip_member():
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_STORED) as archive:
        archive.writestr("META-INF/MANIFEST.MF", "MIDlet-Name: Synthetic\n")
        archive.writestr("Main.class", b"\xca\xfe\xba\xbe" + bytes(12))
        archive.writestr("same.bin", b"ORIGINAL!")
        with pytest.warns(UserWarning, match="Duplicate name"):
            archive.writestr("same.bin", b"last member remains valid")
    jar = stream.getvalue().replace(b"ORIGINAL!", b"CORRUPTED")
    with zipfile.ZipFile(io.BytesIO(jar)) as archive:
        with pytest.raises(zipfile.BadZipFile, match="CRC"):
            archive.read(archive.infolist()[2])
    report, payloads = carver.scan(gzip.compress(jar))
    assert report["jar_occurrences"] == 0
    assert payloads == {}


def test_refuses_existing_output_without_changing_it(tmp_path):
    target = tmp_path / "out"
    report, payloads = carver.scan(gzip.compress(make_jar()))
    carver.write_result(target, report, payloads)
    original = (target / "manifest.json").read_bytes()
    with pytest.raises(ValueError, match="overwrite"):
        carver.write_result(target, {}, {})
    assert (target / "manifest.json").read_bytes() == original


def test_rejects_inflate_over_limit(monkeypatch):
    monkeypatch.setattr(carver, "MAX_INFLATED", 32)
    report, payloads = carver.scan(gzip.compress(make_jar()))
    assert report["jar_occurrences"] == 0
    assert payloads == {}


def test_total_budget_counts_nonjar_streams_and_accepts_exact_limit(monkeypatch):
    monkeypatch.setattr(carver, "MAX_TOTAL_INFLATED", 8)
    report, payloads = carver.scan(gzip.compress(b"1234") + gzip.compress(b"5678"))
    assert report["complete_gzip_streams"] == 2
    assert payloads == {}
    with pytest.raises(ValueError, match="Total complete gzip output"):
        carver.scan(gzip.compress(b"1234") + gzip.compress(b"56789"))


def test_total_budget_counts_duplicate_jars_before_deduplication(monkeypatch):
    jar = make_jar()
    monkeypatch.setattr(carver, "MAX_TOTAL_INFLATED", len(jar))
    stream = gzip.compress(jar)
    with pytest.raises(ValueError, match="Total complete gzip output"):
        carver.scan(stream + stream)
