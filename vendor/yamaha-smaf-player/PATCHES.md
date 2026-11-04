# Reunion local changes

The upstream base is `akustikrausch/yamaha-smaf-player` commit
`627f7ad8583ce34c5fec0269ef9778167af080d6` (Apache-2.0).

`patches/0001-mmmg-sequ.patch` adds bounded parsing of the older MMMG container:
two leading bytes, nested VOIC/EXVO voice definitions and SEQU streams. Each
stream uses four channels and a 20 ms duration/gate clock. The existing
HandyPhone event decoder is extended only for SEQU's expression controller
`0x36`, long modulation, pitch-bend scale, and fine-tune field consumption.
The existing MTR/ATR paths and the no-playable-track guard are unchanged.

Evidence is the original Independence Day 3D SGS resource 27 (zero based),
after its two-byte media prefix: 5,456 bytes, SHA-256
`4b1500609263b8aa3bb4e145f83dd7cac02557334525109291ce5529ee24ebf6`.
It contains one MMMG at byte 91, five EXVO definitions in VOIC, and a 5,141-byte
SEQU at byte 304. Independent event inspection counted 897 notes and 598
`0x36` expression changes. There is no MTR or ATR in this resource.

Format behavior was checked against the author's implementation in
[smaf825](https://github.com/but80/smaf825/tree/7a4cf377914c33f81b3a6561dbfcf1d4a02a3cb6):
`smaf/chunk/mmmg.go`, `mmmg_voic.go`, `mmmg_exvo.go`,
`smaf/event/event.go` (`CreateEventSEQU`), and `sequencer/sequencer.go`
(20 ms fallback for a sequence outside an MTR score). That reference is MIT,
copyright 2017 but80; its license is included as `REFERENCE-LICENSE-smaf825.txt`.
The C++ changes are implemented locally and use the existing synthesizer.

Limitations: EXWV sample chunks and SEQU fine-tune synthesis remain unsupported;
the observed resource uses neither. Short PCM voice definitions unsupported by
the upstream voice decoder still use its fallback timbres. The output is an
approximation, not a Yamaha ROM or hardware recording.

Validation: `tests/smaf.test.mjs` decodes the unchanged resource to audible,
finite stereo PCM and rejects an invalid nested VOIC length. The original
Sketcher .2inch golden remains 453,176 frames with the same peak range.
`validation/smaf-independence.json` records the seven source resource hashes
and outputs. This checks parser/playback behavior, not hardware fidelity.

## Mwa sampled effects

`patches/0002-mwa-stream-pcm.patch` fixes the observed mono, 4-bit Yamaha ADPCM
Mwa format `0x20`. Its header is three bytes: format, then a big-endian 16-bit
sample rate. The sample bytes start after that header. The prior parser used
two bytes and derived the rate from a nibble, which is not the Mwa layout.
Other Mwa encoding subtypes and the separate Awa path are unchanged.

The [Yamaha MA-5 Authoring Tool manual, section 4.5.1, page 46](https://manuals.plus/m/66bfe529849a714a1d213edf827619a5c58de8170e50de271d0a9ea7e8cb2892.pdf)
maps bank MSB 125 notes 0–12 and 92–110 to stream wave IDs 1–32. A matching
validated Mwa is now played at its declared native rate, with channel volume,
expression, velocity and pan. It ends at its actual sample boundary; a shorter
note gate releases it. Other notes retain the prior synthesis path.

The binary layout was independently checked against the author's
[vavi-sound WaveType implementation](https://github.com/umjammer/vavi-sound/blob/41c07ddcb5393c1e31d6a00e501c9fcc2d02f354/src/main/java/vavi/sound/smaf/vavi/chunk/WaveType.java)
and `StreamWaveDataChunk` at the same commit. The implementation here is a
local C++ change, using the already included ADPCM decoder.

Independence Day resources 29–33 contain the same 45-byte event sequence and
five different Mwa1 payloads (`20 1F 40`, mono ADPCM at 8 kHz). Previously all
five yielded the same sustained FM waveform. The regression now requires five
different non-silent PCM outputs, with audible samples ending within 1.1 s;
the intentionally long sequence gate does not extend the sound itself.
The Sketcher golden and the new MMMG music regression remain unchanged.
