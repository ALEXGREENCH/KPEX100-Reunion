"""Extract Net Alkkagi from the verified Samsung SPH-X6000 part-two dump."""

import argparse
from binascii import crc_hqx
from collections import defaultdict
from hashlib import sha256
from pathlib import Path
from struct import unpack_from
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

SOURCE_SHA256 = "e65f6968f9ed83eedb07ba8e6789d3f9a7a6269c53fb59942b68719b89ead62f"
PAGE_BYTES = 256
FS_OFFSET = 0x400000
PREFIX = b"nvm/brew/"
FILES = {
    "1351.mif",
    *(f"1351/{index}.mmf" for index in range(10)),
    "1351/netpebble.bar",
    "1351/netpebble.mod",
    "1351/netpebble.sig",
}


def recover(dump):
    if sha256(dump).hexdigest() != SOURCE_SHA256:
        raise ValueError("Expected the verified SPH-X6000-pt2.bin")
    first = {}
    pages = defaultdict(list)
    for offset in range(FS_OFFSET, len(dump) - PAGE_BYTES + 1, PAGE_BYTES):
        page = dump[offset : offset + PAGE_BYTES]
        status, key, index, kind, generation, size = unpack_from("<6H", page)
        if status not in (0xDB, 0xFE) or not 0 < size <= 240:
            continue
        expected_crc = int.from_bytes(page[254:256], "big")
        if (crc_hqx(page[1:254], 0xFFFF) ^ 0xFFFF) != expected_crc:
            continue
        if status == 0xFE and index and kind in (1, 2):
            pages[key, index].append((generation, offset, page[12 : 12 + size]))
        elif status == 0xDB and index == 0 and kind == 2:
            end = 29 + page[28]
            name = page[29:end].rstrip(b"\0")
            if not name.startswith(PREFIX):
                continue
            path = name[len(PREFIX) :].decode("ascii", errors="replace")
            if path not in FILES:
                continue
            if path in first or page[end - 1] != 0 or end + size > 252:
                raise ValueError(f"Invalid or ambiguous first page for {path}")
            first[path] = key, end, page[end : end + size]
    if first.keys() != FILES:
        raise ValueError("Some named files have no valid first page")
    recovered = {}
    for path, (key, header_end, payload) in first.items():
        indices = sorted(index for file_key, index in pages if key == file_key)
        if indices != list(range(1, len(indices) + 1)):
            raise ValueError(f"Page sequence has a gap for {path}")
        if indices and header_end + len(payload) != 252:
            raise ValueError(f"Incomplete first page for {path}")
        parts = [payload]
        for index in indices:
            choices = pages[key, index]
            _, _, body = max(choices, key=lambda row: (row[0], len(row[2])))
            if not all(body.startswith(candidate) for _, _, candidate in choices):
                raise ValueError(f"Conflicting continuations for {path}")
            if (index < indices[-1] and len(body) != 240) or (
                index == indices[-1] and len(body) == 240
            ):
                raise ValueError(f"Unexpected continuation size for {path}")
            parts.append(body)
        recovered[path] = b"".join(parts)
    return recovered


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dump", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    try:
        if args.dump.stat().st_size != 7275424:
            raise ValueError("Unexpected SPH-X6000-pt2.bin size")
        files = recover(args.dump.read_bytes())
        with ZipFile(args.output, "x") as archive:
            for name, data in sorted(files.items()):
                archive.writestr(ZipInfo(name), data, compress_type=ZIP_DEFLATED)
    except (OSError, ValueError) as error:
        parser.exit(1, f"{error}\n")
    print(f"Recovered {len(files)} BREW files into {args.output}")


if __name__ == "__main__":
    main()
