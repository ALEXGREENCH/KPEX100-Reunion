# K-PEX 100 — Reunion

A browser and Windows emulator for the Kingston K-PEX 100 and Sinjisoft GNEX.
Reunion executes original ARM firmware and the original GNEX interpreter and
graphics routines. Game logic and assets come from unmodified SGS files.

[Русский README](README.md) · [Documentation](doc/README.md) ·
[Compatibility](doc/compatibility.md) · [GitHub Pages](doc/github-pages.md)

**Bring your own Kingston 2.12 ROM and SGS files.** Original firmware, games,
memory snapshots and the proprietary Swerve module are excluded from this
repository and from the public site build. The catalogue contains hashes and
tested runtime profiles.

## Run locally

Install Node.js 22+ and npm, then run these commands in the cloned repository:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5174/` in a browser with WebAssembly support. Import your
ROM and games in the browser. Known files are matched by SHA-256 to retain
their device profiles. Files are processed locally, and saves use IndexedDB.
The original Kingston 2.12 ROM is required for direct SGS execution:

```text
743d0b9a377dc6a3f0a80b7816cee575ad2f8249643876367c4bfaac54ddd19a
```

For an unpacked local collection, Python 3.11+ can import files by hash:

```sh
python tools/assets.py import /path/to/originals
python tools/assets.py verify --allow-missing
```

The server can also run without npm dependencies: `node tools/serve.mjs`.
Opening `index.html` through `file://` is unsupported.

## Build and deploy

```sh
npm run build
npm run preview
```

The `site/` output is static and supports GitHub project paths such as
`/REPOSITORY/`. It excludes original binaries even after a local import.
On GitHub, select **Settings → Pages → Source → GitHub Actions**. The included
workflow deploys on pushes to `main` and supports manual dispatch.
See the [Pages guide](doc/github-pages.md).

## Scope

The web engine has recorded gameplay and input scenarios for **37 games and
one utility**, covering SGS v1/v2/v4/v36. These checks do not establish complete
playthroughs. Independence Day 3D uses an original Swerve ARM module supplied
locally; complex scenes remain slow. Full-firmware boot is verified through the
Kingston 2.12 menu and Hell Fire. Eight other firmware versions are experimental.

The Python desktop version has a narrower scope: four K-PEX games and the
experimental full-firmware path. It requires Python 3.11+ with Tkinter:

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r desktop/requirements.txt
.venv/Scripts/python.exe desktop/launch.py
```

See [desktop instructions](doc/desktop.md) for asset import and Windows builds.

## Development

```sh
npm test
npm run format:check
npm run build
```

These checks work without proprietary assets. `npm run test:integration`
requires the full locally imported collection; use `python tools/assets.py verify`
to check it first. See [CONTRIBUTING.md](CONTRIBUTING.md).

`doc/` preserves GNEX SDK 2.10/2.12 research, Mobile C API evidence, the hardware
model, Swerve ABI notes and Sinjisoft history. `tools/` includes a static SDK
extractor, SGS inspector, replay runner and audio build tools. Most detailed
research notes are in Russian. SDK installers and manuals are referenced by
URL and hash, not redistributed.

Original Reunion code is [MIT-licensed](LICENSE). Bundled components retain
their GPL-2.0, Apache-2.0 and MIT terms; see [THIRD_PARTY.md](THIRD_PARTY.md).
No licence for original firmware, games, SDKs or Swerve is granted by this project.
