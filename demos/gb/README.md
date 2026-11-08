# Pocket Lab и Prism Relay

В библиотеке Reunion откройте «Примеры».

- **Pocket Lab · Game Boy на GNEX**. Стрелки двигают робота по комнате.
- **Prism Relay · Game Boy Color на GNEX**. Соберите три светящиеся ячейки в лабиринте и дойдите до выхода справа. После этого на экране появляется `LINKED`.

SGS читает `POCKET.GBR` или `PRISM.GBC` вызовами `FileOpen`, `FileReadInt` и `FileClose`. Картридж заполняет VRAM, опрашивает регистр `$FF00` и определяет, можно ли передвинуть робота. [Программа Mobile C](gb-reunion.mc) подаёт ввод, исполняет инструкции SM83 и рисует фон. [Генератор](build.py) содержит обе программы картриджей и упаковывает выбранную в SGS как файл VFS.

Прототип поддерживает 32-КиБ ROM-only картриджи. Для DMG реализованы 2-битные тайлы и палитра `BGP`. CGB добавляет второй банк VRAM, атрибуты карты, отражение тайлов и фоновые RGB555-палитры через `VBK`, `BGPI` и `BGPD`. При записи картриджем нового тайла или цвета перерисовываются только затронутые ячейки. Экран выводится целиком при размере не менее 160 × 144. Совместимость ограничена реализованными инструкциями и фоновым режимом. Спрайты, звук, прерывания, точное время и контроллеры банков картриджа требуют дальнейшей реализации. Обе демки поставляются со своими картриджами без загрузочного ROM и логотипа Nintendo.

[Карты тайлов CGB](https://github.com/gbdev/pandocs/blob/master/src/Tile_Maps.md) · [Палитры CGB](https://github.com/gbdev/pandocs/blob/master/src/Palettes.md)

## Сборка на Windows

Распакуйте оригинальные `mcc_GNEX.exe` и `MASM_GNEX.exe` из SDK 2.12 в одну папку и передайте её путь. Сборка сверяет оба SHA‑256. Старый компилятор заканчивает работу после 31 января 2010 года. Генератор меняет год на 2099 только во временной копии компилятора. [Архив GNEX SDK 2.12](https://archive.org/details/gnex_sdk_v2.12)

```powershell
python demos/gb/build.py --sdk C:/path/to/sdk --output POCKET.SGS
python demos/gb/build.py --rom-only --output POCKET.GBR
python demos/gb/build.py --sdk C:/path/to/sdk --color --output PRISM.SGS
python demos/gb/build.py --rom-only --color --output PRISM.GBC
```

В Reunion готовые [Pocket Lab](../../web/data/games/demo-pocket-lab.sgs) и [Prism Relay](../../web/data/games/demo-prism-relay.sgs) можно импортировать как обычные SGS. Флаг `--cart` подставляет свой совместимый ROM-only файл. Режим и имя внутри SGS определяются флагом CGB в заголовке картриджа. `--plain` отключает кодирование XOR для другого загрузчика. Для проверки отрисовки и ввода доступны [тест Pocket Lab](../../tests/pocket-lab.test.mjs) и [прохождение Prism Relay](../../tests/prism-relay.test.mjs).

Для запуска из меню `GAME` Kingston 2.12 положите SGS и соответствующий картридж рядом в эту папку. Оригинальная прошивка открывает внешний файл через те же вызовы GNEX. В её FAT-пути нужно трёхбуквенное расширение, поэтому картридж DMG имеет имя `POCKET.GBR`. Вложенная папка под `GAME` для этого вызова не подходит. Проверка выполнялась в полной эмуляции Kingston 2.12. Замеры на физическом плеере ещё нужны.
