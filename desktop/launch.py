"""Launch the Reunion desktop application, optionally with ROM/SGS paths."""

import argparse


def main():
    parser = argparse.ArgumentParser(description="K-PEX 100 — Reunion")
    parser.add_argument("--rom", help="Firmware ROM path (Kingston 2.12 for SGS)")
    parser.add_argument("--game", help="SGS game path")
    parser.add_argument(
        "--self-test",
        metavar="REPORT.json",
        help="Run native packaging checks and write a JSON report",
    )
    parser.add_argument(
        "--self-test-originals",
        action="store_true",
        help="Also verify imported ROM, games and optional firmware checkpoints",
    )
    args = parser.parse_args()
    if not args.self_test or args.self_test_originals:
        from kpex.assets import prepare_bundled_assets

        prepare_bundled_assets()
    if args.self_test:
        from kpex.frozen_smoke import run

        raise SystemExit(
            0 if run(args.self_test, with_originals=args.self_test_originals) else 1
        )
    from kpex.app import main as open_app

    open_app(args.rom, args.game)


if __name__ == "__main__":
    main()
