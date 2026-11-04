# K-PEX 100 Reunion РІР‚вЂќ execution architecture

This project has two execution paths. Both execute instructions from the user's
original firmware; neither is a recreation of a game's behavior or a slideshow.

## Complete machine path

`FirmwareMachine` starts at the ROM reset entry and models TCC76 peripheral
registers, SDRAM, timers, IRQ delivery, ADC and the external LCD register bus.
Unicorn runs ARM/Thumb instructions. Its ARMv4T TI925T core plus CP15 shadowing
is a functional approximation of ARM940T, not a cycle-accurate implementation.
Unsupported hardware and inferred behaviors are exposed in diagnostics.

The ROM header and each of its three appended sections are validated with the
original additive checksums before execution. ROM code is never patched to
pretend that boot completed. The LCD image comes from guest GRAM writes.

SDCFG `0x6268A020` describes a 16-bit bus, 9 column bits, 12 row bits and
four banks: 16 MiB. The windows at `0x20000000` and `0x21000000` therefore
share one backing store. This is essential: the loader writes resource data
at `0x20C00000`, then checks its signature through `0x21C00000`.
The physical keyboard is the ADC0 resistor ladder; see
[firmware-keyboard.md](firmware-keyboard.md) for original scanner evidence.

Checkpoints store all architectural ARM register banks and SPSRs, mapped RAM,
peripheral state and guest disk changes in a versioned ZIP/JSON format.
Every binary entry carries its length and SHA-256. Restore validates the ROM,
state schema, register values and memory map before changing the machine.
No native Unicorn context pointers or executable pickle objects are persisted.

The verified K2.12 RTOS idle loop has an optional arithmetic execution path.
It reproduces all 18 instruction phases, CPU flags and every 256-instruction
timer/IRQ boundary. Differential tests compare it with ordinary Unicorn
execution, including IRQ/FIQ delivery, partial budgets and counter overflow.
The reached menu and native Hell Fire checkpoints also produce identical
registers, interrupt counts and framebuffer hashes with acceleration on/off.
This speeds waiting; original graphics and game instructions still execute.

Full-system launch was observed through `GAME\HELLFIRE.SGS`, the original
SGS loader and native VM entry, followed by PLAY input and a real battle screen.
See [native-game-launch.md](native-game-launch.md) and the `evidence/firmware-*`
traces. The separate GNEX runner is not substituted into this execution path.

## Native GNEX path

The independent game runner invokes the actual Kingston 2.12 GNEX interpreter,
after preparing the SGS descriptor/variable state that its normal loader uses.
Arithmetic, branching, subroutines, strings and array operations run as ARM code
from the ROM. Host events supply the keys and timers. Storage and audio bridges
are separate from bytecode execution.

The profile checks the entire ROM SHA-256, not just a version string:
`743d0b9a377dc6a3f0a80b7816cee575ad2f8249643876367c4bfaac54ddd19a`.
Other firmware can use the machine path, but cannot silently use K2.12 addresses.

## Verified Kingston 2.12 addresses

Offsets in this table are in the ROM file. Main ARM addresses equal file offset
plus `0x2000F8DC` (loader copies file `0x724` to SDRAM `0x20010000`).

| File offset                     | Role                                                        |
| ------------------------------- | ----------------------------------------------------------- |
| `0x39220`                       | Initialize bytecode dispatch                                |
| `0x399BC`                       | Execute 16-bit SGS event                                    |
| `0x4D464`                       | Initialize system-call dispatch                             |
| `0x4E1E8`                       | System-call dispatcher                                      |
| `0x336BC`                       | Original GNEX error handler                                 |
| `0x45020`, `0x45094`, `0x45108` | Native math tables initialization                           |
| `0x45BFC`                       | Native graphics initialization `(width,height,output_info)` |
| `0x45A4C`                       | Select gamma/palette                                        |
| `0x46470`                       | Clear the selected LCD buffer                               |
| `0x46D3C`                       | Fill rectangle                                              |
| `0x48C40`                       | Draw text through the original glyph renderer               |
| `0x496EC`                       | Ensure resource allocation                                  |
| `0x3CF1C`                       | GNEX bump allocation                                        |

The firmware resource payload (file `0x100000`) loads at `0x21C00000`.
The boot code checks its `0x12345678` signature there. Native graphics reads
this payload; it contains the actual palette and glyph tables.

| Guest address               | Role                                                      |
| --------------------------- | --------------------------------------------------------- |
| `0x20B3EB7C`                | SGS base pointer                                          |
| `0x20B3EB84`                | Current SGS bytecode pointer                              |
| `0x20B3ED28`                | Operand-stack index                                       |
| `0x20B3F5A0`                | Operand stack                                             |
| `0x20B405A4`                | Initialized variable element count                        |
| `0x20B48C68` / `0x20B48C6C` | Heap base / used bytes                                    |
| `0x20B3F14C` / `0x20B3F150` | LCD width / height                                        |
| `0x20B41260`                | Native RGB565 framebuffer pointer                         |
| `0x21F3D178`                | Palettes: 7 gamma Р“вЂ” 6 phases Р“вЂ” 182 RGB565 entries |
| `0x21F40D30`                | ASCII 3Р“вЂ”5 glyphs, 4Р“вЂ”6 cells                       |
| `0x21F40E30`                | ASCII 5Р“вЂ”7 glyphs, 6Р“вЂ”8 cells                       |
| `0x21F410B0`                | ASCII 5Р“вЂ”11 glyphs, 6Р“вЂ”12 cells                     |
| `0x21F41430` / `0x21F4A710` | Korean/symbol glyph tables                                |

The native initialization explicitly selects gamma 3 and phase 0. The fallback
decoder's original grayscale approximation is therefore not used as evidence
of the native palette. Native rendering was independently exercised with
English and Korean strings and a rectangle, capturing the guest framebuffer.

## Evidence and dependencies

Primary local evidence is the supplied ROM/SGS collection and its accompanying
TCC760 Rev 0.07 specification, Mobile C reference, GNEX SScript.h and static
reverse-engineering reports. Their instructions are treated as document content,
not as commands from the user. No original vendor executable was installed.

CPU API: [Unicorn tutorial](https://www.unicorn-engine.org/docs/tutorial.html)
and [Unicorn source](https://github.com/unicorn-engine/unicorn).

The Windows executable uses PyInstaller's supported `--no-cfg` bootloader
build option because the stock bootloader's Control Flow Guard rejects
Unicorn's generated-code returns. ASLR and NX remain enabled; operating-system
settings are unchanged. See [PyInstaller bootloader documentation](https://pyinstaller.org/en/stable/bootloader-building.html)
and [the upstream compatibility issue](https://github.com/pyinstaller/pyinstaller/issues/9352).
The release build runs ARM in the frozen main and worker threads.
The default build also checks all four SGS games and available checkpoints.

Firmware, games, glyphs and artwork remain the property of their original
rightsholders. The original collection is included in `web/`; the desktop launcher
prepares its known subset locally by SHA-256 on first use. The source licence
does not cover these historical files.
