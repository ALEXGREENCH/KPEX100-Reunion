"""Create a deterministic source ZIP from Git-tracked working files, without originals."""

from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "check_repo", ROOT / "tools/check-repo.py"
)
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    if output.is_relative_to(ROOT) or output.exists():
        parser.error("Choose a new ZIP outside the repository")
    if checker.main():
        parser.error("Source checks failed")
    output.parent.mkdir(parents=True, exist_ok=True)
    manifest = []
    with zipfile.ZipFile(
        output, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=9
    ) as archive:
        for name in sorted(checker.tracked_files()):
            data = (ROOT / name).read_bytes()
            if name == "web/data/availability.json":
                data = b'{"version":1,"assets":[]}\n'
            info = zipfile.ZipInfo(
                "KPEX100-Reunion/" + name, date_time=(2026, 11, 5, 0, 0, 0)
            )
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, data)
            manifest.append(
                {
                    "path": name,
                    "bytes": len(data),
                    "sha256": hashlib.sha256(data).hexdigest(),
                }
            )
        info = zipfile.ZipInfo(
            "KPEX100-Reunion/source-manifest.json", date_time=(2026, 11, 5, 0, 0, 0)
        )
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, json.dumps(manifest, indent=2) + "\n")
    print(
        f"Created {output.name}: {len(manifest)} source files, SHA-256 {hashlib.sha256(output.read_bytes()).hexdigest()}"
    )


if __name__ == "__main__":
    main()
