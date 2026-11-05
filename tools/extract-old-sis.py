"""Extract and validate original payloads from EPOC release 6 SIS files.

Usage: python extract-old-sis.py INPUT.sis NEW_OUTPUT_DIRECTORY
Python 3.11+, standard library. Supports simple and multilingual file records;
conditional/options records are rejected. Output names are flat and prefixed.
The output directory must be new and its parent must already exist.
Format reference: https://thoukydides.github.io/riscos-psifs/sis.html
"""

import argparse
import binascii
import hashlib
import json
from pathlib import Path, PureWindowsPath
import re
import struct
import sys
import zlib

HEADER_SIZE = 100
MAX_INPUT = 64 * 1024 * 1024
MAX_FILE = 64 * 1024 * 1024
MAX_TOTAL = 256 * 1024 * 1024
MAX_RECORDS = 4096
MAX_LANGUAGES = 256
MAX_STRING = 65536


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def decode_payload(packed, expected, compressed):
    if expected > MAX_FILE:
        raise ValueError("Uncompressed file exceeds 64 MiB limit")
    if not compressed:
        if len(packed) != expected:
            raise ValueError("Uncompressed file length mismatch")
        return packed
    if not packed:
        if expected:
            raise ValueError("Missing compressed payload")
        return b""
    stream = zlib.decompressobj()
    decoded = stream.decompress(packed, expected + 1)
    # Never call unbounded flush(): eof confirms all output was produced.
    if len(decoded) != expected or not stream.eof:
        raise ValueError("Truncated zlib stream or declared output length mismatch")
    if stream.unused_data or stream.unconsumed_tail:
        raise ValueError("Trailing or unconsumed bytes in compressed payload")
    return decoded


def parse_sis(data):
    """Validate the complete supported package before returning output bytes."""
    if not HEADER_SIZE <= len(data) <= MAX_INPUT:
        raise ValueError("SIS input must be between 100 bytes and 64 MiB")
    uid1, uid2, uid3, uid4 = struct.unpack_from("<4I", data)
    if uid2 != 0x10003A12 or uid3 != 0x10000419:
        raise ValueError("Unsupported SIS format; expected EPOC release 6")
    actual_uid_crc = binascii.crc_hqx(data[:12:2], 0)
    actual_uid_crc |= binascii.crc_hqx(data[1:12:2], 0) << 16
    if uid4 != actual_uid_crc:
        raise ValueError("UID CRC mismatch")
    checksum, language_count, record_count, requisite_count = struct.unpack_from(
        "<4H", data, 16
    )
    capability_count = struct.unpack_from("<H", data, 30)[0]
    options, package_type = struct.unpack_from("<2H", data, 36)
    version_major, version_minor = struct.unpack_from("<2H", data, 40)
    language_ptr, records_ptr, requisite_ptr, certificate_ptr, names_ptr = (
        struct.unpack_from("<5I", data, 48)
    )
    signature_ptr, capability_ptr = struct.unpack_from("<2I", data, 68)
    if signature_ptr and not HEADER_SIZE <= signature_ptr < len(data):
        raise ValueError("Signature pointer is outside input bounds")
    body_end = signature_ptr or len(data)
    actual_crc = binascii.crc_hqx(data[18:body_end], binascii.crc_hqx(data[:16], 0))
    if checksum != actual_crc:
        raise ValueError("SIS body CRC mismatch")
    if options & ~0x1B or package_type > 5:
        raise ValueError("Unsupported SIS options or package type")
    if not 1 <= language_count <= MAX_LANGUAGES:
        raise ValueError("Unsupported language count")
    if not 1 <= record_count <= MAX_RECORDS or requisite_count > MAX_RECORDS:
        raise ValueError("Unsupported record count")

    def bounded(offset, size, label):
        if (
            offset > body_end
            or size > body_end - offset
            or size
            and offset < HEADER_SIZE
        ):
            raise ValueError(f"{label} is outside SIS body bounds")
        return data[offset : offset + size]

    string_bytes = 0

    def string(offset, size, label):
        nonlocal string_bytes
        if size > MAX_STRING:
            raise ValueError(f"{label} exceeds string length limit")
        string_bytes += size
        if string_bytes > MAX_TOTAL:
            raise ValueError("Package exceeds total string processing budget")
        raw = bounded(offset, size, label)
        return raw.decode("utf-16-le" if options & 1 else "latin-1")

    def strings(pointer, count, label):
        raw = bounded(pointer, count * 8, label)
        lengths = struct.unpack_from(f"<{count}I", raw)
        pointers = struct.unpack_from(f"<{count}I", raw, count * 4)
        return [string(p, n, label) for p, n in zip(pointers, lengths)]

    language_data = bounded(language_ptr, language_count * 2, "Languages")
    languages = list(struct.unpack(f"<{language_count}H", language_data))
    component_names = strings(names_ptr, language_count, "Component names")
    requisite_size = 12 + language_count * 8
    bounded(requisite_ptr, requisite_count * requisite_size, "Requisites")
    for index in range(requisite_count):
        strings(
            requisite_ptr + index * requisite_size + 12,
            language_count,
            "Requisite names",
        )
    bounded(capability_ptr, capability_count * 8, "Capabilities")
    if certificate_ptr:
        bounded(certificate_ptr, 16, "Certificate header")

    cursor = records_ptr
    records = []
    output_specs = []
    total_unpacked = 0
    total_packed = 0
    total_variants = 0
    for index in range(record_count):
        kind = struct.unpack("<I", bounded(cursor, 4, "File record type"))[0]
        if kind not in (0, 1):
            raise ValueError(f"Unsupported file record type {kind} at record {index}")
        variants = language_count if kind == 1 else 1
        total_variants += variants
        if total_variants > MAX_RECORDS:
            raise ValueError("Too many file/language variants")
        record_size = 36 + variants * 12
        raw = bounded(cursor, record_size, f"File record {index}")
        _, file_type, details, source_size, source_ptr, target_size, target_ptr = (
            struct.unpack_from("<7I", raw)
        )
        if file_type > 5:
            raise ValueError(f"Unsupported file type {file_type} at record {index}")
        source_name = string(source_ptr, source_size, "Source name")
        destination_name = string(target_ptr, target_size, "Destination name")
        sizes = struct.unpack_from(f"<{variants}I", raw, 28)
        pointers = struct.unpack_from(f"<{variants}I", raw, 28 + variants * 4)
        originals = struct.unpack_from(f"<{variants}I", raw, 28 + variants * 8)
        mime_size, mime_ptr = struct.unpack_from("<2I", raw, 28 + variants * 12)
        mime = string(mime_ptr, mime_size, "MIME type")
        record = dict(
            index=index,
            record_offset=cursor,
            record_type=kind,
            file_type=file_type,
            details=details,
            source_name=source_name,
            destination_name=destination_name,
            mime_type=mime,
            variants=[],
        )
        for language_index, (packed_size, pointer, original_size) in enumerate(
            zip(sizes, pointers, originals)
        ):
            bounded(pointer, packed_size, "File data")
            if original_size > MAX_FILE:
                raise ValueError("Uncompressed file exceeds 64 MiB limit")
            total_unpacked += original_size
            total_packed += packed_size
            if total_unpacked > MAX_TOTAL or total_packed > MAX_TOTAL:
                raise ValueError("Package exceeds total processing budget")
            if file_type == 4 and (packed_size or original_size):
                raise ValueError("FILENULL record unexpectedly contains data")
            variant = dict(
                language_index=language_index if kind == 1 else None,
                language_id=languages[language_index] if kind == 1 else None,
                source_offset=pointer,
                packed_bytes=packed_size,
                bytes=original_size,
            )
            record["variants"].append(variant)
            if file_type != 4:
                base = PureWindowsPath(destination_name or source_name).name
                base = (
                    re.sub(r"[^A-Za-z0-9. _-]", "_", base)[:120].rstrip(" .")
                    or "payload.bin"
                )
                prefix = (
                    f"{index:02}-"
                    if kind == 0
                    else f"{index:02}-lang-{language_index:03}-"
                )
                variant["file"] = prefix + base
                output_specs.append(variant)
        records.append(record)
        cursor += record_size

    # Every record is accepted before any decompression or filesystem mutation.
    outputs = []
    for variant in output_specs:
        packed = bounded(variant["source_offset"], variant["packed_bytes"], "File data")
        payload = decode_payload(packed, variant["bytes"], not options & 8)
        variant["packed_sha256"] = sha256(packed)
        variant["sha256"] = sha256(payload)
        outputs.append((variant["file"], payload))
    manifest = dict(
        format="EPOC release 6 SIS",
        input_bytes=len(data),
        input_sha256=sha256(data),
        uid1=f"{uid1:08x}",
        uid_crc=f"{uid4:08x}",
        uid_crc_verified=True,
        body_crc=f"{checksum:04x}",
        body_crc_verified=True,
        crc_body_end=body_end,
        signature_bytes=len(data) - body_end,
        signature_verified=False,
        version_major=version_major,
        version_minor=version_minor,
        options=options,
        languages=languages,
        component_names=component_names,
        record_count=record_count,
        extracted_files=len(outputs),
        records=records,
    )
    return manifest, outputs


def write_outputs(directory, manifest, outputs):
    """Create one new directory; roll back only files this operation created."""
    directory = Path(directory)
    if directory.exists() or directory.is_symlink():
        raise ValueError(f"Refusing to overwrite existing output path: {directory}")
    if not directory.parent.is_dir():
        raise ValueError("Output parent directory must already exist")
    names = [name for name, _ in outputs] + ["manifest.json"]
    if any(
        not name or Path(name).name != name or PureWindowsPath(name).name != name
        for name in names
    ):
        raise ValueError("Output filenames must be flat basenames")
    if len({name.casefold() for name in names}) != len(names):
        raise ValueError("Colliding output filenames")
    directory.mkdir()
    created = []
    try:
        for name, blob in outputs:
            target = directory / name
            with target.open("xb") as stream:
                created.append(target)
                stream.write(blob)
        target = directory / "manifest.json"
        with target.open("x", encoding="utf-8") as stream:
            created.append(target)
            json.dump(manifest, stream, indent=2, ensure_ascii=False)
            stream.write("\n")
    except BaseException:
        for target in reversed(created):
            target.unlink(missing_ok=True)
        directory.rmdir()
        raise


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args(argv)
    if args.input.is_symlink() or not args.input.is_file():
        raise ValueError("Input must be a regular file, not a symlink")
    if args.input.stat().st_size > MAX_INPUT:
        raise ValueError("Input exceeds 64 MiB limit")
    manifest, outputs = parse_sis(args.input.read_bytes())
    manifest["input"] = str(args.input)
    write_outputs(args.output, manifest, outputs)
    print(f"Verified UID/body CRCs; extracted {len(outputs)} original files")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, struct.error, zlib.error) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
