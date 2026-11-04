"""Explicit opt-in: REUNION_AUDIO_TESTS=1 plays a brief MP3 through Windows."""

import os
from pathlib import Path
import time
import pytest

from kpex.audio import AudioEngine
from kpex.sgs import SgsFile

pytestmark = pytest.mark.skipif(
    os.name != "nt" or os.environ.get("REUNION_AUDIO_TESTS") != "1",
    reason="Host audio playback requires explicit REUNION_AUDIO_TESTS=1",
)


@pytest.mark.originals
def test_windows_mci_mp3_play_and_stop(tmp_path):
    root = Path(__file__).resolve().parents[1]
    game = SgsFile((root / "data/games/Godori.sgs").read_bytes())
    audio = AudioEngine(tmp_path)
    try:
        audio.play(game.resources[2284].data)
        deadline = time.monotonic() + 3
        while (
            not audio.play_count
            and not audio.last_error
            and time.monotonic() < deadline
        ):
            time.sleep(0.02)
        assert audio.last_error is None
        assert audio.play_count == 1
        audio.stop()
        deadline = time.monotonic() + 2
        while audio.last_mode != "stopped" and time.monotonic() < deadline:
            time.sleep(0.02)
        assert audio.last_mode == "stopped"
    finally:
        audio.close()
