# Neon Ranger

Автор демоуровня и проекта `first_nes` — Greg M. Krsak. [Исходный код, ревизия c7fca8d](https://github.com/gregkrsak/first_nes/tree/c7fca8d496a7e99c9deec177bf8b99e2df301cab) · [Оригинальная лицензия Unlicense](LICENSE)

Файл [NEON.NES](NEON.NES) — неизменённый вывод сборки исходного проекта. Размер 24 592 байта, SHA‑256 `91516cb428ded36e3fc4da391501849afde241f3923f300cd1b91b477cf7c5d4`, один банк PRG-ROM, один банк CHR-ROM, mapper 0, вертикальное зеркалирование. Сборка использовала [cc65 V2.19](https://github.com/cc65/cc65/tree/V2.19). Команда `make` в исходном проекте собирает заголовок, PRG и CHR в `first_nes.nes`, а `make validate` проверяет формат.

Reunion запускает этот файл без изменений. Контейнер GNEX и настройки вывода находятся в [основной папке NES](../README.md).
