"""Build the optional desktop SMAF decoder from the shared vendored C++ source."""

import argparse
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / "vendor/yamaha-smaf-player"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--compiler", default="clang++", help="C++20 compiler (LLVM-MinGW on Windows)")
    args = parser.parse_args()
    compiler = shutil.which(args.compiler)
    if not compiler:
        parser.error(f"Compiler not found: {args.compiler}")
    output = ROOT / "bin/smaf-render.exe"
    output.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            compiler,
            "-std=c++20",
            "-O2",
            "-static",
            "-I" + str(SOURCE / "src"),
            str(SOURCE / "example/smaf-render.cpp"),
            *[str(SOURCE / "src" / name) for name in ("smaf_file.cpp", "smaf_voice.cpp", "ma_player.cpp", "ma_fm_core.cpp")],
            "-o",
            str(output),
        ],
        check=True,
    )
    print(output)


if __name__ == "__main__":
    main()
