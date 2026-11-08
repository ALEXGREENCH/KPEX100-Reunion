%{
#DEFINE PLAYERVER 4
#DEFINE LCDCLASS 255
#DEFINE IMAGETYPE 255
#DEFINE AUDIOTYPE 255
#DEFINE APPTYPE 1
#DEFINE APPCPID 100
#DEFINE APPID 994
#DEFINE APPVER 256
#DEFINE APPNAME "GNEX Bench"
#DEFINE VALIDCOUNT 255
#DEFINE VALIDTERM 255
%}

#define ROUNDS 24
#define ARITHMETIC 8192
#define RECTANGLES 384
#define TIMER_MS 20
#define IDLE_PHASE 0
#define CPU_PHASE 1
#define LCD_PHASE 2
#define RESULTS 3
#define STOPPED 4

int phase, round, checksum, idleMs, cpuMs, lcdMs, left;
string line;

void Palette(int color) {
    if (color == 0) SetColorRGB(16, 27, 40);
    if (color == 1) SetColorRGB(41, 91, 123);
    if (color == 2) SetColorRGB(48, 160, 166);
    if (color == 3) SetColorRGB(239, 187, 112);
    if (color == 4) SetColorRGB(227, 232, 234);
}

void Header() {
    Palette(4);
    FillRect(0, 0, swWidth - 1, swHeight - 1);
    Palette(2);
    FillRect(0, 0, swWidth - 1, 17);
    DrawStr(left, 4, "GNEX BENCH / 1");
}

void Running() {
    Header();
    if (phase == IDLE_PHASE) DrawStr(left, 24, "1 / TIMER");
    if (phase == CPU_PHASE) DrawStr(left, 24, "2 / ARITHMETIC");
    if (phase == LCD_PHASE) DrawStr(left, 24, "3 / FILL + FLUSH");
    Flush();
}

int Rate(int count, int elapsed) {
    if (elapsed > 0) return count * 1000 / elapsed;
    return 0;
}

void Summary() {
    Header();
    if (idleMs <= 0 || cpuMs <= 0 || lcdMs <= 0) {
        DrawStr(left, 24, "CLOCK UNAVAILABLE");
    } else {
        MakeStr1(line, "IDLE    %d ms", idleMs);
        DrawStr(left, 24, line);
        MakeStr1(line, "CPU     %d ms", cpuMs);
        DrawStr(left, 38, line);
        MakeStr1(line, "LCD     %d ms", lcdMs);
        DrawStr(left, 52, line);
        MakeStr1(line, "ITER/s  %d", Rate(ROUNDS * ARITHMETIC, cpuMs));
        DrawStr(left, 66, line);
        MakeStr1(line, "RECT/s  %d", Rate(ROUNDS * RECTANGLES, lcdMs));
        DrawStr(left, 80, line);
    }
    MakeStr1(line, "CHECK %X", checksum);
    DrawStr(left, 94, line);
    DrawStr(left, 108, "OK / REPEAT");
    Flush();
}

void ArmPhase() {
    round = 0;
    ResetTick(0);
    SetTimer(TIMER_MS, 0);
}

void Begin() {
    phase = IDLE_PHASE;
    checksum = 0x1234;
    Running();
    ArmPhase();
}

void main() {
    left = (swWidth - 96) / 2;
    if (swWidth < 120 || swHeight < 120) {
        phase = STOPPED;
        DrawStr(0, 0, "LCD TOO SMALL");
        Flush();
        return;
    }
    Begin();
}

void EVENT_TIMEOUT() {
    int i, x, y;
    if (phase >= RESULTS) return;
    if (phase == CPU_PHASE) {
        for (i = 0; i < ARITHMETIC; i++) {
            checksum = (checksum * 17 + i + round) & 65535;
            checksum = checksum ^ (checksum >> 7);
        }
    } else if (phase == LCD_PHASE) {
        for (i = 0; i < RECTANGLES; i++) {
            x = left + (i % 6) * 16;
            y = 42 + ((i / 6) % 6) * 8;
            Palette((i + round) & 3);
            FillRect(x, y, x + 15, y + 7);
        }
        Flush();
    }
    round++;
    if (round < ROUNDS) {
        SetTimer(TIMER_MS, 0);
    } else if (phase == IDLE_PHASE) {
        idleMs = GetTick(0);
        phase = CPU_PHASE;
        Running();
        ArmPhase();
    } else if (phase == CPU_PHASE) {
        cpuMs = GetTick(0);
        phase = LCD_PHASE;
        Running();
        ArmPhase();
    } else {
        lcdMs = GetTick(0);
        phase = RESULTS;
        Summary();
    }
}

void EVENT_KEYPRESS() {
    if (phase == RESULTS && swData == 20) Begin();
}
