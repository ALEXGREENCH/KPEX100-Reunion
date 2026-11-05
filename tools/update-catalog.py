#!/usr/bin/env python3
"""Apply evidenced handset profiles and gameplay records to the existing catalogue."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VALIDATION = ROOT / "validation"
CATALOG = ROOT / "web/data/catalog.json"

HINTS = {
    "hellfire": "Начать игру — Enter / PLAY. Движение — стрелки.",
    "gnex1_1zimae": "Выбор — Z / OK. В начале есть длинное сюжетное вступление; диалоги продолжаются через OK.",
    "gnex36_dungeon_fighter": "В меню выберите новую игру стрелкой вниз и OK. Пропуск вступления — #.",
    "gnex21_eska2": "Выбор — Z / OK. Вступление пропускается клавишами # и *.",
    "gnex13_mu_-_fairy": "Выбор — Z / OK. Цифра 1 выбирает пункт меню, 5 открывает действие/выбор героя.",
    "gnex25_ys3_the_oath_in_felghana": "Сначала CLR / X закрывает настройки скорости. В меню новая игра — второй пункт. Диалоги — OK.",
    "gnex18_shing_stone": "В меню 2 — новая игра; затем 1 — обычная сложность. Вступление продолжается через OK.",
    "gnex16_bubble_bubble": "OK открывает меню; 1 начинает игру. Движение — стрелки, действие — 5.",
    "gnex8_nom": "OK открывает меню и начинает Stage 1. Прыжок — 5.",
    "gnex9_nom2": "Выбор — Z / OK. Для прыжка используйте цифровую клавиатуру, как указано в игре.",
    "gnex29_crow2": "В начальном меню нажмите вниз один раз, затем OK для новой игры. OK продолжает диалоги; 4/6 — движение, 5 — действие.",
    "gnex35_gostop_w_": "OK начинает партию и продолжает диалог. Карта выбирается соответствующей цифрой.",
    "gnex12_mosquito": "Историческая звуковая утилита: 2 открывает выбор режима; 1 — городской режим с таймером.",
    "gnex32_traffic": "Первый запуск измеряет скорость. Продолжайте через OK; перед первой миссией есть длинные диалоги.",
    "gnex33_pocket_pro_baseball3": "OK подтверждает настройки и команды. Действие на поле — 5.",
    "gnex34_major2007": "Подтверждение — OK, переход NEXT — #. Перед матчем пройдите встроенные подсказки.",
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--require-frames",
        action="store_true",
        help="Require original screenshots when recording new evidence",
    )
    args = parser.parse_args()
    prior = {
        item["id"]: item.get("evidence") or {}
        for item in json.loads(
            (VALIDATION / "compatibility.json").read_text(encoding="utf-8")
        )["games"]
    }
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    native_names = {
        entry["name"]
        for entry in json.loads(
            (ROOT / "tests/native-goldens.json").read_text(encoding="utf-8")
        )
    }
    profiles = {}
    for name in ("phone-profiles.json", "legacy-profiles.json"):
        profiles.update(
            json.loads((VALIDATION / name).read_text(encoding="utf-8"))["profiles"]
        )
    proofs = {}
    for name in (
        "legacy-gameplay.json",
        "desktop-gameplay.json",
        "modern-gameplay.json",
        "swerve-gameplay.json",
        "kingston-naver-gameplay.json",
        "phone-firmware-gameplay.json",
        "lg-sd810-gameplay.json",
        "community-gameplay.json",
        "mobaill-gameplay.json",
        "s60-catalog-gameplay.json",
    ):
        path = VALIDATION / name
        if not path.exists():
            continue
        for game_id, proof in json.loads(path.read_text(encoding="utf-8"))[
            "games"
        ].items():
            if proof["status"] != "idle":
                raise ValueError("Gameplay record is not successful: " + game_id)
            proofs[game_id] = {**proof, "record": name}
    # Later records supersede earlier runs of the same game. Check only the
    # selected evidence; screenshots themselves are kept outside public sources.
    for game_id, proof in proofs.items():
        frame = (VALIDATION / proof["frame"]).resolve()
        if not frame.is_relative_to(VALIDATION.resolve()):
            raise ValueError("Frame escapes validation directory")
        if frame.is_file():
            frame_hash = hashlib.sha256(frame.read_bytes()).hexdigest()
        else:
            previous = prior.get(game_id, {})
            if (
                args.require_frames
                or any(previous.get(key) != value for key, value in proof.items())
                or not previous.get("frameSha256")
            ):
                raise ValueError(
                    "New evidence requires its original gameplay frame: " + game_id
                )
            frame_hash = previous["frameSha256"]
        proof["frameSha256"] = frame_hash
    records = []
    for game in catalog["games"]:
        game.setdefault("runtime", {}).update(
            {
                key: value
                for key, value in profiles.get(game["id"], {}).items()
                if key in ("width", "height", "deviceMin", "deviceUserId")
            }
        )
        proof = proofs.get(game["id"])
        has_native_golden = game["sourceName"] in native_names
        if has_native_golden:
            game["compatibility"] = "verified"
        elif proof:
            game["compatibility"] = (
                "utility" if game["id"] == "gnex12_mosquito" else "playable"
            )
            game.pop("note", None)
        else:
            game["compatibility"] = "research"
        game["startHint"] = HINTS.get(
            game["id"],
            game.get("startHint")
            or (
                "Выбор — Z / OK. Цифры, * и # доступны на клавиатуре телефона; следуйте подсказкам игры."
                if game["platform"] == "mobile"
                else "Выбор — Z / A. Движение — стрелки."
            ),
        )
        if game["format"] == 36:
            game["startHint"] = (
                "Выбор — 5, перемещение по меню — стрелки. Для новой игры: 5 → вниз → 5. Первичная загрузка 3D занимает время."
            )
        records.append(
            {
                "id": game["id"],
                "title": game["title"],
                "format": game["format"],
                "compatibility": game["compatibility"],
                "evidence": (
                    proof
                    or {
                        "record": "tests/gnex.test.mjs",
                        "note": "Native desktop pixel, event and syscall goldens",
                    }
                    if proof or has_native_golden
                    else None
                ),
            }
        )
    CATALOG.write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (VALIDATION / "compatibility.json").write_text(
        json.dumps(
            {
                "scope": "Recorded working scenes and controls, not end-to-end game completion or every API.",
                "games": records,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    counts = {
        label: sum(game["compatibility"] == label for game in catalog["games"])
        for label in ("verified", "playable", "utility", "research")
    }
    print(json.dumps(counts))


if __name__ == "__main__":
    main()
