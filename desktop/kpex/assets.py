"""Prepare the desktop collection from the repository's shared original files."""

import hashlib
import json
import os
from pathlib import Path
import shutil
import sys


def asset_root():
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[1]


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def entries(root):
    records = json.loads((root / "data/manifest.json").read_text(encoding="utf-8"))
    for record in records:
        target = (root / record["path"]).resolve()
        if not target.is_relative_to((root / "data").resolve()):
            raise ValueError("Asset path escapes desktop/data")
    return records


def verify(root, records=None):
    records = entries(root) if records is None else records
    missing, invalid, present = [], [], []
    for record in records:
        target = root / record["path"]
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


def import_assets(source_directory, root, records=None):
    records = entries(root) if records is None else records
    wanted = {record["sha256"]: record for record in records}
    sizes = {record["size"] for record in records}
    copied = 0
    for directory, folders, names in os.walk(source_directory, followlinks=False):
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
            target = root / record["path"]
            if target.exists():
                if digest(target) != record["sha256"]:
                    raise ValueError(f"Refusing to overwrite modified file: {target}")
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with source.open("rb") as incoming, target.open("xb") as outgoing:
                shutil.copyfileobj(incoming, outgoing)
            copied += 1
    return copied


def prepare_bundled_assets(root=None):
    """Copy missing known assets once; existing local files are never overwritten."""
    root = asset_root() if root is None else Path(root)
    source = root.parent / "web"
    if not source.is_dir():
        return 0
    missing = [
        record for record in entries(root) if not (root / record["path"]).is_file()
    ]
    return import_assets(source, root, missing) if missing else 0
