import hashlib
import json

import pytest

from kpex.assets import import_assets, prepare_bundled_assets, verify


@pytest.fixture
def collection(tmp_path):
    root = tmp_path / "desktop"
    (root / "data").mkdir(parents=True)
    source = tmp_path / "web/data/games"
    source.mkdir(parents=True)
    payload = b"synthetic collection member"
    record = {
        "path": "data/games/local.sgs",
        "size": len(payload),
        "sha256": hashlib.sha256(payload).hexdigest(),
    }
    (root / "data/manifest.json").write_text(json.dumps([record]), encoding="utf-8")
    (source / "renamed.bin").write_bytes(payload)
    (source / "local.sgs").write_bytes(b"x" * len(payload))
    return root, source, payload


def test_first_launch_imports_by_hash_and_second_launch_reuses_files(collection):
    root, _, payload = collection
    assert prepare_bundled_assets(root) == 1
    target = root / "data/games/local.sgs"
    assert target.read_bytes() == payload
    modified = target.stat().st_mtime_ns
    assert prepare_bundled_assets(root) == 0
    assert target.stat().st_mtime_ns == modified
    assert verify(root) == {"verified": 1, "missing": [], "invalid": []}


def test_explicit_import_refuses_to_replace_modified_local_file(collection):
    root, source, _ = collection
    target = root / "data/games/local.sgs"
    target.parent.mkdir()
    target.write_bytes(b"user-modified copy")
    with pytest.raises(ValueError, match="Refusing to overwrite"):
        import_assets(source, root)
    assert target.read_bytes() == b"user-modified copy"


def test_automatic_preparation_preserves_existing_local_file(collection):
    root, _, _ = collection
    target = root / "data/games/local.sgs"
    target.parent.mkdir()
    target.write_bytes(b"user-modified copy")
    assert prepare_bundled_assets(root) == 0
    assert target.read_bytes() == b"user-modified copy"
