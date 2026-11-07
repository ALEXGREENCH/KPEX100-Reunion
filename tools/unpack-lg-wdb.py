"""Unpack the legacy LG CYON WDB format used by KH1300, KH1400 and SH130.

The WDB and its companion DLL are data inputs. The DLL is never loaded.
Format reference: https://github.com/michaelwright235/wdb_extract
Requires PyCryptodome.
"""

import argparse
import hashlib
from pathlib import Path, PureWindowsPath
import struct
from tempfile import TemporaryDirectory
import zlib


MAX_CONTAINER_BYTES = 256 * 1024 * 1024
MAX_FILE_BYTES = 128 * 1024 * 1024
MAX_OUTPUT_BYTES = 512 * 1024 * 1024


def u32(data, offset=0):
    return struct.unpack_from("<I", data, offset)[0]


def indexed_ranges(data, decrypt, header_end, count):
    footer_size = u32(data, len(data) - 4)
    footer_start = len(data) - 4 - footer_size
    if footer_size < 4 + count * 4 or footer_start <= header_end:
        raise ValueError("invalid WDB index length")
    footer = decrypt(data[footer_start:-4])
    if u32(footer) != count:
        raise ValueError("WDB index count differs from the header")
    offsets = struct.unpack_from(f"<{count}I", footer, 4)
    if offsets[0] != header_end or offsets[-1] >= footer_start:
        raise ValueError("invalid WDB index bounds")
    return zip(offsets, (*offsets[1:], footer_start))


def prefix_ranges(data, start, count):
    for _ in range(count):
        if start + 8 > len(data):
            break
        header_size, compressed_size = struct.unpack_from("<2I", data, start)
        if not 16 <= header_size <= 8192 or not compressed_size:
            raise ValueError(f"invalid WDB prefix record at {start:#x}")
        end = start + 8 + header_size + compressed_size
        if end > len(data):
            break
        yield start, end
        start = end


def read_records(data, decrypt, *, prefix=False):
    header_size = u32(data)
    header_end = 4 + header_size
    if not 16 <= header_size <= min(4096, len(data) - 8):
        raise ValueError("invalid WDB header length")
    header = decrypt(data[4:header_end])
    size, count, name_size, version_size = struct.unpack_from("<4I", header)
    if (
        size != header_size
        or size != 16 + name_size + version_size
        or not 1 <= count <= 100_000
    ):
        raise ValueError("invalid WDB header, check the companion DLL")
    version = header[16 + name_size :].decode("ascii")

    ranges = (
        prefix_ranges(data, header_end, count)
        if prefix
        else indexed_ranges(data, decrypt, header_end, count)
    )
    records = []
    names = set()
    directories = set()
    total = 0
    for start, end in ranges:
        if start + 8 > end:
            raise ValueError("WDB index is unordered or overlaps a record")
        record_header_size, compressed_size = struct.unpack_from("<2I", data, start)
        payload = start + 8 + record_header_size
        if not 16 <= record_header_size <= 8192 or payload + compressed_size != end:
            raise ValueError(f"invalid WDB record bounds at {start:#x}")
        header = decrypt(data[start + 8 : payload])
        size, path_size, expected, _flags = struct.unpack_from("<4I", header)
        if size != 16 + path_size or not 16 < size <= len(header):
            raise ValueError(f"invalid WDB filename length at {start:#x}")
        original_name = header[16:size].decode("cp949")
        parts = original_name.replace("\\", "/").split("/")
        if any(
            not part
            or part.rstrip(" .") != part
            or PureWindowsPath(part).is_reserved()
            or any(ord(char) < 32 or char in '<>:"|?*' for char in part)
            for part in parts
        ):
            raise ValueError(f"unsafe WDB path {original_name!r}")
        path = Path(*parts)
        key = path.as_posix().casefold()
        parents = {parent.as_posix().casefold() for parent in path.parents}
        if key in names or key in directories or parents & names:
            raise ValueError(f"conflicting WDB path {original_name!r}")
        names.add(key)
        directories.update(parents)
        total += expected
        if expected > MAX_FILE_BYTES or total > MAX_OUTPUT_BYTES:
            raise ValueError("declared output exceeds the extraction limit")
        records.append((path, payload, end, expected))
    if not records:
        raise ValueError("WDB prefix contains no complete records")
    return version, records


def unpack(wdb, dll, output, *, prefix=False):
    from Crypto.Cipher import ARC4

    if not 24 <= wdb.stat().st_size <= MAX_CONTAINER_BYTES:
        raise ValueError("WDB size is outside the supported bounds")
    if not dll.is_file() or not dll.stat().st_size:
        raise ValueError("companion DLL is missing or empty")
    if output.exists() or output.is_symlink():
        raise ValueError("output directory already exists")
    digits = str(dll.stat().st_size).encode("ascii")
    salt = b"113841"
    key = hashlib.md5(
        bytes(digit + salt[i % len(salt)] for i, digit in enumerate(digits))
    ).digest()

    def decrypt(data):
        return ARC4.new(key).decrypt(data)

    data = wdb.read_bytes()
    version, records = read_records(data, decrypt, prefix=prefix)
    with TemporaryDirectory(prefix="lg-wdb-", dir=output.parent) as scratch:
        staging = Path(scratch) / "files"
        staging.mkdir()
        for path, start, end, expected in records:
            stream = zlib.decompressobj()
            decoded = stream.decompress(decrypt(data[start:end]), expected + 1)
            if (
                len(decoded) != expected
                or not stream.eof
                or stream.unused_data
                or stream.unconsumed_tail
            ):
                raise ValueError(f"invalid zlib stream for {path.as_posix()}")
            target = staging / path
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open("xb") as file:
                file.write(decoded)
        if output.exists() or output.is_symlink():
            raise ValueError("output directory already exists")
        staging.rename(output)
    return version, len(records)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("wdb", type=Path)
    parser.add_argument("companion_dll", type=Path)
    parser.add_argument("output", type=Path, help="new directory in an existing parent")
    parser.add_argument(
        "--prefix",
        action="store_true",
        help="extract complete records from a verified contiguous prefix without an index",
    )
    args = parser.parse_args()
    try:
        version, count = unpack(
            args.wdb, args.companion_dll, args.output, prefix=args.prefix
        )
    except ModuleNotFoundError:
        parser.exit(
            1,
            "PyCryptodome required. Install with python -m pip install pycryptodome\n",
        )
    except (OSError, ValueError, struct.error, zlib.error) as error:
        parser.exit(1, f"{error}\n")
    scope = " from the WDB prefix" if args.prefix else ""
    print(f"{version}: extracted {count} files{scope}")


if __name__ == "__main__":
    main()
