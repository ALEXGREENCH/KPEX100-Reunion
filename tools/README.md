# Research tools

See [the reproducibility guide](../doc/tools-guide.md) for exact inputs, hashes and commands.

- `sdk-static.py`: inventory or extract the known GNEX SDK 2.10/2.12 InstallShield container as data.
- `sdk-syscalls.py`: reproduce the SDK 2.12 syscall name/signature catalogue from MASM and MCC.
- `pe_reader.py`: bounded PE32 parsing shared by those two Python tools; standard library only.
- `sgs-info.mjs`: inspect a local SGS container and optionally extract one resource.
- `replay-sgs.mjs`: replay JSON key/timer actions with the original interpreter and capture PNG frames plus diagnostics.
- `serve.mjs`: serve `web/` or `site/` locally, including a project path prefix.
- `build.mjs` / `check-site.mjs`: create and verify the public GitHub Pages artifact.
- `check-repo.py` / `check-doc-links.py`: check tracked files and local documentation links.
- `assets.py`: verify original assets or import matching local files by SHA-256.
- `package-source.py`: export Git-tracked source files as a deterministic ZIP without historical binaries.
- `update-catalog.py`: apply explicit handset profiles and recorded gameplay evidence to catalogue labels.
- `build-smaf.py` and `smaf-wrapper.cpp`: build the optional audio renderer.

No original SDK, firmware or game binaries are included in these tools. The extraction tools never launch the installer or load native code. Existing extraction outputs are not overwritten.
