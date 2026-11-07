"""Static search must retain provenance, Korean text and exclude false originals."""

import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import zipfile

import pytest

SPEC = importlib.util.spec_from_file_location(
    "wayback_text_index",
    Path(__file__).resolve().parents[2] / "tools/wayback-text-index.py",
)
indexer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(indexer)


def fixture(
    tmp_path,
    *,
    body=None,
    states=("verified",),
    status="200",
    mime="text/html",
    wrong_cdx=False,
    wrong_object=False,
):
    body = (
        body
        or '<meta charset="euc-kr"><title>신지소프트</title><p>GVM SDK 배포</p>'.encode(
            "cp949"
        )
    )
    digest = hashlib.sha256(body).hexdigest()
    cdx = base64.b32encode(hashlib.sha1(body).digest()).decode().rstrip("=")
    record = {
        "original": "http://sinjisoft.com/board/",
        "timestamp": "20020101000000",
        "mimetype": mime,
        "statuscode": status,
        "digest": "A" * 32 if wrong_cdx else cdx,
    }
    captures = [
        json.dumps(
            {
                "id": str(i),
                "state": state,
                "payload": digest,
                "record": json.dumps(record),
            }
        )
        for i, state in enumerate(states)
    ]
    path = tmp_path / "snapshot.zip"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("collection/captures.jsonl", "\n".join(captures))
        archive.writestr(
            f"collection/objects/{digest[:2]}/{digest}",
            b"changed" if wrong_object else body,
        )
    return path


def test_cp949_extended_euckr_label_and_literal_links():
    original = '<meta charset="euc-kr"><title>신지소프트</title><p>똠방각하 &amp; SDK</p><script>BAD()</script><style>BAD CSS</style><!-- BAD COMMENT --><a href="GVM.zip?a=1&amp;b=2">자료</a>'.encode(
        "cp949"
    )
    result = indexer.extract(original)
    assert result["decoding"] == {"declared": "euc-kr", "used": "cp949", "lossy": False}
    assert result["title"] == "신지소프트"
    assert "똠방각하 & SDK" in result["text"]
    assert "BAD" not in result["text"]
    assert result["hrefs"] == ["GVM.zip?a=1&b=2"]


def test_utf8_bom_wins_over_historical_wrong_declaration():
    text = '\ufeff<meta charset="euc-kr"><p>지넥스</p>'.encode("utf8")
    result = indexer.extract(text)
    assert result["decoding"]["used"] == "utf-8-sig"
    assert result["text"] == "지넥스"


@pytest.mark.parametrize("label", ["KS_C_5601-1987", "windows-949", "euc-kr"])
def test_korean_web_labels(label):
    result = indexer.extract(
        f'<meta charset="{label}"><p>신지소프트 똠</p>'.encode("cp949")
    )
    assert result["text"] == "신지소프트 똠"
    assert not result["decoding"]["lossy"]


def test_unknown_label_and_damaged_sequence_are_explicit():
    result = indexer.extract(b'<meta charset="missing-codec"><p>\x81</p>')
    assert result["decoding"] == {
        "declared": "missing-codec",
        "used": "cp949",
        "lossy": True,
    }
    assert "\ufffd" in result["text"]


def test_grouping_keeps_each_capture_and_excludes_pending(tmp_path):
    result = indexer.build(
        fixture(tmp_path, states=("verified", "verified", "pending"))
    )
    assert result["counts"]["indexedCaptures"] == 2
    assert result["counts"]["uniqueHtmlBodies"] == 1
    assert len(result["documents"][0]["captures"]) == 2
    hit = list(indexer.search(result, "gVm sDk"))[0]
    assert len(hit["captures"]) == 2
    assert hit["matchingLines"] == ["GVM SDK 배포"]
    assert list(indexer.search(result, "없음")) == []


def test_delta_index_requires_exact_base(tmp_path):
    base = fixture(tmp_path)
    delta = tmp_path / "delta.zip"
    dependency = {
        "filename": base.name,
        "sha256": hashlib.sha256(base.read_bytes()).hexdigest(),
    }
    with zipfile.ZipFile(base) as original, zipfile.ZipFile(delta, "w") as archive:
        archive.writestr("manifest.json", json.dumps({"base": dependency}))
        archive.writestr(
            "collection/captures.jsonl", original.read("collection/captures.jsonl")
        )
    with pytest.raises(ValueError, match="requires --base"):
        indexer.build(delta)
    with pytest.raises(ValueError, match="Base archive SHA256 mismatch"):
        indexer.build(delta, delta)
    result = indexer.build(delta, base)
    assert result["baseArchive"] == dependency
    assert result["documents"] == indexer.build(base)["documents"]


@pytest.mark.parametrize(
    "kwargs",
    [{"status": "404"}, {"mime": "application/pdf"}, {"states": ("mismatch",)}],
)
def test_error_mime_and_mismatch_not_promoted_to_html(tmp_path, kwargs):
    result = indexer.build(fixture(tmp_path, **kwargs))
    assert not result["documents"]


@pytest.mark.parametrize("kwargs", [{"wrong_cdx": True}, {"wrong_object": True}])
def test_verify_source_even_when_queue_claims_verified(tmp_path, kwargs):
    with pytest.raises(ValueError, match="mismatch"):
        indexer.build(fixture(tmp_path, **kwargs))


def test_korean_nfc_search_and_blank_query():
    index = {
        "documents": [
            {
                "sha256": "test",
                "title": "",
                "text": "\u110c\u1175넥스",
                "decoding": {},
                "captures": [],
            }
        ]
    }
    assert list(indexer.search(index, "지넥스"))[0]["matchingLines"] == [
        "\u110c\u1175넥스"
    ]
    with pytest.raises(ValueError):
        list(indexer.search(index, " "))
