from kpex.app import EmulatorWorker


class Machine:
    instructions = 1000
    status = "paused"
    rom_info = {
        "sha256": "743d0b9a377dc6a3f0a80b7816cee575ad2f8249643876367c4bfaac54ddd19a"
    }

    def __init__(self):
        self.keys = {}

    def key(self, name, pressed):
        self.keys[name] = pressed


def worker():
    result = EmulatorWorker()
    result.mode, result.running = "firmware", True
    result.machine = Machine()
    return result


def test_short_host_tap_survives_native_keyboard_polling():
    w = worker()
    w._key("a", True)
    w.machine.instructions += 100_000
    w._key("a", False)
    assert w.machine.keys["a"]
    w.machine.instructions += 6_900_000
    w._release_native_keys()
    assert not w.machine.keys["a"]
    assert not w.native_key_releases


def test_long_press_releases_immediately_and_repeat_does_not_extend_it():
    w = worker()
    w._key("left", True)
    w.machine.instructions += 8_000_000
    w._key("left", True)
    w._key("left", False)
    assert not w.machine.keys["left"]
    assert not w.native_key_releases


def test_pausing_releases_an_already_released_host_tap():
    w = worker()
    w._key("a", True)
    w._key("a", False)
    w._command("pause", ())
    assert not w.machine.keys["a"]
    assert not w.native_key_releases
