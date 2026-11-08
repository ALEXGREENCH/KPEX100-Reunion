// Mono 16 kHz PCM, 4,160 samples. The first two bytes identify GNEX WAV.
const sound pulseHeader = {
    7, 0, 82, 73, 70, 70, 164, 32, 0, 0, 87, 65, 86, 69,
    102, 109, 116, 32, 16, 0, 0, 0, 1, 0, 1, 0, 128, 62, 0, 0,
    0, 125, 0, 0, 2, 0, 16, 0, 100, 97, 116, 97, 128, 32, 0, 0, 0, 0
};
sound pulseA, pulseB;
int apuPulse[8], apuEnable;
int pulseReady, pulseTarget, pulseAge, lastPulse;

void PulseFill(int at, int count, int level) {
    if (pulseTarget) MemSetMedia(pulseB, at, level & 255, count);
    else MemSetMedia(pulseA, at, level & 255, count);
}

void PlayPulse(int note) {
    int period, cycle, duty, first, last, volume, on, off, sample, from, to;
    period = note & 2047;
    duty = (note >> 11) & 3;
    volume = note >> 13;
    // 16 CPU clocks per NES pulse period and 1,789,773 Hz NTSC CPU clock.
    // 586 is the Q12 sample duration of one timer unit at 16 kHz.
    cycle = (period + 1) * 586;
    on = (volume * (7 - duty)) >> 2;
    off = -(volume * (duty + 1) >> 2);
    first = cycle >> 3;
    last = cycle * (duty + 2) >> 3;
    if (duty == 2) {
        on = volume;
        off = -volume;
        last = cycle * 5 >> 3;
    }
    if (duty == 3) {
        // The 75% waveform is low on steps 1 and 2 of each period.
        on = -(volume * 3 >> 1);
        off = volume >> 1;
        last = cycle * 3 >> 3;
    }
    // Repeating the same byte gives coarse signed 16-bit levels using native memset.
    PulseFill(46, 8320, off);
    for (sample = 0; sample < (4160 << 12); sample += cycle) {
        from = (sample + first + 4095) >> 12;
        to = (sample + last + 4095) >> 12;
        if (to > 4160) to = 4160;
        if (to > from) PulseFill(46 + 2 * from, 2 * (to - from), on);
    }
    if (pulseTarget) PlaySound(pulseB);
    else PlaySound(pulseA);
}

int PulseNote(int channel) {
    int index, period, control;
    if (!(apuEnable & (1 << channel))) return 0;
    index = channel * 4;
    control = apuPulse[index];
    // FamiTone uses software volume and does not clock length or sweep.
    if ((control & 48) != 48 || (apuPulse[index + 1] & 128)) return 0;
    period = apuPulse[index + 2] | ((apuPulse[index + 3] & 7) << 8);
    if (period < 16 || !(control & 15)) return 0;
    return period | ((control >> 6) << 11) | ((control & 15) << 13);
}

void AudioTick() {
    int note;
    note = PulseNote(0);
    if (!note) note = PulseNote(1);
    if (!note) {
        if (lastPulse) StopSound();
        lastPulse = 0;
        pulseAge = 0;
        return;
    }
    // Playback owns a single native stream. Coalesce short changes to avoid
    // repeatedly opening it during one guest sound frame.
    pulseAge++;
    if (lastPulse && pulseAge < 4) return;
    if (lastPulse == note && pulseAge < 9) return;
    if (!pulseReady) {
        if (pulseReady < 0) return;
        pulseReady = -1;
        if (!SetMediaSize(pulseA, 8368) || !SetMediaSize(pulseB, 8368)) return;
        MemCpyMedia(pulseA, 0, pulseHeader, 0, 46);
        MemCpyMedia(pulseB, 0, pulseHeader, 0, 46);
        pulseReady = 1;
    }
    PlayPulse(note);
    pulseTarget ^= 1;
    lastPulse = note;
    pulseAge = 0;
}
