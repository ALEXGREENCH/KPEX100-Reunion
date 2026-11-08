# K-PEX 100 — Reunion

A browser and Windows emulator for the Kingston K-PEX 100 and Sinjisoft GNEX.
Reunion executes original ARM firmware and the original GNEX interpreter and
graphics routines. Game logic and assets come from unmodified SGS files.

[Русский README](README.md) · [Documentation](doc/README.md) ·
[Compatibility](doc/compatibility.md) · [Play in your browser](https://alexgreench.github.io/KPEX100-Reunion/)

The collection includes 9 firmware images, 117 SGS applications, 21 Anycall ADS games, 3 quick-start
snapshots and the original Swerve 2.1 module. The catalogue records SHA-256
hashes and tested runtime profiles.

A Kingston cold boot adds 14 homebrew games to the virtual FAT16 storage, with SGS launchers and ROM collections under `GAME/GB`, `GAME/GBC`, `GAME/NES`, and `GAME/GG`.
[Player pack and instructions](demos/kpex/README.md).

Eighteen Samsung Anycall games launch from the browser library using their original MBIN files and embedded SMAF audio. Each has a gameplay and input check. Timers, palette and synthesized timbres are approximate. ADS saves currently last for the active session. [Anycall controls and source archives](doc/samsung-anycall-ads-mbin.md#запуск-в-браузере)

[World League and Bounce from S60](doc/s60-library-completion.md): three previously preserved SGS builds are now in the launch library, with fresh paired scene/control checks. Menu rendering and external-audio limits remain documented.

[Seven additional GVM builds](doc/brewgames-gvm-games.md) include .hack//SIGN,
Ragnarok Gaiden, Mashimaro, Bukbeol, Fruit Tycoon, Fantasy Blue and a Zzayo
variant, with original archives and paired input/control checks.

The Games tab contains SGS and ADS builds, a playable
[Fortress Tournament reconstruction](doc/fortress-tournament.md), and the
Mosquito utility. The Examples tab contains four historical samples, homebrew for
[Game Boy and Game Boy Color](demos/gb/README.md), [NES](demos/nes/README.md), and
[Game Gear](demos/gg/README.md), plus [GNEX Bench](demos/benchmark/README.md). Preserved attachments,
source projects and research downloads are available on the
[archive page](https://alexgreench.github.io/KPEX100-Reunion/research/), with
provenance, sizes and SHA-256 hashes. Native PXO and Flash finds are preserved
research inputs; Reunion does not claim to run them.

[Platform preservation](doc/preservation.md) provides the complete SDK 2.10/2.12
installers, emulators, the exact original Mobile C Reference 311 and early GVM
documents. Sixty-three downloadable ZIPs retain actual files, with a complete
direct-member hash inventory and an offline verification tool.

The [Daum and HandyGame archive](doc/korean-game-portals-pass20.md) adds game
listings, beta topics and a January 2002 GVM handset table.

The [Softmax and m4leaf archive](doc/softmax-mobile-and-symbian.md) covers the first Crow,
the original KTF BREW Magna Carta M archive and the Symbian 6/7 corpus audit.

[Acquisition pass 18](doc/game-hunt-pass18.md) preserves 73 SKT game archives
containing Java classes and two GVM developer source attachments. This pass
adds no runnable SGS; its full static audit and originals are downloadable.

## Run locally

Install Node.js 22+ and npm, then run these commands in the cloned repository:

```sh
git clone https://github.com/ALEXGREENCH/KPEX100-Reunion.git
cd KPEX100-Reunion
npm ci
npm run dev
```

Open `http://127.0.0.1:5174/` in a browser with WebAssembly support and select a
game from the library. You can also import additional files in the browser;
known builds are matched by SHA-256 to retain their profiles. Saves use IndexedDB.
Direct SGS execution uses the included original Kingston 2.12 ROM:

```text
743d0b9a377dc6a3f0a80b7816cee575ad2f8249643876367c4bfaac54ddd19a
```

Python 3.11+ can verify all 81 included files or restore missing files from
another unpacked collection:

```sh
python tools/assets.py verify
# Only if local files are missing:
python tools/assets.py import /path/to/originals
```

The server can also run without npm dependencies: `node tools/serve.mjs`.
Opening `index.html` through `file://` is unsupported.

## Build and deploy

```sh
npm run build
npm run preview
```

The `site/` output is static and supports GitHub project paths such as
`/REPOSITORY/`. The default build verifies and includes the entire collection.
The optional `npm run build:source-only` creates a smaller site without those
files, with browser import available to its visitors.
On GitHub, select **Settings → Pages → Source → GitHub Actions**. The included
workflow deploys on pushes to `main` and supports manual dispatch.
See the [Pages guide](doc/github-pages.md).

## Scope

The catalogue counts distinct historical builds and demos. The latest batch
adds four [Mobaill SGS builds](doc/mobaill-games.md),
[Zola from GVM Club](doc/gvm-forum-attachments.md) and five
[SGS payloads from S60 applications](doc/gnex-devices.md#symbian-s60).
See also the preserved [native S60 runtimes](doc/s60-runtimes.md),
[historical SDK emulators](doc/gnex-emulators.md) and
[GVM/GNEX lineage evidence](doc/gvm-gnex-lineage.md).

The web engine has recorded gameplay and input scenarios for **64 game builds and
one utility**, covering SGS v1/v2/v4/v36. These checks do not establish complete
playthroughs. Independence Day 3D uses the included original Swerve ARM module;
complex scenes remain slow. Full-firmware boot is verified through the
Kingston 2.12 menu and Hell Fire. Eight other firmware versions are experimental.

No structurally valid SGS game containers were found inside the nine ROMs.
Games shown in the full-firmware menu are separate collection files placed on
the emulator's virtual FAT16 disk. The [scan report and tool](doc/firmware-games.md)
document the result and its limits, including unknown packing and native code.

The Python desktop version has a narrower scope: four K-PEX games and the
experimental full-firmware path. It requires Python 3.11+ with Tkinter:

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r desktop/requirements.txt
.venv/Scripts/python.exe desktop/launch.py
```

The desktop library is prepared automatically from the included `web/`
collection on first launch. See [desktop instructions](doc/desktop.md) for
dependencies, optional manual import and Windows builds.

## Development

```sh
npm test
npm run format:check
npm run build
```

The unit tests do not depend on original games. `npm run test:integration`
uses the included full collection and works after cloning; use
`python tools/assets.py verify` to check the files first. See [CONTRIBUTING.md](CONTRIBUTING.md).

`doc/` preserves GNEX SDK 2.10/2.12 research, Mobile C API evidence, the hardware
model, Swerve ABI notes and Sinjisoft history. `tools/` includes a static SDK
extractor, SGS inspector, replay runner and audio build tools. Most detailed
research notes are in Russian. SDK installers and manuals are referenced by
URL and hash, not redistributed.

Original Reunion code is [MIT-licensed](LICENSE). Bundled components retain
their GPL-2.0, Apache-2.0 and MIT terms; see [THIRD_PARTY.md](THIRD_PARTY.md).
No licence for original firmware, games, SDKs or Swerve is granted by this project.

The web player uses a fixed 5:4 LCD, a library drawer and device-specific controls.
Volume is adjustable in 5% steps and remembered locally. Photographic shells are
cosmetic and never change VM compatibility settings. [Interface, photo sources
and browser checks](doc/web-interface.md). The SD1020 photo is preserved but is
not enabled as an overlay because it only shows the closed device.

Menu → Controls supports replacement bindings, alternatives and per-game overrides
for keyboard, mouse buttons/wheel and Gamepad API buttons/axes. Preferences stay
in this browser. [Binding behavior and browser limits](doc/input-controls.md).
