import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error


TOOLS = Path(__file__).resolve().parents[2] / "tools"
SPEC = importlib.util.spec_from_file_location(
    "preserve_platform_pages", TOOLS / "preserve-platform-pages.py"
)
PAGES = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PAGES)


class Response(io.BytesIO):
    status = 200
    url = "https://example.org/document"
    headers = {"Content-Type": "text/html; charset=euc-kr"}


class PreservationTests(unittest.TestCase):
    source = {
        "url": "https://example.org/document",
        "kind": "corporate-notice",
        "requiredText": ["신지소프트", "GVM"],
    }

    def test_korean_original_cached_and_checked_for_mutation(self):
        body = '<meta charset="euc-kr"><p>신지소프트 GVM 자료</p>'.encode("cp949")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with patch.object(
                PAGES.urllib.request, "urlopen", return_value=Response(body)
            ):
                result = PAGES.preserve([self.source], root, delay=0)[0]
            self.assertTrue(result["verified"])
            self.assertEqual(result["decoding"]["used"], "cp949")
            original = root / result["receipt"]["path"]
            self.assertEqual(original.read_bytes(), body)
            self.assertEqual(
                result["receipt"]["sha256"], hashlib.sha256(body).hexdigest()
            )
            with patch.object(PAGES.urllib.request, "urlopen") as request:
                self.assertTrue(
                    PAGES.preserve([self.source], root, delay=0)[0]["verified"]
                )
                request.assert_not_called()
            original.write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "Changed original"):
                PAGES.preserve([self.source], root, delay=0)

    def test_http_failure_body_is_preserved_but_not_verified(self):
        error = urllib.error.HTTPError(
            self.source["url"], 404, "Not Found", {}, io.BytesIO(b"missing document")
        )
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with patch.object(PAGES.urllib.request, "urlopen", side_effect=error):
                result = PAGES.preserve([self.source], root, delay=0)[0]
            self.assertFalse(result["verified"])
            self.assertEqual(result["receipt"]["status"], 404)
            self.assertEqual(
                (root / result["receipt"]["path"]).read_bytes(), b"missing document"
            )
            receipt = json.loads((root / "receipts.jsonl").read_text())
            self.assertEqual(receipt["status"], 404)

    def test_unicode_separators_in_receipt_headers_survive_cached_resume(self):
        body = "<meta charset='utf-8'><p>신지소프트 GVM</p>".encode()
        response = Response(body)
        header = "original\u0085\u2028\u2029page"
        response.headers = {"X-Original-Name": header}
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with patch.object(PAGES.urllib.request, "urlopen", return_value=response):
                original = PAGES.preserve([self.source], root, delay=0)[0]
            with patch.object(PAGES.urllib.request, "urlopen") as request:
                resumed = PAGES.preserve([self.source], root, delay=0)[0]
                request.assert_not_called()
            self.assertTrue(resumed["verified"])
            self.assertEqual(
                resumed["receipt"], json.loads(json.dumps(original["receipt"]))
            )
            self.assertEqual(
                dict(resumed["receipt"]["headers"])["X-Original-Name"], header
            )

    def test_success_status_and_script_text_are_not_enough(self):
        body = (
            "<title>Error</title><script>신지소프트 GVM</script><p>Missing</p>".encode()
        )
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(
                PAGES.urllib.request, "urlopen", return_value=Response(body)
            ):
                result = PAGES.preserve([self.source], Path(tmp), delay=0)[0]
            self.assertFalse(result["verified"])

    def test_no_automatic_link_fetching(self):
        body = '<p>신지소프트 GVM</p><a href="/execute.exe">SDK</a>'.encode()
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(
                PAGES.urllib.request, "urlopen", return_value=Response(body)
            ) as request:
                result = PAGES.preserve([self.source], Path(tmp), delay=0)[0]
            self.assertEqual(request.call_count, 1)
            self.assertEqual(result["links"], ["/execute.exe"])

    def test_short_body_is_preserved_but_never_verified_or_cached(self):
        body = "<p>신지소프트 GVM</p>".encode()
        response = Response(body)
        response.headers = {"Content-Length": str(len(body) + 10)}
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with patch.object(PAGES.urllib.request, "urlopen", return_value=response):
                result = PAGES.preserve([self.source], root, delay=0)[0]
            self.assertFalse(result["verified"])
            self.assertFalse(result["receipt"]["bodyComplete"])
            self.assertEqual((root / result["receipt"]["path"]).read_bytes(), body)
            with patch.object(
                PAGES.urllib.request, "urlopen", return_value=Response(body)
            ) as request:
                self.assertTrue(
                    PAGES.preserve([self.source], root, delay=0)[0]["verified"]
                )
                self.assertEqual(request.call_count, 1)


if __name__ == "__main__":
    unittest.main()
