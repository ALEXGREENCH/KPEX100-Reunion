"""The callback probe exception must not allow other compiled files."""

import importlib.util
from pathlib import Path


def test_callback_probe_has_a_pinned_exception():
    root = Path(__file__).resolve().parents[2]
    spec = importlib.util.spec_from_file_location(
        "repo_guard", root / "tools/check-repo.py"
    )
    guard = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(guard)
    name = "tools/fixtures/kingston-callback-clock/clock.sgs"
    assert not guard.forbidden(name)
    assert guard.original_files()[name] == {
        "bytes": 2420,
        "sha256": "8c79353af9698c1a7259415894271b0c31a8323f41f4c51bb9c1b4a5a4502573",
    }
    assert guard.forbidden("tools/fixtures/kingston-callback-clock/other.sgs")
    assert guard.forbidden("tools/fixtures/kingston-callback-clock/clock.exe")
    assert guard.forbidden("tools/fixtures/other/clock.sgs")
