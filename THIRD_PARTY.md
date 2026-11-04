# Third-party components and historical inputs

The [MIT licence](LICENSE) covers original Reunion code. It does not relicense
bundled dependencies, historical firmware, games, GNEX SDKs, manuals or Swerve.
Keep each component's copyright and licence notices when redistributing it.

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

`web/data/catalog.json` records the size and SHA-256 of each supported original
file. Firmware, SGS, proprietary Swerve and native quick-start snapshots are
excluded from this repository and from the Pages build. Snapshot RAM contains
original firmware/game data and is treated the same way as those inputs.

Use the browser file importer or `python tools/assets.py import /local/path`
to supply your own files locally. There is no automatic download of historical
binaries. Original SDK installers, extracted SDK programs and manual PDFs are
also excluded. Research documents retain URLs, hashes and derived findings.
The original Swerve module has separate [archive provenance](doc/swerve-provenance.json).
