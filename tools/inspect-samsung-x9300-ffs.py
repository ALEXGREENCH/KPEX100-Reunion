"""Check the application records in the known Samsung SPH-X9300 memory dump."""

import argparse
from binascii import crc_hqx
from collections import Counter
from hashlib import sha256
import json
from pathlib import Path
import re
from struct import unpack_from

INPUT_SIZE = 6_413_344
INPUT_SHA256 = "1d71e614db03997e9814a7c8cfee28d9588f92ed60482b94dd5803bcec5b1587"
PAGE_SIZE = 1024
PAGE_PHASE = 0x380
STATUSES = {0x6C, 0xDB, 0xED, 0xFB}
PATH_PATTERN = re.compile(rb"[A-Za-z$][A-Za-z0-9_./$-]*")
APPLICATION_PATHS = {
    b"W/preload_info",
    b"W/exe_info",
    b"W/sys_dll_info",
    b"W/APPCnt",
    b"AdsRegistryData",
    b"pimads",
}


def scan(data):
    """Inventory named records and emit details only for known application paths."""
    if len(data) != INPUT_SIZE or sha256(data).hexdigest() != INPUT_SHA256:
        raise ValueError("Unexpected X9300-pt3.bin size or SHA-256")

    counts = Counter()
    names = set()
    application = []
    for offset in range(PAGE_PHASE, len(data) - PAGE_SIZE + 1, PAGE_SIZE):
        page = data[offset : offset + PAGE_SIZE]
        status, record_id, _, record_type, field8, size, _ = unpack_from("<7H", page)
        length = page[28]
        if status not in STATUSES or not 4 <= length <= 62:
            continue
        name = page[29 : 28 + length]
        if page[28 + length] or not PATH_PATTERN.fullmatch(name):
            continue
        crc = crc_hqx(page[1:-2], 0xFFFF) ^ 0xFFFF
        if int.from_bytes(page[-2:], "big") != crc:
            continue

        counts[f"0x{status:02x}"] += 1
        names.add(name)
        if name not in APPLICATION_PATHS:
            continue

        # Only type 2 records for the selected paths are interpreted here.
        payload = None
        if record_type == 2 and 0 < size <= len(page) - 71:
            payload = page[69 : 69 + size]

        application.append(
            {
                "offset": f"0x{offset:x}",
                "path": name.decode("ascii"),
                "status": f"0x{status:02x}",
                "id": record_id,
                "type": record_type,
                "field8": field8,
                "sizeField": size,
                "pageCrc16": f"{crc:04x}",
                "inlinePayloadSha256": sha256(payload).hexdigest() if payload else None,
                "inlineByte": payload[0] if payload and len(payload) == 1 else None,
            }
        )

    return {
        "source": {
            "member": "X9300-pt3.bin",
            "bytes": len(data),
            "sha256": INPUT_SHA256,
        },
        "pageSize": PAGE_SIZE,
        "phase": f"0x{PAGE_PHASE:x}",
        "namedPageCount": counts.total(),
        "uniquePathCount": len(names),
        "countsByStatus": dict(sorted(counts.items())),
        "applicationRecords": application,
        "gamePathMatches": sum(
            bool(re.search(rb"game|lost.?planet", name, re.I)) for name in names
        ),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    args = parser.parse_args()
    try:
        with args.source.open("rb") as source:
            result = scan(source.read(INPUT_SIZE + 1))
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
