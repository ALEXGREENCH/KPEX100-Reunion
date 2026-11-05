# Third-party components and historical inputs

The [MIT licence](LICENSE) covers original Reunion code. It does not relicense
bundled dependencies, historical firmware, games, GNEX SDKs, manuals or Swerve.
Keep each component's copyright and licence notices when redistributing it.

The separate LG SV400 research recovery archive includes an LGLZ decoder
translated from LGUI under GPL-3.0-or-later, its original source, a modified
C reference, COPYING and provenance. It is documented in
[the SV400 recovery report](doc/lg-sv400-games.md) and is not installed as a
Reunion runtime component. Its licence does not grant rights to LG's original
game payloads.

Additional preservation ZIPs are explicitly listed in
[the research catalogue](web/research/catalog.json). They include historical
developer attachments, AHYANE author history and LG SB260/SV730 PXO/Flash assets.
They are byte-verified research downloads, separate from the runnable collection.
Original vendor and author materials retain their existing rights; Reunion's
MIT licence does not relicense them. The LG archive carries the LGUI-derived
decoder, corresponding source, GPL-3.0-or-later notices and provenance alongside
the historical payloads. Read each archive's manifest and licence files.

The preserved GNEX Zone handset cards retain Sinjisoft's original notices and
archived HTML. Their tables are historical device documentation, not a new
Reunion licence for the original pages or proof of emulator compatibility.

The early GNEX Club source archive preserves historical SDK announcements and
Sinjisoft's original June 2003 company brochure, with their existing rights.
It contains no recovered SDK installer. Original pages and PDFs are not
relicensed under Reunion's MIT licence.

## Unicorn.js / Unicorn Engine for the browser

- Upstream: [Unicorn.js ARM v1.0.3](https://github.com/AlexAltea/unicorn.js/releases/tag/v1.0.3).
- Licence: GPL-2.0; included as [web/engine/vendor/LICENSE](web/engine/vendor/LICENSE).
- JavaScript: `web/engine/vendor/unicorn_arm_legacy.js`.
- WebAssembly: `web/engine/vendor/unicorn_arm.wasm`.
- Exact revisions, original and modified hashes: [unicorn-provenance.json](web/engine/vendor/unicorn-provenance.json).

The upstream JavaScript was renamed and given one global export,
`globalThis.MUnicornLegacy = MUnicorn`, for module-worker loading. The ARM WASM
binary is unchanged. The corresponding source archives include both the
JavaScript project and its exact Unicorn submodule:

| Component      | Revision                                   | Included source                                                                                         |
| -------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Unicorn.js     | `3a2eb47a0238c0149c5c3e067774c9350b75e5bf` | [Source archive](vendor/unicorn-sources/unicorn-js-3a2eb47a0238c0149c5c3e067774c9350b75e5bf.tar.gz)     |
| Unicorn Engine | `52f90cda023abaca510d59f021c88629270ad6c0` | [Source archive](vendor/unicorn-sources/unicorn-engine-52f90cda023abaca510d59f021c88629270ad6c0.tar.gz) |

Build instructions are supplied inside the upstream archives. The browser
runtime version is independent from the Python package version used by desktop.

## Yamaha SMAF Player

- Author: Andreas Wendorf / Akustikrausch.
- Upstream: [yamaha-smaf-player](https://github.com/akustikrausch/yamaha-smaf-player),
  commit `627f7ad8583ce34c5fec0269ef9778167af080d6`.
- Licence: [Apache-2.0](vendor/yamaha-smaf-player/LICENSE).
- Included source: `vendor/yamaha-smaf-player/`.
- Generated browser files: `web/engine/vendor/smaf.mjs` and `smaf.wasm`.

Local patches add the validated older MMMG/VOIC/EXVO/SEQU format and mono Mwa
StreamPCM effects. Their provenance, limitations and reference implementations
are documented in [PATCHES.md](vendor/yamaha-smaf-player/PATCHES.md). The
[smaf825 reference licence](vendor/yamaha-smaf-player/REFERENCE-LICENSE-smaf825.txt)
is retained with those notes. Reunion's wrapper and build script are in
`tools/smaf-wrapper.cpp` and `tools/build-smaf.py`; see [audio build notes](doc/browser-audio.md).
Preset FM timbres are approximate and contain no original Yamaha ROM dump.

## fflate

- Upstream: [fflate](https://github.com/101arrowz/fflate), version **0.8.2**.
- Author: Arjun Barrett.
- Licence: [MIT](web/vendor/fflate-LICENSE.txt).
- File: `web/vendor/fflate.js`.
- Purpose: decoding compressed native firmware states.

## Desktop dependencies

The Python environment installs the pinned packages from
[desktop/requirements.txt](desktop/requirements.txt). The source tree does not
include prebuilt Python environments or the Windows executable. Relevant
licence notices for Unicorn, Pillow, Capstone, Python, Tcl/Tk and PyInstaller
are retained under [desktop/licenses](desktop/licenses/). Build and runtime
requirements are documented in [doc/desktop.md](doc/desktop.md).

Unicorn's desktop licence notice is [COPYING](desktop/licenses/unicorn/COPYING).
The MIT licence for Reunion does not replace the licence of that native engine
or the conditions attached to redistributing a bundled Windows application.

## Development and research references

Prettier is a pinned npm development dependency. Its package includes its own
MIT licence. Black is used to format Python source and is installed separately.
Neither is required to run the browser emulator itself.

The InstallShield container format was checked against
[ISx](https://github.com/lifenjoiner/ISx), MIT, copyright 2017 lifenjoiner.
`tools/sdk-static.py` is a separate Python implementation. The SDK tools read
external files as data and do not execute their installers. References used for
hardware and API behaviour are recorded in [doc/reference-index.md](doc/reference-index.md).

The GPL-3.0 project [khvcemu](https://github.com/khrecast/khvcemu) provided a
research lead to the original BREW Swerve module, its helpers and extension
class. Reunion's GNEX bridge is documented separately in [doc/swerve.md](doc/swerve.md).
The Swerve binary itself is not part of either project's source licence.

## Historical binary inputs

The repository and default Pages build include 9 firmware images, 68 SGS
applications, 3 native quick-start snapshots and the original Swerve 2.1 module.
These 81 historical files are preserved byte-for-byte. `web/data/catalog.json`
records catalogue sizes, SHA-256 hashes and runtime profiles; the Swerve module
has separate [archive provenance](doc/swerve-provenance.json). Snapshot RAM
contains original firmware/game data. These materials retain their own
provenance and are not relicensed under Reunion's MIT licence.

Galaga for LG SD1000 preserves the original SGS body recovered from the
phone's GVM2X storage. The title screen credits Namco and MDream.
[Source image, extraction and gameplay evidence](doc/phone-firmware-games.md#lg-sd1000-galaga-из-памяти-телефона).

English Vocabulary Quiz King v1.0.8 preserves the original SGS from the
GVM storage of an LG SV130. The title screen credits GameTooth.com.
[Source image, extraction and gameplay evidence](doc/phone-firmware-games.md#дампы-lg-sv130-и-sv360).

Bubble Bobble for LG SD1020 preserves the original SGS body from GVM2X storage.
The title screen credits Taito and MDream.
[Source image, extraction and gameplay evidence](doc/phone-firmware-games.md#lg-sd1020-и-sd1250-bubble-bobble-и-ladder).

Battle Armor, Soul Sword, Treasure Hunter, The Man-Jong, Star Fighter,
Aiolos, Blocks, Exciting Drop and Blue Swallow come from public attachments
posted in the Korean KPEX100 forum in 2009.
[Original posts, names and hashes](validation/kingston-naver-game-recovery.json).

`python tools/assets.py verify` checks the collection. The browser importer and
`python tools/assets.py import /local/path` can supply or restore local files.
No additional historical binaries are downloaded automatically. The optional
`npm run build:source-only` omits the collection from the site output; the default
`npm run build` includes it.

Original SDK installers, extracted SDK programs and the Mobile C Reference Manual
are external research inputs. The separate research archives include historical
company pages and the corporate brochure PDF; they retain their own notices.

Four additional unmodified GVM2 builds come from public Mobaill attachments;
[provenance and limits](doc/mobaill-games.md). Storm of Silence Demo and
Waterski are unchanged SGS extracted from native S60 applications;
[source installers and hashes](validation/s60-catalog-gameplay.json).
Aiolos Fighter, Pocket Baseball 2 and Pocket Golf are also unchanged SGS from
previously preserved native S60 distributions;
[source hashes and bounded gameplay evidence](validation/s60-extra-gameplay.json).
The full S60 wrappers and external WAV/MIDI are now downloadable in the
[preserved S60 research archive](doc/s60-runtimes.md). Historical repacks are
identified as received; publisher authenticity is not established. They are
not runtime dependencies or covered by Reunion's MIT licence.

Additional GVM Club / Naver forum recoveries are documented in
[the forum attachment report](doc/gvm-forum-attachments.md). Their research bundle
preserves third-party Mobile C examples, resources, historical documents and
original SGS files. Zola's unchanged SGS is also included in the ordinary
catalogue; its single-player START mode comes from the original Mobile C and
SDK constants. The
Reunion source licence does not relicense those historical files.

The separate LG MAIN research tools use the official LZO 2.10 safe decoder
(GPL-2.0-or-later). Its source archive, licence, tested build command and
library hash accompany that research bundle. The new unpacker is
GPL-3.0-or-later; neither it nor the decoder is placed in the MIT runtime.
[Recovery method and exact sources](doc/lg-main-images.md).
