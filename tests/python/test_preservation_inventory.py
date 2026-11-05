"""Exercise preserved-file identity and independent ZIP CRC failure detection."""

import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location(
    "preservation",
    Path(__file__).resolve().parents[2] / "tools/preservation-inventory.py",
)
preservation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preservation)
PAYLOAD = b"unaltered historical fixture bytes"


class PreservationInventoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.archive = self.root / "research/archives/fixture.zip"
        self.archive.parent.mkdir(parents=True)
        (self.root / "web/research").mkdir(parents=True)
        with zipfile.ZipFile(self.archive, "w", zipfile.ZIP_STORED) as archive:
            archive.writestr("source/document.bin", PAYLOAD)
        self.record_identity()

    def record_identity(self):
        raw = self.archive.read_bytes()
        entry = {
            "id": "fixture",
            "repositoryPath": "research/archives/fixture.zip",
            "bytes": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest(),
        }
        (self.root / "web/research/catalog.json").write_text(
            json.dumps({"artifacts": [entry]}), encoding="utf-8"
        )

    def damage_payload(self):
        raw = bytearray(self.archive.read_bytes())
        raw[raw.index(PAYLOAD)] ^= 1
        self.archive.write_bytes(raw)

    def test_records_exact_member_identity_without_extracting(self):
        result = preservation.inventory(self.root)
        member = result["archives"][0]["members"][0]
        self.assertEqual(member["bytes"], len(PAYLOAD))
        self.assertEqual(member["sha256"], hashlib.sha256(PAYLOAD).hexdigest())
        self.assertTrue(result["archives"][0]["zipCrcPassed"])
        self.assertFalse((self.root / "source/document.bin").exists())

    def test_changed_archive_cannot_inherit_catalog_identity(self):
        self.damage_payload()
        with self.assertRaisesRegex(ValueError, "Archive SHA-256 mismatch"):
            preservation.inventory(self.root)

    def test_bad_member_crc_fails_even_with_matching_outer_hash(self):
        self.damage_payload()
        self.record_identity()
        with self.assertRaises(zipfile.BadZipFile):
            preservation.inventory(self.root)


if __name__ == "__main__":
    unittest.main()
