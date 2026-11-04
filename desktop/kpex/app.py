"""Desktop front end for the original ARM firmware and GNEX runtimes.

The worker owns all emulated state. Tk only renders immutable snapshots; no
firmware instruction or game event runs on the GUI thread.
"""

from __future__ import annotations

import hashlib
import json
import queue
import sys
import threading
import time
import traceback
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from PIL import Image, ImageTk


BG = "#0b1019"
PANEL = "#121b29"
PANEL2 = "#182436"
LINE = "#29384b"
TEXT = "#e7eef8"
MUTED = "#8fabc6"
ACCENT = "#73e3c1"
BLUE = "#81b3ff"
ERROR = "#ffb3a9"
FONT = "Segoe UI"
MONO = "Cascadia Mono"

KEY_CODES = {
    "left": 0x10,
    "right": 0x11,
    "up": 0x12,
    "down": 0x13,
    "a": 0x14,
    "select": 0x14,
    "b": 0x0A,
    "menu": 0x0D,
    "start": 0x15,
    "play": 0x15,
    "mode": 0x0B,
    "rec": 0x0C,
}
KEYBOARD = {
    "Left": "left",
    "Right": "right",
    "Up": "up",
    "Down": "down",
    "z": "a",
    "Z": "a",
    "x": "b",
    "X": "b",
    "Return": "start",
    "Escape": "b",
    "Tab": "menu",
    "c": "mode",
    "C": "mode",
    "v": "rec",
    "V": "rec",
}
PHYSICAL_KEYS = {90: "a", 88: "b", 67: "mode", 86: "rec"}


def application_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[1]


def _as_dict(value):
    if callable(value):
        value = value()
    return value if isinstance(value, dict) else {"value": str(value)}


class EmulatorWorker(threading.Thread):
    """Serializes emulator commands and bounds work independently of Tk."""

    def __init__(self):
        super().__init__(name="reunion-emulation", daemon=True)
        self.commands: queue.Queue = queue.Queue()
        self.updates: queue.Queue = queue.Queue(maxsize=3)
        self.machine = None
        self.mode = "none"
        self.running = False
        self.closed = False
        self.source = None
        self.rom = None
        self.game = None
        self.error = ""
        self.events = 0
        self.last_tick = 0.0
        self.timer_revision = None
        self.paused_at = None
        self.last_publish = 0.0
        self.notes = []
        self.last_run = {}
        self.audio = None
        self.audio_enabled = True
        self.smaf_enhancement = False
        self.native_key_starts = {}
        self.native_key_releases = {}

    def submit(self, action, *args):
        self.commands.put((action, args))

    def note(self, message):
        self.notes.append((time.strftime("%H:%M:%S"), str(message)))
        self.notes = self.notes[-80:]

    def _status(self):
        if self.error:
            return "error"
        if self.machine is None:
            return "ready"
        status = getattr(self.machine, "status", None)
        if status is None:
            status = _as_dict(getattr(self.machine, "diagnostics", {})).get(
                "status", "ready"
            )
        return str(status)

    def _load(self, mode, rom, game=None, run=True):
        self.running = False
        if self.audio is not None:
            self.audio.stop()
        self.machine = None
        self.native_key_starts.clear()
        self.native_key_releases.clear()
        self.error = ""
        self.events = 0
        self.last_run = {}
        self.mode, self.rom, self.game = mode, Path(rom), Path(game) if game else None
        self.source = self.game or self.rom
        if mode == "firmware":
            from .firmware import FirmwareMachine
            from .disk import bundled_disk

            games_directory = application_root() / "data" / "games"
            virtual_disk = bundled_disk(games_directory, self.rom.read_bytes())
            self.machine = FirmwareMachine(self.rom, disk_image=virtual_disk)
            self.note(f"ROM: {self.rom.name}. ARM reset готов.")
        else:
            from .gnex import GnexRuntime

            if self.audio is None:
                from .audio import AudioEngine

                self.audio = AudioEngine(
                    application_root() / "cache" / "audio",
                    enabled=self.audio_enabled,
                    smaf_enhancement=self.smaf_enhancement,
                )
            game_bytes = self.game.read_bytes()
            save_name = hashlib.sha256(game_bytes).hexdigest()[:16] + ".json"
            self.machine = GnexRuntime(
                self.rom.read_bytes(),
                game_bytes,
                save_path=application_root() / "saves" / save_name,
                audio=self.audio,
            )
            self.machine.event("START")
            self.events += 1
            self.note(f"SGS: {self.game.name}. Выполнено событие START.")
        self.running = bool(run) and self._status() not in (
            "blocked",
            "error",
            "unsupported",
            "stopped",
            "exited",
        )
        self.last_tick = time.monotonic()
        self.timer_revision = getattr(self.machine, "timer_revision", None)
        self.paused_at = None if self.running else self.last_tick

    def _sync_timer(self):
        """SetTimer re-arms even when its delay is unchanged; keys alone do not."""
        if self.mode != "game" or self.machine is None:
            return
        revision = getattr(self.machine, "timer_revision", None)
        if revision != self.timer_revision:
            self.timer_revision = revision
            self.last_tick = time.monotonic()
            if not self.running:
                self.paused_at = self.last_tick

    def _advance(self, single=False):
        if self.machine is None:
            return
        if self.mode == "firmware":
            self.last_run = (
                self.machine.run(instruction_budget=1 if single else 100_000) or {}
            )
            self._release_native_keys()
        else:
            if not getattr(self.machine, "timer_ms", None):
                if single:
                    self.note("Игра ожидает ввода; таймер отключён.")
                return
            self.machine.event("TIMEOUT")
            self.events += 1
            self.timer_revision = getattr(self.machine, "timer_revision", None)
        if self._status().lower() in (
            "blocked",
            "error",
            "unsupported",
            "stopped",
            "exited",
        ):
            self.running = False

    def _key(self, name, pressed):
        if self.machine is None:
            return
        if self.mode == "game" and not self.running and pressed:
            return
        if self.mode == "firmware":
            if pressed:
                self.native_key_starts.setdefault(name, self.machine.instructions)
                self.native_key_releases.pop(name, None)
                self.machine.key(name, True)
            else:
                start = self.native_key_starts.pop(name, self.machine.instructions)
                # Four native ADC scans plus phase margin. This makes a short
                # host tap visible when the machine runs slower than real time.
                minimum = (
                    7_000_000
                    if self.machine.rom_info["sha256"]
                    == "743d0b9a377dc6a3f0a80b7816cee575ad2f8249643876367c4bfaac54ddd19a"
                    else 0
                )
                if self.running and self.machine.instructions < start + minimum:
                    self.native_key_releases[name] = start + minimum
                else:
                    self.native_key_releases.pop(name, None)
                    self.machine.key(name, False)
        elif hasattr(self.machine, "key"):
            self.machine.key(name, pressed)
        elif hasattr(self.machine, "set_key"):
            self.machine.set_key(KEY_CODES[name], pressed)
        elif pressed:
            self.machine.event("KEYPRESS", KEY_CODES[name])
            self.events += 1
        if self._status().lower() in (
            "blocked",
            "error",
            "unsupported",
            "stopped",
            "exited",
        ):
            self.running = False

    def _release_native_keys(self, force=False):
        if self.mode != "firmware" or self.machine is None:
            return
        for name, deadline in list(self.native_key_releases.items()):
            if force or self.machine.instructions >= deadline:
                self.machine.key(name, False)
                del self.native_key_releases[name]

    def _command(self, action, args):
        if action == "close":
            self.closed = True
            self.running = False
            if self.audio is not None:
                self.audio.close()
        elif action == "audio":
            self.audio_enabled, self.smaf_enhancement = map(bool, args)
            if self.audio is not None:
                self.audio.enabled = self.audio_enabled
                self.audio.smaf_enhancement = self.smaf_enhancement
                if not self.audio_enabled:
                    self.audio.stop()
        elif action == "load":
            self._load(*args)
        elif action == "save_state":
            if self.mode == "firmware" and self.machine is not None:
                from .state import save_state

                save_state(self.machine, args[0])
                self.note(f"Состояние прошивки сохранено: {Path(args[0]).name}")
        elif action == "load_state":
            from .firmware import FirmwareMachine
            from .state import load_state

            rom, path = map(Path, args)
            restored = FirmwareMachine(rom)
            load_state(restored, path)
            for name in list(restored._held_keys):
                restored.key(name, False)
            if self.audio is not None:
                self.audio.stop()
            self.machine, self.rom, self.source = restored, rom, rom
            self.native_key_starts.clear()
            self.native_key_releases.clear()
            self.mode, self.game = "firmware", None
            self.running, self.error, self.events = False, "", 0
            self.last_run = restored.snapshot()
            self.last_tick = self.paused_at = time.monotonic()
            self.timer_revision = None
            self.note(f"Состояние восстановлено: {path.name}. Нажмите «Продолжить».")
        elif action == "run":
            if self.machine is not None and not self.error:
                if not self.running and self.paused_at is not None:
                    self.last_tick += time.monotonic() - self.paused_at
                    self.paused_at = None
                self.running = self._status() not in (
                    "blocked",
                    "error",
                    "unsupported",
                    "stopped",
                    "exited",
                )
                if (
                    self.running
                    and self.audio is not None
                    and hasattr(self.audio, "resume")
                ):
                    self.audio.resume()
        elif action == "pause":
            if self.running:
                self.paused_at = time.monotonic()
            self.running = False
            self._release_native_keys(force=True)
            if self.audio is not None and hasattr(self.audio, "resume"):
                self.audio.pause()
            self.note("Исполнение приостановлено.")
        elif action == "reset" and self.rom:
            self.note("Сброс состояния.")
            self._load(self.mode, self.rom, self.game, run=False)
        elif action == "step":
            self.running = False
            if not self.error:
                self._advance(single=True)
                self.last_tick = time.monotonic()
                self.paused_at = self.last_tick
        elif action == "key":
            self._key(*args)
        self._sync_timer()

    def _snapshot(self):
        machine = self.machine
        info = {}
        frame = None
        if machine is not None:
            if self.mode == "firmware":
                info = {
                    **self.last_run,
                    "status": getattr(machine, "status", ""),
                    "stop_reason": getattr(machine, "stop_reason", ""),
                    "instructions": getattr(machine, "instructions", 0),
                    "registers": _as_dict(getattr(machine, "registers", {})),
                    "unsupported": getattr(machine, "unsupported", []),
                    "trace": list(getattr(machine, "trace", []))[-16:],
                }
            else:
                info = dict(_as_dict(getattr(machine, "diagnostics", {})))
                info["events_dispatched"] = self.events
                info["timer_ms"] = getattr(machine, "timer_ms", None)
            source_frame = getattr(machine, "framebuffer", None)
            if callable(source_frame):
                source_frame = source_frame()
            if isinstance(source_frame, Image.Image):
                frame = source_frame.copy()
        snapshot = {
            "mode": self.mode,
            "running": self.running,
            "status": self._status(),
            "source": self.source.name if self.source else "",
            "frame": frame,
            "diagnostics": info,
            "error": self.error,
            "notes": list(self.notes),
        }
        while True:
            try:
                self.updates.put_nowait(snapshot)
                break
            except queue.Full:
                try:
                    self.updates.get_nowait()
                except queue.Empty:
                    pass
        self.last_publish = time.monotonic()

    def run(self):
        while not self.closed:
            changed = False
            try:
                try:
                    action, args = self.commands.get(timeout=0.008)
                    self._command(action, args)
                    changed = True
                except queue.Empty:
                    pass
                now = time.monotonic()
                if self.running and self.machine is not None:
                    interval = 0.005
                    if self.mode == "game":
                        timer = getattr(self.machine, "timer_ms", None)
                        # A disabled timer means that the game waits for input.
                        interval = (
                            max(0.001, float(timer) / 1000)
                            if timer and timer > 0
                            else None
                        )
                    if interval is not None and now - self.last_tick >= interval:
                        self._advance()
                        self.last_tick = time.monotonic()
                        changed = True
                if changed and now - self.last_publish >= 0.033:
                    self._snapshot()
                elif now - self.last_publish > 0.25:
                    self._snapshot()
            except Exception as exc:
                self.running = False
                self.error = f"{type(exc).__name__}: {exc}"
                self.note(self.error)
                self.note(traceback.format_exc(limit=5))
                self._snapshot()


class ReunionApp:
    def __init__(self, root: tk.Tk, rom: Path | None = None, game: Path | None = None):
        self.root = root
        self.root.title("K-PEX 100 — Reunion")
        self.root.configure(bg=BG)
        self.root.geometry("1320x850")
        self.root.minsize(1060, 710)
        self.root.protocol("WM_DELETE_WINDOW", self.close)
        self.worker = EmulatorWorker()
        self.worker.start()
        self.selected_rom = rom
        self.selected_game = game
        self.library_paths = {}
        self.current_frame = None
        self.photo = None
        self.held_keys = set()
        self.last_snapshot = {}
        self.last_info_text = ""
        self.last_log_text = ""
        self.scale_var = tk.StringVar(value="Авто")
        self.status_var = tk.StringVar(value="Готов к загрузке")
        self.mode_var = tk.StringVar(value="ОРИГИНАЛЬНЫЙ КОД · ARM + GNEX")
        self.source_var = tk.StringVar(value="Выберите прошивку или игру")
        self.rom_var = tk.StringVar(value="Прошивка не выбрана")
        self.game_var = tk.StringVar(value="Игра не выбрана")
        self.audio_var = tk.BooleanVar(value=True)
        self.smaf_var = tk.BooleanVar(value=False)
        self._style()
        self._layout()
        self._scan_library()
        self._bind_keys()
        self.root.after(40, self._poll)
        if game and self.selected_rom:
            self.root.after(150, self.launch_game)
        elif rom:
            self.root.after(150, self.boot_firmware)

    def _style(self):
        style = ttk.Style(self.root)
        style.theme_use("clam")
        style.configure("TFrame", background=BG)
        style.configure("Panel.TFrame", background=PANEL)
        style.configure("TLabel", background=BG, foreground=TEXT, font=(FONT, 10))
        style.configure(
            "TCheckbutton", background=BG, foreground=MUTED, font=(FONT, 10)
        )
        style.map(
            "TCheckbutton", background=[("active", BG)], foreground=[("active", TEXT)]
        )
        style.configure("Muted.TLabel", foreground=MUTED)
        style.configure(
            "TButton",
            background=PANEL2,
            foreground=TEXT,
            bordercolor=LINE,
            lightcolor=PANEL2,
            darkcolor=PANEL2,
            padding=(14, 9),
            font=(FONT, 10),
        )
        style.map(
            "TButton",
            background=[("active", "#2a4058"), ("pressed", "#355573")],
            foreground=[("disabled", "#536477")],
        )
        style.configure(
            "Accent.TButton",
            background=ACCENT,
            foreground="#10291f",
            font=(FONT, 10, "bold"),
        )
        style.map(
            "Accent.TButton", background=[("active", "#9bf4d8"), ("pressed", "#4bb99a")]
        )
        style.configure(
            "Treeview",
            background=PANEL,
            fieldbackground=PANEL,
            foreground=TEXT,
            bordercolor=PANEL,
            rowheight=24,
            font=(FONT, 10),
        )
        style.map(
            "Treeview",
            background=[("selected", "#294959")],
            foreground=[("selected", "#b7ffe7")],
        )
        style.configure("TNotebook", background=PANEL, borderwidth=0)
        style.configure(
            "TNotebook.Tab", background=PANEL2, foreground=MUTED, padding=(12, 8)
        )
        style.map(
            "TNotebook.Tab",
            background=[("selected", PANEL)],
            foreground=[("selected", TEXT)],
        )
        style.configure(
            "TCombobox",
            fieldbackground=PANEL2,
            background=PANEL2,
            foreground=TEXT,
            arrowcolor=TEXT,
            selectbackground=PANEL2,
            selectforeground=TEXT,
        )
        style.map(
            "TCombobox",
            fieldbackground=[("readonly", PANEL2)],
            foreground=[("readonly", TEXT)],
            selectbackground=[("readonly", PANEL2)],
            selectforeground=[("readonly", TEXT)],
        )
        style.configure(
            "Vertical.TScrollbar",
            background=LINE,
            troughcolor=PANEL,
            bordercolor=PANEL,
            arrowcolor=MUTED,
            lightcolor=LINE,
            darkcolor=LINE,
        )

    def label(self, parent, text, fg=TEXT, bg=BG, font=(FONT, 10), **kwargs):
        return tk.Label(parent, text=text, fg=fg, bg=bg, font=font, **kwargs)

    def _layout(self):
        header = tk.Frame(self.root, bg=BG)
        header.pack(fill="x", padx=26, pady=(22, 18))
        self.label(header, "K-PEX 100", font=(FONT, 23, "bold")).pack(side="left")
        self.label(header, "REUNION", fg=ACCENT, font=(FONT, 11, "bold")).pack(
            side="left", padx=(18, 0), pady=(7, 0)
        )
        audio_controls = tk.Frame(header, bg=BG)
        audio_controls.pack(side="right")
        ttk.Checkbutton(
            audio_controls,
            text="Звук",
            variable=self.audio_var,
            command=self._audio_settings,
        ).grid(row=0, column=0, sticky="e")
        ttk.Checkbutton(
            audio_controls,
            text="SMAF · доп. режим",
            variable=self.smaf_var,
            command=self._audio_settings,
        ).grid(row=0, column=1, padx=(15, 0), sticky="e")
        self.label(
            audio_controls,
            "SMAF: приближённый синтез вне оригинального K-PEX",
            fg=MUTED,
            font=(FONT, 8),
        ).grid(row=1, column=0, columnspan=2, sticky="e", pady=(3, 0))

        toolbar = tk.Frame(self.root, bg=BG)
        toolbar.pack(fill="x", padx=26, pady=(0, 18))
        ttk.Button(toolbar, text="Открыть ROM / SGS", command=self.open_file).pack(
            side="left"
        )
        ttk.Button(
            toolbar,
            text="▶ Продолжить",
            style="Accent.TButton",
            command=lambda: self.worker.submit("run"),
        ).pack(side="left", padx=(15, 6))
        ttk.Button(
            toolbar, text="Ⅱ Пауза", command=lambda: self.worker.submit("pause")
        ).pack(side="left", padx=3)
        ttk.Button(
            toolbar, text="↻ Сброс", command=lambda: self.worker.submit("reset")
        ).pack(side="left", padx=3)
        ttk.Button(
            toolbar, text="Шаг", command=lambda: self.worker.submit("step")
        ).pack(side="left", padx=3)
        scale = ttk.Combobox(
            toolbar,
            textvariable=self.scale_var,
            values=["Авто", "1×", "2×", "3×", "4×"],
            width=6,
            state="readonly",
        )
        scale.pack(side="right")
        scale.bind("<<ComboboxSelected>>", lambda _e: self._draw_frame())
        self.label(toolbar, "Масштаб", fg=MUTED).pack(side="right", padx=(12, 8))

        body = tk.Frame(self.root, bg=BG)
        body.pack(fill="both", expand=True, padx=26)
        body.columnconfigure(1, weight=1)
        body.rowconfigure(0, weight=1)

        library = tk.Frame(
            body, bg=PANEL, width=228, highlightthickness=1, highlightbackground=LINE
        )
        library.grid(row=0, column=0, sticky="nsew", padx=(0, 18))
        library.grid_propagate(False)
        library.columnconfigure(0, weight=1)
        library.rowconfigure(1, weight=1)
        self.label(
            library, "БИБЛИОТЕКА", fg=MUTED, bg=PANEL, font=(FONT, 10, "bold")
        ).grid(row=0, column=0, sticky="w", padx=16, pady=(17, 11))
        self.library = ttk.Treeview(
            library, show="tree", selectmode="browse", height=10
        )
        self.library.grid(row=1, column=0, sticky="nsew", padx=7, pady=4)
        library_scroll = ttk.Scrollbar(library, command=self.library.yview)
        library_scroll.grid(row=1, column=1, sticky="ns", padx=(0, 4), pady=4)
        self.library.configure(yscrollcommand=library_scroll.set)
        self.library.bind("<<TreeviewSelect>>", self._select_library)
        self.library.bind("<Double-1>", self._activate_library)
        footer = tk.Frame(library, bg=PANEL)
        footer.grid(row=2, column=0, columnspan=2, sticky="ew", padx=15, pady=15)
        self.label(
            footer, "Двойной щелчок — запустить", fg=MUTED, bg=PANEL, font=(FONT, 9)
        ).pack(anchor="w", pady=(0, 14))
        self.label(
            footer, "ROM для игрового движка", fg=MUTED, bg=PANEL, font=(FONT, 9)
        ).pack(anchor="w")
        tk.Label(
            footer,
            textvariable=self.rom_var,
            bg=PANEL,
            fg=TEXT,
            font=(FONT, 9),
            anchor="w",
            justify="left",
            wraplength=190,
        ).pack(fill="x", pady=(4, 10))
        ttk.Button(footer, text="Загрузить прошивку", command=self.boot_firmware).pack(
            fill="x", pady=3
        )
        if (
            application_root() / "data/states/Kingston-2.12-menu.reunion-state"
        ).is_file():
            ttk.Button(
                footer, text="Меню Kingston 2.12", command=self.open_saved_menu
            ).pack(fill="x", pady=3)
            self.label(
                footer, "Из сохранённой загрузки", fg=MUTED, bg=PANEL, font=(FONT, 8)
            ).pack(anchor="w", pady=(0, 5))
        ttk.Button(
            footer,
            text="Запустить игру",
            style="Accent.TButton",
            command=self.launch_game,
        ).pack(fill="x", pady=3)

        center = tk.Frame(body, bg=BG)
        center.grid(row=0, column=1, sticky="nsew")
        center.columnconfigure(0, weight=1)
        center.rowconfigure(1, weight=1)
        info_header = tk.Frame(center, bg=BG)
        info_header.grid(row=0, column=0, sticky="ew", pady=(0, 10))
        tk.Label(
            info_header,
            textvariable=self.source_var,
            fg=TEXT,
            bg=BG,
            font=(FONT, 16, "bold"),
            anchor="w",
        ).pack(fill="x")
        tk.Label(
            info_header,
            textvariable=self.mode_var,
            fg=MUTED,
            bg=BG,
            font=(FONT, 9),
            anchor="w",
        ).pack(fill="x", pady=(6, 0))
        self.screen = tk.Canvas(
            center,
            bg="#05080e",
            highlightthickness=1,
            highlightbackground=LINE,
            height=370,
            width=440,
        )
        self.screen.grid(row=1, column=0, sticky="nsew")
        self.screen.bind("<Configure>", lambda _e: self._draw_frame())
        self.screen.bind("<Button-1>", lambda _e: self.screen.focus_set())
        self.screen.configure(takefocus=True)

        controls = tk.Frame(center, bg=BG)
        controls.grid(row=2, column=0, pady=(12, 4), sticky="ew")
        controls.columnconfigure(1, weight=1)
        dpad = tk.Frame(controls, bg=BG)
        dpad.grid(row=0, column=0, sticky="w")
        for name, text, row, col in [
            ("up", "▲", 0, 1),
            ("left", "◀", 1, 0),
            ("down", "▼", 1, 1),
            ("right", "▶", 1, 2),
        ]:
            self._key_button(dpad, text, name, width=3).grid(
                row=row, column=col, padx=2, pady=2
            )
        middle = tk.Frame(controls, bg=BG)
        middle.grid(row=0, column=1)
        self._key_button(middle, "MENU", "menu", width=5).pack(side="left", padx=3)
        self._key_button(middle, "PLAY", "start", width=5).pack(side="left", padx=3)
        ab = tk.Frame(controls, bg=BG)
        ab.grid(row=0, column=2, sticky="e")
        self._key_button(ab, "B", "b", width=3).pack(side="left", padx=4, pady=(12, 0))
        self._key_button(ab, "A", "a", width=3).pack(side="left", padx=4, pady=(0, 12))
        self.label(
            center,
            "↑ ↓ ← →   ·   Z / X   ·   Enter — PLAY   ·   Tab — MENU",
            fg=MUTED,
            font=(FONT, 9),
        ).grid(row=3, column=0, sticky="w", pady=(6, 10))

        inspector = tk.Frame(
            body, bg=PANEL, width=260, highlightthickness=1, highlightbackground=LINE
        )
        inspector.grid(row=0, column=2, sticky="nsew", padx=(18, 0))
        inspector.grid_propagate(False)
        inspector.columnconfigure(0, weight=1)
        inspector.rowconfigure(2, weight=1)
        self.label(
            inspector, "СОСТОЯНИЕ МАШИНЫ", fg=MUTED, bg=PANEL, font=(FONT, 10, "bold")
        ).grid(row=0, column=0, sticky="w", padx=15, pady=(17, 9))
        self.status_label = tk.Label(
            inspector,
            textvariable=self.status_var,
            bg=PANEL,
            fg=ACCENT,
            font=(FONT, 12, "bold"),
            anchor="w",
            wraplength=225,
            justify="left",
        )
        self.status_label.grid(row=1, column=0, sticky="ew", padx=15, pady=(0, 15))
        tabs = ttk.Notebook(inspector)
        tabs.grid(row=2, column=0, sticky="nsew", padx=6, pady=(0, 7))
        self.details = self._text_tab(tabs, "Диагностика")
        self.log = self._text_tab(tabs, "Журнал")
        self.details.insert(
            "1.0",
            "Здесь появятся регистры ARM,\nсистемные вызовы и причины\nостановки.\n\nНа экране отображается только\nframebuffer эмулятора.",
        )
        self.details.configure(state="disabled")
        checkpoints = tk.Frame(inspector, bg=PANEL)
        checkpoints.grid(row=3, column=0, sticky="ew", padx=12, pady=(0, 12))
        self.save_state_button = ttk.Button(
            checkpoints,
            text="Сохранить состояние",
            command=self.save_machine_state,
            state="disabled",
        )
        self.save_state_button.pack(fill="x", pady=3)
        ttk.Button(
            checkpoints, text="Открыть состояние", command=self.open_machine_state
        ).pack(fill="x", pady=3)

        statusbar = tk.Frame(self.root, bg=BG)
        statusbar.pack(fill="x", padx=26, pady=(12, 13))
        self.label(
            statusbar,
            "220 × 176   •   Пиксельное масштабирование",
            fg=MUTED,
            font=(FONT, 9),
        ).pack(side="left")
        self.label(
            statusbar,
            "ARM / MMIO: экспериментально   ·   SGS: оригинальный GNEX + HLE",
            fg=MUTED,
            font=(FONT, 9),
        ).pack(side="right")

    def _text_tab(self, notebook, title):
        frame = tk.Frame(notebook, bg=PANEL)
        notebook.add(frame, text=title)
        text = tk.Text(
            frame,
            bg=PANEL,
            fg=MUTED,
            font=(MONO, 9),
            relief="flat",
            wrap="word",
            padx=9,
            pady=12,
            insertbackground=TEXT,
            highlightthickness=0,
            width=20,
            height=10,
        )
        scroll = ttk.Scrollbar(frame, command=text.yview)
        text.configure(yscrollcommand=scroll.set)
        scroll.pack(side="right", fill="y")
        text.pack(fill="both", expand=True)
        return text

    def _key_button(self, parent, text, key, width=4):
        button = tk.Button(
            parent,
            text=text,
            width=width,
            bg=PANEL2,
            fg=TEXT,
            activebackground="#355573",
            activeforeground=ACCENT,
            font=(FONT, 11, "bold"),
            relief="flat",
            bd=0,
            padx=8,
            pady=8,
            takefocus=False,
        )
        button.bind("<ButtonPress-1>", lambda _e: self._input(key, True))
        button.bind("<ButtonRelease-1>", lambda _e: self._input(key, False))
        button.bind("<Leave>", lambda _e: self._input(key, False))
        return button

    def _scan_library(self):
        self.library.delete(*self.library.get_children())
        self.library_paths.clear()
        root = application_root()
        firmware_root = self.library.insert("", "end", text="ПРОШИВКИ", open=True)
        games_root = self.library.insert("", "end", text="ИГРЫ SGS", open=True)
        firmware = (
            sorted((root / "data" / "firmware").rglob("*"))
            if (root / "data" / "firmware").exists()
            else []
        )
        games = (
            sorted((root / "data" / "games").rglob("*"))
            if (root / "data" / "games").exists()
            else []
        )
        for path in firmware:
            if path.is_file() and path.suffix.lower() == ".rom":
                name = (
                    " / ".join(path.relative_to(root / "data" / "firmware").parts[:-1])
                    or path.stem
                )
                item = self.library.insert(firmware_root, "end", text=name)
                self.library_paths[item] = ("firmware", path)
                if self.selected_rom is None or (
                    "2.12" in str(path)
                    and self.selected_rom.name.lower() != "kpex100.rom"
                ):
                    self.selected_rom = path
        for path in games:
            if path.is_file() and path.suffix.lower() == ".sgs":
                item = self.library.insert(
                    games_root, "end", text=path.stem.replace("_", " ")
                )
                self.library_paths[item] = ("game", path)
                if self.selected_game is None or (
                    path.stem.lower() == "hell_fire"
                    and self.selected_game.stem.lower() == "godori"
                ):
                    self.selected_game = path
        if self.selected_rom:
            self.rom_var.set(self._rom_display(self.selected_rom))
        if self.selected_game:
            self.game_var.set(self.selected_game.name)

    def _audio_settings(self):
        self.worker.submit("audio", self.audio_var.get(), self.smaf_var.get())

    def _rom_display(self, path):
        parts = path.parts
        if "firmware" in parts:
            return " / ".join(parts[parts.index("firmware") + 1 :])
        return path.name

    def _select_library(self, _event=None):
        selection = self.library.selection()
        if selection and selection[0] in self.library_paths:
            mode, path = self.library_paths[selection[0]]
            if mode == "firmware":
                self.selected_rom = path
                self.rom_var.set(self._rom_display(path))
            else:
                self.selected_game = path
                self.game_var.set(path.name)

    def _activate_library(self, _event=None):
        selection = self.library.selection()
        if selection and selection[0] in self.library_paths:
            mode, _path = self.library_paths[selection[0]]
            self.boot_firmware() if mode == "firmware" else self.launch_game()

    def open_file(self):
        path = filedialog.askopenfilename(
            parent=self.root,
            title="Открыть прошивку или игру",
            filetypes=[
                ("K-PEX ROM / SGS", "*.rom *.ROM *.sgs *.SGS"),
                ("Все файлы", "*.*"),
            ],
        )
        if not path:
            return
        path = Path(path)
        if path.suffix.lower() == ".sgs":
            self.selected_game = path
            self.launch_game()
        else:
            self.selected_rom = path
            self.rom_var.set(self._rom_display(path))
            self.boot_firmware()

    def _require_rom(self):
        if self.selected_rom and self.selected_rom.is_file():
            return True
        path = filedialog.askopenfilename(
            parent=self.root,
            title="Выберите ROM Kingston 2.12 для GNEX",
            filetypes=[("Прошивка ROM", "*.rom *.ROM"), ("Все файлы", "*.*")],
        )
        if path:
            self.selected_rom = Path(path)
            self.rom_var.set(self._rom_display(self.selected_rom))
            return True
        return False

    def boot_firmware(self):
        if self._require_rom():
            self._release_all()
            self.source_var.set(self.selected_rom.name)
            self.status_var.set("Загрузка ROM…")
            self.worker.submit("load", "firmware", self.selected_rom, None, True)
            self.screen.focus_set()

    def save_machine_state(self):
        if self.last_snapshot.get("mode") != "firmware":
            return
        self._release_all()
        path = filedialog.asksaveasfilename(
            parent=self.root,
            title="Сохранить состояние прошивки",
            defaultextension=".reunion-state",
            initialfile="KPEX100.reunion-state",
            filetypes=[("Состояние Reunion", "*.reunion-state")],
        )
        if path:
            self.worker.submit("save_state", path)

    def open_saved_menu(self):
        directory = application_root()
        self.selected_rom = directory / "data/firmware/Kingston-2.12.rom"
        self.rom_var.set(self._rom_display(self.selected_rom))
        self._release_all()
        self.worker.submit(
            "load_state",
            self.selected_rom,
            directory / "data/states/Kingston-2.12-menu.reunion-state",
        )
        self.worker.submit("run")
        self.screen.focus_set()

    def open_machine_state(self):
        if not self._require_rom():
            return
        path = filedialog.askopenfilename(
            parent=self.root,
            title="Открыть состояние выбранной прошивки",
            filetypes=[("Состояние Reunion", "*.reunion-state"), ("Все файлы", "*.*")],
        )
        if path:
            self._release_all()
            self.worker.submit("load_state", self.selected_rom, path)
            self.screen.focus_set()

    def launch_game(self):
        if not self.selected_game or not self.selected_game.is_file():
            path = filedialog.askopenfilename(
                parent=self.root,
                title="Выберите SGS",
                filetypes=[("Игра SGS", "*.sgs *.SGS")],
            )
            if not path:
                return
            self.selected_game = Path(path)
        if self._require_rom():
            self._release_all()
            self.source_var.set(self.selected_game.name)
            self.status_var.set("Запуск GNEX…")
            self.worker.submit(
                "load", "game", self.selected_rom, self.selected_game, True
            )
            self.screen.focus_set()

    def _bind_keys(self):
        self.root.bind("<KeyPress>", self._key_event)
        self.root.bind("<KeyRelease>", lambda event: self._key_event(event, False))
        self.root.bind("<FocusOut>", self._focus_out)
        self.root.bind("<F5>", lambda _e: self.worker.submit("run"))
        self.root.bind("<F6>", lambda _e: self.worker.submit("pause"))
        self.root.bind("<F10>", lambda _e: self.worker.submit("step"))

    def _key_event(self, event, pressed=True):
        key = KEYBOARD.get(event.keysym)
        if key is None and sys.platform == "win32":
            # Windows keycodes retain the physical Z/X/C/V keys across layouts.
            key = PHYSICAL_KEYS.get(event.keycode)
        if key is not None:
            self._input(
                key, pressed, allow_repeat=key in ("up", "down", "left", "right")
            )
            return "break"

    def _input(self, key, pressed, allow_repeat=False):
        if pressed:
            # Direction keys use the user's OS repeat delay/rate. Confirmation
            # and menu keys dispatch once per press, avoiding repeated actions.
            if key in self.held_keys and not allow_repeat:
                return
            self.held_keys.add(key)
        else:
            if key not in self.held_keys:
                return
            self.held_keys.discard(key)
        self.worker.submit("key", key, pressed)

    def _release_all(self):
        for key in list(self.held_keys):
            self._input(key, False)

    def _focus_out(self, _event):
        self.root.after_idle(
            lambda: self._release_all() if self.root.focus_get() is None else None
        )

    def _draw_frame(self):
        width, height = self.screen.winfo_width(), self.screen.winfo_height()
        self.screen.delete("all")
        if self.current_frame is None:
            self.screen.create_text(
                width // 2,
                height // 2 - 12,
                text="K-PEX 100",
                fill="#304258",
                font=(FONT, 24, "bold"),
            )
            self.screen.create_text(
                width // 2,
                height // 2 + 27,
                text="Экран эмулятора · ожидание загрузки",
                fill=MUTED,
                font=(FONT, 10),
            )
            return
        frame = self.current_frame
        maximum = max(
            1, min((width - 20) // frame.width, (height - 20) // frame.height)
        )
        requested = (
            maximum if self.scale_var.get() == "Авто" else int(self.scale_var.get()[0])
        )
        factor = min(maximum, requested)
        rendered = frame.resize(
            (frame.width * factor, frame.height * factor), Image.Resampling.NEAREST
        )
        self.photo = ImageTk.PhotoImage(rendered)
        self.screen.create_image(width // 2, height // 2, image=self.photo)

    @staticmethod
    def _replace_text(widget, value):
        previous = widget.yview()
        widget.configure(state="normal")
        widget.delete("1.0", "end")
        widget.insert("1.0", value)
        widget.configure(state="disabled")
        if previous:
            widget.yview_moveto(previous[0])

    def _poll(self):
        snapshot = None
        try:
            while True:
                snapshot = self.worker.updates.get_nowait()
        except queue.Empty:
            pass
        if snapshot:
            self.last_snapshot = snapshot
            mode = snapshot["mode"]
            self.save_state_button.configure(
                state="normal" if mode == "firmware" else "disabled"
            )
            labels = {
                "ready": "Готов",
                "running": "Исполняется",
                "paused": "Пауза",
                "blocked": "Остановка: периферия",
                "error": "Ошибка исполнения",
                "unsupported": "Не поддерживается",
                "stopped": "Остановлен",
                "exited": "Игра завершена",
                "idle": "Ожидание события",
            }
            state = snapshot["status"].lower()
            status = labels.get(state, snapshot["status"])
            if (
                mode != "none"
                and not snapshot["running"]
                and state
                not in ("blocked", "error", "unsupported", "stopped", "exited")
            ):
                status = "Пауза"
            elif snapshot["running"] and state in ("ready", "paused"):
                status = "Исполняется"
            self.status_var.set(status if mode != "none" else "Готов к загрузке")
            self.status_label.configure(
                fg=ERROR if state in ("blocked", "error", "unsupported") else ACCENT
            )
            if snapshot["source"]:
                self.source_var.set(snapshot["source"])
            self.mode_var.set(
                {
                    "firmware": "ПРОШИВКА · ARM940T / МОДЕЛЬ TCC76",
                    "game": "ИГРА SGS · ОРИГИНАЛЬНЫЙ GNEX / HLE",
                    "none": "ОРИГИНАЛЬНЫЙ КОД · ARM + GNEX",
                }[mode]
            )
            if snapshot["frame"] is not None or self.current_frame is not None:
                self.current_frame = snapshot["frame"]
                self._draw_frame()
            diagnostics = snapshot["diagnostics"]
            if snapshot["error"]:
                diagnostics = {"error": snapshot["error"], **diagnostics}
            info_text = json.dumps(
                diagnostics, indent=2, ensure_ascii=False, default=str
            )
            if diagnostics and info_text != self.last_info_text:
                self._replace_text(self.details, info_text[:18000])
                self.last_info_text = info_text
            log_text = "\n\n".join(
                f"{stamp}  {message}" for stamp, message in snapshot["notes"]
            )
            if log_text != self.last_log_text:
                self._replace_text(self.log, log_text)
                self.log.see("end")
                self.last_log_text = log_text
        if not self.worker.closed:
            self.root.after(40, self._poll)

    def close(self):
        self._release_all()
        self.worker.submit("close")
        self.root.destroy()


def main(rom=None, game=None):
    root = tk.Tk()
    ReunionApp(root, Path(rom) if rom else None, Path(game) if game else None)
    root.mainloop()


if __name__ == "__main__":
    main()
