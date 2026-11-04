from pathlib import Path
import struct
import pytest

pytestmark = pytest.mark.originals
from kpex.firmware import FirmwareMachine, inspect_rom

ROM = Path(__file__).resolve().parents[1] / "data/firmware/Kingston-2.12.rom"


@pytest.fixture(scope="module")
def rom():
    if not ROM.exists():
        pytest.skip("Bundled original firmware unavailable")
    return ROM.read_bytes()


def test_original_rom_integrity_and_load_map(rom):
    info = inspect_rom(rom)
    assert info["checksum_valid"]
    assert (
        info["sha256"]
        == "743d0b9a377dc6a3f0a80b7816cee575ad2f8249643876367c4bfaac54ddd19a"
    )
    assert info["entry"] == 0x70000084
    assert info["loads"][0]["source"] == 0x70000724
    assert info["loads"][0]["destination"] == 0x20010000
    assert sum(s["length"] for s in info["sections"]) + 0x100000 == len(rom)


def test_corrupt_executable_rejected(rom):
    corrupt = bytearray(rom)
    corrupt[0x800] ^= 1
    assert not inspect_rom(corrupt)["checksum_valid"]
    with pytest.raises(ValueError, match="checksum"):
        FirmwareMachine(corrupt)


def test_corrupt_payload_rejected(rom):
    corrupt = bytearray(rom)
    corrupt[0x100100] ^= 1
    assert not inspect_rom(corrupt)["checksum_valid"]


@pytest.mark.parametrize("payload", [b"", b"\x00" * 0x100000, b"\x00" * 17])
def test_malformed_header_rejected(payload):
    with pytest.raises(ValueError):
        inspect_rom(payload)


def test_bad_section_bounds_rejected(rom):
    corrupt = bytearray(rom)
    struct.pack_into("<I", corrupt, 0x20, 0xFFFFFFFC)
    with pytest.raises(ValueError, match="section"):
        inspect_rom(corrupt)


def test_bounded_original_cpu_execution_and_reset_replay(rom):
    machine = FirmwareMachine(rom)
    first = machine.run(3000)
    assert first["status"] == "paused"
    assert first["instructions"] == 3000
    assert first["pc"] != 0x70000000
    assert machine.read_memory(0x20010000, 32) == rom[0x724:0x744]
    assert first["lcd_pixel_writes"] == 0
    machine.reset()
    second = machine.run(3000)
    assert second["registers"] == first["registers"]
    assert second["instructions"] == first["instructions"]
    assert machine.read_memory(0x20010000, 32) == rom[0x724:0x744]


def test_unknown_mmio_blocks_without_fake_pixels(rom):
    machine = FirmwareMachine(rom)
    # Dedicated guest loads an unknown device input.
    machine.cpu.mem_write(0x20010000, bytes.fromhex("000091e5feffffea"))
    from unicorn import arm_const as ar

    machine.cpu.reg_write(ar.UC_ARM_REG_PC, 0x20010000)
    machine.cpu.reg_write(ar.UC_ARM_REG_R1, 0x80000900)
    result = machine.run(20)
    assert result["status"] == "blocked"
    assert "0x80000900" in result["stop_reason"]
    assert result["lcd_pixel_writes"] == 0
    assert machine.framebuffer.getbbox() is None


def test_external_lcd_receives_actual_guest_writes(rom):
    machine = FirmwareMachine(rom)
    # Guest selects GRAM and writes one red RGB565 pixel through CS1.
    from unicorn import arm_const as ar

    machine.cpu.mem_write(
        0x20010000, bytes.fromhex("2200a0e3b000c1e1f800a0e30004a0e1b200c1e1feffffea")
    )
    machine.cpu.reg_write(ar.UC_ARM_REG_PC, 0x20010000)
    machine.cpu.reg_write(ar.UC_ARM_REG_R1, 0x50000000)
    result = machine.run(5)
    assert result["lcd_pixel_writes"] == 1
    assert machine.framebuffer.getpixel((0, 0)) == (255, 0, 0)
    assert machine.framebuffer.getpixel((1, 0)) == (0, 0, 0)


def test_ata_identify_and_sector_read_are_real_guest_io(rom):
    source = bytes(512) + b"AB" + bytes(510)
    machine = FirmwareMachine(rom, disk_image=source)
    from unicorn import arm_const as ar

    # IDENTIFY: mov r0,#ec; strb r0,[r1,#1c]; ldrh r2,[r1].
    machine.cpu.mem_write(0x20010000, bytes.fromhex("ec00a0e31c00c1e5b020d1e1feffffea"))
    machine.cpu.reg_write(ar.UC_ARM_REG_PC, 0x20010000)
    machine.cpu.reg_write(ar.UC_ARM_REG_R1, 0x40000000)
    result = machine.run(3)
    assert result["registers"]["r2"] == 0x40
    assert machine.ata_registers[28] == 0x48
    # READ sector1: set count and LBA low, command20, read first word.
    machine.cpu.mem_write(
        0x20011000,
        bytes.fromhex("0100a0e30800c1e50c00c1e52000a0e31c00c1e5b020d1e1feffffea"),
    )
    machine.cpu.reg_write(ar.UC_ARM_REG_PC, 0x20011000)
    result = machine.run(6)
    assert result["registers"]["r2"] == 0x4241
    assert machine.ata_trace[-1]["lba"] == 1
    assert source[512:514] == b"AB"


def test_ata_out_of_range_reports_error_not_fabricated_data(rom):
    machine = FirmwareMachine(rom, disk_image=bytes(512))
    from unicorn import arm_const as ar

    machine.cpu.mem_write(
        0x20011000, bytes.fromhex("0100a0e30800c1e50c00c1e52000a0e31c00c1e5feffffea")
    )
    machine.cpu.reg_write(ar.UC_ARM_REG_PC, 0x20011000)
    machine.cpu.reg_write(ar.UC_ARM_REG_R1, 0x40000000)
    machine.run(5)
    assert machine.ata_registers[28] == 0x41
    assert machine.ata_registers[4] == 0x10


def test_sdram_upper_16_mib_is_alias_required_by_real_resource_loader(rom):
    machine = FirmwareMachine(rom)
    machine.cpu.mem_write(0x20C00000, bytes.fromhex("78563412"))
    assert machine.read_memory(0x21C00000, 4) == bytes.fromhex("78563412")
    machine.cpu.mem_write(0x21F3D178, b"palette")
    assert machine.read_memory(0x20F3D178, 7) == b"palette"
    assert machine.snapshot()["firmware_resources_loaded"] is True


def test_documented_dai_configuration_registers_mask_reserved_bits(rom):
    machine = FirmwareMachine(rom)
    from unicorn import arm_const as ar

    # Write all bits to DAMR/DAVC, then read the hardware-visible fields.
    machine.cpu.mem_write(
        0x20010000, bytes.fromhex("0000e0e3400081e5440081e5402091e5443091e5feffffea")
    )
    machine.cpu.reg_write(ar.UC_ARM_REG_PC, 0x20010000)
    machine.cpu.reg_write(ar.UC_ARM_REG_R1, 0x80000000)
    result = machine.run(5)
    assert result["status"] == "paused"
    assert result["registers"]["r2"] == 0xFFFF
    assert result["registers"]["r3"] == 0xF
