"""Compile Reunion Mobile C examples and attach application-local VFS files."""

from hashlib import sha256
from pathlib import Path
from struct import pack, unpack_from
from subprocess import run
from tempfile import TemporaryDirectory


COMPILER = "a02ffd612a4a242852f35a1fc0fc4bdf1911c0a07375a75955822ce5629f996f"
ASSEMBLER = "c9dd8612c392b0a1f9189b838b529157c1235f48e344e781fdb4c47ff3b5530a"


def _checked(path, digest):
    data = path.read_bytes()
    if sha256(data).hexdigest() != digest:
        raise ValueError(f"Unexpected SDK executable {path}")
    return data


def build_sgs(sdk: Path, source: Path) -> bytes:
    """Build a plain SGS with the verified Windows GNEX 2.12 toolchain."""
    sdk = sdk.resolve(strict=True)
    original = _checked(sdk / "mcc_GNEX.exe", COMPILER)
    assembler = sdk / "MASM_GNEX.exe"
    _checked(assembler, ASSEMBLER)
    stem = source.stem
    with TemporaryDirectory(prefix="reunion-sgs-") as directory:
        work = Path(directory)
        # The old compiler expires after 31 January 2010. Only its temporary
        # copy receives the new year. The SDK and the system clock stay intact.
        assert unpack_from("<I", original, 0x100F)[0] == 2010
        compiler = work / "mcc_GNEX.exe"
        compiler.write_bytes(original[:0x100F] + pack("<I", 2099) + original[0x1013:])
        (work / source.name).write_bytes(source.read_bytes())
        run([compiler, source.name], cwd=work, check=False)
        if not (work / f"{stem}.sal").is_file():
            raise RuntimeError(f"Mobile C did not emit {stem}.sal")
        run(
            [
                assembler,
                "-gvmswap",
                "-exe",
                "-optimize",
                "-o",
                stem,
                "-l",
                f"{stem}.sal",
            ],
            cwd=work,
            check=True,
        )
        return (work / f"{stem}.sgs").read_bytes()


def encode_kpex(sgs: bytes) -> bytes:
    """Encode an SGS using the Kingston 2.12 loader's XOR mask."""
    return bytes(byte ^ 0xA5 for byte in sgs)


def pack_vfs(sgs: bytes, files: dict[str, bytes]) -> bytes:
    """Append a table of read-only files to a plain SGS v4 container."""
    if not files:
        return sgs
    if len(sgs) < 124 or sgs[0] != 4 or unpack_from("<I", sgs, 120)[0] != len(sgs):
        raise ValueError("Expected a plain SGS v4 build without appended files")
    names = {}
    for name, data in files.items():
        normalized = name.lower()
        if (
            not name
            or len(name) > 511
            or any(c in name for c in "\\:\0")
            or any(part in ("", ".", "..") for part in name.split("/"))
            or normalized in names
            or len(data) > 16 * 1024 * 1024
        ):
            raise ValueError(f"Invalid SGS filename or payload {name!r}")
        names[normalized] = (name.encode("ascii") + b"\0", data)
    table_size = sum(12 + len(name) for name, _ in names.values())
    offset = len(sgs) + 8 + table_size
    table = bytearray()
    for name, data in names.values():
        table += pack("<I", len(name)) + name + pack("<II", offset, len(data))
        offset += len(data)
    return (
        sgs
        + pack("<II", table_size, len(names))
        + table
        + b"".join(names[name][1] for name in names)
    )
