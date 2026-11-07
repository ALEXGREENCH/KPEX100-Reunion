from pathlib import Path
import runpy
from zipfile import ZipFile

import pytest


ROOT = Path(__file__).resolve().parents[2]
decode = runpy.run_path(str(ROOT / "tools/decode-gvm-compressed.py"))["decode"]


@pytest.fixture(scope="module")
def sample():
    with ZipFile(ROOT / "research/archives/LG-SD1020-Compressed-GVM.zip") as archive:
        return (
            archive.read("original/gvm2x_000.bin")[176:],
            archive.read("derived/hiphop-spirit-lg-sd1020.sgs"),
        )


def test_original_matches_native_kingston_expansion(sample):
    source, expected = sample
    decoded, report = decode(source)
    assert decoded == expected
    assert decoded[:100] == source[:100]
    assert report["layout"]["resources"] == 54
    assert report["decodedZeroSuffixBytes"] == 3
    assert report["expandedSha256"] == (
        "75aa893c9e7ef72115c69e2740cce84e9826f7638b139a99b7a67b4ab4d5939b"
    )


def test_rejects_truncated_and_bad_history_tokens(sample):
    source, _ = sample
    with pytest.raises(ValueError, match="invalid SGS layout"):
        decode(source[:200])
    # A match at history index 63 with length four would cross the window.
    with pytest.raises(ValueError, match="outside the 64-byte history"):
        decode(source[:100] + b"\xfe\x40")
