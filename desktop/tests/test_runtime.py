from pathlib import Path
import hashlib
import struct
import pytest
from kpex.gnex import GnexRuntime, GnexError
from kpex.sgs import SgsFile, SgsError

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def rom():
    return (ROOT / "data/firmware/Kingston-2.12.rom").read_bytes()


def digest(machine):
    return hashlib.sha256(machine.framebuffer.tobytes()).hexdigest()


@pytest.mark.parametrize(
    "name,key",
    [
        ("hell_fire.sgs", 0x15),
        ("kpetris_beta.sgs", 0x14),
        ("ikaria.sgs", 0x14),
        ("Godori.sgs", 0x14),
    ],
)
@pytest.mark.originals
def test_original_games_execute_start_timers_and_input(rom, name, key, tmp_path):
    machine = GnexRuntime(
        rom,
        (ROOT / "data/games" / name).read_bytes(),
        save_path=tmp_path / (name + ".json"),
    )
    machine.event("START")
    assert machine.status == "idle", machine.diagnostics
    frames = {digest(machine)}
    for _ in range(5):
        machine.event("TIMEOUT")
        assert machine.status == "idle", machine.diagnostics
        frames.add(digest(machine))
    machine.set_key(key, True)
    machine.set_key(key, False)
    for step in range(40):
        if step % 10 == 0:
            code = 0x10 if step % 20 == 0 else 0x11
            machine.set_key(code, True)
            machine.set_key(code, False)
        if machine.timer_ms:
            machine.event("TIMEOUT")
        assert machine.status == "idle", machine.diagnostics
        frames.add(digest(machine))
    assert machine.event_count >= 10
    assert len(frames) > 1, "No observable game response to events"
    assert 0x5F in machine.syscalls, "Guest never requested an LCD presentation"
    assert machine.framebuffer.size == (220, 176)


@pytest.mark.originals
def test_kpetris_native_gameplay_input_and_deterministic_replay(rom):
    raw = (ROOT / "data/games/kpetris_beta.sgs").read_bytes()
    history = []
    for _ in range(2):
        game = GnexRuntime(rom, raw)
        game.event("START")
        title = digest(game)
        game.set_key(0x14, True)
        game.set_key(0x14, False)
        playing = digest(game)
        assert playing != title
        game.set_key(0x10, True)
        game.set_key(0x10, False)
        moved = digest(game)
        assert moved != playing
        game.event("TIMEOUT")
        assert game.status == "idle"
        assert game.timer_ms == 1000
        history.append((title, playing, moved, digest(game)))
    assert history[0] == history[1]


@pytest.mark.originals
def test_wrong_firmware_never_uses_fixed_native_addresses(rom):
    corrupt = bytearray(rom)
    corrupt[0x40000] ^= 1
    with pytest.raises(GnexError, match="unmodified Kingston"):
        GnexRuntime(corrupt, (ROOT / "data/games/hell_fire.sgs").read_bytes())


@pytest.mark.originals
def test_guest_instruction_budget_stops_runaway_event(rom):
    game = GnexRuntime(rom, (ROOT / "data/games/kpetris_beta.sgs").read_bytes())
    game.event("START", instruction_budget=1)
    assert game.status == "error"
    assert "exceeded" in game.error


@pytest.mark.originals
def test_kpetris_menu_exit_uses_native_termination(rom):
    game = GnexRuntime(rom, (ROOT / "data/games/kpetris_beta.sgs").read_bytes())
    game.event("START")
    for _ in range(3):
        game.set_key(0x13, True)
        game.set_key(0x13, False)
    game.set_key(0x14, True)
    assert game.status == "exited", game.diagnostics
    assert game.timer_ms is None
    assert game.error is None
    assert 0xE1 in game.syscalls
    previous = game.event_count
    game.event("TIMEOUT")
    assert game.event_count == previous


@pytest.mark.originals
def test_malformed_sections_and_resource_sizes_rejected():
    original = SgsFile((ROOT / "data/games/kpetris_beta.sgs").read_bytes())
    corrupt = bytearray(original.body)
    struct.pack_into("<I", corrupt, 72, 0xFFFFFFFF)
    with pytest.raises(SgsError):
        SgsFile(corrupt)
    corrupt = bytearray(original.body)
    struct.pack_into("<I", corrupt, original.c + 4, 0xFFFFFFFF)
    with pytest.raises(SgsError):
        SgsFile(corrupt)


@pytest.mark.parametrize("raw", [b"", b"\x04" * 20, b"\x01" + bytes(127)])
def test_truncated_and_legacy_sgs_are_explicit(raw):
    with pytest.raises(SgsError):
        SgsFile(raw)
