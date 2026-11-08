# Badger и Push Push Ice World на Samsung Anycall

В **Badger** после меню Enter или OK открывает уровень. Стрелки влево
и вправо двигают героя. Цифры 4 и 6 дают те же кадры при одинаковых
тактах. Кнопки 1 и 3 выполняют короткие прыжки, 7 и 9 — длинные,
как указано в оригинальном меню управления. В **Push Push Ice World**
движение работает с крестовины и
цифр 2, 4, 6, 8. В первом лабиринте проверены два блока. После толчка
влево или вниз блок встаёт на соответствующую цель и краснеет.
[Играть](https://alexgreench.github.io/KPEX100-Reunion/) ·
[Кадры и манифесты](../research/archives/Samsung-Anycall-Badger-and-Push-Push-Ice-World-Replays.zip).

| Игра                | Имя оригинала                     | Кадр      | CRC32      |
| ------------------- | --------------------------------- | --------- | ---------- |
| Badger              | `오소리.mbin`                     | 120 × 128 | `45397c13` |
| Push Push Ice World | `버전 다름/푸쉬푸쉬얼음나라.mbin` | 120 × 144 | `51a53256` |

В обоих случаях сравниваются прогоны с одинаковой заставкой и числом
тактов. В активных ветках направление подаётся раз в четыре такта.
У Push Push три проверенных ресурса MQ хранят больше индексов, чем
запрошено для вывода. Декодер проверяет полный размер ресурса, а
отрисовка ограничивается запрошенным прямоугольником.
Обе игры прошли по два прогона на 5 400 тактов с вводом. Badger использует
лимит 50 000 единиц работы на событие. Максимум в этих прогонах — 34 849.
[Исходный архив Anycall Land](../research/archives/Samsung-Anycall-ADS-MBIN.zip) ·
[Проверка Badger](../validation/anycall-badger.json) ·
[Проверка Push Push](../validation/anycall-push-push-ice-world.json).

```sh
python -m pip install unicorn==2.1.4 Pillow==13.0.0
python tools/replay-anycall-jumping-baby.py research/archives/Samsung-Anycall-ADS-MBIN.zip badger-replay --game badger
python tools/replay-anycall-jumping-baby.py research/archives/Samsung-Anycall-ADS-MBIN.zip push-push-replay --game push-push-ice-world
```
