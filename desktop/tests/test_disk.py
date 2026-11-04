import struct
import pytest
from pathlib import Path
from kpex.disk import create_fat16, install_firmware_resources, SectorDisk, bundled_disk


def test_firmware_disk_accepts_empty_or_partial_local_collection(tmp_path):
    empty = bundled_disk(tmp_path / "not-imported-yet")
    assert empty[510:512] == b"\x55\xaa"
    (tmp_path / "Godori.sgs").write_bytes(b"synthetic local file")
    partial = bundled_disk(tmp_path)
    assert b"GODORI  SGS" in partial
    assert b"HELLFIRESGS" not in partial
    assert b"synthetic local file" in partial


def test_fat16_directory_and_multi_cluster_file_roundtrip():
    payload = bytes(range(256)) * 30
    image = create_fat16({"TEST.SGS": payload})
    assert image[510:512] == b"\x55\xaa"
    start, sectors = struct.unpack_from("<II", image, 454)
    assert (start, sectors) == (32768, 98304)
    bpb = start * 512
    assert image[bpb + 54 : bpb + 62] == b"FAT16   "
    spc = image[bpb + 13]
    reserved = struct.unpack_from("<H", image, bpb + 14)[0]
    fat_secs = struct.unpack_from("<H", image, bpb + 22)[0]
    fat = (start + reserved) * 512
    root = (start + reserved + 2 * fat_secs) * 512
    data = root + 512 * 32
    assert image[root + 32 : root + 43] == b"GAME       "
    directory = struct.unpack_from("<H", image, root + 32 + 26)[0]
    ent = data + (directory - 2) * spc * 512 + 64
    assert image[ent : ent + 11] == b"TEST    SGS"
    cluster = struct.unpack_from("<H", image, ent + 26)[0]
    size = struct.unpack_from("<I", image, ent + 28)[0]
    recovered = bytearray()
    seen = set()
    while cluster < 0xFFF8:
        assert cluster not in seen
        seen.add(cluster)
        off = data + (cluster - 2) * spc * 512
        recovered.extend(image[off : off + spc * 512])
        cluster = struct.unpack_from("<H", image, fat + cluster * 2)[0]
    assert recovered[:size] == payload
    assert (
        image[fat : fat + fat_secs * 512]
        == image[fat + fat_secs * 512 : fat + fat_secs * 1024]
    )


def test_sector_device_rejects_out_of_range_and_preserves_neighbors():
    disk = SectorDisk(bytes(1536))
    disk.write(1, b"A" * 512)
    assert disk.read(1) == b"A" * 512
    assert disk.read(0) == disk.read(2) == bytes(512)
    with pytest.raises(ValueError):
        disk.read(-1)
    with pytest.raises(ValueError):
        disk.read(3)
    with pytest.raises(ValueError):
        disk.write(2, bytes(1024))
    with pytest.raises(ValueError):
        disk.write(0, b"odd")


@pytest.mark.originals
def test_native_rom_resource_sectors_do_not_overwrite_filesystem():
    rom = (
        Path(__file__).resolve().parents[1] / "data/firmware/Kingston-2.12.rom"
    ).read_bytes()
    image = create_fat16({"TEST.SGS": b"game contents"})
    filesystem = bytes(image[32768 * 512 :])
    install_firmware_resources(image, rom)
    assert image[4096 * 512 : 4096 * 512 + len(rom) - 0x100000] == rom[0x100000:]
    assert image[32768 * 512 :] == filesystem
