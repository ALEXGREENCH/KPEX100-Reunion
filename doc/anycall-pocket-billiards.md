# Pocket Billiards на Samsung Anycall

Оригинальный `포켓_빌리어드.mbin` из Anycall Land дошёл до игрового стола. Две команды подтверждения с интервалом в два такта привели к удару. На 187-м показе кадра биток сдвинулся, а в прогоне без ввода остался на исходном месте. Между кадрами различается 251 пиксель. [Кадры и манифест](../research/archives/Samsung-Anycall-Pocket-Billiards-Replay.zip) · [Исходный архив игр](../research/archives/Samsung-Anycall-ADS-MBIN.zip)

Этот выпуск использует буфер 120 × 144. Гостевой код по смещению `0x1996` в теле MBIN передаёт в службу `+0x74` координаты, границы отсечения, индекс цвета и адрес буфера. Из этих вызовов складывается пунктир прицела. За прогон игра использовала 660 таких вызовов и загрузила 44 изображения MQ. Палитра RGB332 пробная. Звук, сохранения и полный матч пока не проверены.

```sh
python -m pip install unicorn==2.1.4 Pillow==13.0.0
python tools/replay-anycall-jumping-baby.py research/archives/Samsung-Anycall-ADS-MBIN.zip pocket-billiards-replay --game pocket-billiards
```

Скрипт также принимает отдельный MBIN с совпадающей SHA‑256. В веб-библиотеке игра запускается из того же MBIN. [Управление в браузере](samsung-anycall-ads-mbin.md#запуск-в-браузере) · [Скрипт](../tools/replay-anycall-jumping-baby.py) · [Проверка архива](../validation/anycall-pocket-billiards.json)
