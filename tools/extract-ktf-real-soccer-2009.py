"""Reassemble the installer payload in the Dubigame KTF Real Soccer 2009 package."""

import argparse
from hashlib import sha256
from io import BytesIO
from pathlib import Path
import struct
from zipfile import ZipFile


PACKAGE_SHA256 = "36353252b311c1aa5ec8fcece5830bd48f545b5d301d454bdb59ac53835dfc1e"
PAYLOAD_SHA256 = "fde94c6de2f658789cd81686164c31070ecf1a30e140d027292731c16da3f508"
JAR_PATH = "W/apps/010100D3/010100D3.jar"


def reassemble(package):
    if sha256(package).hexdigest() != PACKAGE_SHA256:
        raise ValueError("unexpected KTF Real Soccer 2009 package SHA-256")
    with ZipFile(BytesIO(package)) as outer:
        jar_bytes = outer.read(JAR_PATH)
    with ZipFile(BytesIO(jar_bytes)) as jar:
        chunk_size, chunk_count, payload_size = struct.unpack(
            "<III", jar.read("lo.zinfo")
        )
        if (chunk_size, chunk_count, payload_size) != (102400, 18, 1758425):
            raise ValueError("unexpected lo.zinfo layout")
        chunks = []
        for index in range(chunk_count):
            name = f"lo.z{index:02d}"
            expected = min(chunk_size, payload_size - index * chunk_size)
            if jar.getinfo(name).file_size != expected:
                raise ValueError(f"unexpected size for {name}")
            chunks.append(jar.read(name))
    payload = b"".join(chunks)
    if sha256(payload).hexdigest() != PAYLOAD_SHA256:
        raise ValueError("unexpected installer payload SHA-256")
    with ZipFile(BytesIO(payload)) as installer:
        if len(installer.infolist()) != 94 or installer.testzip() is not None:
            raise ValueError("invalid installer ZIP")
    return payload


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    payload = reassemble(args.package.read_bytes())
    with args.output.open("xb") as output:
        output.write(payload)
    print(f"Verified installer ZIP, {len(payload)} bytes")


if __name__ == "__main__":
    main()
