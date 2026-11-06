"""Inspect preserved GNEX Club SDK pages as data; never submit their download forms."""

from pathlib import Path
import argparse
import base64
import hashlib
import json
import re
import zipfile


def inspect(data):
    text = data.decode("cp949", errors="replace")
    return {
        "sha256": hashlib.sha256(data).hexdigest(),
        "gnexFormFilenames": sorted(
            set(re.findall(r"fname\.value\s*=\s*['\"](GNEX[^'\"]+)['\"]", text))
        ),
        "gvmFormFilenames": sorted(
            set(re.findall(r"fname\.value\s*=\s*['\"](GVM[^'\"]+)['\"]", text))
        ),
        "directFileLinks": sorted(set(re.findall(r"href=[\"'](/file/[^\"']+)", text))),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    args = parser.parse_args()
    with zipfile.ZipFile(args.archive) as archive:
        records = json.loads(archive.read("evidence/sdk-snapshot-retrievals.json"))
        rows = []
        for record in records:
            if not record["id"].startswith("download-"):
                continue
            timestamp = record["id"].removeprefix("download-")
            data = archive.read(f"originals/sdk-pages/{timestamp}.html")
            result = inspect(data)
            if result["sha256"] != record["sha256"]:
                raise ValueError(f"Changed original: {timestamp}")
            digest = base64.b32encode(hashlib.sha1(data).digest()).decode().rstrip("=")
            rows.append(
                dict(
                    timestamp=timestamp,
                    matchesRequestedCdx=digest == record["cdxSha1"],
                    **result,
                )
            )
        if not rows:
            raise ValueError("No preserved SDK pages")
    print(json.dumps(rows, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
