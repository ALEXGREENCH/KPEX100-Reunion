"""Keep the default test suite independent of external copyrighted assets."""

import hashlib
import json
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def pytest_addoption(parser):
    parser.addoption(
        "--with-originals",
        action="store_true",
        help="Run native tests against imported original ROM/SGS",
    )


def pytest_configure(config):
    config.addinivalue_line(
        "markers", "originals: requires locally imported original ROM/SGS"
    )
    if not config.getoption("--with-originals"):
        return
    from kpex.assets import prepare_bundled_assets

    prepare_bundled_assets(ROOT)
    records = json.loads((ROOT / "data/manifest.json").read_text(encoding="utf-8"))
    required = [record for record in records if not record.get("optional")]
    problems = []
    for record in required:
        path = ROOT / record["path"]
        if not path.is_file():
            problems.append(record["path"] + " (missing)")
        elif hashlib.sha256(path.read_bytes()).hexdigest() != record["sha256"]:
            problems.append(record["path"] + " (hash mismatch)")
    if problems:
        raise pytest.UsageError(
            "Import original assets using desktop/tools/assets.py first:\n"
            + "\n".join(problems)
        )


def pytest_collection_modifyitems(config, items):
    if config.getoption("--with-originals"):
        return
    skip = pytest.mark.skip(reason="Original assets are opt-in: use --with-originals")
    for item in items:
        if item.get_closest_marker("originals"):
            item.add_marker(skip)
