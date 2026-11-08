# Bubble Monk на Samsung Anycall

Первый Bubble Monk (`보글보글 동자승`) работает из исходного файла `버전 다름/보글보글_동자승.mbin`. После заставки нажмите OK, затем OK ещё раз в меню. Стрелки влево и вправо двигают монаха, стрелка вверх отвечает за прыжок, `#` выпускает пузырь. [Веб-библиотека](https://alexgreench.github.io/KPEX100-Reunion/) · [Оригинальный MBIN](../web/data/games/anycall/bubble-monk.mbin)

В кадре 120 × 128 после 24 тактов движение влево, вправо, прыжок и выстрел меняют 222, 224, 282 и 116 пикселей относительно прогона без ввода. Экран Key Control проверен отдельно. В двух прогонах по 5 400 тактов ARM/WASM и независимый Python Unicorn совпали во всех 12 контрольных кадрах. Наибольший расход в ARM/WASM составил 16 413 из доступных 25 000 полуслов на событие. [Манифест](../validation/anycall-bubble-monk.json) · [Кадры и манифест в ZIP](../research/archives/Samsung-Anycall-Bubble-Monk-Replay.zip)

Вызов ADS `+0x9c` очищает весь LCD. Для этого оригинала проверены шесть точек возврата и значения заливки `0` и `0xff`. Без очистки фрагменты предыдущего экрана оставались поверх первого уровня. [Реализация](../web/engine/ads.js)

```sh
python tools/replay-anycall-jumping-baby.py research/archives/Samsung-Anycall-ADS-MBIN.zip bubble-monk-replay --game bubble-monk
```
