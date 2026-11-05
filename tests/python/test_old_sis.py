"""Synthetic malformed-package checks; no old executable is run."""

import binascii
import importlib.util
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch
import zlib

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "old_sis", ROOT.parents[1] / "tools" / "extract-old-sis.py"
)
sis = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sis)


def checksums(data):
    uid = binascii.crc_hqx(data[:12:2], 0) | binascii.crc_hqx(data[1:12:2], 0) << 16
    struct.pack_into("<I", data, 12, uid)
    signature = struct.unpack_from("<I", data, 68)[0] or len(data)
    crc = binascii.crc_hqx(data[18:signature], binascii.crc_hqx(data[:16], 0))
    struct.pack_into("<H", data, 16, crc)
    return data


def fixture(multilingual=False, compressed=True):
    values = [b"first payload", b"second payload"] if multilingual else [b"payload"]
    count = len(values)
    record = 100 + 2 * count
    names = record + 36 + count * 12
    data = bytearray(names + count * 8)
    struct.pack_into("<4I", data, 0, 0x10272E3F, 0x10003A12, 0x10000419, 0)
    struct.pack_into("<3H", data, 18, count, 1, 0)
    struct.pack_into("<H", data, 36, 1 | (0 if compressed else 8))
    struct.pack_into("<5I", data, 48, 100, record, 0, 0, names)
    for i in range(count):
        struct.pack_into("<H", data, 100 + i * 2, i + 1)
    name = "Demo".encode("utf-16-le")
    for i in range(count):
        struct.pack_into("<I", data, names + i * 4, len(name))
        struct.pack_into("<I", data, names + count * 4 + i * 4, len(data))
    data.extend(name)
    target = "!:\\System\\Apps\\Demo\\demo.app".encode("utf-16-le")
    target_ptr = len(data)
    data.extend(target)
    struct.pack_into(
        "<7I",
        data,
        record,
        int(multilingual),
        0,
        0,
        len(target),
        target_ptr,
        len(target),
        target_ptr,
    )
    for i, value in enumerate(values):
        packed = zlib.compress(value) if compressed else value
        struct.pack_into("<I", data, record + 28 + i * 4, len(packed))
        struct.pack_into("<I", data, record + 28 + count * 4 + i * 4, len(data))
        struct.pack_into("<I", data, record + 28 + count * 8 + i * 4, len(value))
        data.extend(packed)
    return checksums(data)


class ExtractTests(unittest.TestCase):
    def test_simple_and_uncompressed(self):
        for compressed in (False, True):
            report, outputs = sis.parse_sis(fixture(compressed=compressed))
            self.assertEqual(outputs, [("00-demo.app", b"payload")])
            self.assertTrue(report["uid_crc_verified"] and report["body_crc_verified"])

    def test_multilingual(self):
        report, outputs = sis.parse_sis(fixture(multilingual=True))
        self.assertEqual(
            [blob for _, blob in outputs], [b"first payload", b"second payload"]
        )
        self.assertEqual(
            [x["language_id"] for x in report["records"][0]["variants"]], [1, 2]
        )
        self.assertEqual(len({name for name, _ in outputs}), 2)

    def test_uid_crc(self):
        data = fixture()
        data[0] ^= 1
        with self.assertRaisesRegex(ValueError, "UID CRC"):
            sis.parse_sis(data)

    def test_body_crc(self):
        data = fixture()
        data[-1] ^= 1
        with self.assertRaisesRegex(ValueError, "body CRC"):
            sis.parse_sis(data)

    def test_signature_excluded_from_crc(self):
        data = fixture()
        struct.pack_into("<I", data, 68, len(data))
        data.extend(b"signature")
        report, _ = sis.parse_sis(checksums(data))
        self.assertEqual(report["signature_bytes"], 9)
        self.assertFalse(report["signature_verified"])

    def test_pointer_bounds(self):
        data = fixture()
        struct.pack_into("<I", data, 102 + 32, len(data) + 1)
        with self.assertRaisesRegex(ValueError, "bounds"):
            sis.parse_sis(checksums(data))

    def test_output_limit(self):
        data = fixture()
        struct.pack_into("<I", data, 102 + 36, sis.MAX_FILE + 1)
        with self.assertRaisesRegex(ValueError, "limit"):
            sis.parse_sis(checksums(data))

    def test_repeated_strings_share_a_processing_budget(self):
        # Both original record names reference the same bytes. Count each
        # decoded occurrence so aliases cannot amplify a small input forever.
        data = fixture()
        name_bytes = struct.unpack_from("<I", data, 102 + 12)[0]
        with patch.object(sis, "MAX_TOTAL", name_bytes + 8):
            with self.assertRaisesRegex(ValueError, "string processing budget"):
                sis.parse_sis(data)

    def test_reject_partial_and_trailing_zlib(self):
        packed = zlib.compress(b"payload")
        for invalid in (packed[:-1], packed + b"trailing", packed + packed):
            with self.assertRaises(ValueError):
                sis.decode_payload(invalid, 7, True)
        with self.assertRaises(ValueError):
            sis.decode_payload(packed, 1, True)

    def test_unsupported_record_before_writes(self):
        data = fixture()
        struct.pack_into("<I", data, 102, 7)
        with tempfile.TemporaryDirectory(dir=ROOT) as temporary:
            root = Path(temporary)
            self.assertEqual(root.parent.resolve(), ROOT.resolve())
            src = root / "bad.sis"
            src.write_bytes(checksums(data))
            out = root / "out"
            with self.assertRaisesRegex(ValueError, "Unsupported file record type"):
                sis.main([str(src), str(out)])
            self.assertFalse(out.exists())

    def test_no_overwrite(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as temporary:
            root = Path(temporary)
            self.assertEqual(root.parent.resolve(), ROOT.resolve())
            sentinel = root / "keep"
            sentinel.write_bytes(b"original")
            with self.assertRaisesRegex(ValueError, "overwrite"):
                sis.write_outputs(root, {}, [("new", b"data")])
            self.assertEqual(sentinel.read_bytes(), b"original")
            self.assertFalse((root / "new").exists())

    def test_write_failure_rollback(self):
        original_open = Path.open

        def failing_open(path, mode="r", *args, **kwargs):
            if path.name == "second":
                raise OSError("simulated full disk")
            return original_open(path, mode, *args, **kwargs)

        with tempfile.TemporaryDirectory(dir=ROOT) as temporary:
            root = Path(temporary)
            self.assertEqual(root.parent.resolve(), ROOT.resolve())
            out = root / "out"
            with patch.object(Path, "open", failing_open), self.assertRaises(OSError):
                sis.write_outputs(out, {}, [("first", b"a"), ("second", b"b")])
            self.assertFalse(out.exists())

    def test_flat_names_only(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as temporary:
            root = Path(temporary)
            self.assertEqual(root.parent.resolve(), ROOT.resolve())
            with self.assertRaisesRegex(ValueError, "flat"):
                sis.write_outputs(root / "out", {}, [("../escape", b"x")])
            self.assertFalse((root / "out").exists())


if __name__ == "__main__":
    unittest.main()
