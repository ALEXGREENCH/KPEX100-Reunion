"""Verify three S60 library SGS against fresh SIS payloads in preserved ZIPs.

Reads original bytes in memory; never installs SIS or executes native APP code.
The full repository, its research ZIPs and Python3.11+ are required.
"""

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path, PurePosixPath
import re
import zipfile


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "old_sis", ROOT / "tools/extract-old-sis.py"
)
SIS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SIS)


def digest(body):
    return hashlib.sha256(body).hexdigest()


def verify():
    evidence = json.loads(
        (ROOT / "validation/s60-library-provenance.json").read_text("utf8")
    )
    catalog = json.loads((ROOT / "web/data/catalog.json").read_text("utf8"))
    entries = {entry["id"]: entry for entry in catalog["games"]}
    reports = []
    archive_hashes = {}
    for package in evidence["packages"]:
        identifier = package["id"]
        if not re.fullmatch(r"[a-z0-9-]+", identifier):
            raise ValueError("Invalid game identity")
        source = package["sourceArchive"]
        relative = PurePosixPath(source["repositoryPath"])
        if (
            relative.is_absolute()
            or ".." in relative.parts
            or relative.parts[:2] != ("research", "archives")
        ):
            raise ValueError("Invalid source ZIP path")
        path = ROOT.joinpath(*relative.parts)
        if path.is_symlink():
            raise ValueError("Linked source ZIP")
        if path not in archive_hashes:
            data = path.read_bytes()
            archive_hashes[path] = (len(data), digest(data))
        if archive_hashes[path] != (source["bytes"], source["sha256"]):
            raise ValueError("Changed source ZIP: " + identifier)
        with zipfile.ZipFile(path) as archive:
            member = package["installer"]["archiveMember"]
            info = archive.getinfo(member)
            if info.file_size > 64 * 1024 * 1024:
                raise ValueError("SIS exceeds bounded input")
            installer = archive.read(info)
            if (
                len(installer) != package["installer"]["bytes"]
                or digest(installer) != package["installer"]["sha256"]
            ):
                raise ValueError("Changed original SIS: " + identifier)
            manifest, outputs = SIS.parse_sis(installer)
            if len(outputs) != package["freshDecodedFiles"]:
                raise ValueError("Changed decoded payload count")
            prefix = member.split("original-sis/", 1)[0]
            application = package["application"]
            folder = PurePosixPath(application["path"]).parent
            for name, body in outputs:
                if body != archive.read(prefix + str(folder / name)):
                    raise ValueError("Archived/fresh SIS payload mismatch: " + name)
            app = dict(outputs)[PurePosixPath(application["path"]).name]
            if (
                len(app) != application["bytes"]
                or digest(app) != application["sha256"]
                or app[0x10:0x14] != b"EPOC"
            ):
                raise ValueError("Changed original E32 application")
            entry = entries[identifier]
            if entry["url"] != "data/games/" + identifier + ".sgs":
                raise ValueError("Unexpected library asset path")
            game = (ROOT / "web" / entry["url"]).read_bytes()
            offset = application["sgsSourceOffset"]
            if (
                len(game) != entry["bytes"]
                or digest(game) != entry["sha256"]
                or digest(game) != package["sgs"]["sha256"]
                or app[offset : offset + len(game)] != game
            ):
                raise ValueError("SGS is not the unchanged native APP slice")
            reports.append(
                {
                    "id": identifier,
                    "freshDecodedFiles": len(outputs),
                    "uidAndBodyCrcPassed": True,
                    "allArchivedPayloadsMatch": True,
                    "sgsSha256": digest(game),
                    "exactAppSlice": True,
                }
            )
    if len(reports) != 3:
        raise ValueError("Expected the three documented S60 library additions")
    return {"ok": True, "packages": reports, "nativeCodeExecuted": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="New JSON file; never overwritten")
    args = parser.parse_args()
    if args.output and args.output.exists():
        parser.error("Output exists; select a new path")
    result = verify()
    text = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        with args.output.open("x", encoding="utf8", newline="\n") as stream:
            stream.write(text)
    print(text, end="")
