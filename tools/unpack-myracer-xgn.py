"""Decode a MyRacer MF101 .xgn file into a validated SGS v4 body.

Based on the XGN path in the recovered ROM_EXEC (ARM 0x0809c0c4).
Requires PyCryptodome. No firmware or game code executes during decoding.
"""

import argparse
from pathlib import Path
import runpy
import sys


def decode_xgn(raw, des):
    edge = 256
    footer_size = 16
    if len(raw) < 2 * edge + footer_size:
        raise ValueError("truncated XGN envelope")
    # The MF101 loader derives its fixed DES key from the TPSP prefix
    # and the four bytes passed by the .xgn-specific entry point.
    cipher = des.new(b"TPSP$RA$", des.MODE_ECB)
    footer = cipher.decrypt(raw[-footer_size:])
    if footer[:11] != b"TPSP$RA$sgs":
        raise ValueError("invalid MF101 XGN footer")
    tail = len(raw) - edge - footer_size
    decoded = (
        cipher.decrypt(raw[:edge])
        + raw[edge:tail]
        + cipher.decrypt(raw[tail:-footer_size])
    )
    return decoded


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    try:
        from Crypto.Cipher import DES

        scanner = runpy.run_path(
            str(Path(__file__).with_name("scan-firmware-games.py"))
        )
        raw = scanner["read_input"](args.input)
        decoded = decode_xgn(raw, DES)
        sgs = scanner["parse_candidate"](decoded, 0)
        if not sgs or sgs["version"] != 4 or sgs["declared_body_bytes"] != len(decoded):
            raise ValueError("decoded XGN does not contain one complete SGS v4 body")
        with args.output.open("xb") as output:
            output.write(decoded)
        print(f"{len(decoded)} bytes, SHA-256 {scanner['digest'](decoded)}")
    except ImportError:
        print(
            "Install PyCryptodome with python -m pip install pycryptodome",
            file=sys.stderr,
        )
        return 1
    except (OSError, ValueError) as error:
        print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
