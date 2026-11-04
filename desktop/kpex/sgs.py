"""Validated GNEX SGS v4/v36 containers, including the K-PEX XOR envelope."""

from __future__ import annotations
from dataclasses import dataclass
import struct


class SgsError(ValueError):
    pass


@dataclass(frozen=True)
class Resource:
    type: int
    offset: int
    data: bytes


class SgsFile:
    EVENTS = (
        "START",
        "END",
        "TIMEOUT",
        "KEYPRESS",
        "RSEVENT",
        "RSRECEIVE",
        "RESULT",
        "RECEIVE",
        "NETWORK",
        "SMSRECEIVE",
        "GENERAL",
    )

    def __init__(self, raw: bytes):
        if len(raw) < 128:
            raise SgsError("SGS header is truncated")
        self.wrapper_bytes = 32 if raw[:4] == b"\x20\0\0\0" else 0
        body = raw[self.wrapper_bytes :]
        if len(body) < 128:
            raise SgsError("SGS body header is truncated after its wrapper")
        self.xor_mask = 0
        if body[0] not in (1, 2, 4, 36) and body[0] ^ 165 in (1, 2, 4, 36):
            body = bytes(x ^ 165 for x in body)
            self.xor_mask = 165
        self.version = body[0]
        if self.version not in (4, 36):
            raise SgsError(
                f"SGS player version {self.version} is unsupported; v4/v36 required"
            )
        self.body = body
        self.title = body[10:26].split(b"\0", 1)[0].decode("cp949", "replace")
        self.a, self.b, self.c, self.d = struct.unpack_from("<4I", body, 72)
        self.declared_size = struct.unpack_from("<I", body, 120)[0]
        if (
            not 128
            <= self.a
            <= self.b
            <= self.c
            <= self.d
            <= self.declared_size
            <= len(body)
        ):
            raise SgsError("SGS section offsets are outside the file or unordered")
        if (self.b - self.a) % 8 or (self.d - self.c) % 12:
            raise SgsError("SGS descriptor alignment is invalid")
        self.entries = dict(zip(self.EVENTS, struct.unpack_from("<11I", body, 28)))
        if any(p and (p < 128 or p >= self.a or p % 2) for p in self.entries.values()):
            raise SgsError("SGS entry point is outside the bytecode")
        self.variables = list(struct.iter_unpack("<HHI", body[self.a : self.b]))
        if sum(n for _, n, _ in self.variables) * 4 != self.c - self.b:
            raise SgsError("SGS variable data size disagrees with its descriptors")
        self.resources = []
        pos = self.d
        for t, n, reserved in struct.iter_unpack("<III", body[self.c : self.d]):
            if pos + n > self.declared_size:
                raise SgsError("SGS resource exceeds declared payload")
            self.resources.append(Resource(t, pos, body[pos : pos + n]))
            pos += n
        if pos != self.declared_size:
            raise SgsError("SGS resource sizes do not cover its payload")

    def resource(self, index: int) -> Resource:
        if not 0 <= index < len(self.resources):
            raise SgsError(f"Resource index {index} out of range")
        return self.resources[index]
