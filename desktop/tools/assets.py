"""Import or verify external desktop ROM/SGS files by their preserved SHA-256."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def entries():
    records = json.loads((ROOT / "data/manifest.json").read_text(encoding="utf-8"))
    for record in records:
        target = (ROOT / record["path"]).resolve()
        if not target.is_relative_to((ROOT / "data").resolve()):
            raise ValueError("Asset path escapes desktop/data")
    return records


def verify(records):
    missing, invalid, present = [], [], []
    for record in records:
        target = ROOT / record["path"]
        if not target.is_file():
            missing.append(record["path"])
        elif (
            target.stat().st_size != record["size"]
            or digest(target) != record["sha256"]
        ):
            invalid.append(record["path"])
        else:
            present.append(record["path"])
    return {"verified": len(present), "missing": missing, "invalid": invalid}


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
    records = entries()
    copied = 0
    if args.command == "import":
        if args.directory is None or not args.directory.is_dir():
            parser.error("import requires an existing directory of unpacked originals")
        wanted = {record["sha256"]: record for record in records}
        sizes = {record["size"] for record in records}
        for directory, folders, names in os.walk(args.directory, followlinks=False):
            folders[:] = [
                name for name in folders if not (Path(directory) / name).is_symlink()
            ]
            for name in names:
                source = Path(directory) / name
                if (
                    source.is_symlink()
                    or not source.is_file()
                    or source.stat().st_size not in sizes
                ):
                    continue
                record = wanted.get(digest(source))
                if record is None:
                    continue
                target = ROOT / record["path"]
                if target.exists():
                    if digest(target) != record["sha256"]:
                        raise ValueError(
                            f"Refusing to overwrite modified file: {target}"
                        )
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                with source.open("rb") as incoming, target.open("xb") as outgoing:
                    shutil.copyfileobj(incoming, outgoing)
                copied += 1
    result = verify(records)
    print(json.dumps({"imported": copied, **result}, indent=2))
    return 1 if result["invalid"] or (args.require_all and result["missing"]) else 0


if __name__ == "__main__":
    raise SystemExit(main())
