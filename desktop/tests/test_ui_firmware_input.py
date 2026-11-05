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


def test_firmware_batches_adapt_but_step_stays_one_instruction(monkeypatch):
    w = worker()
    clock = [0.0]
    elapsed = [0.002]
    calls = []
    monkeypatch.setattr("kpex.app.time.monotonic", lambda: clock[0])

    def run(instruction_budget):
        calls.append(instruction_budget)
        w.machine.instructions += instruction_budget
        clock[0] += elapsed[0]
        return {}

    w.machine.run = run
    w._advance()
    assert calls == [100_000]
    assert w.firmware_budget == 100_000
    previous = w.firmware_budget
    elapsed[0] = 0.2
    w._advance()
    assert 2000 <= w.firmware_budget < previous
    previous = w.firmware_budget
    w._advance(single=True)
    assert calls[-1] == 1
    assert w.firmware_budget == previous


def test_command_burst_reaches_pause_before_the_next_cpu_batch():
    w = worker()
    for _ in range(63):
        w.submit("key", "a", True)
    w.submit("pause")
    w.submit("run")
    assert w._process_commands()
    assert not w.running
    assert w.commands.qsize() == 1
    assert w._process_commands()
    assert w.running


def test_powered_off_firmware_cannot_resume():
    w = worker()
    w.running = False
    w.machine.status = "off"
    w._command("run", ())
    assert not w.running


def test_adaptive_batch_stops_at_the_native_key_release_deadline():
    w = worker()
    w._key("a", True)
    w._key("a", False)
    deadline = w.native_key_releases["a"]
    w.machine.instructions = deadline - 17
    w.firmware_budget = 1_000_000
    calls = []

    def run(instruction_budget):
        calls.append(instruction_budget)
        w.machine.instructions += instruction_budget
        return {}

    w.machine.run = run
    w._advance()
    assert calls == [17]
    assert w.machine.instructions == deadline
    assert not w.machine.keys["a"]
    assert not w.native_key_releases


def test_pause_releases_a_key_still_held_on_the_host():
    w = worker()
    w._key("right", True)
    w._command("pause", ())
    assert not w.machine.keys["right"]
    assert not w.native_key_starts
