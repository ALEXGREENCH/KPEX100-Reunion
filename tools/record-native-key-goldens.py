"""Record original ARM gameplay using the native K-PEX key-release protocol."""

import argparse
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "desktop"))
from kpex.gnex import GnexRuntime  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Output must be new")
    native = json.loads(
        (ROOT / "validation/kpex-native-key-events.json").read_text("utf8")
    )
    if [record["value"] for record in native["records"]] != [20, 255, 17, 255]:
        raise ValueError("Original firmware key-release evidence is required")
    catalog = json.loads((ROOT / "web/data/catalog.json").read_text("utf8"))

    def original(entry):
        data = (ROOT / "web" / entry["url"]).read_bytes()
        if (
            len(data) != entry["bytes"]
            or hashlib.sha256(data).hexdigest() != entry["sha256"]
        ):
            raise ValueError("Original identity mismatch: " + entry["id"])
        return data

    rom = original(
        next(item for item in catalog["firmwares"] if item["id"] == "kingston-2.12")
    )
    results = []
    for game_id in ("hellfire", "kpetris", "ikaria", "godori"):
        entry = next(item for item in catalog["games"] if item["id"] == game_id)
        machine = GnexRuntime(rom, original(entry))
        machine.event("START")
        title = hashlib.sha256(machine.framebuffer.tobytes()).hexdigest()
        for _ in range(5):
            machine.event("TIMEOUT")
        key = 21 if game_id == "hellfire" else 20
        machine.set_key(key, True)
        machine.set_key(key, False)
        for step in range(40):
            if step % 10 == 0:
                code = 17 if step % 20 else 16
                machine.set_key(code, True)
                machine.set_key(code, False)
            if machine.timer_ms:
                machine.event("TIMEOUT")
            if machine.status != "idle":
                raise RuntimeError(machine.diagnostics)
        results.append(
            {
                "name": entry["sourceName"],
                "title": title,
                "final": hashlib.sha256(machine.framebuffer.tobytes()).hexdigest(),
                "status": machine.status,
                "events": machine.event_count,
                "syscalls": {
                    str(key): value for key, value in machine.syscalls.items()
                },
            }
        )
    args.output.write_text(json.dumps(results, indent=2) + "\n", encoding="utf8")
    print(
        json.dumps(
            {"games": len(results), "events": [item["events"] for item in results]}
        )
    )


if __name__ == "__main__":
    main()
