# Homebrew для K-PEX 100

[Скачать комплект для Kingston](https://alexgreench.github.io/KPEX100-Reunion/homebrew.zip)

В браузере выберите Kingston 2.12 и **Холодный старт** во вкладке «Прошивки». Reunion разложит приложения и картриджи на виртуальном FAT16-накопителе. Откройте меню `GAME` оригинальной прошивки. Для прямого запуска из раздела «Примеры» Reunion читает тот же картридж из VFS внутри SGS.

Для копирования на плеер распакуйте ZIP и объедините его папку `GAME` с папкой `GAME` накопителя. Выбирайте файл `.SGS` из меню плеера. Отдельные папки содержат те же ROM с обычными расширениями для других эмуляторов.

В браузере кнопка «Добавить файлы» принимает `.gb`, `.gbc`, `.nes` и `.gg`. Локальный картридж появляется во вкладке «Игры». При запуске Reunion подставляет его в подходящий SGS и хранит исходный файл только в браузере. Raw Snake, Lan Master и Neon Ranger узнаются по SHA-256. Для холодного старта локальный ROM копируется в свою папку FAT. Готовые лаунчеры Kingston в ZIP открывают свои штатные картриджи.

Импорт принимает GB/GBC без контроллера банков на 32 КиБ, iNES mapper 0 с PRG 16/32 КиБ и CHR 8 КиБ, а также Game Gear на 32 КиБ с заголовком `TMR SEGA`. Совместимость программы зависит от реализованных инструкций и видеорежимов. Для запуска в сборке без бинарников сначала добавьте оригинальную Kingston 2.12 и SGS соответствующей платформы.

| SGS в `GAME`  | Картридж рядом с SGS | ROM в коллекции   | Игра                                      |
| ------------- | -------------------- | ----------------- | ----------------------------------------- |
| `POCKET.SGS`  | `POCKET.GBR`         | `GB/POCKET.GB`    | [Pocket Lab](../gb/README.md)             |
| `SNAKE.SGS`   | `SNAKE.GBR`          | `GB/SNAKE.GB`     | [Raw Snake](../gb/raw-snake/README.md)    |
| `PRISM.SGS`   | `PRISM.GBC`          | `GBC/PRISM.GBC`   | [Prism Relay](../gb/README.md)            |
| `ORBITAL.SGS` | `ORBITAL.NES`        | `NES/ORBITAL.NES` | [Orbital Courier](../nes/README.md)       |
| `NEON.SGS`    | `NEON.NES`           | `NES/NEON.NES`    | [Neon Ranger](../nes/README.md)           |
| `LAN.SGS`     | `LAN.NES`            | `NES/LAN.NES`     | [Lan Master](../nes/lan-master/README.md) |
| `VAULT.SGS`   | `VAULT.GGR`          | `GG/VAULT.GG`     | [Prism Vault](../gg/README.md)            |

У оригинальной Kingston 2.12 загрузчик SGS принимает XOR `0xA5`. В полном запуске `FileOpen` ищет плоское имя в `GAME`. Проверка с `GAME/GBC/PRISM.GBC` дала ошибку смены каталога. Короткое расширение `.GB` также не прошло сравнение имени в FAT. Для запуска используется трёхбуквенное `.GBR`. Обе копии каждого картриджа совпадают побайтно.

В полной эмуляции Kingston 2.12 проверены запуск и игровой ввод Pocket Lab, Prism Relay, Orbital Courier, Neon Ranger, Prism Vault и Raw Snake. В Lan Master проверен вход на первый уровень по Select в полной прошивке. Короткое нажатие вправо в этом прогоне курсор не сдвинуло. Первый уровень пройден в прямом режиме SGS. Замеры и тесты на физическом плеере ещё нужны. В ZIP лежат лицензия MIT для кода Reunion, Unlicense для Neon Ranger и Raw Snake и отметка о public domain для Lan Master.

Повторная упаковка из проверенных файлов репозитория

```powershell
node tools/homebrew-pack.mjs homebrew.zip
```

[Проверка образа FAT и ZIP](../../tests/homebrew-pack.test.mjs) · [Модель часов K-PEX](../../doc/hardware.md)
