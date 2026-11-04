# Original firmware game launch path

Kingston 2.12; RAM code = file + `0x2000F8DC`.

1. `0x53E68(selected_file_index)` switches application bytes `0x200DF8ED/EE`
   to 4 (game mode), preserves media state, and reserves the original 2 MiB
   game area beginning at `0x20685290`.
2. At `0x53F34вЂ“0x53F48`, it copies the literal `GAME\` (file `0x53F90`) into
   `0x20B48CA0`, then appends the selected filename from the firmware browser.
   The FAT image's uppercase `GAME` directory and short `*.SGS` names match.
3. At `0x53F64`, it calls `0x3C58C(0, pathname, 0)`. That function copies the
   pathname into `0x20B40E80`, separates directory/title, configures dimensions,
   initializes the message queue, and dispatches the engine start message.
4. `0x49B94` dispatches message 0x0F to `0x41BF8` (loader).
5. `0x4187C` opens through native FAT functions; `0x3CDEC` reads then XORs each
   byte with 0xA5. `0x41924вЂ“0x41950` explicitly accepts versions 1, 2, 4 and
   0x24. All four supported original games are encrypted version 4 with no
   leading 32-byte wrapper.
6. `0x41C74вЂ“0x41C8C` selects the newer VM for version >=4. Original bytecode
   execution enters file `0x399BC` / RAM `0x20049298`.

Useful trace addresses:

| Stage                | RAM address |
| -------------------- | ----------- |
| Launch selected game | 0x20063744  |
| Start host/engine    | 0x2004BE68  |
| Load SGS header      | 0x200514D4  |
| New VM interpreter   | 0x20049298  |
| VM error             | 0x20042F98  |

For initial full-system testing, Hell Fire and KPetris avoid the physical MP3
codec path. Godori uses sound subtype 8, which the native firmware forwards to
the audio driver. Ikaria's SMAF subtype 2 and Hell Fire's buzzer subtypes 0/1
are ignored by the original K2.12 adapter at `0x3CFA0`.
