"""Decode a MyRacer XGN or VGN game into a validated SGS v4 body.

Based on the two game-loading paths in the recovered MyRacer ROM_EXEC.
Requires PyCryptodome. No firmware or game code executes during decoding.
"""

import argparse
from pathlib import Path
import runpy
import sys


def decode_xgn(raw, des, config=None):
    edge = 256
    footer_size = 16
    if len(raw) < 2 * edge + footer_size:
        raise ValueError("truncated MyRacer game envelope")
    # XGN supplies the fixed suffix. The VGN path receives four config bytes.
    suffix = b"$RA$" if config is None else config
    if len(suffix) != 4:
        raise ValueError("VGN configuration must be exactly four bytes")
    key = b"TPSP" + suffix
    cipher = des.new(key, des.MODE_ECB)
    footer = cipher.decrypt(raw[-footer_size:])
    if footer[:11] != key + b"sgs":
        raise ValueError("invalid MyRacer SGS footer")
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
    parser.add_argument(
        "--vgn-config", metavar="HEX", help="four VGN configuration bytes in file order"
    )
    args = parser.parse_args()
    try:
        from Crypto.Cipher import DES

        scanner = runpy.run_path(
            str(Path(__file__).with_name("scan-firmware-games.py"))
        )
        raw = scanner["read_input"](args.input)
        config = bytes.fromhex(args.vgn_config) if args.vgn_config is not None else None
        decoded = decode_xgn(raw, DES, config)
        sgs = scanner["parse_candidate"](decoded, 0)
        if not sgs or sgs["version"] != 4 or sgs["declared_body_bytes"] != len(decoded):
            raise ValueError("decoded file does not contain one complete SGS v4 body")
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
