"""Build a Unicorn-compatible PyInstaller bootloader in this Python environment.

Unicorn's generated-code returns are incompatible with the stock MSVC bootloader's
Control Flow Guard. Use PyInstaller's supported --no-cfg build option, affecting
only our bootloader; no operating-system security settings are changed.
https://pyinstaller.org/en/stable/bootloader-building.html
https://github.com/pyinstaller/pyinstaller/issues/9352
"""

import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys

import PyInstaller


def has_cfg(path):
    data = Path(path).read_bytes()
    pe_offset = struct.unpack_from("<I", data, 0x3C)[0]
    characteristics = struct.unpack_from("<H", data, pe_offset + 24 + 70)[0]
    return bool(characteristics & 0x4000)


def main():
    if sys.platform != "win32":
        raise SystemExit("This release builder targets 64-bit Windows.")
    bootloaders = (
        Path(PyInstaller.__file__).parent / "bootloader" / "Windows-64bit-intel"
    )
    if all(
        (bootloaders / name).is_file() and not has_cfg(bootloaders / name)
        for name in ("run.exe", "runw.exe")
    ):
        print("Unicorn-compatible bootloader already installed.")
        return
    waf_args = "--no-cfg"
    # LLVM-MinGW is usable without a system-wide Visual Studio installation.
    clang = shutil.which("clang")
    if clang:
        version = subprocess.check_output([clang, "--version"], text=True)
        if "windows-gnu" in version or "mingw" in version.lower():
            waf_args += " --clang"
    env = os.environ.copy()
    env["PYINSTALLER_COMPILE_BOOTLOADER"] = "1"
    env["PYINSTALLER_BOOTLOADER_WAF_ARGS"] = waf_args
    subprocess.run(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "--verbose",
            "--no-cache-dir",
            "--force-reinstall",
            "--no-deps",
            "--no-binary=pyinstaller",
            f"pyinstaller=={PyInstaller.__version__}",
        ],
        env=env,
        check=True,
    )
    for name in ("run.exe", "runw.exe"):
        if has_cfg(bootloaders / name):
            raise RuntimeError(
                f"{name} still has CFG enabled; cannot package Unicorn safely."
            )
    print("Unicorn-compatible bootloader ready.")


if __name__ == "__main__":
    main()
