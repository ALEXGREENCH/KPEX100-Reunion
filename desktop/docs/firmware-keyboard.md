# Kingston 2.12 physical keyboard evidence

ROM SHA256 `743d0b9a377dc6a3f0a80b7816cee575ad2f8249643876367c4bfaac54ddd19a`.
Code offsets below are file offsets; RAM code address = file offset + `0x2000F8DC`.

The keyboard is an ADC channel 0 resistor ladder. The scanner at file `0x106C8`
directly writes `0` to ADCCON `0x80000A00`, then reads ADCDATA `0x80000A84`.
This bypasses the generic ADC helper used by battery/USB sensing. It masks with
`0x070703FF`, waits for ready bits `0x07000000`, and decodes the low ten bits.
It restores ADCCON bit 4 and ADC auxiliary control low bits afterward.

The following physical mapping uses the original default setting byte
RAM `0x200E0764` = 2 (ROM file `0xD0E88`). Setting values other than 2 exchange
up/down and left/right. There is no GPIO or injected firmware event required
for ordinary navigation keys.

| Button                                | ADC0 inclusive range | Chosen sample | Raw key | Firmware short key | GNEX key |
| ------------------------------------- | -------------------: | ------------: | ------: | -----------------: | -------: |
| Play                                  |           0РІР‚вЂњ40 |            20 |       0 |                  0 |     0x15 |
| Esc                                   |         41РІР‚вЂњ110 |            75 |      12 |                 12 |     0x0A |
| Select                                |        111РІР‚вЂњ190 |           150 |      13 |                 13 |     0x14 |
| Rec                                   |        191РІР‚вЂњ270 |           230 |       3 |                  6 |     0x0C |
| Auxiliary, physical label unconfirmed |        271РІР‚вЂњ350 |           310 |       7 |                  5 |     0x16 |
| Mode                                  |        351РІР‚вЂњ430 |           390 |       4 |                 14 |     0x0B |
| Menu                                  |        431РІР‚вЂњ500 |           465 |       5 |                  7 |     0x0D |
| Up                                    |        501РІР‚вЂњ590 |           545 |       8 |                 10 |     0x12 |
| Down                                  |        591РІР‚вЂњ650 |           620 |       9 |                 11 |     0x13 |
| Right                                 |        651РІР‚вЂњ700 |           675 |       1 |                  1 |     0x11 |
| Left                                  |        701РІР‚вЂњ780 |           740 |       2 |                  2 |     0x10 |
| Volume down                           |        781РІР‚вЂњ850 |           815 |      11 |                  4 |     0x19 |
| Volume up                             |        851РІР‚вЂњ980 |           915 |      10 |                  3 |     0x1A |
| Released                              |       981РІР‚вЂњ1023 |          1023 |     255 |            РІР‚вЂќ |  РІР‚вЂќ |

Evidence chain:

- ADC thresholds: `0x10778РІР‚вЂњ0x10898`.
- Debouncing and event handling: `0x10408`, `0x10560`, `0x1089CРІР‚вЂњ0x10914`.
- Raw key/event kind РІвЂ вЂ™ firmware key: `0x204A4РІР‚вЂњ0x2062C`.
- Firmware key РІвЂ вЂ™ GNEX key names/codes: `0x53C0CРІР‚вЂњ0x53DB4`.
- GNEX key numeric definitions: supplied game `kpex.h` and SDK reference.
- HOLD switch: GPIO D bit 15, high = unlocked, low = locked, read by
  `0x106E0РІР‚вЂњ0x10710` and `0x2AF00`.
- GPIO A bit 15: main loop `0xDEA4` counts low samples and eventually calls
  `0x17F6C`; likely a power switch input, physical relation to Play unproven.
  Do not assign it to ordinary Play without additional evidence.

The original scanner performs two-sample debounce. Short key event kind 3 is
emitted on release. The standalone execution probe holds four scanner calls,
releases for two, then calls the original queue polling and both translators.
All 13 sample values produced the expected GNEX key codes, with no modification
of these ROM routines. `python tools/firmware_keys_probe.py --rom /path/to/Kingston-2.12.rom`
reproduces the 13-key probe and prints its JSON results. It initializes the existing HOLD-state byte as
unlocked to avoid unrelated LCD side effects in the isolated function test.
All 1024 ADC levels were also executed through the native scanner; the exact
inclusive ranges above match `evidence/firmware-adc-thresholds.json`.

Single ADC ladder means simultaneous directions are not independent electrical
bits. Choosing the last pressed host button is an emulator input policy; it is
not a measured physical multiple-button resistor behavior.
