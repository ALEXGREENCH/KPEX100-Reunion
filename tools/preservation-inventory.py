"""Verify preserved research ZIPs and inventory their members without executing them."""

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def digest(stream):
    result = hashlib.sha256()
    while chunk := stream.read(1024 * 1024):
        result.update(chunk)
    return result.hexdigest()


def inventory(root):
    catalog_path = root / "web/research/catalog.json"
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    archives = []
    for entry in catalog["artifacts"]:
        path = root / entry["repositoryPath"]
        if (
            path.is_symlink()
            or not path.resolve().is_relative_to((root / "research/archives").resolve())
            or path.stat().st_size != entry["bytes"]
        ):
            raise ValueError("Invalid archive path or size: " + entry["id"])
        with path.open("rb") as stream:
            archive_hash = digest(stream)
        if archive_hash != entry["sha256"]:
            raise ValueError("Archive SHA-256 mismatch: " + entry["id"])
        members = []
        seen = set()
        with zipfile.ZipFile(path) as archive:
            for info in archive.infolist():
                name = info.filename
                parts = PurePosixPath(name).parts
                if (
                    name in seen
                    or name.startswith("/")
                    or ".." in parts
                    or "\\" in name
                    or ":" in name
                    or info.flag_bits & 1
                    or (info.external_attr >> 16) & 0o170000 == 0o120000
                ):
                    raise ValueError("Unsupported ZIP member: " + name)
                seen.add(name)
                if info.is_dir():
                    continue
                # Reading to EOF checks the ZIP CRC as well as computing SHA-256.
                with archive.open(info) as stream:
                    sha = digest(stream)
                members.append(
                    {
                        "path": name,
                        "bytes": info.file_size,
                        "crc32": f"{info.CRC:08x}",
                        "sha256": sha,
                    }
                )
        archives.append(
            {
                "id": entry["id"],
                "repositoryPath": entry["repositoryPath"],
                "bytes": entry["bytes"],
                "sha256": archive_hash,
                "zipCrcPassed": True,
                "members": members,
            }
        )
    return {
        "schema": 1,
        "scope": "Every catalogued research ZIP and every direct file member. "
        "Nested archives/installers are preserved as exact files; their internal "
        "payloads have separate research audits. No vendor code executed. "
        "Member paths use Python ZIP decoding; legacy filename bytes remain "
        "unchanged in the original archives.",
        "archives": archives,
        "counts": {
            "archives": len(archives),
            "archiveBytes": sum(item["bytes"] for item in archives),
            "fileMembers": sum(len(item["members"]) for item in archives),
            "uniqueMemberHashes": len(
                {file["sha256"] for item in archives for file in item["members"]}
            ),
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True, help="New JSON file")
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Output already exists; choose a new filename")
    result = inventory(ROOT)
    with args.output.open("x", encoding="utf-8") as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    print(json.dumps(result["counts"]))


if __name__ == "__main__":
    main()
