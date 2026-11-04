"""Host scheduling regressions: key repeat must not starve game timers."""

from types import SimpleNamespace

import pytest

from kpex.app import EmulatorWorker
from kpex.gnex import GnexRuntime


def worker_with_timer():
    worker = EmulatorWorker()
    worker.mode = "game"
    worker.machine = SimpleNamespace(timer_ms=1000, timer_revision=1, status="idle")
    worker.running = True
    worker.timer_revision = 1
    worker.last_tick = 10.0
    return worker


def test_set_timer_same_delay_rearms_but_plain_key_does_not(monkeypatch):
    worker = worker_with_timer()
    monkeypatch.setattr("kpex.app.time.monotonic", lambda: 10.8)
    worker._sync_timer()  # Ordinary keypress, no SetTimer call.
    assert worker.last_tick == 10.0
    worker.machine.timer_revision += 1  # SetTimer(1000, repeat) again.
    worker._sync_timer()
    assert worker.last_tick == 10.8
    monkeypatch.setattr("kpex.app.time.monotonic", lambda: 10.9)
    worker._sync_timer()  # Another held-arrow repeat must preserve deadline.
    assert worker.last_tick == 10.8


def test_pause_preserves_remaining_interval(monkeypatch):
    worker = worker_with_timer()
    monkeypatch.setattr("kpex.app.time.monotonic", lambda: 10.4)
    worker._command("pause", ())
    assert not worker.running
    monkeypatch.setattr("kpex.app.time.monotonic", lambda: 100.4)
    worker._command("run", ())
    assert worker.running
    assert worker.last_tick == pytest.approx(100.0)
    assert 100.4 - worker.last_tick == pytest.approx(0.4)


def test_disabled_timer_never_dispatches_synthetic_timeout():
    worker = worker_with_timer()
    worker.machine.timer_ms = None
    worker.machine.event = lambda *_: pytest.fail("disabled timer dispatched TIMEOUT")
    worker._advance(single=True)
    assert worker.events == 0


def test_native_timer_syscalls_publish_rearm_and_cancel():
    # Exercise the syscall boundary without booting a guest CPU.
    runtime = object.__new__(GnexRuntime)
    runtime.vfs = SimpleNamespace(syscall=lambda *_: False)
    runtime.timer_revision = 0
    runtime._args = lambda _n: [1000, 1]
    assert runtime._syscall(0x95)
    assert (runtime.timer_ms, runtime.timer_repeat, runtime.timer_revision) == (
        1000,
        True,
        1,
    )
    runtime._syscall(0x95)
    assert runtime.timer_revision == 2
    runtime._args = lambda _n: [0, 0]
    runtime._syscall(0x95)
    assert runtime.timer_ms is None
    assert runtime.timer_revision == 3
    runtime._syscall(0x98)
    assert runtime.timer_ms is None
    assert runtime.timer_revision == 4
