"""The direct desktop adapter must preserve the original firmware's release events."""

from kpex.gnex import GnexRuntime


class KeyAdapter(GnexRuntime):
    """Stub guest execution; the firmware protocol has a separate real ARM test."""

    def __init__(self):
        self.held_keys = set()
        self.key_release_event = True
        self.status = "idle"
        self.calls = []

    @property
    def diagnostics(self):
        return {}

    def event(self, name, value):
        self.calls.append((name, value))


def test_release_once_with_other_key_held_and_after_exit():
    game = KeyAdapter()
    game.set_key(20, True)
    game.set_key(17, True)
    game.set_key(20, False)
    assert game.calls == [("KEYPRESS", 20), ("KEYPRESS", 17), ("KEYPRESS", 255)]
    assert game.held_keys == {17}
    game.set_key(20, False)
    assert len(game.calls) == 3
    game.status = "exited"
    game.set_key(17, False)
    assert len(game.calls) == 3
    assert not game.held_keys
