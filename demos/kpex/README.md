# Homebrew для K-PEX 100

[Скачать комплект для Kingston](https://alexgreench.github.io/KPEX100-Reunion/homebrew.zip)

В браузере выберите Kingston 2.12 и **Холодный старт** во вкладке «Прошивки». Reunion разложит приложения и картриджи на виртуальном FAT16-накопителе. Откройте меню `GAME` оригинальной прошивки. Для прямого запуска из раздела «Примеры» Reunion читает тот же картридж из VFS внутри SGS.

Для копирования на плеер распакуйте ZIP и объедините его папку `GAME` с папкой `GAME` накопителя. Выбирайте файл `.SGS` из меню плеера. Отдельные папки содержат те же ROM с обычными расширениями для других эмуляторов.

В браузере кнопка «Добавить файлы» принимает `.gb`, `.gbc`, `.nes` и `.gg`. Локальный картридж появляется во вкладке «Игры». При запуске Reunion подставляет его в подходящий SGS и хранит исходный файл только в браузере. Для известных ROM, включая Geometrix и Zooming Secretary, Reunion подбирает лаунчер по SHA-256. Для холодного старта локальный ROM копируется в свою папку FAT. Готовые лаунчеры Kingston в ZIP открывают свои штатные картриджи.

Импорт принимает GB/GBC без контроллера банков на 32 КиБ, оригинальную Geometrix с MBC5, iNES mapper 0 с PRG 16/32 КиБ и CHR 8 КиБ, а также Game Gear на 32 КиБ с заголовком `TMR SEGA`. Совместимость программы зависит от реализованных инструкций и видеорежимов. Для запуска в сборке без бинарников сначала добавьте оригинальную Kingston 2.12 и SGS соответствующей платформы.

| SGS в `GAME`  | Картридж рядом с SGS | ROM в коллекции   | Игра                                                    |
| ------------- | -------------------- | ----------------- | ------------------------------------------------------- |
| `POCKET.SGS`  | `POCKET.GBR`         | `GB/POCKET.GB`    | [Pocket Lab](../gb/README.md)                           |
| `SNAKE.SGS`   | `SNAKE.GBR`          | `GB/SNAKE.GB`     | [Raw Snake](../gb/raw-snake/README.md)                  |
| `2048.SGS`    | `2048.GBR`           | `GB/2048.GB`      | [2048](../gb/2048/README.md)                            |
| `PRISM.SGS`   | `PRISM.GBC`          | `GBC/PRISM.GBC`   | [Prism Relay](../gb/README.md)                          |
| `GEOM.SGS`    | `GEOM.GBC`           | `GBC/GEOM.GBC`    | [Geometrix](../gb/geometrix/README.md)                  |
| `FLOODER.SGS` | `FLOODER.GBC`        | `GBC/FLOODER.GBC` | [Flooder](../gb/flooder/README.md)                      |
| `ORBITAL.SGS` | `ORBITAL.NES`        | `NES/ORBITAL.NES` | [Orbital Courier](../nes/README.md)                     |
| `NEON.SGS`    | `NEON.NES`           | `NES/NEON.NES`    | [Neon Ranger](../nes/README.md)                         |
| `LAN.SGS`     | `LAN.NES`            | `NES/LAN.NES`     | [Lan Master](../nes/lan-master/README.md)               |
| `CHASE.SGS`   | `CHASE.NES`          | `NES/CHASE.NES`   | [Chase](../nes/chase/README.md)                         |
| `ZOOM.SGS`    | `ZOOM.NES`           | `NES/ZOOM.NES`    | [Zooming Secretary](../nes/zooming-secretary/README.md) |
| `VAULT.SGS`   | `VAULT.GGR`          | `GG/VAULT.GG`     | [Prism Vault](../gg/README.md)                          |
| `BREAKER.SGS` | `BREAKER.GGR`        | `GG/BREAKER.GG`   | [Signal Breaker](../gg/README.md)                       |
| `PULSE.SGS`   | `PULSE.GGR`          | `GG/PULSE.GG`     | [Pulse Relay](../gg/README.md)                          |
| `COIL.SGS`    | `COIL.GGR`           | `GG/COIL.GG`      | [Coil Runner](../gg/README.md)                          |
| `FREIGHT.SGS` | `FREIGHT.GGR`        | `GG/FREIGHT.GG`   | [Freight Shift](../gg/README.md)                        |

У оригинальной Kingston 2.12 загрузчик SGS принимает XOR `0xA5`. В полном запуске `FileOpen` ищет плоское имя в `GAME`. Проверка с `GAME/GBC/PRISM.GBC` дала ошибку смены каталога. Короткое расширение `.GB` также не прошло сравнение имени в FAT. Для запуска используется трёхбуквенное `.GBR`. Обе копии каждого картриджа совпадают побайтно.

В полной эмуляции Kingston 2.12 проверены запуск и игровой ввод Pocket Lab, Prism Relay, Orbital Courier, Neon Ranger, Prism Vault, Raw Snake, Signal Breaker и Pulse Relay. В Lan Master проверены вход на первый уровень, одиночный шаг вправо и два отдельных поворота кабеля. В Flooder через меню Kingston проверены выбор цвета и первый ход, а в прямом режиме SGS решена вся доска. В 2048 проверены запуск, ход вправо и сброс. В Freight Shift проверены толчок, отмена и переход во вторую комнату. В Coil Runner проверены заряд, прыжок через провал и возврат к контрольной точке. Замеры и тесты на физическом плеере ещё нужны. В Chase проверены движение, подбор кристалла и пауза в прямом режиме. В ZIP лежат исходники Geometrix и её лицензия GPL v3, лицензии MIT для Reunion, Flooder и 2048, Unlicense для Neon Ranger и Raw Snake и отметки о public domain для Lan Master и Chase.

Повторная упаковка из проверенных файлов репозитория

```powershell
node tools/homebrew-pack.mjs homebrew.zip
```

[Проверка образа FAT и ZIP](../../tests/homebrew-pack.test.mjs) · [Модель часов K-PEX](../../doc/hardware.md)
