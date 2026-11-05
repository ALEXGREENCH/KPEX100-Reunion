# Research tools

See [the reproducibility guide](../doc/tools-guide.md) for exact inputs, hashes and commands.

- `sdk-static.py`: inventory or extract the known GNEX SDK 2.10/2.12 InstallShield container as data.
- `sdk-syscalls.py`: reproduce the SDK 2.12 syscall name/signature catalogue from MASM and MCC.
- `pe_reader.py`: bounded PE32 parsing shared by those two Python tools; standard library only.
- `sgs-info.mjs`: inspect a local SGS container and optionally extract one resource.
- `scan-firmware-games.py`: find and optionally extract structurally validated SGS containers from ROMs; see the [scan report and limits](../doc/firmware-games.md).
- `replay-sgs.mjs`: replay JSON key/timer actions with the original interpreter and capture PNG frames plus diagnostics.
- `serve.mjs`: serve `web/` or `site/` locally, including a project path prefix.
- `build.mjs` / `check-site.mjs`: create and verify the public GitHub Pages artifact.
- `check-repo.py` / `check-doc-links.py`: check tracked files and local documentation links.
- `assets.py`: verify original assets or import matching local files by SHA-256.
- `package-repo.py`: export the Git-tracked repository and verified collection as a deterministic ZIP.
- `update-catalog.py`: apply explicit handset profiles and recorded gameplay evidence to catalogue labels.
- `build-smaf.py` and `smaf-wrapper.cpp`: build the optional audio renderer.

The shared original collection is in `web/data/`; SDK installers are external inputs. The extraction tools never launch the installer or load native code. Existing extraction outputs are not overwritten.
