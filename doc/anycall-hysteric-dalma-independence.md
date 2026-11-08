# Hysteric Girl, Dalma и Independence Day на Samsung Anycall

Откройте игру в библиотеке и подтвердите меню кнопкой Enter, Z или экранной
OK. Hysteric Girl позволяет двигать курсор и открывать карточки. В Dalma
стрелки двигают молоток, OK наносит удар. В Independence Day стрелки
двигают корабль, OK стреляет.
[Играть](https://alexgreench.github.io/KPEX100-Reunion/) ·
[Кадры и манифесты](../research/archives/Samsung-Anycall-Hysteric-Dalma-Independence-Replays.zip).

| Игра                       | Имя оригинала                    | Размер кадра | CRC32      |
| -------------------------- | -------------------------------- | ------------ | ---------- |
| Hysteric Girl              | `버전 다름/히스테리_걸.mbin`     | 120 × 144    | `46fa8b95` |
| Dalma, Let's Play          | `버전 다름/달마야놀자.mbin`      | 120 × 128    | `894353ca` |
| Independence Day (Anycall) | `버전 다름/인디팬던스_데이.mbin` | 120 × 144    | `12ce87b1` |

В каждой игре сравниваются прогоны без ввода, со стрелкой вправо и с OK
при одинаковом числе тактов. В Hysteric Girl цифры 6 и 5 дублируют вправо
и OK. Для каждой игры отдельно прошли два прогона по 5 400 тактов с вводом.
[Оригинальный архив Anycall Land](../research/archives/Samsung-Anycall-ADS-MBIN.zip) ·
[Hysteric Girl](../validation/anycall-hysteric-girl.json) ·
[Dalma](../validation/anycall-dalma-lets-play.json) ·
[Independence Day](../validation/anycall-independence-day-anycall.json).

Два ресурса Dalma хранят 55 и 96 строк, а игра запрашивает 54 и 92.
В дополнительных строках есть видимые пиксели. Спрайт Independence Day
хранит 10 строк, из которых игра запрашивает 8. Последние две заполнены
непрозрачным белым. Для этих трёх ресурсов движок проверяет точные
смещения, дескрипторы, размеры, прозрачный индекс и адрес вызова.
Декодер сохраняет полный растр, а отрисовка использует размеры из
вызова игры. В Hysteric Girl блок результатов хранится в текущей сессии.

```sh
python -m pip install unicorn==2.1.4 Pillow==13.0.0
python tools/replay-anycall-jumping-baby.py research/archives/Samsung-Anycall-ADS-MBIN.zip hysteric-replay --game hysteric-girl
python tools/replay-anycall-jumping-baby.py research/archives/Samsung-Anycall-ADS-MBIN.zip dalma-replay --game dalma-lets-play
python tools/replay-anycall-jumping-baby.py research/archives/Samsung-Anycall-ADS-MBIN.zip independence-replay --game independence-day-anycall
```
