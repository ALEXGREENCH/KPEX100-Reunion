#!/usr/bin/env python3
"""Verify or import local firmware/game assets by their catalogue SHA-256."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys

PROJECT = Path(__file__).resolve().parents[1]
WEB = PROJECT / "web"


def digest(path):
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def entries():
    catalog = json.loads((WEB / "data/catalog.json").read_text(encoding="utf-8"))
    assets = [
        item for group in ("firmwares", "games", "states") for item in catalog[group]
    ]
    assets.append(
        {
            "id": "swerve-2.1",
            "url": "engine/vendor/swerve/swv21brew.mod",
            "bytes": 273188,
            "sha256": "1e76412e158bc3948bf6ad173b181368e0f0d554d6b0e1488a29402d96b0cdab",
        }
    )
    for entry in assets:
        target = (WEB / entry["url"]).resolve()
        if not target.is_relative_to(WEB.resolve()):
            raise ValueError("Asset target escapes web: " + entry["id"])
    return assets


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["verify", "import"])
    parser.add_argument(
        "directory",
        nargs="?",
        type=Path,
        help="Local directory containing unpacked originals or another Reunion build",
    )
    parser.add_argument(
        "--allow-missing",
        action="store_true",
        help="Accept a partial collection; changed files always fail",
    )
    args = parser.parse_args()
    assets = entries()
    if args.command == "import":
        if args.directory is None or not args.directory.is_dir():
            parser.error("import requires an existing input directory")
        wanted = {entry["sha256"]: entry for entry in assets}
        sizes = {entry["bytes"] for entry in assets}
        copied = 0
        for directory, dirs, names in os.walk(args.directory, followlinks=False):
            dirs[:] = [
                name for name in dirs if not (Path(directory) / name).is_symlink()
            ]
            for name in names:
                source = Path(directory) / name
                if (
                    source.is_symlink()
                    or not source.is_file()
                    or source.stat().st_size not in sizes
                ):
                    continue
                entry = wanted.get(digest(source))
                if entry is None:
                    continue
                target = WEB / entry["url"]
                if target.exists():
                    if digest(target) != entry["sha256"]:
                        raise ValueError(
                            "Refusing to replace a different file: " + str(target)
                        )
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                with source.open("rb") as incoming, target.open("xb") as outgoing:
                    shutil.copyfileobj(incoming, outgoing)
                copied += 1
        print(f"Imported {copied} matching files.")
    missing, invalid = [], []
    for entry in assets:
        target = WEB / entry["url"]
        if not target.is_file():
            missing.append(entry["id"])
        elif (
            target.stat().st_size != entry["bytes"] or digest(target) != entry["sha256"]
        ):
            invalid.append(entry["id"])
    print(
        json.dumps(
            {
                "verified": len(assets) - len(missing) - len(invalid),
                "missing": missing,
                "invalid": invalid,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    available = [
        entry["id"] for entry in assets if entry["id"] not in missing + invalid
    ]
    manifest = WEB / "data/availability.json"
    manifest.write_text(
        json.dumps({"version": 1, "assets": available}, indent=2) + "\n",
        encoding="utf-8",
    )
    return int(
        bool(
            invalid or (missing and args.command == "verify" and not args.allow_missing)
        )
    )


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
