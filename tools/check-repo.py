"""Check tracked source files for historical binaries and build/cache directories."""

from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def tracked_files():
    result = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, check=True, capture_output=True
    )
    return [name for name in result.stdout.decode("utf-8").split("\0") if name]


def forbidden(name):
    path = Path(name)
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
    if path.suffix.lower() in {".rom", ".sgs", ".mod", ".exe", ".dll", ".kps", ".pyc"}:
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
    print(
        f"Checked {len(names)} tracked source files: no historical binaries or generated directories."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
