# Chase

Лабиринт Shiru для NES и Famicom, выпущенный в январе 2012 года вместе с его руководством по разработке игр на C. В пяти лабиринтах нужно собрать кристаллы, избегая преследователей. Play начинает игру и переключает паузу, стрелки двигают героя. В браузере Play соответствует Enter. [Статья автора](https://shiru.untergrund.net/articles/programming_nes_games_in_c.htm)

[CHASE.NES](CHASE.NES) — неизменённый `Chase.nes` из [ZIP автора от 27 марта 2016 года](https://web.archive.org/web/20160327132502id_/http://shiru.untergrund.net/files/nes/chase.zip). Размер ROM 24 592 байта. SHA‑256 `e32a445436b916835547c9716d8f461bcbbf3f3edd87f68116bbc7eb2108e3c0`. SHA‑256 ZIP `b5c6a2da932255ec87893b0ad04bc8ec97d68d3f0db70da22a1ed0a1a002c0c1`. NROM-128, 16 КиБ PRG-ROM, 8 КиБ CHR-ROM, горизонтальное зеркалирование. [Лицензия и атрибуция](LICENSE.txt)

Reunion проверяет запуск первого уровня, движение, сбор первого кристалла, паузу и возобновление игры. Отдельный запуск ROM в [JSNES 2.1.0](https://github.com/bfirsh/jsnes/tree/v2.1.0) подтвердил начало того же уровня и управление. Титульный экран в SGS выводится без исходной прокрутки, звуки требуют NES APU. [Тест](../../../tests/chase-demo.test.mjs)

Для запуска в меню `GAME` Kingston 2.12 скопируйте рядом `CHASE.SGS` и `CHASE.NES`. Веб-версия открывает тот же картридж из встроенной файловой системы SGS. [Сборка](../README.md)
