"""Audio checks decode real archived resources without playing on the host."""

import array
import hashlib
import json
import os
from pathlib import Path
import wave
import pytest

from kpex.audio import AudioEngine, AudioError, extract_mp3
from kpex.sgs import SgsFile

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.originals
def test_godori_mp3_matches_independent_archive_hash():
    game = SgsFile((ROOT / "data/games/Godori.sgs").read_bytes())
    data = extract_mp3(game.resources[2283].data)
    assert (
        hashlib.sha256(data).hexdigest()
        == "446771e6348a2644f8617965c6813e1bbeeef2d899c7e65bf8159718586df928"
    )


def test_reject_fake_mpeg_sync():
    with pytest.raises(AudioError):
        extract_mp3(b"\xff\xfb\xb0\0" + bytes(100))


@pytest.mark.originals
def test_all_23_godori_streams_match_preserved_manifest():
    game = SgsFile((ROOT / "data/games/Godori.sgs").read_bytes())
    expected = json.loads((ROOT / "tests/fixtures/mp3.json").read_text())["streams"]
    assert len(expected) == 23
    for entry in expected:
        original = game.resources[entry["index"]].data
        decoded = extract_mp3(original)
        assert len(decoded) == entry["bytes"] < len(original)
        assert hashlib.sha256(decoded).hexdigest() == entry["sha256"]
        assert original.find(decoded) == 628


def test_original_firmware_silent_subtypes(tmp_path):
    audio = AudioEngine(tmp_path, enabled=False)
    assert audio.prepare(b"\0\0\x06\x28\x26\0") is None
    assert audio.prepare(b"\x01\0" + bytes(40)) is None
    assert audio.ignored_native_subtypes == {0, 1}
    assert audio.play_count == 0


@pytest.mark.skipif(
    os.name != "nt" or not (ROOT / "bin/smaf-render.exe").is_file(),
    reason="Optional desktop SMAF renderer has not been built",
)
@pytest.mark.originals
def test_optional_smaf_renders_real_nonzero_stereo_pcm(tmp_path):
    game = SgsFile((ROOT / "data/games/ikaria.sgs").read_bytes())
    audio = AudioEngine(tmp_path, enabled=False)
    payload = game.resources[5226].data
    assert audio.prepare(payload) is None
    path = audio.prepare(payload, allow_smaf=True)
    with wave.open(str(path), "rb") as wav:
        assert wav.getnchannels() == 2
        assert wav.getsampwidth() == 2
        assert wav.getframerate() == 44100
        assert 40000 < wav.getnframes() < 60000
        samples = array.array("h", wav.readframes(wav.getnframes()))
        assert max(abs(sample) for sample in samples) > 1000
    assert audio.play_count == 0
