"""Build the Reunion GNEX benchmark with Sinjisoft's SDK 2.12."""

import argparse
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sgs_build import build_sgs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sdk", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--plain", action="store_true", help="omit the K-PEX encoding")
    args = parser.parse_args()
    sgs = build_sgs(args.sdk, Path(__file__).with_name("gnex-bench.mc"))
    if not args.plain:
        sgs = bytes(byte ^ 0xA5 for byte in sgs)
    args.output.write_bytes(sgs)


if __name__ == "__main__":
    main()
