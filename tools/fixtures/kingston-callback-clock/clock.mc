%{
#DEFINE PLAYERVER 4
#DEFINE LCDCLASS 255
#DEFINE IMAGETYPE 255
#DEFINE AUDIOTYPE 255
#DEFINE APPTYPE 1
#DEFINE APPCPID 100
#DEFINE APPID 1190
#DEFINE APPVER 256
#DEFINE APPNAME "TickProbe"
#DEFINE VALIDCOUNT 255
#DEFINE VALIDTERM 255
%}

int report[17];
void main() {
    report[0] = 0x5449434b;
    ResetTick(0);
    ResetTick(9);
    SetTimer(20,1);
}
void EVENT_TIMEOUT() {
    int i, value;
    if (report[16]) return;
    report[1] = GetTick(0);
    report[2] = GetTick(9);
    value = 1;
    for (i=0; i<50000; i++) value = (value + 37) ^ i;
    report[3] = GetTick(0);
    report[4] = GetTick(9);
    report[5] = value;
    report[6] = i;
    ResetTimer();
    report[16] = 0x454e4421;
}
