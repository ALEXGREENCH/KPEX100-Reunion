# Couple Bowling на Samsung Anycall

В первом одиночном режиме стрелки меняют положение и прицел, OK управляет
шкалой силы. В двух прогонах с одинаковым началом подтверждение изменило
бросок и дало шесть сбитых кеглей, автоматический бросок — девять.
Стрелка вправо отдельно изменила траекторию мяча.
[Играть](https://alexgreench.github.io/KPEX100-Reunion/) ·
[Кадры и манифест](../research/archives/Samsung-Anycall-Couple-Bowling-Replay.zip).

Веб-версия запускает оригинальный `버전 다름/커플볼링.mbin`, 116 817 байт,
CRC32 `14dfd52a`. В кадре 120 × 144 дорожка и рамки используют
вертикальные отрезки `+0x90` и горизонтальные `+0x94`. Игра ведёт
счёт в сессии и записывает 124-байтовый блок результатов через
`+0x0c`. Регрессия проверяет два перехода после записи.
[Исходный архив](../research/archives/Samsung-Anycall-ADS-MBIN.zip) ·
[Хеши кадров](../validation/anycall-couple-bowling.json) ·
[Тест ARM/WASM](../tests/ads.test.mjs).

```sh
python -m pip install unicorn==2.1.4 Pillow==13.0.0
python tools/replay-anycall-jumping-baby.py research/archives/Samsung-Anycall-ADS-MBIN.zip bowling-replay --game couple-bowling
```
