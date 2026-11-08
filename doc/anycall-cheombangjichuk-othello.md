# Cheombangjichuk Othello на Samsung Anycall

Выберите игру в библиотеке, пройдите заставку и подтвердите первый режим
кнопкой OK. Стрелки двигают курсор. От его начального положения нажмите
вправо четыре раза, вниз два раза и OK. Ход ставит фишку и переворачивает
соседнюю, затем отвечает компьютер. В парном прогоне через 101 такт на
доске шесть фишек. В прогоне без OK остаются четыре.
[Играть](https://alexgreench.github.io/KPEX100-Reunion/) ·
[Кадры и манифест](../research/archives/Samsung-Anycall-Cheombangjichuk-Othello-Replay.zip).

Reunion исполняет 130 088 байт оригинального `버전 다름/천방지축_오델로.mbin`
с CRC32 `723ad5a8`. Кадр 120 × 144. Три вызова `+0x9c` из
`0xf40042eb` очищают LCD цветом `0xff`. Проверка этого профиля
учитывает, что тот же слот в других сборках встречается с другими
параметрами. В заставке также встречается пустой дескриптор MQ.
[Исходный архив](../research/archives/Samsung-Anycall-ADS-MBIN.zip) ·
[Проверка](../validation/anycall-cheombangjichuk-othello.json).

```sh
python -m pip install unicorn==2.1.4 Pillow==13.0.0
python tools/replay-anycall-jumping-baby.py research/archives/Samsung-Anycall-ADS-MBIN.zip othello-replay --game cheombangjichuk-othello
```
