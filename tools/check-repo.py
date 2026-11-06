"""Check tracked source files, bundled original hashes and excluded build directories."""

from pathlib import Path
import subprocess
import sys
import hashlib
import json
from functools import cache

ROOT = Path(__file__).resolve().parents[1]


@cache
def original_files():
    catalog = json.loads((ROOT / "web/data/catalog.json").read_text(encoding="utf-8"))
    entries = [
        entry for group in ("firmwares", "games", "states") for entry in catalog[group]
    ]
    entries.extend(
        json.loads((ROOT / "web/devices/catalog.json").read_text(encoding="utf-8"))[
            "skins"
        ]
    )
    entries.append(
        {
            "url": "engine/vendor/swerve/swv21brew.mod",
            "bytes": 273188,
            "sha256": "1e76412e158bc3948bf6ad173b181368e0f0d554d6b0e1488a29402d96b0cdab",
        }
    )
    for entry in entries:
        if not (ROOT / "web" / entry["url"]).resolve().is_relative_to(ROOT / "web"):
            raise ValueError("Catalogue asset escapes web directory")
    result = {"web/" + entry["url"]: entry for entry in entries}
    research = json.loads(
        (ROOT / "web/research/catalog.json").read_text(encoding="utf-8")
    )["artifacts"]
    for entry in research:
        name = entry["repositoryPath"]
        path = (ROOT / name).resolve()
        if (
            not path.is_relative_to(ROOT / "research/archives")
            or path.suffix != ".zip"
            or name in result
        ):
            raise ValueError("Invalid research archive path")
        result[name] = entry
    return result


def tracked_files():
    result = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, check=True, capture_output=True
    )
    return [name for name in result.stdout.decode("utf-8").split("\0") if name]


def forbidden(name):
    if name in original_files():
        return False
    path = Path(name)
    if name.startswith("research/"):
        return True
    if any(
        part
        in {
            "node_modules",
            ".openai",
            "__pycache__",
            ".venv",
            "site",
            "saves",
            ".pytest_cache",
        }
        for part in path.parts
    ):
        return True
    if path.suffix.lower() in {
        ".rom",
        ".sgs",
        ".mod",
        ".exe",
        ".dll",
        ".kps",
        ".pyc",
        ".reunion-state",
    }:
        return True
    if name.startswith("web/data/") and name not in {
        "web/data/catalog.json",
        "web/data/availability.json",
    }:
        return True
    if name.startswith("desktop/data/") and path.suffix != ".json":
        return True
    return False


def main():
    names = tracked_files()
    errors = [name for name in names if forbidden(name) or (ROOT / name).is_symlink()]
    if errors:
        print("Files that must not be tracked:\n" + "\n".join(errors))
        return 1
    if not names:
        print("No tracked files; initialize and stage the source repository first.")
        return 1
    for name, entry in original_files().items():
        path = ROOT / name
        if (
            name not in names
            or not path.is_file()
            or path.stat().st_size != entry["bytes"]
            or hashlib.sha256(path.read_bytes()).hexdigest() != entry["sha256"]
        ):
            print("Missing or changed bundled original: " + name)
            return 1
    print(
        f"Checked {len(names)} tracked files and {len(original_files())} original hashes."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
