"""Rebuild the optional browser SMAF synthesizer with Emscripten 3.1.64."""

from pathlib import Path
import argparse
import shutil
import subprocess
import sys

project = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--emcc", default="em++", help="em++ executable or em++.py")
args = parser.parse_args()
source = project / "vendor/yamaha-smaf-player"
output = project / "web/engine/vendor"
output.mkdir(parents=True, exist_ok=True)
compiler = [sys.executable, args.emcc] if args.emcc.endswith(".py") else [args.emcc]
subprocess.run(
    compiler
    + [
        "-std=c++20",
        "-O3",
        "-fno-exceptions",
        "-fno-rtti",
        "-I" + str(source / "src"),
        str(project / "tools/smaf-wrapper.cpp"),
        *map(str, sorted((source / "src").glob("*.cpp"))),
        "-sMODULARIZE=1",
        "-sEXPORT_ES6=1",
        "-sEXPORT_NAME=createSmafModule",
        "-sENVIRONMENT=web,worker",
        "-sALLOW_MEMORY_GROWTH=1",
        "-sFILESYSTEM=0",
        '-sEXPORTED_FUNCTIONS=["_malloc","_free","_smaf_create","_smaf_render","_smaf_destroy"]',
        '-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32"]',
        "-o",
        str(output / "smaf.mjs"),
    ],
    check=True,
)
shutil.copy2(source / "LICENSE", output / "smaf-LICENSE.txt")
print("Built web/engine/vendor/smaf.mjs and smaf.wasm")
