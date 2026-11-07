import hashlib
import http.client
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error


SPEC = importlib.util.spec_from_file_location(
    "preserve_firmware_files",
    Path(__file__).resolve().parents[2] / "tools/preserve-firmware-files.py",
)
FILES = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(FILES)


class Response(io.BytesIO):
    status = 200
    url = "https://example.org/original.7z"
    headers = {}


class InterruptedResponse(Response):
    def read(self, size=-1):
        raise http.client.IncompleteRead(b"partial", 10)


class FirmwarePreservationTests(unittest.TestCase):
    source = {"url": Response.url, "listingUrl": "https://example.org/"}

    def acquire(self, root, response, **kwargs):
        with patch.object(FILES.urllib.request, "urlopen", return_value=response):
            return FILES.preserve([self.source], root, delay=0, **kwargs)[0]

    def test_binary_exact_receipt_cache_and_mutation_detection(self):
        body = b"7z\x00\xff\r\n\x80" * 100
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            result = self.acquire(root, Response(body))
            receipt = result["receipt"]
            self.assertTrue(receipt["complete"])
            self.assertEqual(result["listingUrl"], self.source["listingUrl"])
            self.assertEqual(receipt["sha256"], hashlib.sha256(body).hexdigest())
            original = root / receipt["path"]
            self.assertEqual(original.read_bytes(), body)
            with patch.object(FILES.urllib.request, "urlopen") as request:
                FILES.preserve([self.source], root, delay=0)
                request.assert_not_called()
            original.write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "Changed cached"):
                FILES.preserve([self.source], root, delay=0)

    def test_http_error_body_preserved_without_success_cache(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            error = urllib.error.HTTPError(
                Response.url, 404, "Missing", {}, io.BytesIO(b"missing")
            )
            with patch.object(FILES.urllib.request, "urlopen", side_effect=error):
                receipt = FILES.preserve([self.source], root, delay=0)[0]["receipt"]
            self.assertEqual(receipt["status"], 404)
            self.assertEqual((root / receipt["path"]).read_bytes(), b"missing")
            self.assertEqual(
                self.acquire(root, Response(b"found"))["receipt"]["status"], 200
            )

    def test_short_declared_body_is_not_cached(self):
        response = Response(b"short")
        response.headers = {"Content-Length": "15"}
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            receipt = self.acquire(root, response)["receipt"]
            self.assertFalse(receipt["complete"])
            self.assertEqual(receipt["error"], "Short HTTP body")
            self.assertEqual((root / receipt["path"]).read_bytes(), b"short")
            self.assertTrue(
                self.acquire(root, Response(b"retried"))["receipt"]["complete"]
            )

    def test_chunk_interruption_keeps_partial_bytes_and_error_receipt(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            receipt = self.acquire(root, InterruptedResponse())["receipt"]
            self.assertFalse(receipt["complete"])
            self.assertIn("IncompleteRead", receipt["error"])
            self.assertEqual((root / receipt["path"]).read_bytes(), b"partial")
            self.assertEqual(
                json.loads((root / "receipts.jsonl").read_text())["sha256"],
                receipt["sha256"],
            )

    def test_unannounced_oversize_retains_only_bounded_prefix(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            receipt = self.acquire(root, Response(b"0123456789"), max_bytes=6)[
                "receipt"
            ]
            self.assertFalse(receipt["complete"])
            self.assertEqual(receipt["bytes"], 6)
            self.assertEqual((root / receipt["path"]).read_bytes(), b"012345")

    def test_declared_oversize_is_rejected_before_reading(self):
        response = Response(b"unused")
        response.headers = {"Content-Length": "100"}
        with tempfile.TemporaryDirectory() as tmp:
            receipt = self.acquire(Path(tmp), response, max_bytes=6)["receipt"]
            self.assertFalse(receipt["complete"])
            self.assertNotIn("path", receipt)
            self.assertIn("Declared body", receipt["error"])

    def test_connection_failure_has_receipt_and_no_fake_object(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with patch.object(
                FILES.urllib.request,
                "urlopen",
                side_effect=urllib.error.URLError("offline"),
            ):
                receipt = FILES.preserve([self.source], root, delay=0)[0]["receipt"]
            self.assertFalse(receipt["complete"])
            self.assertEqual(receipt["status"], 0)
            self.assertNotIn("path", receipt)


if __name__ == "__main__":
    unittest.main()
