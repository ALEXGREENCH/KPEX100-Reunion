# Research tools

See [the reproducibility guide](../doc/tools-guide.md) for exact inputs, hashes and commands.

- `sdk-static.py`: inventory or extract the known GNEX SDK 2.10/2.12 InstallShield container as data.
- `sdk-syscalls.py`: reproduce the SDK 2.12 syscall name/signature catalogue from MASM and MCC.
- `pe_reader.py`: bounded PE32 parsing shared by those two Python tools; standard library only.
- `sgs-info.mjs`: inspect a local SGS container and optionally extract one resource.
- `scan-firmware-games.py`: find and optionally extract structurally validated SGS containers from ROMs; see the [scan report and limits](../doc/firmware-games.md).
- `extract-samsung-push-push.py` extracts verified Push Push I–III level tables as XSB or original bytes. See [sources and usage](../doc/phone-firmware-games.md#samsung-push-push-i-ii-и-iii).
- `unpack-lg-wdb.py` extracts legacy LG CYON WDB files using the companion DLL size. See the [verified models and commands](../doc/phone-firmware-games.md#игры-из-заводских-kdz).
- `unpack-myracer-xgn.py` decodes MyRacer MF101 XGN games into SGS v4 and checks the footer, header and resource layout. See the [firmware and format evidence](../doc/phone-firmware-games.md#myracer-mf101-и-игры-с-комплектного-диска).
- `unpack-sky-binx.py` decodes SKY BINX updates into PDL with per-block ZIP CRC checks. See the [format and three verified firmware sources](../doc/phone-firmware-games.md#декодирование-sky-binx).
- `extract-sky-rsc.py` validates the observed leading and trailing resource tables in SKY updates and extracts explicitly selected original records. See the [Cube Cube and Rhythm Station examples](../doc/phone-firmware-games.md#ресурсы-sky-и-cube-cube).
- `extract-old-sis.py` extracts EPOC release 6 SIS payloads with UID/body CRC checks and bounded decompression. It preserves simple/multilingual files and all conditional branches/options as data without evaluating installer conditions. See the [Sinjisoft S60 recovery](../doc/gnex-devices.md#symbian-s60).
- `extract-lg-sd810-gvm.py` reconstructs five original games and two music applications from the exact SD810 SXS2V309 dump, validating page order, complete SGS layouts and original INF lengths. See [source hashes and commands](../doc/lg-sd810.md).
- `inspect-sanyo-a011-vm.py` statically reconstructs 240 GVM dispatch entries from the exact SCP-A011 K2 V2000 BIN. It requires Capstone, executes no firmware and writes a new JSON without overwriting. See [input hash, command and trace limits](../doc/sanyo-nokia-korean-gvm.md#нативный-интерпретатор-scp-a011).
- `replay-samsung-t100-native.py` runs the original ARM code of three SGH-T100 games in Unicorn and captures the firmware framebuffer. See the [required AXF and replay commands](../doc/phone-firmware-games.md#samsung-sgh-t100-и-orange-824).
- `replay-samsung-a800-native.py` runs Fortress, Space War and X-Flighter from the verified A80XDWBD firmware and captures its 2-bit framebuffer. See the [input image and commands](../doc/phone-firmware-games.md#samsung-sgh-a800).
- `carve-gzip-jars.py`: recover intact MIDlet JARs from bounded gzip streams without running the installer; verified on the Nokia 3410 v5.46 service package. See [phone firmware research](../doc/phone-firmware-games.md).
- `replay-sgs.mjs`: replay JSON key/timer actions with the original interpreter and capture PNG frames plus diagnostics.
  Use `--file GAME.sgs actions.json OUTPUT_DIRECTORY` for an uncatalogued SGS, with an explicit device profile in the action plan.
  In an object with `actions`, set `advanceClock: true` to advance the emulated civil clock with scheduled time. This lets scripts that poll `GetTime` leave their splash screens.
  `runtime.startData` selects an evidenced START argument; `advance` steps by 0–10000 virtual milliseconds while dispatching only due timers. See [the replay guide](../doc/replay.md).
- `benchmark-web.mjs`: compare reference and accelerated execution on identical originals, checking frame hashes and game state; see [methodology and measurements](../doc/web-performance.md).
- `benchmark-firmware.mjs`: compare full ROM execution against a reference checkout, including CPU, timers, ATA, LCD, and SDRAM; see [firmware validation](../doc/firmware-validation.md).
- `serve.mjs`: serve `web/` or `site/` locally, including a project path prefix.
- `build.mjs` / `check-site.mjs`: create and verify the public GitHub Pages artifact.
- `research-assets.mjs`: verify the size and SHA-256 of every preserved ZIP listed in `web/research/catalog.json`; the full build calls it before publishing archive links.
- `preservation-inventory.py`: verify every research ZIP hash and each direct member's CRC, then write a new JSON inventory with member SHA-256, sizes and archive identities. No vendor software is executed. See [preservation](../doc/preservation.md).
- `check-repo.py` / `check-doc-links.py`: check tracked files and local documentation links.
- `assets.py`: verify original assets or import matching local files by SHA-256.
- `package-repo.py`: export the Git-tracked repository and verified collection as a deterministic ZIP.
- `update-catalog.py`: apply explicit handset profiles and recorded gameplay evidence to catalogue labels.
- `build-smaf.py` and `smaf-wrapper.cpp`: build the optional audio renderer.

The shared original collection is in `web/data/`; SDK installers are external inputs. The extraction tools never launch the installer or load native code. Existing extraction outputs are not overwritten.

- `inspect-gnex-sdk-pages.py`: inspect the preserved SDK page ZIP, verify original page hashes/CDX and list literal download filenames without running JavaScript. See [early SDK sources](../doc/gnex-early-sdk-player-followup.md).
- `browser-input-check.mjs`: exercise binding settings and source-aware input releases in an isolated browser. See [controls](../doc/input-controls.md).
- `stress-kpex.mjs`: seeded inputs, scheduled virtual timers and host timeouts for original K-PEX SGS. See [Battle Armor checks and limits](../doc/battle-armor-stability.md).
- `benchmark-memory-copy.mjs`: compare real bulk/scalar WASM memory copies; [scope and whole-game measurements](../doc/web-performance-pass2.md).
- `trace-kpex-key-events.mjs`: observe original full-firmware VM input through modeled hardware keys; [hashes and limits](../doc/kpex-key-release.md).
- `record-native-key-goldens.py`: independently record four corrected input scenarios with Python/Unicorn, checking catalogue originals and the native key-event receipt first.
- `inspect-sdk-emulator.py`: hash-locked static x86 disassembly of the SDK VM, event queue and timers; [method and limitations](../doc/sdk-emulator-internals.md).
- `browser-presentation-check.mjs`: optional isolated Chromium/Chrome checks for the fixed LCD, device controls, touch cancellation and volume persistence. See [setup](../doc/web-interface.md).

- `browser-gameplay-check.mjs`: 65-second actual Worker/ROM/SGS smoke with keyboard input and host timers; [scope and results](../doc/kpex-key-release.md).
- `wayback-harvest.py`: resumable uncollapsed CDX indexes and exact replay bodies with digest checks; [configuration, status and commands](../doc/wayback-collection.md).
- `package-wayback.py`: consistent SQLite snapshot, immutable response objects and a verified ZIP manifest, including while a collector is running.
- `preserve-sinjisoft-newswire.py`: save the publicly listed Korean Sinjisoft press releases and their directly linked photographs; [coverage](../doc/sinjisoft-press-preservation.md).

Сборщик Wayback также приоритизирует ALZ/HWP/CHM/DOC/MSI и учитывает
обычный `www`-алиас хостового CDX без соседних блогов;
[проверенный пример](../doc/gvm-technical-library-pass.md).

- `wayback-text-index.py`: build a static Korean/English search index from a frozen Wayback ZIP, verifying HTML bodies against both SHA-256 and CDX SHA-1. Search NFC-normalized text without executing pages or fetching links; [coverage and decoding limits](../doc/sinjisoft-early-sdk-notices.md).

- `benchmark-rgb565.mjs`: compare the original GNEX host color conversion and the compact channel lookup, including output allocation and exact pixel checks. `benchmark-web.mjs --compare display` alternates the two display methods on one guarded runtime; [measurements and limits](../doc/rgb565-display-performance.md).

- `inspect-gvm-legacy-chat.py`: hash-locked x86 GVM dispatcher and chat callbacks. Optional `--reference` emulates only the verified 25-byte LockChatMode callback in isolated Unicorn memory and records independent stack/state vectors; [method, dependencies and limits](../doc/witop-hellfire-legacy.md).

- `inspect-gvm-buzzer.py`: record note, rest and timing events from the isolated native SDK tone loop. Windows sound/wait calls are intercepted; [reproduction and waveform limits](../doc/gvm-buzzer-audio.md).
