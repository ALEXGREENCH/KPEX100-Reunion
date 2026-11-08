# Merry Christmas, Mr. 라면왕 и 우동타임 на Samsung Anycall

Все три сборки из папки `버전 다름` оригинального Anycall Land дошли до первого уровня. В архиве сохранены сами три MBIN, кадры меню и уровня, контроль без ввода и отдельный кадр для каждой проверенной кнопки. Начальные кадры перед вводом совпадают побайтно. После ввода оба прогона получают одинаковое число событий таймера. [Игры, кадры и манифесты](../research/archives/Samsung-Anycall-Merry-Ramen-Udon-Replays.zip) · [Полный архив Anycall Land](../research/archives/Samsung-Anycall-ADS-MBIN.zip)

| Игра                                | Проверенный ввод                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Merry Christmas (`메리 크리스마스`) | 2 поднимает сани, 4 сдвигает их влево, 6 вправо.                                                                          |
| Mr. 라면왕                          | Коды 1–9 выбирают девять отдельных конфорок в сетке 3×3. В каждой паре изменений видна кастрюля в соответствующей ячейке. |
| 우동타임 (Udon Time)                | Коды 2, 5 и 8 дают разные кадры игровой сцены. При нажатии 8 счёт меняется с `000000` на `000001`.                        |

В трёх сценариях код 19 подтверждает выбор в меню. Рисование выполняется с пробной палитрой RGB332 и синтетическим временем. Для 우동타임 служба `+0x40` получает границы диапазона и возвращает 16-битное число в буфер вызывающей стороны. Фиксированный seed обеспечивает повторяемость прогона. Звук, сохранения, штатная частота таймеров и прохождение целиком пока не проверены.

```sh
python -m pip install unicorn==2.1.4 Pillow==13.0.0
python tools/replay-anycall-jumping-baby.py research/archives/Samsung-Anycall-ADS-MBIN.zip merry-replay --game merry-christmas
python tools/replay-anycall-jumping-baby.py research/archives/Samsung-Anycall-ADS-MBIN.zip ramen-replay --game mr-ramen
python tools/replay-anycall-jumping-baby.py research/archives/Samsung-Anycall-ADS-MBIN.zip udon-replay --game udon-time
```

Вместо общего ZIP можно передать скрипту соответствующий MBIN из папки `original/` нового архива. На Pages доступны архив и отчёт. Сценарии воспроизводятся локально и сверяют SHA‑256 перед исполнением. [Инструмент](../tools/replay-anycall-jumping-baby.py) · [Проверка архива](../validation/anycall-merry-ramen-udon.json)
