# Homebrew для Game Boy и Game Boy Color

В библиотеке Reunion откройте «Примеры».

- **Pocket Lab · Game Boy на GNEX**. Стрелки двигают робота по комнате.
- **Prism Relay · Game Boy Color на GNEX**. Соберите три светящиеся ячейки в лабиринте и дойдите до выхода справа. После этого на экране появляется `LINKED`.
- **Raw Snake · Game Boy на GNEX**. Play запускает игру, стрелки поворачивают змейку. Используется [оригинальный картридж Альберта Гонсалеса](raw-snake/README.md).
- **2048 · Game Boy на GNEX**. Play начинает партию, стрелки сдвигают плитки, Select сбрасывает поле. Используется [оригинальный картридж Уайатта Фергюсона](2048/README.md).
- **Geometrix · Game Boy Color на GNEX**. Стрелки двигают курсор, Select меняет фигуры местами, Esc поворачивает курсор. [Картридж и исходники](geometrix/README.md).
- **Flooder · Game Boy Color на GNEX**. Стрелки меняют выбранный цвет, Select перекрашивает связанную область. Используется [оригинальный картридж Обальфура](flooder/README.md).

SGS читает `POCKET.GBR`, `PRISM.GBC`, `SNAKE.GBR`, `2048.GBR` или `FLOODER.GBC` вызовами `FileOpen`, `FileReadInt` и `FileClose`. Картридж заполняет VRAM и работает с регистром кнопок `$FF00`. [Программа Mobile C](gb-reunion.mc) подаёт ввод, исполняет инструкции SM83 и рисует кадр. [Генератор](build.py) содержит программы Pocket Lab и Prism Relay и упаковывает выбранный картридж в SGS как файл VFS.

Прототип поддерживает 32-КиБ ROM-only картриджи и отдельный профиль MBC5 с 8 КиБ SRAM для Geometrix. Для DMG реализованы 2-битные тайлы и палитра `BGP`. CGB добавляет второй банк VRAM, атрибуты карты, отражение тайлов и фоновые RGB555-палитры через `VBK`, `BGPI` и `BGPD`. При записи картриджем нового тайла или цвета перерисовываются только затронутые ячейки. Экран выводится целиком при размере не менее 160 × 144. Pocket Lab и Prism Relay работают в фоновом режиме. Вариант Raw Snake добавляет стек, прерывания кнопок и VBlank, а также 8 × 8 DMG-спрайты. Вариант 2048 добавляет полноширинное окно DMG с произвольной строкой начала и ускоряет ожидание строки LCD и вывод тайлов GBDK. Время PPU приближённое. В Geometrix работают перенос GDMA в обе карты VRAM, прерывания совпадения LY/LYC для меню паузы и файл рекордов. Остальные контроллеры, режимы PPU и звук Game Boy требуют отдельной реализации.

[Карты тайлов CGB](https://github.com/gbdev/pandocs/blob/master/src/Tile_Maps.md) · [Палитры CGB](https://github.com/gbdev/pandocs/blob/master/src/Palettes.md)

## Сборка на Windows

Распакуйте оригинальные `mcc_GNEX.exe` и `MASM_GNEX.exe` из SDK 2.12 в одну папку и передайте её путь. Сборка сверяет оба SHA‑256. Старый компилятор заканчивает работу после 31 января 2010 года. Генератор меняет год на 2099 только во временной копии компилятора. [Архив GNEX SDK 2.12](https://archive.org/details/gnex_sdk_v2.12)

```powershell
python demos/gb/build.py --sdk C:/path/to/sdk --output POCKET.SGS
python demos/gb/build.py --rom-only --output POCKET.GBR
python demos/gb/build.py --sdk C:/path/to/sdk --color --output PRISM.SGS
python demos/gb/build.py --rom-only --color --output PRISM.GBC
python demos/gb/build.py --sdk C:/path/to/sdk --raw-snake --output SNAKE.SGS
python demos/gb/build.py --rom-only --raw-snake --output SNAKE.GBR
python demos/gb/build.py --sdk C:/path/to/sdk --flooder --output FLOODER.SGS
python demos/gb/build.py --rom-only --flooder --output FLOODER.GBC
python demos/gb/build.py --sdk C:/path/to/sdk --2048 --output 2048.SGS
python demos/gb/build.py --rom-only --2048 --output 2048.GBR
python demos/gb/build.py --sdk C:/path/to/sdk --geometrix --output GEOM.SGS
python demos/gb/build.py --rom-only --geometrix --output GEOM.GBC
```

В Reunion готовые [Pocket Lab](../../web/data/games/demo-pocket-lab.sgs), [Prism Relay](../../web/data/games/demo-prism-relay.sgs) и [Raw Snake](../../web/data/games/demo-raw-snake.sgs) можно импортировать как обычные SGS. Флаг `--cart` подставляет свой совместимый ROM-only файл в прототип Pocket Lab или Prism Relay. Режим и имя внутри SGS определяются флагом CGB в заголовке картриджа. `--plain` отключает кодирование XOR для другого загрузчика. Для проверки отрисовки и ввода доступны [тест Pocket Lab](../../tests/pocket-lab.test.mjs) и [прохождение Prism Relay](../../tests/prism-relay.test.mjs).

Для запуска из меню `GAME` Kingston 2.12 положите SGS и соответствующий картридж рядом в эту папку. Оригинальная прошивка открывает внешний файл через те же вызовы GNEX. В её FAT-пути нужно трёхбуквенное расширение, поэтому картридж DMG имеет имя `POCKET.GBR`. Вложенная папка под `GAME` для этого вызова не подходит. Проверка выполнялась в полной эмуляции Kingston 2.12. Замеры на физическом плеере ещё нужны.
