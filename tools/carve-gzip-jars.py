"""Recover complete JARs stored in gzip streams without running an installer.

This is a bounded signature carver, not a parser for every Nokia installer.
Python 3.11+, standard library only. Original compressed input remains unchanged.
"""

import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import sys
import zipfile
import zlib

MAX_INPUT = 64 * 1024 * 1024
MAX_INFLATED = 16 * 1024 * 1024
MAX_TOTAL_INFLATED = 128 * 1024 * 1024
MAX_STREAMS = 4096
MAX_MEMBERS = 4096


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def jar_metadata(data):
    """Recognize complete MIDlet JARs; read members only after checking bounds."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            members = archive.infolist()
            if len(members) > MAX_MEMBERS:
                return None
            if sum(member.file_size for member in members) > MAX_INFLATED:
                return None
            if any(member.flag_bits & 1 for member in members):
                return None
            names = archive.namelist()
            # zipfile's name-based reads select the last duplicate member.
            # Reject ambiguity before manifest, CRC or class validation.
            if len(set(names)) != len(names):
                return None
            if "META-INF/MANIFEST.MF" not in names:
                return None
            manifest = archive.read("META-INF/MANIFEST.MF").decode("utf-8", "replace")
            if not any(
                line.startswith("MIDlet-Name:") for line in manifest.splitlines()
            ):
                return None
            if archive.testzip() is not None:
                return None
            classes = [name for name in names if name.endswith(".class")]
            if not classes or not all(
                archive.read(name).startswith(b"\xca\xfe\xba\xbe") for name in classes
            ):
                return None
            return {
                "manifest": manifest,
                "entries": names,
                "class_files": classes,
                "zip_crc_verified": True,
            }
    except (
        zipfile.BadZipFile,
        RuntimeError,
        ValueError,
        NotImplementedError,
        zlib.error,
    ):
        return None


def scan(data):
    """Return metadata and original JAR byte sequences from complete gzip streams."""
    if len(data) > MAX_INPUT:
        raise ValueError("Input exceeds 64 MiB")
    positions = []
    for match in re.finditer(b"\x1f\x8b\x08", data):
        if len(positions) >= MAX_STREAMS:
            raise ValueError("Too many gzip candidates")
        positions.append(match.start())
    complete, total_inflated, records, payloads = 0, 0, [], {}
    for offset in positions:
        inflater = zlib.decompressobj(31)
        try:
            raw = inflater.decompress(data[offset:], MAX_INFLATED + 1)
        except zlib.error:
            continue
        if not inflater.eof or len(raw) > MAX_INFLATED:
            continue
        total_inflated += len(raw)
        if total_inflated > MAX_TOTAL_INFLATED:
            raise ValueError("Total complete gzip output exceeds 128 MiB")
        # Count every complete stream, including non-JARs and duplicate JARs.
        # Retained unique payloads are therefore bounded by the same budget.
        complete += 1
        metadata = jar_metadata(raw)
        if metadata is None:
            continue
        identity = sha256(raw)
        filename = f"jar-{identity[:24]}.jar"
        records.append(
            {
                "gzip_offset": offset,
                "gzip_bytes": len(data) - offset - len(inflater.unused_data),
                "jar_bytes": len(raw),
                "sha256": identity,
                "output_file": filename,
                **metadata,
            }
        )
        payloads.setdefault(filename, raw)
    return {
        "schema": 1,
        "method": "Bounded gzip signature scan; complete streams with gzip integrity validation; complete MIDlet JARs with ZIP member CRC and Java class magic validation.",
        "source_bytes": len(data),
        "source_sha256": sha256(data),
        "gzip_candidates": len(positions),
        "complete_gzip_streams": complete,
        "jar_occurrences": len(records),
        "unique_jar_files": len(payloads),
        "limits": [
            "This does not parse installer paths or prove that every package variant is installed on every phone.",
            "Multiple JAR variants of one title are not multiple different games.",
            "Structural extraction and CRC verification do not establish runtime compatibility.",
        ],
        "jars": records,
    }, payloads


def write_result(directory, report, payloads):
    if directory.exists() or directory.is_symlink():
        raise ValueError("Output directory already exists; refusing to overwrite")
    directory.mkdir(parents=True)
    for filename, data in payloads.items():
        with (directory / filename).open("xb") as stream:
            stream.write(data)
    with (directory / "manifest.json").open(
        "x", encoding="utf-8", newline="\n"
    ) as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2)
        stream.write("\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument(
        "--output", required=True, type=Path, help="New output directory"
    )
    parser.add_argument(
        "--source-url", help="Optional provenance URL, recorded without fetching"
    )
    args = parser.parse_args()
    if args.input.is_symlink() or not args.input.is_file():
        parser.error("Input must be a regular file")
    if args.input.stat().st_size > MAX_INPUT:
        parser.error("Input exceeds 64 MiB")
    report, payloads = scan(args.input.read_bytes())
    report["source_file"] = args.input.name
    if args.source_url:
        report["source_url"] = args.source_url
    write_result(args.output, report, payloads)
    print(
        json.dumps(
            {
                key: report[key]
                for key in (
                    "source_sha256",
                    "complete_gzip_streams",
                    "jar_occurrences",
                    "unique_jar_files",
                )
            }
        )
    )


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
