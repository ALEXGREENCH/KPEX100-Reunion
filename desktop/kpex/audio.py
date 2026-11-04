"""Asynchronous Windows sound output at the GNEX device boundary.

The K2.12 adapter accepts sound subtype 7/8 only (ROM file 0x3CFA0).
SMAF type 2 is an explicit optional enhancement using the bundled Apache-2.0
FM synthesizer. Its preset instruments approximate the undumped Yamaha ROM.
"""

from __future__ import annotations
import ctypes
import hashlib
import os
from pathlib import Path
import queue
import struct
import subprocess
import threading
import wave


class AudioError(ValueError):
    pass


def extract_mp3(payload):
    """Find a real MPEG Layer III stream, checking consecutive frame headers."""
    rates = (44100, 48000, 32000)
    for start in range(min(4096, len(payload) - 8)):
        pos, frames = start, 0
        while pos + 4 <= len(payload):
            header = int.from_bytes(payload[pos : pos + 4], "big")
            version, layer = (header >> 19) & 3, (header >> 17) & 3
            bitrate_index, rate_index = (header >> 12) & 15, (header >> 10) & 3
            if (
                header >> 21 != 0x7FF
                or version == 1
                or layer != 1
                or not 1 <= bitrate_index <= 14
                or rate_index == 3
            ):
                break
            bitrates = (
                (0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320)
                if version == 3
                else (0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160)
            )
            rate = rates[rate_index] // (
                1 if version == 3 else 2 if version == 2 else 4
            )
            length = (144000 if version == 3 else 72000) * bitrates[
                bitrate_index
            ] // rate + ((header >> 9) & 1)
            if pos + length > len(payload):
                break
            frames += 1
            pos += length
        if frames >= 2:
            return payload[start:pos]
    raise AudioError("No complete MPEG Layer III frame sequence in sound resource")


class AudioEngine:
    def __init__(self, cache_dir, enabled=True, smaf_enhancement=False):
        self.cache_dir = Path(cache_dir)
        self.enabled = enabled
        self.smaf_enhancement = smaf_enhancement
        self.last_error = None
        self.last_format = None
        self.last_mode = None
        self.play_count = 0
        self.ignored_native_subtypes = set()
        self._generation = 0
        self._closed = False
        self._queue = queue.Queue(maxsize=1)
        self._thread = None
        self._lock = threading.RLock()
        self._alias = f"reunion_{id(self):x}"
        self._winmm = ctypes.WinDLL("winmm") if os.name == "nt" else None
        if self._winmm:
            self._winmm.mciSendStringW.argtypes = (
                ctypes.c_wchar_p,
                ctypes.c_wchar_p,
                ctypes.c_uint,
                ctypes.c_void_p,
            )
            self._winmm.mciSendStringW.restype = ctypes.c_uint

    @property
    def diagnostics(self):
        return dict(
            enabled=self.enabled,
            smaf_enhancement=self.smaf_enhancement,
            last_format=self.last_format,
            last_error=self.last_error,
            last_mode=self.last_mode,
            play_count=self.play_count,
            ignored_native_subtypes=sorted(self.ignored_native_subtypes),
            synthesis="Optional SMAF: approximate FM preset bank; MP3 uses Windows decoder",
        )

    def prepare(self, payload, allow_smaf=None):
        """Decode/cache without playback; usable for headless audio verification."""
        if len(payload) < 2 or len(payload) > 16 * 1024 * 1024:
            raise AudioError("Invalid GNEX sound resource length")
        subtype = struct.unpack_from("<H", payload)[0]
        allow_smaf = self.smaf_enhancement if allow_smaf is None else allow_smaf
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        key = hashlib.sha256(payload).hexdigest()
        if subtype == 8:
            target = self.cache_dir / (key + ".mp3")
            if not target.exists():
                target.write_bytes(extract_mp3(payload))
            return target
        if subtype == 7:
            start = payload.find(b"RIFF", 2, 1024)
            if start < 0 or payload[start + 8 : start + 12] != b"WAVE":
                raise AudioError("Subtype 7 resource has no recognized WAVE header")
            size = struct.unpack_from("<I", payload, start + 4)[0] + 8
            if size > len(payload) - start:
                raise AudioError("Truncated subtype 7 WAVE")
            target = self.cache_dir / (key + ".wav")
            if not target.exists():
                target.write_bytes(payload[start : start + size])
            return target
        if subtype == 2 and allow_smaf:
            if payload[2:6] != b"MMMD" or len(payload) < 10:
                raise AudioError("SMAF sound lacks MMMD header")
            length = int.from_bytes(payload[6:10], "big") + 8
            if length > len(payload) - 2:
                raise AudioError("Truncated SMAF sound")
            target = self.cache_dir / (key + "-fm1.wav")
            if target.exists():
                return target
            source = self.cache_dir / (key + ".mmf")
            source.write_bytes(payload[2 : 2 + length])
            executable = (
                Path(__file__).resolve().parent.parent / "bin" / "smaf-render.exe"
            )
            if not executable.is_file():
                raise AudioError("Optional SMAF renderer is not installed")
            result = subprocess.run(
                [str(executable), str(source), str(target), "180"],
                capture_output=True,
                timeout=30,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            if result.returncode not in (0, 3):
                raise AudioError(
                    "SMAF renderer failed: "
                    + result.stdout.decode("utf8", "replace")[-300:]
                )
            with wave.open(str(target), "rb") as wav:
                if not wav.getnframes() or wav.getnchannels() != 2:
                    raise AudioError("SMAF renderer produced no stereo PCM")
            return target
        self.ignored_native_subtypes.add(subtype)
        return None  # Matches the original K2.12 sound adapter's silent return.

    def _mci(self, command, ignore_error=False):
        if self._winmm is None:
            raise AudioError("Windows audio output is unavailable on this platform")
        buffer = ctypes.create_unicode_buffer(256)
        result = self._winmm.mciSendStringW(command, buffer, len(buffer), None)
        if result and not ignore_error:
            error = ctypes.create_unicode_buffer(256)
            self._winmm.mciGetErrorStringW(result, error, len(error))
            raise AudioError(f"Windows audio {result}: {error.value}")
        return buffer.value

    def _stop_device(self):
        if self._winmm:
            self._mci(f"close {self._alias}", ignore_error=True)

    def play(self, payload):
        if not self.enabled or self._closed:
            return
        with self._lock:
            self._generation += 1
            request = (self._generation, "play", bytes(payload))
            try:
                self._queue.get_nowait()
            except queue.Empty:
                pass
            self._queue.put_nowait(request)
            if self._thread is None:
                self._thread = threading.Thread(
                    target=self._worker, name="ReunionAudio", daemon=True
                )
                self._thread.start()

    def _worker(self):
        try:
            while not self._closed:
                try:
                    generation, command, payload = self._queue.get(timeout=0.5)
                except queue.Empty:
                    continue
                try:
                    if command == "stop":
                        self._stop_device()
                        self.last_mode = "stopped"
                        continue
                    if command == "pause":
                        self._mci(f"pause {self._alias}", ignore_error=True)
                        self.last_mode = "paused"
                        continue
                    if command == "resume":
                        self._mci(f"resume {self._alias}", ignore_error=True)
                        self.last_mode = (
                            self._mci(f"status {self._alias} mode", ignore_error=True)
                            or "stopped"
                        )
                        continue
                    path = self.prepare(payload)
                    if path is None:
                        continue
                    with self._lock:
                        if (
                            generation != self._generation
                            or not self.enabled
                            or self._closed
                        ):
                            continue
                        self._stop_device()
                        kind = "mpegvideo" if path.suffix == ".mp3" else "waveaudio"
                        self._mci(
                            f'open "{path.resolve()}" type {kind} alias {self._alias}'
                        )
                        self._mci(f"play {self._alias}")
                        self.last_mode = self._mci(f"status {self._alias} mode")
                        self.last_format = (
                            "MP3"
                            if kind == "mpegvideo"
                            else "SMAF FM" if payload[:2] == b"\x02\0" else "WAVE"
                        )
                        self.last_error = None
                        self.play_count += 1
                except Exception as exc:
                    self.last_error = str(exc)
        finally:
            self._stop_device()

    def _control(self, command):
        with self._lock:
            self._generation += 1
            try:
                self._queue.get_nowait()
            except queue.Empty:
                pass
            if self._thread:
                self._queue.put_nowait((self._generation, command, None))

    def stop(self):
        self._control("stop")

    def pause(self):
        self._control("pause")

    def resume(self):
        self._control("resume")

    def close(self):
        self._closed = True
        self.stop()
