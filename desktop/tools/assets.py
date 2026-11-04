"""Import or verify desktop ROM/SGS files by their preserved SHA-256."""

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from kpex.assets import import_assets, verify


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("import", "verify"))
    parser.add_argument("directory", nargs="?", type=Path)
    parser.add_argument(
        "--require-all",
        action="store_true",
        help="Fail if any catalogued original is missing",
    )
    args = parser.parse_args()
    copied = 0
    if args.command == "import":
        if args.directory is None or not args.directory.is_dir():
            parser.error("import requires an existing directory of unpacked originals")
        copied = import_assets(args.directory, ROOT)
    result = verify(ROOT)
    print(json.dumps({"imported": copied, **result}, indent=2))
    return 1 if result["invalid"] or (args.require_all and result["missing"]) else 0


if __name__ == "__main__":
    raise SystemExit(main())
