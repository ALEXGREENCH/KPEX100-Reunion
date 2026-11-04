"""Deterministic FAT16 media for the emulated ATA device.

Only guest sectors are exposed. No physical disk or host directory is mounted.
The MBR partition begins at sector 32768, beyond reserved firmware resources;
files use DOS 8.3 aliases. The ROM reads its payload from raw sector 4096.
"""

from __future__ import annotations
from pathlib import Path
import struct

SECTOR_SIZE = 512


def create_fat16(
    files: dict[str, bytes], total_sectors=131072, volume_label="KPEX REUNION"
) -> bytearray:
    """Build a 64 MiB FAT16 disk; files are placed beneath GAME/."""
    start, reserved, roots, spc = 32768, 1, 512, 4
    total_sectors = int(total_sectors)
    if not 65536 <= total_sectors <= 262144:
        raise ValueError("FAT16 disk size must be 32..128 MiB")
    part = total_sectors - start
    root_secs = roots * 32 // 512
    fat_secs = 1
    while True:
        clusters = (part - reserved - 2 * fat_secs - root_secs) // spc
        needed = (2 * (clusters + 2) + 511) // 512
        if needed <= fat_secs:
            break
        fat_secs = needed
    if not 4085 <= clusters < 65525:
        raise ValueError("Cluster count does not describe FAT16")
    data_lba = start + reserved + 2 * fat_secs + root_secs
    root_lba = start + reserved + 2 * fat_secs
    disk = bytearray(total_sectors * 512)
    # MBR: saturated CHS fields, LBA partition addressing.
    struct.pack_into(
        "<B3sB3sII",
        disk,
        446,
        0x80,
        b"\xfe\xff\xff",
        0x06,
        b"\xfe\xff\xff",
        start,
        part,
    )
    disk[510:512] = b"\x55\xaa"
    bpb = start * 512
    disk[bpb : bpb + 3] = b"\xeb\x3c\x90"
    disk[bpb + 3 : bpb + 11] = b"MSDOS5.0"
    struct.pack_into(
        "<HBHBHHBHHHII",
        disk,
        bpb + 11,
        512,
        spc,
        reserved,
        2,
        roots,
        part if part < 65536 else 0,
        0xF8,
        fat_secs,
        63,
        255,
        start,
        part if part >= 65536 else 0,
    )
    disk[bpb + 36 : bpb + 39] = bytes([0x80, 0, 0x29])
    struct.pack_into("<I", disk, bpb + 39, 0x4B504558)
    label = volume_label.upper().encode("ascii")[:11].ljust(11, b" ")
    disk[bpb + 43 : bpb + 54] = label
    disk[bpb + 54 : bpb + 62] = b"FAT16   "
    disk[bpb + 510 : bpb + 512] = b"\x55\xaa"
    fat = bytearray(fat_secs * 512)
    struct.pack_into("<HH", fat, 0, 0xFFF8, 0xFFFF)
    next_cluster = 2
    cluster_bytes = spc * 512

    def allocate(payload):
        nonlocal next_cluster
        if not payload:
            return 0
        n = (len(payload) + cluster_bytes - 1) // cluster_bytes
        first = next_cluster
        if first + n > clusters + 2:
            raise ValueError("Files exceed the virtual disk capacity")
        for i in range(n):
            cluster = next_cluster
            next_cluster += 1
            struct.pack_into(
                "<H", fat, cluster * 2, 0xFFFF if i == n - 1 else cluster + 1
            )
            off = (data_lba + (cluster - 2) * spc) * 512
            chunk = payload[i * cluster_bytes : (i + 1) * cluster_bytes]
            disk[off : off + len(chunk)] = chunk
        return first

    def entry(name, attr, cluster=0, size=0):
        out = bytearray(32)
        out[:11] = name
        out[11] = attr
        # Fixed creation date makes images reproducible; no host time dependence.
        date = ((2026 - 1980) << 9) | (11 << 5) | 4
        struct.pack_into("<H", out, 16, date)
        struct.pack_into("<H", out, 18, date)
        struct.pack_into("<HHHI", out, 22, 0, date, cluster, size)
        return out

    directories = {}
    for name in ("GAME", "MUSIC", "PHOTO", "VIDEO", "TEXT"):
        cluster = allocate(bytes(cluster_bytes))
        directories[name] = cluster
        off = (data_lba + (cluster - 2) * spc) * 512
        disk[off : off + 32] = entry(b".          ", 0x10, cluster)
        disk[off + 32 : off + 64] = entry(b"..         ", 0x10, 0)
    root = bytearray(root_secs * 512)
    root[:32] = entry(label, 0x08)
    for i, (name, cluster) in enumerate(directories.items(), 1):
        root[i * 32 : (i + 1) * 32] = entry(
            name.encode().ljust(11, b" "), 0x10, cluster
        )
    disk[root_lba * 512 : (root_lba + root_secs) * 512] = root
    used_names = set()
    game_off = (data_lba + (directories["GAME"] - 2) * spc) * 512
    if len(files) > cluster_bytes // 32 - 2:
        raise ValueError("Too many files for the GAME directory")
    for i, (name, payload) in enumerate(sorted(files.items()), 2):
        parts = name.upper().split(".")
        if (
            len(parts) != 2
            or not 1 <= len(parts[0]) <= 8
            or not 1 <= len(parts[1]) <= 3
        ):
            raise ValueError("Guest filenames must be explicit 8.3 aliases")
        if any(
            c not in "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-" for p in parts for c in p
        ):
            raise ValueError("Invalid DOS filename")
        short = (parts[0].ljust(8) + parts[1].ljust(3)).encode("ascii")
        if short in used_names:
            raise ValueError("Duplicate DOS filename")
        used_names.add(short)
        payload = bytes(payload)
        first = allocate(payload)
        disk[game_off + i * 32 : game_off + (i + 1) * 32] = entry(
            short, 0x20, first, len(payload)
        )
    for n in range(2):
        off = (start + reserved + n * fat_secs) * 512
        disk[off : off + len(fat)] = fat
    return disk


def install_firmware_resources(image: bytearray, rom: bytes) -> None:
    """Populate the raw area used by native ROM sector loader 0x200429EC.

    ROM descriptors specify relative sector numbers; hardware adds 0x1000.
    Resource writes must remain before the FAT partition, never within it.
    """
    if len(rom) < 0x100000 or len(image) < 512:
        raise ValueError("Truncated ROM or disk")
    partition = struct.unpack_from("<I", image, 454)[0]
    count = struct.unpack_from("<I", rom, 0x14)[0]
    if count != 3:
        raise ValueError("Unexpected ROM resource section count")
    sections = []
    for i in range(count):
        source, sector, size, _ = struct.unpack_from("<IIII", rom, 0x20 + 16 * i)
        target = (4096 + sector) * 512
        length = size * 512
        if (
            source < 0x100000
            or source + length > len(rom)
            or target + length > partition * 512
        ):
            raise ValueError("Firmware resources overlap FAT or exceed ROM")
        sections.append((target, rom[source : source + length]))
    for target, payload in sections:
        image[target : target + len(payload)] = payload


def bundled_disk(data_directory: Path, rom: bytes | None = None) -> bytearray:
    aliases = {
        "hell_fire.sgs": "HELLFIRE.SGS",
        "ikaria.sgs": "IKARIA.SGS",
        "kpetris_beta.sgs": "KPETRIS.SGS",
        "Godori.sgs": "GODORI.SGS",
    }
    image = create_fat16(
        {
            alias: (Path(data_directory) / name).read_bytes()
            for name, alias in aliases.items()
            if (Path(data_directory) / name).is_file()
        }
    )
    if rom is not None:
        install_firmware_resources(image, rom)
    return image


class SectorDisk:
    def __init__(self, image: bytes | bytearray):
        if not image or len(image) % 512:
            raise ValueError("Disk image must contain whole 512-byte sectors")
        self.image = bytearray(image)
        self.total_sectors = len(self.image) // 512
        self.reads = self.writes = 0

    def read(self, lba, count=1):
        if lba < 0 or count < 1 or lba + count > self.total_sectors:
            raise ValueError("ATA read exceeds virtual disk")
        self.reads += count
        return bytes(self.image[lba * 512 : (lba + count) * 512])

    def write(self, lba, data):
        if (
            not data
            or len(data) % 512
            or lba < 0
            or lba + len(data) // 512 > self.total_sectors
        ):
            raise ValueError("ATA write exceeds virtual disk")
        self.image[lba * 512 : lba * 512 + len(data)] = data
        self.writes += len(data) // 512

    def save(self, path):
        Path(path).write_bytes(self.image)
