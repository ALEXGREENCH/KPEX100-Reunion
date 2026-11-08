# NES на GNEX

В разделе «Примеры» доступны два NROM-картриджа.

- **Orbital Courier**. Стрелками проведите корабль через два пояса обломков и свяжите три маяка слева направо. Кнопка A или Select начинает новую попытку. Видна центральная область NES 208 × 160 без масштабирования.
- **Neon Ranger**. В независимом демоуровне Greg M. Krsak влево и вправо двигают героя, A или Select прыгает. Отпустите кнопку раньше для короткого прыжка. Видна вся ширина NES, сверху убраны 16 исходных строк, а оставшаяся область уменьшена до 192 × 168. [Происхождение и сборка картриджа](neon-ranger/README.md)

[Интерпретатор Mobile C](nrom.mc.in) читает картридж через GNEX VFS, запускает RP2A03 с вектора сброса и подаёт ввод через строб и сдвиговый регистр `$4016`. PPU выводит неподвижный фон, палитры и видимые спрайты OAM. Прерывание NMI от VBlank работает с возвратом через RTI. При DMA из внутренней памяти читается непосредственно зеркалируемая страница RAM. Фон повторно просматривается после изменений VRAM, палитры или параметров таблицы.

Заголовок поддерживает iNES mapper 0 с одним или двумя банками PRG-ROM, одним банком CHR-ROM, горизонтальным или вертикальным зеркалированием. Реализована часть инструкций RP2A03. VBlank подаётся раз в 20 мс. Расширение на произвольные игры требует полного набора инструкций, APU, прокрутки, точной модели приоритета спрайтов и потактовой синхронизации. [Схема NROM](https://www.nesdev.org/wiki/NROM) · [PPU](https://www.nesdev.org/wiki/PPU_programmer_reference) · [Контроллер NES](https://www.nesdev.org/wiki/NES_controller)

## Сборка

Для сборки SGS под Windows положите оригинальные `mcc_GNEX.exe` и `MASM_GNEX.exe` из SDK 2.12 в одну папку. Общий [сборщик](../sgs_build.py) проверяет SHA‑256 и меняет дату окончания работы компилятора во временной копии. Исходник картриджа находится в [build.py](build.py). [Архив GNEX SDK 2.12](https://archive.org/details/gnex_sdk_v2.12)

```powershell
python demos/nes/build.py --sdk C:/path/to/sdk --output ORBITAL.SGS
python demos/nes/build.py --rom-only --output ORBITAL.NES
python demos/nes/build.py --sdk C:/path/to/sdk --neon-ranger --output NEON.SGS
```

Параметр `--cart test.nes` заменяет вложенный картридж для экспериментов с поддерживаемыми инструкциями и регистрами. `--plain` отключает кодирование XOR для другого загрузчика. [Интеграционный тест](../../tests/nes-demo.test.mjs) проверяет три маяка и перезапуск [Orbital Courier](../../web/data/games/demo-orbital-courier.sgs), ходьбу, прыжок и приземление [Neon Ranger](../../web/data/games/demo-neon-ranger.sgs). Самостоятельный `.nes` Orbital Courier отдельно прошёл тот же маршрут в [JSNES 2.1.0](https://github.com/bfirsh/jsnes/tree/v2.1.0).

Для запуска из меню `GAME` Kingston 2.12 положите `ORBITAL.SGS` и `ORBITAL.NES` либо `NEON.SGS` и `NEON.NES` рядом в папку `GAME`. В полной эмуляции прошивки используется внешний картридж через оригинальные вызовы GNEX.
