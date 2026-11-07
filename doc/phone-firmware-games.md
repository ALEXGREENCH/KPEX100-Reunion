# Игры в прошивках телефонов и плееров

Исследование от **5 ноября 2026 года**. Цель — найти оригинальные игры,
конкретные версии прошивок и воспроизводимые способы извлечения. Это каталог
исследования; наличие записи здесь не означает поддержку формата в Reunion.

Главный практический результат: из сервисного пакета **Nokia 3410 v5.46**
извлечена **Munkiki’s Castles 1.06** в 15 JAR-упаковках. Дополнительно скачаны и
проверены официальный firmware **Samsung YP-T8 с XEOVIA**, архив демоверсии
**Dirge of Cerberus: Lost Episode для P903i** и **LogJam для iRiver clix**.
Для Samsung Anycall найдены четыре точно идентифицированных EADS-образа
в исследовании другого эмулятора; сами эти образы здесь не получены.

## Как читать результаты

- **Проверены байты**: файл скачан; проверены размер, SHA-256 и указанная структура.
- **Первичный отчёт проекта**: результат опубликован автором извлечения или эмулятора; здесь не повторён.
- **Руководство / релиз**: производитель подтверждает модель, название игры или платформу.
- **След**: известны имя, URL или метаданные; содержимое ещё не получено.

Также различаются четыре источника: заводская предустановка, сервисный пакет
прошивки, позднее загруженная пользователем игра и отдельный комплект поставщика.
Нельзя автоматически считать любой JAR с телефона частью заводского ROM.

## Карта конкретных целей

| Устройство / прошивка                   | Игры или комплект                                             | Формат / способ сохранения                 | Текущий результат                                                           |
| --------------------------------------- | ------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------- |
| Nokia 3410, NHM-2 5.46                  | Munkiki’s Castles 1.06                                        | Java ME JAR из gzip-потоков сервисного EXE | **Извлечено и проверено**, 15 упаковок / 14 наборов файлов одной игры       |
| Nokia 2100, 5.49                        | Snake II, Space Impact, Link5                                 | Нативный код в `2100.fls`                  | Автор Nokstalgia документирует запуск игр                                   |
| Nokia 3310, NHM-5 6.39                  | Snake II, Space Impact, Bantumi, Pairs II                     | Нативный код и ресурсы MCU/PPM/PMM         | Есть карты кода, извлечение ресурсов и C-реконструкции                      |
| Nokia 3210 / 5110                       | Snake, Memory, Rotation / Snake, Memory, Logic                | Нативные игры                              | Есть модельные исследования и реконструкции                                 |
| Nokia S40 DCT4 / BB5                    | Предустановленные JAR, темы, Flash Lite                       | CNT / файловая система / FAT16             | Готовый массовый извлекатель `predeftool`; ограничения зависят от поколения |
| Samsung SCH-W830 DL21 / DA18, W860 DA06 | MinigameQVGAOEM                                               | ARM Thumb EADS                             | Извлечены два разных образа. Оба прошли тест ARAM                           |
| Samsung SCH-W770 DA05                   | Minigame WQVGA, Sudoku WQVGA, Pangya                          | ARM Thumb EADS                             | Все три извлечены. Minigame прошла тест ARAM                                |
| Samsung SCH-W210 / W240                 | Bomb Link, у W240 также Bluetooth Stony 2 и Janggi            | ARM Thumb EADS                             | Bomb Link совпадает побайтно на обеих моделях и прошла тест ARAM            |
| Samsung SGH-A800                        | Fortress, Space War, X-Flighter                               | Пока не установлен                         | Названия подтверждены руководством; извлечённого образа нет                 |
| Samsung SGH-E700                        | Honey Ball, Go! Hamster, Bowling                              | Пока не установлен                         | Набор подтверждён руководством Orange                                       |
| Samsung SCH-W420 CD16                   | Nom 2, Bluetooth Janggi и запись с URL Com2uS                 | ARM Thumb EADS                             | Три записи извлечены из точного DAT, запуск не проверен                     |
| Sanyo SCP-5300 V1036SP                  | Ms. PAC-MAN DEMO, Astrosmash, JAMDAT Bowling                  | Java ME MIDP 1.0 / CLDC 1.0                | Три JAR извлечены и проверены по CRC и манифестам                           |
| LG CYON SH150A, SW15A712_00             | Space Commando, Zoo Zoo Club, Mobile Bowling, Grand Golf      | KDZ, формат игр неизвестен                 | Игры перечислены в руководстве. Для KDZ пока есть карточка и старый URL     |
| Panasonic P903i / P903iX                | Dirge of Cerberus: Lost Episode, предустановленная демоверсия | DoJa: JAR + JAM + SP + внешние ресурсы     | **Архив демоверсии проверен**; предустановка подтверждена Square Enix       |
| Panasonic P-01A                         | Kingdom Hearts coded: Olympus Coliseum — Side Episode         | i-appli / MascotCapsule eruption           | Предустановка подтверждена Square Enix; есть отчёт об извлечении            |
| Sony Ericsson W53S                      | Metal Gear Solid Mobile trial                                 | BREW                                       | Сохранение предустановленной версии описано участниками проекта             |
| Panasonic P-06C                         | Rockman.EXE Phantom / Legend of Network                       | i-appli и файловая система телефона        | Полные игры восстановлены другим проектом; это пользовательские загрузки    |
| Samsung YP-T8, 1.38 FR                  | Hurdle, Hextris, PipePlus, Dart                               | XEOVIA / `.XOV`                            | **Проверен runtime в ROM**; отдельные XOV ещё не извлечены                  |
| Oracom UB-880, UB-890, UB-950, UB-950M  | Aiolos                                                        | GNEX SGS v4                                | Из FNT извлечены две сборки, обе доходят до первого уровня в Reunion        |
| Samsung YH-J70                          | ClearScreen, Othello, Omok, Tetris, Chips                     | Движок пока не установлен                  | Названия из руководства производителя                                       |
| iRiver U10 / clix                       | LogJam и другие Flash-игры                                    | SWF из отдельных комплектов                | **LogJam скачан и проверен**; это не извлечение из ROM                      |

Источники и ограничения каждой группы приведены ниже. Сводка не приравнивает
сообщение о запуске меню к прохождению всех игр до конца.

## Nokia: от настоящего JAR до нативных игр

### Что извлечено из Nokia 3410

В [архиве Nokia DCT3](https://archive.org/details/Nokia_DCT3_firmwares) доступен
[nhm2_mcu0546.exe](https://archive.org/download/Nokia_DCT3_firmwares/nhm2_mcu0546.exe).
Он прочитан как данные, без запуска установщика: 289 кандидатов gzip,
288 полных потоков, 15 корректных MIDlet JAR. Их manifest сообщает
**Munkiki’s Castles, 1.06, Nokia, MIDP-1.0 / CLDC-1.0**. В классах есть ссылки
на Nokia `DirectGraphics`, `DirectUtils`, `FullCanvas` и `Sound`.

15 файлов различаются сырыми ZIP-байтами, но содержат **14 уникальных наборов
распакованных членов**: одна пара отличается только упаковкой. Есть варианты
с `ru-RU`, `uk-UA`, `bg-BG`. Это одна игра в нескольких комплектациях.
Запуск в Java VM здесь не проверялся; порядок установки языковых вариантов
на реальный телефон ещё не восстановлен.

| Объект                                |   Байты | SHA-256                                                            |
| ------------------------------------- | ------: | ------------------------------------------------------------------ |
| Сервисный EXE                         | 8277611 | `3c1ce6af26565941851758bd3162983204910c387a8ad77e6f3fb5cfd058865f` |
| MCU `NHM2NX05.460`                    | 2952360 | `713c6de148eabd907b3eefd4dd43637279b621eb2c94bed09385e9dc4094693f` |
| PPM E `NHM2NX05.46E`                  |  656080 | `779b3c13726a5878a117eed9e91d021597bc4d74dedeb1dba26e9335df1ee633` |
| JAR с RU/UA/BG/EN, gzip offset 295681 |   33185 | `801a6a269eb08617c964d411213a443f78ff2f6304ea1962ae86d311f15f1a34` |

MCU и PPM совпали с хешами в [модельном исследовании Nokia 3410](https://github.com/lukesau/nokia-gb-games/blob/main/3410/README.md).
Описанный там отдельный PMM-экземпляр Munkiki размером 40888 байт и хешем
`e94f9c942968acfadd13e19c62fc0aa8e48f0758a2ec00f2a9ba42269433caf8`
не совпадает с нашими JAR. Сервисный пакет и конкретный адрес игры в PMM —
разные уровни доказательства.

Для воспроизведения из корня Reunion:

```sh
python tools/carve-gzip-jars.py research-input/nhm2_mcu0546.exe --output research-work/nokia3410-jars --source-url https://archive.org/download/Nokia_DCT3_firmwares/nhm2_mcu0546.exe
```

[Manifest извлечения](../validation/nokia3410-preload-extraction.json) фиксирует
смещения, размеры, хеши и поля MIDlet; [сравнение вариантов](../validation/nokia3410-preload-variants.json)
содержит языковые ресурсы и хеши классов. Команда не исполняет EXE или JAR и
требует новый каталог. Подробные пределы — в [инструкции инструментов](tools-guide.md).

### Куда идти дальше в Nokia

[Nokstalgia](https://github.com/rynsf/nokstalgia) запускает нативные игры Nokia
2100 из `2100.fls` v5.49; звук и полноценное меню у автора остаются TODO.
[nokia-gb-games](https://github.com/lukesau/nokia-gb-games) публикует исследования
3210, 3310, 3410 и 5110, извлечение оригинальных ресурсов и C-реконструкции.
Для [3310 v6.39](https://github.com/lukesau/nokia-gb-games/blob/main/3310/README.md)
есть конкретные хеши прошивки и карты. Это не четыре автономных файла, которые
можно переименовать в SGS: код связан с функциями прошивки и её данными.

Для массового сохранения S40 особенно полезен [predeftool](https://github.com/gtrxAC/predeftool):
разбор firmware-пакетов, преобразование образов в FAT16, извлечение и
дедупликация предустановленного содержимого. S40v1 PPM не поддержан, TIKU/6230
требует другой обработки, BB5 обозначен экспериментальным. Доступность
проекта не означает доступность каждого образа: в проверенных метаданных
[BB5-архива](https://archive.org/details/Nokia_BB5_firmwares) ZIP для N70/N80/5800
помечены private. [DCT4-архив](https://archive.org/details/Nokia_DCT4_firmwares)
содержит модельные комплекты 3510i/3530, 3100/3120, 6230/6230i и других;
нужна выборка конкретных небольших редакций.

Полный [nokia-dct3-emulator](https://github.com/djr-747/nokia-dct3-emulator)
и [ветка трассировки игр nokia-dct3-re](https://github.com/lukesau/nokia-dct3-re/tree/games/re-3310)
помогают получить эталон поведения. Заявленные автором 19 загружающихся
профилей из 26 не означают подтверждённую совместимость каждой игры.

## Samsung Anycall: конкретные встроенные EADS-игры

Ранние загрузки Anycall Land формата MBIN и руководство ADSLoader
сохранены в [отдельном архиве](samsung-anycall-ads-mbin.md).

[ARAM Core](https://github.com/mirusu400/aram-core) содержит реальный разбор
Samsung firmware и тесты извлечённых игр. Проверена ревизия
`fea299cba15696ed1460f965b76626d6edab5e03`.

| Модель / build      | Запись                | SHA-256 игрового образа                                            |
| ------------------- | --------------------- | ------------------------------------------------------------------ |
| SCH-W830 DL21       | `MinigameQVGAOEM.dat` | `c83d4f4ee9cbf6ba4280b17f8f8a3dd26157ce9f07849583c04a60ebf9c00429` |
| SCH-W860 DA06       | `MinigameQVGAOEM.dat` | `6b48455bc86e151967d75ec1b596cdd7a09838e495d3a8a1717bd5d67158ee71` |
| SCH-W770 DA05       | `Minigame_WQVGA.dat`  | `16f0ccdf370069e2342aee29c05e22fa64577b7ca5e9d7cc87a98d87b50d391f` |
| SCH-W210 / SCH-W240 | `Bomb_Link.dat`       | `a8c47d3045639b12afd0de213a1c2ef1467f0495c8edad1bb5483a3ab74dc629` |

Хеши опубликованы в [тесте ARAM](https://github.com/mirusu400/aram-core/blob/fea299cba15696ed1460f965b76626d6edab5e03/application/eads_native_games_reference_test.go).
Теперь все четыре эталона извлечены из архивных прошивок, и тест
повторён локально на этих байтах.

[Парсер EADS](https://github.com/mirusu400/aram-core/blob/fea299cba15696ed1460f965b76626d6edab5e03/loader/eads/eads.go)
описывает 0x30-байтовый заголовок: magic `EADS`, little-endian поля формата,
сборки, адреса и размера text, адреса data, размера BSS и имя в +0x20..0x30.
Тело следует за заголовком, Thumb entry получается из text base с установленным
младшим битом. При извлечении нужны проверки размеров, адресов и пролога;
одной найденной строки `EADS` недостаточно.

Это **нативные ARM/Thumb программы**, а не Mobile C SGS. Полезны существующее
ARM-ядро и знания о мобильных ABI, но потребуется отдельное окружение API.
ARAM использует **PolyForm Noncommercial 1.0.0**; его код не копировался в MIT-код
Reunion. [Машинные записи исследования](../validation/phone-firmware-targets.json)
содержат ссылки и статус получения файлов.

### SCH-W210, W240, W770, W830 и W860

В [коллекции Samsung](https://archive.org/details/gt-b-7722_20250528)
получены пять ZIP и 24 компонента шести комплектов прошивок. SHA-1
архивов совпали с метаданными Internet Archive, SHA-256 компонентов —
с точными профилями ARAM. В архиве W830 один из внутренних пакетов
назван `SCH-W380_DL21.7z`. Имена внутри и хеши подтверждают W830 DL21.
[Профили ARAM](https://github.com/mirusu400/aram-core/blob/fea299cba15696ed1460f965b76626d6edab5e03/loader/samsung/profile.go).

| Комплект                                                                         | Что извлечено из DAT                           | Смещение                              |
| -------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------- |
| [W210 CK12](https://archive.org/download/gt-b-7722_20250528/SCH-W210.zip)        | Bomb Link                                      | `0x5e4104`                            |
| [W240 CL28](https://archive.org/download/gt-b-7722_20250528/SCH-W240.zip)        | Bomb Link, Bluetooth Stony 2, Bluetooth Janggi | `0xe829d4`, `0xe94518`, `0xedf288`    |
| [W770 DA05](https://archive.org/download/gt-b-7722_20250528/SCH-W770.zip)        | Sudoku WQVGA, Minigame WQVGA, Pangya           | `0x1520c14`, `0x15a5bb8`, `0x1647080` |
| [W830 DL21 и DA18](https://archive.org/download/gt-b-7722_20250528/SCH-W830.zip) | Один и тот же MinigameQVGAOEM                  | `0x3bbfbc` в обоих DAT                |
| [W860 DA06](https://archive.org/download/gt-b-7722_20250528/SCH-W860.zip)        | Другой MinigameQVGAOEM                         | `0x89124c`                            |

Руководство W240 перечисляет Bomb Link, Stony и Janggi в меню. Руководство
W770 называет Pangya Golf Touch. В W240 внутреннее имя Stony содержит
суффикс `2`. Janggi побайтно совпадает с записью W420 CD16.
[Руководство W240, стр. 106–108](https://manualzz.com/doc/50009011/samsung-sch-w240-%EC%82%AC%EC%9A%A9%EC%9E%90-%EB%A7%A4%EB%89%B4%EC%96%BC),
[руководство W770, стр. 115](https://samsung.manymanuals.com/mobile-phones/sch-w770/user-manual-47914).

Четыре известных ARAM образа прошли `TestExtractedNativeGamesUseVerifiedRuntime`
на указанной ревизии. Тест исполнил по 180 кадров, доставил событие
клавиши, сохранил и восстановил состояние. Запуск Stony 2, Janggi,
Sudoku WQVGA и Pangya пока не проверялся. Все восемь уникальных
записей сохранены с заголовками EADS.

Каждая модель содержит MIME-строки GNEX или ссылки `SKT_GVM://`.
Эти маркеры описывают поддержку формата в телефоне. Во всех 24
компонентах проверены SGS в открытом виде и с XOR `0xa5`.
Два совпадения в FNT W770 отброшены при проверке окружения и заголовка.
Оба начинались в данных графических ресурсов, включая JPEG 68×68.
[Хеши, смещения, маркеры и области проверки](../validation/anycall-eads-extractions.json).

### Samsung SCH-W420 CD16

Из [архива CD16](https://archive.org/download/gt-b-7722_20250528/SCH-W420.zip)
извлечены WBT, WBIN, DAT и FNT. Все четыре SHA-256 совпали с
[профилем ARAM](https://github.com/mirusu400/aram-core/blob/fea299cba15696ed1460f965b76626d6edab5e03/loader/samsung/profile.go#L736).
Источник игровых записей — `SCH-W420_CD16_18C0000.dat` (61 472 768 байт,
SHA-256 `c72e381ab9a29313c9e52876db314dd0285cdf438f5f57aa9b33c12cc959e706`).

| Смещение в DAT | Имя в заголовке | Размер с заголовком | Идентификация                                                                                                                                     |
| -------------- | --------------- | ------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0x1210da4`    | `ADS2_AppMgr`   |             258 076 | Менеджер приложений                                                                                                                               |
| `0x124fdf0`    | `ADS2_DlMgr`    |             227 100 | Менеджер загрузок                                                                                                                                 |
| `0x128753c`    | `Title(Main)`   |             394 496 | **Nom 2 (놈투)**. В теле есть `External World Contact Game` и URL Gamevil. [Релиз разработчика](https://www.newswire.co.kr/newsRead.php?no=46219) |
| `0x12e7a3c`    | `Title(Main)`   |             298 328 | Точное название не установлено. В теле есть `ktf.com2us.com/MHTML/mini.asp`.                                                                      |
| `0x13307ac`    | `블루투스_장기` |             280 872 | **Bluetooth Janggi**. Название декодируется из CP949.                                                                                             |

Все пять записей имеют границы внутри DAT, раздельные диапазоны памяти для
кода и BSS и Thumb-пролог `00 b5`. Извлечённые записи сохранены с исходными
48-байтовыми заголовками. Для Janggi учтено имя CP949. Опубликованная
версия парсера ARAM требует ASCII. Зависимости от API телефона и запуск не
проверялись. [Хеши и диапазоны извлечения](../validation/phone-firmware-20261105-extractions.json).

В том же DAT есть `SKT_GVM://` на 41 726 820 и 44 240 308 и
`application/x-gnex-sgs` на 53 856 708, 56 027 512 и 56 044 856. Эти
строки показывают поддержку формата в данных прошивки. В WBT, WBIN и DAT
целых SGS в проверенных представлениях не найдено. Единственный
кандидат в FNT на 99 776 079 начинается внутри JPEG. Из диапазона
99 774 511–99 776 098 успешно декодируется изображение 68×68, за
которым идёт таблица. Такой кандидат отброшен.

Руководство Orange для E700 перечисляет [Honey Ball, Go! Hamster и Bowling](https://device.report/m/f98fcc7d7c956a0d3a67692d7d5f2967b428140ca90f56cf82595c7867b115ea.pdf).
Формат этих игр здесь не установлен.

### Samsung SGH-T100 и Orange 824

В [пакете T10AXVH1](https://archive.org/download/samsung-sgh-t-series.-7z/Samsung%20SGH-T%20Series.7z/SGH-T100%2FT10AXVH1.7z)
есть AXF, MAP и SYM. Таблица символов называет
`glib_Init_SINJISOFT_Game` (`0x0eb6d0`) и `sinji_logo`. MAP связывает
игровой код и ресурсы с объектными файлами `game_airshoot.o`,
`game_spacewar.o` и `game_mypet.o`. Точки входа в SYM —
`AirShootingGameMain` (`0x0f1780`), `SpaceWarMain` (`0x0f3098`),
`MyPetMain` (`0x0f35e2`). Это адреса линковки. Игровой код собран
внутри нативной ARM-прошивки.

Повтор событий напрямую через эти три точки входа дал оригинальные
кадры **X-Flighter**, **Space War** и **My Pet**. Название X-Flighter
видно на титульном экране `AirShootingGameMain`. Инициализация LCD,
отрисовка RGB444 и игровая логика выполняются из AXF. Скрипт подаёт
ввод и тики отдельно, имитирует часы и EEPROM, перехватывает вызовы
телефонного дисплея, звука и таймеров. В X-Flighter пройден выбор
корабля и начат первый уровень. В Space War после заставки открыто игровое поле,
в My Pet открыта комната и проверено переключение её действий.
В каждой игре кадр после одного и того же тика отличается, если убрать
одну выбранную кнопку из последовательности.
[Сценарии и хеши кадров](../validation/samsung-t100-native-replay.json).

```sh
python -m pip install unicorn Pillow
python tools/replay-samsung-t100-native.py T10AXVH1.AXF replay-t100
```

Для GVM-загрузок Orange 824 архивная ветка даёт другую сборку —
`T10JHVJ1`. В [архиве GSM-Forum](https://web.archive.org/web/20040624104608id_/http://forum.gsmhosting.com/vbb/archive/index.php/t-131298.html)
сохранился исходный адрес `homepage.ntlworld.com/staintondale/T10JHVJ1.rar`.
В проверенном индексе Wayback байтов архива нет. [Тема T100.org](https://web.archive.org/web/20030717040451id_/http://www.t100.org:80/modules.php?name=Forums&file=viewtopic&t=1063&start=0&postdays=0&postorder=asc&highlight=)
сохранила 29 названий obox с CPID/GID. В их числе Sub Station, Torpedo,
Fire Force, Space Battle и Labyrinth. [Полный список](../validation/obox-observed-catalog.json).
[WML Typhone](https://web.archive.org/web/20030608215953id_/http://wap.typhone.com:80/)
содержит команду загрузчика `Device:gvm/Multimedia.GameRun`.

### Samsung SGH-A800

В прошивке `A80XDWBD.AXF` меню связывает **Fortress**, **Space War**
и **X-Flighter** с Thumb-функциями `0x150f90`, `0x1529ec` и `0x158528`.
MAP даёт их нативные модули `fortress4.o`, `spacewar_2.o` и
`airshooting_2.o`. У X-Flighter с SGH-T100 совпадают 9 097 байт
внутри игрового модуля при сравнении непрерывных участков от 32 байт.
Длиннейший совпавший участок в сценарии `setEarthUnit` занимает
620 байт. В Space War тем же методом совпали 337 байт. Игровое меню
A800 задаёт 128×128, а T100 использует 128×160. Проверка подтверждает
родство кода.
[Архив прошивки](https://archive.org/download/gt-b-7722_20250528/SGH-A800.zip),
[руководство](https://manualzz.com/doc/4296800/samsung-sgh-a800-owner-s-manual),
[смещения и контрольные суммы](../validation/samsung-a800-native-evidence.json).

Все три игры запущены напрямую через свои оригинальные точки входа.
Для Fortress проверены карта с Сеулом, первый уровень, движение и выстрел.
Space War и X-Flighter дошли до игрового поля. При одинаковом числе
тиков пропуск выбранной кнопки меняет кадр в каждой из трёх игр.
Отрисовка и игровая логика выполняются из AXF. Два вызова API дисплея,
регистрация таймеров и вызовы звукового API заменены обработчиками
тестового окружения. Кадры читаются из оригинального 2-битного
LCD-буфера. [Сценарии и контрольные кадры](../validation/samsung-a800-native-replay.json).

```sh
python -m pip install unicorn Pillow
python tools/replay-samsung-a800-native.py A80XDWBD.AXF replay-a800
```

### Декодирование SKY BINX

В публикации 2015 года уцелела ссылка на набор для распаковки BINX с
`SkyUpdate.ocx` от 2012 года. Его функция чтения `0x10012680` берёт
32-битную длину блока, расшифровывает кратную 16 байтам часть AES-128-CBC
с нулевым IV и дописывает хвост как есть. В каждом блоке один ZIP-файл.
Декодер собирает PDL из последовательности распакованных блоков с
проверкой ZIP CRC. [Архивная публикация](https://www.doanuprom.com/2015/04/tong-hop-tool-up-rom-goc-sky-fix-toan.html),
[вложение](https://www.mediafire.com/file/m34ekbxvcybf4m9/Tools_extract_binx.rar/file).

| Проверенный образ                                                                               | ZIP-блоки |  Размер PDL | Первое смещение MIME GNEX |
| ----------------------------------------------------------------------------------------------- | --------: | ----------: | ------------------------: |
| [IM-U220 S0168173](https://archive.sunderland93.ru/Firmwares/SKY/IM-U220/IM-U220_S0168173.7z)   |       446 | 116 720 416 |               `0x155fa4c` |
| [IM-S330 S0174124a](https://archive.sunderland93.ru/Firmwares/SKY/IM-S330/IM-S330_S0174124a.7z) |       644 | 168 690 560 |                `0x1c8468` |
| [IM-S350 S0175156](https://archive.sunderland93.ru/Firmwares/SKY/IM-S350/IM-S350_S0175156.7z)   |       644 | 168 690 560 |                `0xa435d8` |

В каждом PDL подтверждены модель, сборка и строки Sinjisoft. Все
1 734 ZIP CRC совпали. Поиск целых SGS v1/v2/v4/v36 в открытом виде и
с XOR `0xa5` ничего не нашёл. Таблицы содержат AMSS и RSC без
явно обозначенного раздела пользовательских данных.
[Хеши и разметка PDL](../validation/sky-binx-firmware-evidence.json).

```sh
python -m pip install pycryptodome
python tools/unpack-sky-binx.py IM-U220_S0168173.BINX IM-U220_S0168173.PDL
```

Следующий набор дал ещё пять подтверждений GNEX. IM-S390 S0177154
уже содержит открытый PDL. Обновления IM-S480S S0183142,
IM-S550S S0188161, IM-S640S S0202126a и IM-U490S S0184128
декодированы из BINX. Все 4 500 ZIP CRC совпали. Целых SGS при
сканировании пяти PDL не обнаружено.
[Источники, разметка и хеши](../validation/sky-additional-firmware-evidence.json).

### Ресурсы SKY и Cube Cube

В разделах RSC IM-U220, IM-S330, IM-S350 и IM-S390 найдены таблицы
с 16-байтными записями. Каждая запись задаёт ID, тип, относительное
смещение и длину ресурса. Отдельные записи задают группу или ссылаются
на следующий ресурс. Распаковщик проверяет границы и структуру всей
таблицы перед извлечением явно выбранных записей.

Из четырёх образов извлечены разные нативные сборки **Cube Cube**
(`큐브큐브`) от **MOBICLE Co.,Ltd**. Дескрипторы указывают ID
`0027140771`, версию `001.000.000`, MIME `application/x-wipi-app`
и расширение `daf`. Издатель анонсировал игру для SKT 16 марта
2007 года. Она поддерживала одиночный и сетевой режимы.
[Сообщение Mobicle](https://www.newswire.co.kr/newsRead.php?no=234575).

Оригинальные DAF содержат Thumb-код и игровые ресурсы.
Запуск DAF в Reunion пока не реализован.
[Размеры, смещения и хеши извлечённых файлов](../validation/sky-cube-cube-extractions.json).

```sh
python tools/extract-sky-rsc.py IM-U220_S0168173.PDL \
  --table-offset 0x21ec000 --region-bytes 60948480 \
  --extract-index 4218 --extract-index 4221 --extract-index 4224 \
  --out-dir cube-u220 --report cube-u220.json
```

В четырёх более поздних образах первый 32-битный указатель области
ресурсов ведёт к таблице в её конце. Смещения записей отсчитываются
от начала полезной нагрузки. Проверены все 9 540 записей этой схемы.
Из них извлечены 18 игровых приложений с 14 различными CONTENT ID.

| Образ              | Названия в оригинальных дескрипторах                                           |
| ------------------ | ------------------------------------------------------------------------------ |
| IM-S480S S0183142  | 리듬 스테이션, 월드장기체스2, SBS포트리스3, 대전퍼즐버블, Hybrid, 서든어택포켓 |
| IM-S550S S0188161  | 문질러터치, 파워풀프로야구KBO'09, I-Musician, 빅뱅-틀린그림찾기                |
| IM-S640S S0202126a | 리듬스타2, EA프로야구2010(KBO), 초코초코타이쿤2, 렙업만이 살길2                |
| IM-U490S S0184128  | 리듬 스테이션, 월드장기체스2, SBS포트리스3, 서든어택포켓                       |

Пятнадцать записей содержат нативные WIPI DAF. Три содержат JAR
с 32-байтным префиксом ресурса. Все ZIP CRC и сигнатуры Java-классов
в JAR проверены. Два одинаковых приложения повторяются между моделями,
поэтому в этом наборе 16 разных SHA-256 игровых payload.
Игровой запуск этих DAF и JAR пока не проверен.
[Источники, метаданные и все границы извлечения](../validation/sky-new-rsc-game-extractions.json).

```sh
python tools/extract-sky-rsc.py IM-S480S_S0183142.PDL \
  --payload-offset 0x2ac0000 --region-bytes 136314880 \
  --extract-index 2193 --extract-index 2194 --extract-index 2195 \
  --out-dir rhythm-station --report rhythm-station.json
```

В сохранённом комплекте вместе с четырьмя Cube Cube находятся
22 игровые записи с 15 CONTENT ID и 20 различными payload.
Для каждого сохранён исходный ресурс с оболочкой и точный
срез DAF/JAR после 32-байтного префикса. Оба SHA-256 указаны
в манифесте. [Реестр сохранённого комплекта](../validation/sky-factory-game-extractions.json).

В следующем образе **IM-U580S S0191130a** проверены ещё 2 680 записей
хвостовой таблицы. Извлечены Rhythm Star 2, EA Pro Baseball 2010,
ChocoChoco Tycoon 2 и Level Up 2. Первые три payload совпали с S640S.
Level Up 2 занимает 1 996 188 байт и имеет отдельный SHA-256
`990765efcea075b3448e29246a9fd76991417e5ef774c79ecbc00b3810a74ea9`.
Игровой запуск пока не проверен.
[Источник и все четыре извлечения](../validation/sky-u580-ktf-firmware-evidence.json).

Ведущая таблица **IM-S240K S0812159** содержит 5 779 записей.
Её тип 5 используется для JPEG. Групповая ссылка может идти сразу
после обычной записи, а конечный нулевой маркер может отсутствовать.
Распаковщик проверяет эти варианты по числу записей, диапазонам
и совпадению границ ссылок. Ресурс 5717 содержит нативный модуль
`JumpingPop Game`, 145 143 байта. Его запуск и полнота зависимостей
пока не подтверждены. [Контрольные суммы и дизассемблирование](../validation/sky-u580-ktf-firmware-evidence.json).

## LG CYON, GVM и ранние OEM-поставки Sinjisoft

Для **LG-SH150A** найдена [точная карточка SW15A712_00](https://lg-firmwares.com/downloads-file/3566/SW15A712_00):
SKT, KDZ, 76.71 MiB, опубликованный hash `0028d37c5bf59262b194514ea36793d3`.
Алгоритм поля Hash на сайте не назван; длина похожа на MD5, но здесь она не
выдаётся за проверенную контрольную сумму скачанного файла. Дата каталога
2016 года не является доказанной датой выпуска прошивки.

[Исторический список LG KDZ](https://forum.gsmhosting.com/vbb/f177/lg-kdz-cab-firmware-1634479/)
сохранил manufacturer URL:

```text
http://csmgdl.lgmobile.com/swdata/WDLSW/LGSH150A/ASKTWA/SW15A712_00/CSE/SW15A712_00.kdz
```

Зеркало требует CAPTCHA, исторический хост не разрешился через DNS в этой
проверке. Байты KDZ пока не получены. На печатных стр. 126–127 руководства
именно для **LG-SH150A** указаны Space Commando (스페이스 코만도),
Zoo Zoo Club (주주클럽), Mobile Bowling (모바일볼링) и Grand Golf (그랜드골프).
Формат этих четырёх игр и наличие GNEX в этой прошивке ещё предстоит
подтвердить по бинарному образу. [Руководство LG](https://gscs-b2c.lge.com/open/downloadFile?fileId=USR017012).

Связи других моделей с Mobile C и результаты извлечения пяти SGS из
дистрибутивов Nokia Symbian собраны в [карте устройств GNEX и GVM](gnex-devices.md).

Руководства LG дают ещё четыре точных устройства для поиска этих игр.
Страницы в таблице отсчитаны от начала PDF.

| Модель    | Предустановленные игры                                                | Источник                                                                       |
| --------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| LG-SH130  | Space Commando, Rhythm Cooking, Pump It Up, Sudoku Puzzle, Grand Golf | [LG, PDF 89–91](https://gscs-b2c.lge.com/open/downloadFile?fileId=USR017008)   |
| LG-KH1300 | Space Commando, Rhythm Cooking, Pump It Up, Sudoku Puzzle, Grand Golf | [LG, PDF 95–97](https://gscs-b2c.lge.com/open/downloadFile?fileId=USR017021)   |
| LG-KH1400 | Space Commando, Pump It Up, Sudoku Puzzle                             | [LG, PDF 140–141](https://gscs-b2c.lge.com/open/downloadFile?fileId=USR016910) |
| LG-SH150  | Sudoku Puzzle, Zoo Zoo Club, Grand Golf, Space Commando               | [LG, PDF 125–126](https://gscs-b2c.lge.com/open/downloadFile?fileId=USR017009) |

Space Commando указан на пяти моделях с учётом SH150A. Grand Golf — на
четырёх. Совпадение названия не определяет формат и идентичность версий.
Карточка SKU для `SW15A712_00` повторяет размер, оператора и hash
карточки SKT. В старом журнале обновлений Octopus есть отдельная сборка
SH150A `SW15A709` и две сборки KH1400 `KW140710`, `KW140714`.
Из этих альтернативных сборок получена KW140714. [Карточка SKU](https://www.lg-firmwares.com/es/downloads-file/11422/SW15A712_00),
[журнал Octopus](https://forum.gsmhosting.com/vbb/f475/octopus-box-v-1-4-6-added-support-lg-kh1400-lg-sh150a-lg-gx200-1074218/?nojs=1).

### Игры из заводских KDZ

Список GSM-Forum сохранил исходные адреса обновлений LG. Три KDZ скачаны
из зеркала и расшифрованы в CAB с помощью открытого декодера старого
формата. После проверки CAB извлечены WDB и парная DLL. Размер DLL
участвует в вычислении ключа WDB. Запуск DLL для распаковки не нужен.
В WDB этих версий число записей 32-битное. Для каждого файла проверены
границы записи, завершение потока zlib и объявленная длина результата.
[Исторические адреса](https://forum.gsmhosting.com/vbb/f177/lg-kdz-cab-firmware-1634479/),
[декодер KDZ](https://github.com/michaelwright235/kdz_decrypt_encrypt),
[описание WDB](https://github.com/michaelwright235/wdb_extract),
[распаковщик WDB в Reunion](../tools/unpack-lg-wdb.py).

Пример после извлечения WDB и DLL из CAB:

```text
python -m pip install pycryptodome
python tools/unpack-lg-wdb.py KW130713.wdb KW130713_MASS.dll KH1300-files
```

| Модель, сборка                                                                           | Файлов WDB | Извлечённые игры                                                      |
| ---------------------------------------------------------------------------------------- | ---------: | --------------------------------------------------------------------- |
| [KH1300 KW130713_00](https://archive.sunderland93.ru/Firmwares/LG/KH1300/KW130713_00.7z) |       1426 | Space Commando, Rhythm Cooking, Grand Golf, Pump It Up, Sudoku Puzzle |
| [SH130 SW130718_00](https://archive.sunderland93.ru/Firmwares/LG/SH130/SW130718_00.7z)   |       1350 | Space Commando, Rhythm Cooking, Grand Golf, Pump It Up, Sudoku Puzzle |
| [KH1400 KW140714_00](https://archive.sunderland93.ru/Firmwares/LG/KH1400/KW140714.7z)    |       1729 | Space Commando, Pump It Up, Sudoku Puzzle                             |

Исполняемые модули лежат в `MODULE/C` как `.pxo`. У Space Commando
это `Game_SR.pxo` и внешние `campaign.lks`, `options.lks` и `data.lkz`
из `MODULE/BUILTIN/GAME`. `data.lkz` открывается как ZIP. Во всех трёх
прошивках CRC его файлов корректны, а в `Menu/english.lks` и
`Menu/HelpContent.lks` присутствует имя **Space Commando**. KH1300 и SH130
используют одинаковый архив ресурсов на 451 запись, KH1400 имеет
горизонтальный набор на 439 записей. В KH1400 также есть отдельные
ресурсы `RACINGTIME`. Их исполняемый модуль ещё не сопоставлен.

Во всех 16 извлечённых `Game*.pxo` распакованы блоки LZO1F по 8192
байта с 32-битным префиксом. У первого блока префикс задаёт полный
распакованный размер, у остальных размер выхода блока. В проверенных
сборках после конца потока может быть выравнивание байтами `0xff`.
Результат начинается с `PXO4`. В варианте KH1300 у `Game_SR.pxo`
дескриптор на `0x1ad4`. Capstone декодирует нативный Thumb в
инициализации на `0x33a8` и обработчике событий на `0x323a`.
Во всех трёх распакованных меню `Game.pxo` есть строка
`Space Commando Platoon` и ссылка на `Game_SR.pxo`.
В 4505 файлах WDB и 16 распакованных PXO сканер не нашёл SGS известных
версий. Для запуска PXO требуется отдельная реализация API телефона.
[LZO](https://www.oberhumer.com/opensource/lzo/).
[Хеши извлечённых файлов](../validation/lg-cyon-firmware-evidence.json).

### LG KU990 Viewty и Space Commando Platoon

В обсуждениях 2008 года владельцы указали каталог `SR` и прошивку
V10e с игрой. Из доступного обновления **V10j OPN-EU** извлечены
`/UPLOAD/Pxo/Game_SR.pxo` и пять файлов `/LGAPP/Media/SR/`.
У 11 разделов DZ проверены MD5 и gzip CRC, у 508 записей `data.lkz`
проверен CRC. PXO4 хранится без внешней LZO-обёртки и содержит
Thumb-код. В архиве KU990 найдены побайтовые соответствия для
157 ресурсов KH1300, 157 ресурсов SH130 и 146 ресурсов KH1400.
В титрах всех четырёх вариантов указан **LG Russia R&D Lab, ©2006**.
[Обсуждение владельцев](https://lg-forum.com/lg-handys-smartphones-und-tablets/space-commando/),
[архив KU990](https://archive.sunderland93.ru/Firmwares/LG/KU990%20%28Viewty%29/Ku990%20v10j.7z),
[проверки и хеши](../validation/lg-ku990-space-commando-evidence.json).

### Samsung SCH-V490, V540, X590 и X780

В четырёх архивах проверены пять бинарных образов. У V490 доступны
`v490.bin` и `V490MSM_CODE_YD18.bin`. В каждом образе обнаружены
модули `GvmMain.c`, `GvmRom.c`, `GvmRam.c` и путь `nvm/gvm`.
Валидных открытых или XOR-обёрнутых SGS сканер не обнаружил.
Также проверены заголовки страниц хранения по схеме, найденной в LG
SD1000 и SV130. Совпадений для имён файлов GVM не было.
[Дампы, хеши, смещения и результаты сканирования](../validation/samsung-gnex-zone-evidence.json).

Руководство Samsung SCH-X590 описывает загрузку контента GVM через
NATE и называет штатными **Push push** и **Penguin ball**. Обе игры
также указаны в руководстве **SCH-X230** для SKT, отдельно от загрузок
GVM. У **SCH-X780** в штатном меню указан **Push Push II**, а загрузка
контента GVM описана в разделе NATE. Связь Push Push с нативным кодом
подтверждена отдельно по образам. [X590, печатные стр. 128–129](https://downloadcenter.samsung.com/content/UM/200311/20031104170914156_SCH-X590.zip),
[X230 SKT, стр. 47–48 и 92–93](https://downloadcenter.samsung.com/content/UM/200311/20031104165447484_SCH-X230_manual.zip),
[X780, стр. 74 и 132–133](https://downloadcenter.samsung.com/content/UM/200311/20031104172249171_SCH-X780.zip).

В инструкции SCH-V500 для SKT штатными названы **Lost Planet2** и
**Haunted School**. Карточка V500 есть в индексе лаборатории GNEX Zone.
Сборка прошивки и формат этих двух игр пока не установлены.
[Руководство V500, раздел 6.11](https://downloadcenter.samsung.com/content/UM/200412/20041210152201296_SCH-V500_SKT_Rev2.2.pdf).

### Samsung Push Push I, II и III

Из **21 образа 16 моделей** извлечены три таблицы уровней. В I 50
записей, в II 66, в III 50. В общей сложности в них 65 разных карт.
Первые 50 карт II повторяют порядок I, а III использует другой порядок.
Схемы первых четырёх уровней I совпадают с опубликованными схемами
владельца SCH-T300. [Схемы уровней](https://www.geocities.ws/namster2k/pushpush/Push-Push.txt),
[все образы и смещения](../validation/samsung-push-push-levels.json).

| Вариант | Эталонный образ                                                               | Смещение таблицы | Размер записи | Записей |
| ------- | ----------------------------------------------------------------------------- | ---------------: | ------------: | ------: |
| I       | [SCH-A310 VG18](https://archive.org/download/gt-b-7722_20250528/SCH-A310.zip) |       `0x27ae3a` |           122 |      50 |
| II      | [SCH-X780](https://archive.org/download/gt-b-7722_20250528/SCH-X780.zip)      |       `0x31eaf0` |           162 |      66 |
| III     | [SCH-V310](https://archive.org/download/gt-b-7722_20250528/SCH-V310.zip)      |       `0x4b0a25` |           162 |      50 |

В каждой записи два байта размеров, затем клетки и нулевое выравнивание.
Оригинальные Thumb-обработчики I и II запущены в Unicorn. Для III
вызван фрагмент загрузки уровня после предварительного вызова прошивки
с восстановленными аргументом и стеком. Для всех 166 записей проверены
размеры, координаты игрока, положение поля и каждая клетка в RAM.
Это проверка загрузки уровней. Полное выполнение игр требует
окружения Samsung. [Прогоны и контрольные суммы](../validation/samsung-push-push-levels.json).

Утилита [extract-samsung-push-push.py](../tools/extract-samsung-push-push.py)
сверяет SHA-256 всей таблицы. По умолчанию она сохраняет XSB для
клиентов Sokoban, с `--format raw` — исходные записи.

```sh
python tools/extract-samsung-push-push.py SCH-A310_VG18.bin Push-Push-I.xsb
python tools/extract-samsung-push-push.py SCH-V310.bin Push-Push-III.bin --format raw
```

### Penguin Ball на Samsung SCH-X590

Пункт `2:Penguin ball` в `X590eng.bin` ведёт на Thumb-обработчик
меню `0xce910`. Диспетчер на `0x13e372` для этого пункта выбирает
инициализацию `0x13bdcc` и игровой обработчик `0x13be9c`.
В ROM рядом с ресурсами сохранилось имя модуля `penggo_game.c`.
[Исходный образ](https://archive.org/download/gt-b-7722_20250528/SCH-X590.zip),
[ссылки из кода и смещения](../validation/samsung-penguin-ball-evidence.json).

Извлечены 13 изображений и семь оригинальных звуков SMAF. Размеры
графики определены по вызовам вывода, формат пикселей подтверждён
преобразованием в обработчике LCD. На PNG видны титульный экран,
справка, игровое поле и Game Over. Для всех семи SMAF проверены
границы чанков, CRC16 и декодирование в ненулевой PCM в Reunion.
[Размеры, CRC и хеши PCM](../validation/samsung-penguin-ball-evidence.json).

В отдельном прогоне Unicorn исполнены оригинальные ARM/Thumb-обработчики
игры. Области RAM и вспомогательный код восстановлены по таблицам старта
ROM. Сценарий проверяет движение, подбор мяча и бросок. Без команды
броска мяч остаётся на исходной высоте. Повтор дал те же состояния и
кадры. Таймерные события подаёт сценарий, доступ к NV и звуку проходит
через заглушки сервисов. Полный запуск телефона и интерактивная игра
в Reunion пока не проверены.
[Результаты прогона](../validation/samsung-penguin-ball-evidence.json).

### LG SD1000. Galaga из памяти телефона

В дампе **SD430I13** найдено хранилище GVM2X с двумя играми.
Архив содержит два сегмента, перекрывающихся на 16 байт. Для Galaga
сохранились все 245 страниц файла `gvm2x/gvm2x_000`. С оригинального
тела на смещении 176 восстановлен **SGS v2** на 58 756 байт с 247
переменными и 255 ресурсами. В заголовке записано `겔러그`, на заставке
указаны Namco и MDream. Сообщение 2002 года подтверждает выпуск
Galaga от M-Dream как загрузки GVM в сети SK Telecom. Наличие файла
в дампе показывает содержимое конкретного экземпляра.
[Исходный архив](https://archive.sunderland93.ru/Firmwares/LG/SD1000/SD430I13.7z),
[анонс 2002 года](https://www.etnews.com/200203280144),
[карта страниц и хеши](../validation/lg-sd1000-gvm2x-evidence.json).

В Reunion Galaga запустилась на оригинальном интерпретаторе Kingston 2.12.
Проверенный сценарий дошёл до первого уровня. Корабль двигался в обе
стороны, после выстрелов счёт вырос до 400. Выбран профиль 128×128
для эмуляции. Точное физическое разрешение SD1000 по этому прогону
не определяется. [Оригинальный SGS](../web/data/games/galaga-lg-sd1000.sgs),
[повтор ввода](../validation/galaga-sd1000-replay.json).

У второй игры **포트토너먼트 (Fort Tournament)** в записи
`gvm2x/gvm2x_001` указаны `SWAPSCRIPT` и `game.sinji.com`.
В дампе недостаёт ровно 12 байт ресурса 397, начиная со смещения
98 179 в SGS. Код и таблицы сохранились, а точные байты нужно
подтвердить другим дампом. В каталог добавлена только Galaga.
В блоге 2008 года владелец вспоминает, что скачал Fort Tournament
в 2005 году. В другой записи он называет свой телефон Anycall B250.
Это указывает на возможный второй экземпляр. Версия игры и привязка
к конкретному дампу B250 пока неизвестны. [Запись об играх NATE](https://pustith.tistory.com/333),
[запись о B250](https://pustith.tistory.com/category/Wish%20List/Wish%20to%20Buy).

По 32-байтным сигнатурам с обеих сторон пропуска проверены 6 228
локальных бинарников. Совпадение найдено только в исходном SD1000.
Журнал Romphonix датирует добавление дампа июлем 2021 года.
Поздняя запись про названия версий пока не привела ко второму образу.
[Журнал Romphonix](https://archive.org/download/changelog-3/changelog%20%283%29.txt).

### LG SD1020 и SD1250. Bubble Bobble и Ladder

В дампе **SD43CI23_memory** от SD1020 запись `gvm2x/gvm2x_001` имеет
идентификатор 6632. Сохранились все 343 страницы данных, включая последнюю
неполную. Из записи на 82 336 байт выделен **SGS v2** `보글보글` на
82 160 байт с 326 ресурсами. На заставке указаны Taito и MDream, 2002 год.
SK Telecom рекламировал эту мобильную игру MDream в 2002 году.
К 2005 году оператор также предлагал выпуск с вибрацией для SCH-G100.
Тождество этих сборок по байтам не установлено.
[Публикация 2002 года](https://www.etnews.com/200211210113),
[перечень игр SCH-G100](https://www.inews24.com/view/173075).

В Reunion проверены меню, ввод на первом уровне и выпуск пузырей.
Для этого сценария выбран профиль 128×128. Наличие игры в памяти
показывает содержимое экземпляра. Происхождение заводского комплекта
остаётся открытым. [Исходный архив](https://archive.sunderland93.ru/Firmwares/LG/SD1020/SD43CI23_memory.7z),
[SGS](../web/data/games/bubble-bobble-lg-sd1020.sgs),
[повтор ввода](../validation/lg-sd1020-bubble-bobble-replay.json).

В записи `gvm2x/gvm2x_000` восстановлена 151 страница данных и заголовок
`힙합정신`. Позднее декодер из Kingston подтвердил сжатый SGS v1.
После распаковки в Reunion открывается приложение для рингтонов.
[Исходная запись и схема распаковки](lg-legacy-compressed.md).

В **SD250I11** от SD1250 найден непрерывный **SGS v1** `Ladder` на
110 686 байт по смещению `0x4aa8a0` в `SD1250.bin`. Это жеребьёвка
`사다리 게임`. В текущем Reunion при 120×160 проверены розыгрыш на
три участника, выбор варианта без SMS, назначение призов и результат.
[Игровой сценарий](lg-legacy-compressed.md).
[Исходный архив](https://archive.sunderland93.ru/Firmwares/LG/SD1250/SD250I11.7z),
[экран телефона в анонсе LG](https://www.inews24.com/view/75301),
[смещения, хеши и диагностика](../validation/lg-sd1020-sd1250-evidence.json).

### LG SD810. Пять игр и два музыкальных приложения

Из фрагментированных файлов GVM образа SXS2V309 восстановлены пять игр:
TETRIS Classic, Shrek 2, 짜요짜요타이쿤, 소드마스터전기 и 떼굴떼굴후라이.
Два других SGS — Music Street и караоке 그날이후. Все пять игр вошли в
веб-каталог после проверки игрового процесса и управления. Это загрузки
в памяти одного телефона; заводская предустановка по ним не устанавливается.
[Оригинальный дамп](https://archive.sunderland93.ru/Firmwares/LG/SD810/SXS2V309%20%5BMemory%20Dump%5D.7z),
[страницы, INF, инструмент и воспроизводимость](lg-sd810.md).

### LG SD910. Другая сборка 2007 Pro Baseball

Из EFS2 дампа **SX910610** восстановлен оригинальный файл
`/wipi/ctn/0056067106/0056067106.sgs`. Размер 799 652 байта включает
32-байтную обёртку SGS v4. Все 1562 страницы сверены с исходным
образом. В файле 4419 ресурсов, код отличается от уже сохранённого
в Reunion 2007 Pro Baseball. Заставка этой версии показывает v1.0.4.

На профиле 176×220 с синтетическим MIN прошли авторизация и первый иннинг.
Сборка доступна из библиотеки. Прежний сценарий с лимитом на `0x1614e`
открывал справку. Поиск цвета на этом экране ускорен.
[Управление и сравнение](lg-sd910-baseball.md) ·
[Исходный архив](https://archive.sunderland93.ru/Firmwares/LG/SD910/SX910610_jtag.7z) ·
[разбор SGS и сравнение](../validation/lg-sd910-baseball-evidence.json).

### LG SD840 и музыкальные приложения GVM

Из 32-МиБ образа SD840 восстановлены **친구여-조PD**, музыкальный плеер
Aziit в SGS v1, и **풀하우스♥황..**, плеер и караоке Aion Media в SGS v2.
Первый занимает 61 294 байта, второй 106 048 байт. Оба собраны из
512-байтных страниц по логическим индексам, с проверкой точной границы
SGS. Ещё один восстановленный SGS `광고컨텐츠` содержит рекламную
оболочку. Данные дампа указывают на отдельные загрузки через NATE.
[Исходный архив](https://archive.sunderland93.ru/Firmwares/LG/SD840/SD840.7z),
[карты страниц и хеши](../validation/lg-sd840-gvm-evidence.json).

В Reunion музыкальные приложения обработали по 95 событий при каждом
из тестовых размеров 120×146 и 176×220. Показаны меню плеера, текст
и элементы караоке. Обработчик звука распознал SMAF. Фактическое
звучание и точность палитры ещё требуют сверки с телефоном. В комплект
извлечения вошли два SGS. Назначение сопутствующего `.res` пока
не установлено, его для запуска не использовали.

### Дампы LG SV130 и SV360

В 32-МиБ дампе SV130 есть `GNEX EXCEPTION` на 4 916 836 и пути
`/fs/GNEX/` и `/skp/c/GVM/`. Из записи `skp/c/GVM/1/1.sgs` восстановлена
игра **영단어퀴즈왕무료 (English Vocabulary Quiz King, бесплатная версия)**.
SGS v2 занимает 105 850 байт, содержит 137 переменных и 798 ресурсов.
Заставка показывает версию 1.0.8, в меню указан GameTooth.com.
Наличие файла подтверждено на одном экземпляре телефона. В соседней
записи `1.inf` сохранился адрес загрузки NATE. Инструкция GameTooth
от января 2003 года описывает выпуск викторины у SK Telecom через
mPlayon и у KTF через Multipack. Формат сборки KTF пока неизвестен.
[Инструкция GameTooth](https://web.archive.org/web/20030129013107id_/http://www.gametooth.com:80/gametooth/mobile/mobilequiz/down.jsp),
[архив SV130](https://archive.sunderland93.ru/Firmwares/LG/SV130/LG-SV130.7z),
[оригинальный SGS](../web/data/games/vocabulary-quiz-lg-sv130.sgs).

Страница метаданных `0xe28400` содержит первые 973 байта файла ID 153.
За ней в логическом порядке следуют 105 страниц с шагом выравнивания
1024 байта и полезной нагрузкой до 1008 байт. Последний байт собранного
файла лежит за пределами длины, указанной в заголовке SGS. Проверены
границы секций и таблица ресурсов. Из дампа экспортирована только игра.
[Карта страниц и хеши](../validation/lg-sv130-gvm-evidence.json).

В Reunion использована игровая область **176×204** с карточки SV130.
На интерпретаторе Kingston 2.12 пройдены меню и два вопроса, показан
третий. Клавиша 1 начинает игру, клавиши 1–3 выбирают ответ.
[Карточка Sinjisoft](https://web.archive.org/web/20041209135210/http://www.gnexclub.com/zone/htm/lg_p/lg-sv130.htm),
[повтор ввода](../validation/lg-sv130-vocabulary-quiz-replay.json).

У GameTooth сохранилась и карточка мобильной стратегии **장기 손자전**.
Индекс сайта содержит отдельный установщик `stwar_setup.exe`.
Он скачан и сверён с CDX, размер 4 563 035 байт, SHA-256
`9ee6e47daced082726a5e17ed920fd7a78fcba83d33fdf2da2faae832e12b143`.
Это Win32-установщик с именем `stwar.exe` внутри. Мобильный SGS
из этого файла пока не получен. [Карточка GameTooth](https://web.archive.org/web/20030121190303id_/http://www.gametooth.com:80/gametooth/mobile/suntzuwar_1/intro.jsp),
[архив установщика](https://web.archive.org/web/20011119211617id_/http://gametooth.com:80/File/stwar_setup.exe).

В JTAG-дампе SV360521 MIME `application/x-gnex-sgs` встречается шесть раз.
Снимок EFS2 читается с `0x01700000` до `0x08000000`, после чего в образе
идут 4 МиБ OOB. В 14 каталогах `/wipi/app` найдены только 20 файлов
с заголовком `PIS\0` и двухбайтовый `pis_reg.dat`. `/wipi/ctn` и
`/wipi/lib` пусты. Ни там, ни при сканировании необработанного образа
SGS известных версий не найдены. Independence Day распространялась
для SV360 через GXG как загружаемая игра. Личные разделы JTAG-дампа
в извлечение не включались. [Происхождение дампа](https://lpcwiki.miraheze.org/wiki/LG_SV360#Firmware),
[декодер EFS2](https://github.com/Crawlerop/dumpefs2/tree/86d2c9970894ec6ede2e72b6c126a3e2ac640d75),
[анонс игры](https://www.etnews.com/200506280132).

Есть ещё одна конкретная ветка GVM вне Кореи: [пресс-релиз Partner от 10 апреля
2002 года, поданный SEC](https://www.sec.gov/Archives/edgar/vprr/0203/02036533.pdf),
описывает Orange Israel **obox**, GVM/Sinjisoft/WiderThan и интеграцию в Samsung.
Сам релиз не называет модель; [современный запуску Ynet](https://www.ynet.co.il/articles/0%2C7340%2CL-1952316%2C00.html)
связывает сервис с маркетинговым названием **Samsung 624**. Не следует без
технического документа превращать его в другой точный индекс SGH. Прошивка и
названия предустановок пока не найдены.

[Руководство SCH-X430SV](https://samsung.manymanuals.de/unknown/sch-x430sv/user-manual-3635/49)
подтверждает GVM-загрузки через NATE; это поддержка сервиса, а не доказательство
встроенного SGS. Исторические сообщения о поставках игр Sinjisoft в Sanyo,
SK Teletech и LG разобраны в [истории Sinjisoft](sinjisoft-history.md).
До связки «точная модель → название → версия ROM → извлечённые байты» эти
OEM-контракты остаются направлениями поиска.

Точная ранняя модель есть в первичном отраслевом документе:
[TTA Journal №82, печатная страница 23](https://tta.or.kr/data/androReport/ttaJnal/JTGHBY_2002_s82_20.pdf)
указывает **SK Teletech IM-2000 → GVM / Mobile C → октябрь 2000, SKT n.TOP**.
Названия предустановок там не приведены. Ещё один канал поиска загрузок —
**So1 / Onse Telecom**, GNEX-портал `www.so1.co.kr`, подтверждённый
[релизом Sinjisoft от 2 ноября 2005 года](https://www.newswire.co.kr/newsRead.php?no=93865).
Это доказанные направления распространения платформы, не найденные ROM-игры.

### .hack//SIGN в архиве NATE

Снимок каталога DdangKong за август 2004 года сохраняет карточку
**닷핵사인 (.hack//SIGN)** с путём `34064/3406428000`. В карточке указаны
цветная GVM, дата размещения 2 апреля 2004 года, объём 120 КБ и
издатель под именем 잼버거오락실. Кнопка загрузки передавала сервису
`MPDownload` идентификаторы `3406428000` и `78516`. Архивный индекс
загрузчика и каталога `EXE/34064/` не дал файла для этих ID. Поздняя запись Elvid показывает запуск
сохранённой основной игры и отдельно описывает эпилог. В полученных
снимках каталога сохранилось описание, а загружаемый SGS пока не найден.
Доступ к живой теме Daum ограничен участниками клуба.
[Карточка NATE](https://web.archive.org/web/20040817193914id_/http://mobile.ddangkong.nate.com/mobile/nateweb/34064/3406428000/index.jsp),
[разбор Elvid](https://rhmvy.tistory.com/entry/SKT-NATE-DotHackSIGN),
[тема Daum GVM](https://cafe.daum.net/GVM/Jckv/115).

### Перепроверка известной GNEX-коллекции

[Straces GNEX/SKVM ZIP](https://archive.org/details/gnex-and-skvm-games-from-straces)
скачан и сравнен с текущим каталогом: **35 SGS-вхождений, 34 уникальных хеша,
0 новых SGS**. Это отдельная коллекция загрузок, без доказанной firmware-привязки.
Название «complete» и описание всех файлов как Java не принимаются за технический факт.

Дополнительно записаны четыре `.daf`: каталоги action hero3d, rainbowsix-,
golf3D и super action hero3D. Их имена, размеры, SHA-256, заголовки и отсутствие
простых EADS/ABHS/ELF/Sinji/GNEX-маркеров сохранены в
[DAF inventory](../validation/straces-daf-inventory.json). Расширение `.daf`
само по себе не устанавливает VM; переименование в `.sgs` ничего не решает.

## Японские телефоны: настоящие предустановки и сохранённые загрузки

### Panasonic P903i — Dirge of Cerberus: Lost Episode

[Square Enix, 12 октября 2006 года](https://www.jp.square-enix.com/company/ja/news/2006/download/release_061012_02.pdf),
подтверждает предустановку демоверсии на P903i/P903iX и OpenGL ES 1.0.
[Руководство NTT DOCOMO, страницы 277–279](https://www.docomo.ne.jp/english/binary/pdf/support/trouble/manual/download/p903i/P903i_E_11.pdf)
описывает предустановленные i-appli и повторную загрузку через P-SQUARE.

Проверен [сохранённый архив демоверсии](https://archive.org/details/final-fantasy-7-dirge-of-cerberus-lost-episode):
3248286 байт, SHA-256 `4b28fdcfe20c2bf29e1c93a15b43e91142a2918391657fde5737dd7366fa2b12`.
В нём `DoCLE.jar` — 994444 байта, 489 ZIP-членов, 412 Java-классов;
`DoCLE.jam` указывает P903i и S001.10; отдельно лежат SP и графические ресурсы.
Архив содержит адаптацию для SDK, поэтому не называется неизменённым сырым
дампом телефона. ZIP и классы проверены, запуск здесь не выполнялся.
[Полный список хешей](../validation/p903i-dirge-demo-inventory.json).

**Статус сохранности обновился:** 3 августа 2026 года [участник восстановления
Yuvi сообщил о полной версии](https://medium.com/@yuviapp/the-story-to-save-a-couple-of-lost-keitai-games-1be4ede27c75),
восстановленной из данных SD-карты. Поэтому старое утверждение «сохранилась
только демка» уже неверно. Наш локальный анализ относится именно к более
раннему архиву демоверсии; восстановление полной версии здесь не повторялось.

### Ещё три конкретных направления

- **P-01A / Kingdom Hearts coded.** [Релиз Square Enix](https://www.jp.square-enix.com/company/ja/news/2008/html/a6e88e5db256829a8229c37e740f133256d4ae92.html)
  называет предустановленный Olympus Coliseum — Side Episode и движок
  **MascotCapsule eruption**. Это не полная эпизодическая игра и не Swerve.
  Есть [первичный рассказ участника извлечения](https://www.reddit.com/r/KingdomHearts/comments/18qswuz)
  через ktdumper.
- **W53S / Metal Gear Solid Mobile trial.** [Отчёт участников сохранения](https://hitsave.org/the-state-of-japanese-feature-phone-preservation-in-2023/)
  описывает извлечённую предустановленную BREW-версию. [Релиз KDDI](https://www.kddi.com/corporate/news_release/2007/0910a/)
  подтверждает выпуск игры для BREW, но отдельно не доказывает её размещение в ROM.
- **P-06C / Rockman.EXE Phantom of Network и Legend of Network.**
  [Команда сохранения](https://www.rockman-corner.com/2023/12/japan-exclusive-rockman-cellphone-games.html)
  описывает восстановление полных игр из памяти телефона с помощью ktdumper
  и разбора FSR. Это пользовательские загрузки, не подтверждённые заводские предустановки.

Полезные инструменты: [ktdumper](https://github.com/ktdumper/ktdumper),
[FSR/XSR/SSR fs-tools](https://github.com/ktdumper/fs-tools),
[openDoJa](https://github.com/GrenderG/openDoJa). Поддержка зависит от модели:
например, `fsr_f` эмулирует загрузчик Fujitsu и требует OneNAND data + OOB,
а не распаковывает любую Panasonic-прошивку. Для DoJa нужно сохранять JAM,
scratchpad SP и внешние данные вместе с JAR; одного архива классов часто мало.

## Плееры: ближайшая к Reunion новая ветка Sinjisoft

### Samsung YP-T8 — XEOVIA подтверждена бинарно

С [официальной страницы Samsung](https://www.samsung.com/fr/support/model/YP-T8Q/ELS/)
скачана прошивка **1.38 FR**: ZIP 2199490 байт,
SHA-256 `1806caaf2fede1f3871978e9ae0bb51ea34fb422b0ec1372d2047efe6d8aec34`.
Внутри ROM, IMG и FNT; CRC ZIP и соответствие извлечённых файлов проверены.

В `YP_T8.rom` (944020 байт; SHA-256
`36dd184a8d3a71f78e1348ac46387c4854092475f0d57ce89e4f09c1823b597d`) найдены:

| ASCII              | Смещение от начала ROM |
| ------------------ | ---------------------- |
| `GameExt.bin`      | `0x8088`               |
| `%s.xov`           | `0x57684`              |
| `Xeovia System`    | `0x58350`              |
| `Xeovia Contents`  | `0x588bc`              |
| `XEOVIA EXCEPTION` | `0x58a7c`              |
| `.XOV`             | `0xa1929`, `0xb1d6d`   |

[Руководство Samsung, страницы 62–65](https://www.manualslib.com/manual/145128/Samsung-Yp-T8.html),
называет **Hurdle, Hextris, PipePlus, Dart**. [Пресс-релиз Samsung 2005 года](https://www.newswire.co.kr/newsRead.php?no=54340)
подтверждает игры с датчиком движения. Устройство имеет экран 160×128 и
трёхосевой акселерометр. [Сервисное руководство](https://www.manualslib.com/manual/1156658/Samsung-Yp-T8.html)
ссылается на Telechips `TCC7xx_FWDN_v1.6d.exe`; это указание на семейство,
но ещё не точная идентификация SoC.

Сканер Reunion проверил 5168528 байт трёх компонентов и 222414 кандидатов:
**0 стандартных SGS**. Строки runtime не доказывают, что сам XOV находится
в upgrade-ROM; игровые файлы могли лежать на пользовательском накопителе.
Совместимость XOV с SGS пока не установлена.
[Файлы, маркеры и независимая проверка](../validation/player-firmware-evidence.json).

Найден точный исторический комплект **T8_Game.zip, 6 игр, около 2.6 MB**:
[страница первоначального куратора](https://web.archive.org/web/20140403223652id_/http://www.anythingbutipod.com/forum/showthread.php?t=32690),
[снимок каталога](https://web.archive.org/web/20100409153635/http://media.generationmp3.com:80/lebellium/T8/).
Исходный адрес — `http://media.generationmp3.com/lebellium/T8/T8_Game.zip`.
Каталог сохранился, ZIP в этой проверке не получен: timeout исходного хоста,
нет доступной точной Wayback-копии. Шесть новых игр в коллекцию не засчитываются.
Следующие источники — оригинальные Yepp CD, резервные копии владельцев и зеркала
этого конкретного комплекта.

### Другие плееры

Из официальной прошивки **YP-T9 1.72 MTP** восстановлены
**Baseball, Honeybee и Pizza Delivery**. Каталог `SYSDATA.bin`
указывает смещения `0x3dddcc`, `0x4feb88` и `0x58d218`.
Длины файлов совпали с заголовками SWF v4, теги проверены до конца.
В `MUON.ROM` есть пути исходников Flash Lite.
[Обновление Samsung](https://downloadcenter.samsung.com/content/FM/200712/20071211143617688_YP-T9J.zip),
[руководство Samsung](https://fccid.io/A3LYPT9/User-Manual/users-manual-675959.html).

В официальном комплекте **YP-T10** сохранены игры **BombBomb,
BubbleSmile и ChickenRunaway**, а также карта метро Subway Map To Go.
Исполняемые файлы `.aab` имеют сигнатуру `ABHS` и нативный ARM-код.
В комплекте есть `.adc`, `.aai`, `.sig` и ресурсы `.arc`.
Все четыре AAB прошли разбор и релокацию загрузчиком ARAM.
Исполнение игр и совместимость API плеера с телефоном пока не
проверялись. [Комплект Samsung](https://downloadcenter.samsung.com/content/FM/200806/20080625131009906_20080625_T10_GAMES.zip),
[проверки T9 и T10](../validation/samsung-yepp-game-evidence.json).

Samsung YH-J70 имеет **ClearScreen, Othello, Omok, Tetris, Chips**, согласно
[руководству производителя](https://doczz.net/doc/3810595/view-owner-s-manual-for-yh-j70).
В официальном обновлении 2.05 скачан `j70_32.bin` (4 003 840 байт,
SHA-256 `9d7c6f58a0e82418234bdb3a0c0d860615ae64aab5f0c5bcbc6d5a5ad3501a05`).
В нём есть строки Othello, Omok, Tetris и Chips на 1 953 952–1 953 976.
Проверка образа не обнаружила SGS и строк GNEX/XEOVIA. Формат игр
пока не подтверждён. [Страница Samsung](https://www.samsung.com/hk_en/support/model/YH-J70LB/XSH/).
В **YH-J50 1.05** также найдены строки Othello, Omok и Tetris.
В нём и в **YP-D1 1.09** сигнатуры GNEX и XEOVIA и SGS известных
версий не найдены. [Архив каталога обновлений](https://web.archive.org/web/20140403223652id_/http://www.anythingbutipod.com/forum/showthread.php?t=32690).

[Архив iRiver U10/clix](https://archive.org/details/iriverclixgames) содержит
отдельные Flash-комплекты: LogJam, LaunchFighters, Driving Range, EX Snowboard,
Freecell, Blackjack, Turtleboat, Sudoku, Critter Crossing, 2001, Barn Baron,
iBall и Frisbee Fetch. Названия и пути из metadata ещё не равны проверке каждого ZIP:
среди записей встречаются подозрительно одинаковые маленькие ответы.

**LogJam действительно скачан:** ZIP 38712 байт, SHA-256
`f94cb19aee1a8403d4bbea89989de713269762f28eaedfe0168b3a519ca6ef3f`.
Внутри исправный `LogJam.swf`, 44691 байт, `FWS` v4; длина в заголовке совпала.
SHA-256 SWF `583381aa6994724c0453d9e42e9eeb04b8f9d9088905eb685f1d971cfb7abc45`.
Это оригинальный загружаемый Flash-комплект, не GNEX и не извлечение из firmware.

### iStation NetForce 2 и COGP

Владелец NetForce 2 описал запуск телефонных GXG-игр на своём плеере
и сохранил PrimePACK4. Из этого архива частичными HTTP-запросами по
оглавлению ZIP получены четыре комплекта. У каждого есть MIPS PE
(`0x0166`), файл ресурсов CRA, SIG и LNK. В исполняемых файлах
найдены `CogpHal_DLLGetMessage`, `cogptarget_wince.lib` и MPGS.
Einstein и Hidden Eye также содержат строку `GXGPlayer`.
[Отчёт владельца](https://blog.djjproject.com/563),
[архив PrimePACK4](https://download.djjproject.com/netforce/PrimePACK4.zip).

| Игра               | Программа          | Ресурсы            |
| ------------------ | ------------------ | ------------------ |
| Sudoku Battle      | `SudokuBattle.exe` | `SudokuBattle.cra` |
| 아인슈타인따라잡기 | `Einstein.exe`     | `BlankProject.cra` |
| 영어뇌습격 2       | `EngBrain2.exe`    | `sone2.cra`        |
| Hidden Eye         | `HiddenEye.exe`    | `HiddenEyePMP.cra` |

В обновлении из того же каталога `NK.bin` содержит имя `MpgsDM.dll`,
а recovery — `MpgsCM.exe`, Omok и JangKi. README обновления называет
модели **NetForce Navi / NetForce Lite Navi**. Для четырёх комплектов
подтверждены COGP и Windows CE. Отдельный релиз Sinjisoft сообщает
о демонстрациях GNEX на WinCE без точных моделей.
[Каталог владельца](https://download.djjproject.com/netforce/),
[релиз Sinjisoft](https://www.newswire.co.kr/newsRead.php?no=114580).

### Ранние DigitalCube i-Station

Отчёт 2005 года называет встроенные игры у **PMP-1000**, без имён
и указания формата. В архиве страницы производителя сохранилось
описание обновления. Бинарник PMP-1000 пока не получен.
[Отчёт KOCCA, PDF стр. 55](https://kocca.kr/knowledge/research/__icsFiles/afieldfile/2010/05/01/x0CGIygutxln.pdf#page=55),
[страница DigitalCube](https://web.archive.org/web/20051222112816id_/http://digital-cube.co.kr:80/eng/bbs/product_pmp1000.php).

Из двух корейских зеркал **V43** получены обновления **1.7.3** и
**2.2.9** и пакет восстановления BIOS **1.1.6**. Вложенные ZIP в EXE
распакованы статически. В двух версиях проверены 3 382 файла из
`app.v43.tgz` и `rootfs.v43.tgz`. Дополнительно проверены три
компонента BIOS и распакованный `initrd.img` с Ext. В проверенных
файловых системах отсутствуют строки движков GNEX и XEOVIA, а сканер
не обнаружил SGS известных версий. Покрытие ограничено полученными
обновлениями и BIOS. [Архив 2.2.9 и BIOS](https://best-bk.tistory.com/42),
[архив 1.7.3 и Qtopia](https://best-bk.tistory.com/63),
[реестр байтов и хешей](../validation/istation-v43-firmware-evidence.json).

Из того же зеркала распакован отдельный пакет **Qtopia для V43**.
Девять файлов меню указывают на ELF32 для MIPS. Исполняемые файлы
сохранились у Fifteen Pieces, Mine Hunt, ParaShoot, Asteroids, Snake,
Patience, Mindbreaker, Same и Tetrix. Проверены все 1 767 обычных
файлов Qtopia. Маркеры GNEX и XEOVIA и SGS известных версий не найдены.
Происхождение пакета относится к установке Qtopia, его наличие в
розничной комплектации V43 не установлено.

У **T43** найден архивный список девяти томов recovery 1.6.1.
Страница зеркала больше не открывается, проверенные ссылки на части
вернули HTTP 410. Для **iRiver PMP-120/140** известны имена европейских
обновлений 2.03 и 2.04 и корейского 2.04. Страницы сохранились,
проверенные ссылки не выдали архивы. [T43 recovery](https://nurakun.tistory.com/47),
[европейское обновление iRiver](https://www.touslesdrivers.com/index.php?v_code=7613&v_page=23),
[корейское обновление iRiver](https://www.shamrockman.net/tutorials/firmwareguide.php).

На действующем японском сайте iRiver получены обновления PMP-120/140
2.03, 2.04 и системный пакет 2.04. В двух `allimg.hex` разобрана ROMFS
на `0x1c0020`, проверены контрольные суммы. Ядро обозначено
`Linux 2.4.19-uc1`. Все 14 ресурсов `pmp00–13.dat` содержат
ARM ELF-объекты с пустой `.text` и данными графики или шрифтов.
Проверка 102 файлов, 19 083 640 байт, не нашла SGS или меток
GNEX/GVM/Sinjisoft. Эти японские сборки не дают подтверждения
GNEX для PMP-120/140.
[Официальный каталог 2.03](https://www.iriver.jp/support/file_171.php),
[2.04](https://www.iriver.jp/support/file_182.php).

При загрузке этих трёх пакетов проверка цепочки TLS завершилась ошибкой.
Повтор выполнен без проверки сертификата. Хеши вычислены локально,
структура ZIP и ROMFS проверена.
[Источники, хеши и границы проверки](../validation/iriver-pmp-japan-evidence.json).

Отдельно восстановлен `D10.HEX` словаря **iRiver Dicple D10** из
[публичного комплекта владельца](https://best-bk.tistory.com/10).
Применён [опубликованный алгоритм iRiver](https://iriver-t10.sourceforge.net/custom-firmware.html):
проверены 14 742 внешние и 73 710 внутренние контрольные суммы, обратное
кодирование дало побайтово исходный HEX. Декодированные 3 685 500 байт
содержат `REIGNCOM D10`, но не дали валидного SGS или меток GNEX/GVM/Sinji.
Версия именно этого HEX не установлена; соседнее имя установщика 1.60
не определяет её. Это результат проверки одной сборки.

Для D20 прочитана официальная карточка системного обновления 1.20
от 9 мая 2006 года; сам образ не получен. Две дополнительно прочитанные
карточки D26 относятся к Manager 1.00 и Plus3 3.3.1.2 — утилитам для ПК.
Обзоры и открытые записи Naver не дали подходящих вложений. Наличие игр
в словарях и сотрудничество Sinjisoft с Reigncom пока не устанавливают
GNEX для D20, D25 или D26.
[Источники, хеши и результаты](../validation/iriver-dictionary-followup.json).

### MPIO. Региональные прошивки в розыске

В оригинальном японском каталоге найдены FG200 4.18 от 7 февраля 2006 года
и 4.17 for Mac от 5 января 2006 года, карточки `dcode=88` и `dcode=78`.
Сами бинарные файлы пока не получены. Карточка зеркала HD400 03.04.0 EU
называет `firmware_hd400_v03040eu.zip`, но действующая ссылка отсутствует;
эта региональная версия уже была известна по официальному каталогу.

В девяти страницах разделов MPIO польского форума перечислены 147 тем;
открыты десять подходящих веток. Архивы прошивок там не найдены.
Ветка 2006 года указывает на исторический фан-сайт `www.mympio.com`.
Это конкретное следующее направление; его внутренний архив ещё не проверен.
Привязка точных моделей FG200/HD400 к GNEX остаётся неподтверждённой.
[Оригинальный японский каталог](https://web.archive.org/web/20060216011150id_/http://www.mpio.jp:80/support/download_list.php?dtype=firmware),
[ветка о фан-сайте](https://forum.mp3store.pl/topic/6220-my-mpio-support-site/),
[хеши и границы проверки](../validation/mpio-regional-firmware-followup.json).

### MyRacer MF101 и игры с комплектного диска

Из корейского комплектного диска MF101 извлечены пять исходных
файлов `.xgn` с сохранением имён Joliet. SHA-1 обоих образов диска
совпал с метаданными Internet Archive. С диска драйверов извлечён
BlazeVideoMagicForMyRacer, видеоконвертер для Windows. Загрузчик XGN
и прошивка в его 97 файлах не обнаружены. [Диски и фотографии](https://archive.org/details/MyRacerMF101),
[хеши файлов](../validation/myracer-mf101-xgn-evidence.json).

| Игра на диске   |     Байты | Дескрипторов ресурсов |
| --------------- | --------: | --------------------: |
| 미니게임천국    |   896 116 |                   747 |
| 뿌뉴뿌뉴퐁Remix |   490 366 |                   598 |
| 슈퍼액션히어로  |   954 334 |                   999 |
| 컴투스사커      | 1 905 240 |                 1 470 |
| 페노아전기2     | 2 659 312 |                 1 749 |

В клубе «놀러오세요 마이레이서» сохранилось обновление `_update_.zip`
на 1 398 626 байт от мая 2008 года. В `ROM_EXEC` видны ARM-векторы
с базой `0x08000000`, метка `SISIS SOC SDK -- PET` и строки
`GNEX EXCEPTION`, `.sgs` и `.xgn`. Ветка `.xgn` вызывает
процедуру `0x0809c0c4`. Она проверяет 16-байтный хвост и
декодирует первые 256 и последние 256 байт полезной нагрузки через
DES ECB. Средняя часть остаётся в исходном виде.
[Обновление с форума](https://cafe.naver.com/myracer/4921),
[история клуба, 2009 год](https://www.khgames.co.kr/news/articleView.html?idxno=58895).

Оригинальная ARM-процедура приняла все пять файлов. Независимый
распаковщик дал побайтно те же SGS v4. Число ресурсов в таблице выше
взято из декодированных заголовков. Для локального XGN нужны
Python 3.11+ и PyCryptodome.

```sh
python -m pip install pycryptodome
python tools/unpack-myracer-xgn.py game.xgn game.sgs
```

При 320×240 в Reunion проверены управление в Mini Game Paradise,
курсор в Ppunyu Ppunyu Pong Remix, удар на тренировке Super Action Hero
и ходьба по карте Penoa Chronicles 2. В Com2uS Soccer проверены
товарищеский матч и движение игрока. Для загрузки поля у этой сборки
увеличен предел обработки таймера.
[Игры, проверенные сцены и архив](myracer-game-disc.md),
[хеши и смещения](../validation/myracer-mf101-xgn-decoded.json).

В другом корейском клубе сохранился отдельный `clubzio_sketcher.vgn`
на 939 698 байт. Для `.vgn` тот же ROM выбирает другую ветку.
Она получает дополнительные четыре байта ключа через конфигурацию,
читаемую при старте. Проверка хвоста ключом XGN для этого файла не
прошла. По контрольному хвосту восстановлены четыре байта конфигурации
`27 70 00 00`. С ними оригинальная ARM-ветка и независимая распаковка
выдали одинаковый SGS v4. В Reunion проверены первая трасса и меню на
трассе. [Публичное вложение Sketcher](https://cafe.naver.com/halfstudy/1949),
[распаковка и хеши](myracer-game-disc.md#sketcher-vgn).

Пост в корейском клубе разработчиков от 3 апреля 2009 года связывает
MyRacer и витрину Play4U с GNEX и называет игру ZIO `질주쾌감 스케쳐`.
В комментариях к объявлению о десятигровом диске Gamevil покупатель
описал полученный диск с игровыми файлами. Образ этого издания
пока не найден. [Клуб разработчиков](https://cafe.naver.com/webzero0/2096),
[объявление Gamevil CD](https://cafe.naver.com/myracer/15313).

Отдельный телефонный выпуск Penoa Chronicles 2 из ветки 2006 года
содержит `0102C183.jar` и метаданные ADF с версией 02.00.09.
Классы ссылаются на `org.kwis.msp.lcdui`, поэтому этот выпуск
учтён как Java WIPI. [Вложение Penoa](https://cafe.naver.com/evk100/4),
[хеши и метаданные](../validation/gnex-korean-forum-followup.json).

В архивном разделе поддержки производителя сохранились точные имена
обновлений. Среди них `통합버젼 firmware_1.1V.zip` на 7 823 733 байта
и `13000번이상 firmware.zip` на 17 552 643 байта. Каталог показывает
имена, размеры и параметры кнопок скачивания. Эти два ZIP пока не получены.
[Каталог обновлений](https://web.archive.org/web/20091012094242id_/http://www.myracer.co.kr/board/bbs.php?table=support_download_my).

С шести официальных страниц MyRacer восстановлены **40 карточек игр**
со старыми адресами и ID Play4U. Пять названий совпадают с файлами
комплектного диска. Среди остальных есть Nom, Nom 2, Mini Game Paradise 2
и Com2uS Bowling 2. Каталог охватывал оба движка устройства.
Формат каждого релиза требует отдельной проверки его файла.
[Каталог производителя](https://web.archive.org/web/20091012093604id_/http://www.myracer.co.kr/board/inc.php?inc=game_1),
[все названия и ID](../validation/myracer-official-game-catalog.json).

В январе 2009 года в клубе MyRacer отдельно анонсировали диск Gamevil
с десятью играми, включая `냐옹타이쿤`. В сообщении указана карточка
Gmarket 158739524. Образ этого диска пока в розыске.
[Анонс диска](https://cafe.naver.com/myracer/15313).

Французская модель **Westrend WF101** описана на сайте производителя
с тем же экраном 320×240, ARM922T и поддержкой мобильных игр и Flash.
На странице сохранилось имя My Racer. Связь с семейством подтверждает
описание, образ WF101 для проверки движка пока не найден. Снимок
главной Play4U сохранил путь магазина `solution/home/play4u/market.php`.
Для 36 уникальных ссылок на карточки из списка MyRacer Wayback
не вернул снимков. [Westrend WF101](https://web.archive.org/web/20080531163605id_/http://www.westrend.fr:80/FR_Products_Detail.asp?ID=147),
[Play4U](https://web.archive.org/web/20080305183136id_/http://www.play4u.co.kr:80/),
[обзор магазина 2008 года](https://game.donga.com/38505/).

### MPIO

В руководстве **MPIO ONE / FG200** на стр. 83 указана встроенная
`push!! rush!!` и возможность добавить ещё две игры обновлением.
Стр. 90–92 называют `Upgrade_FG200.dwu` и `Upgrade_FG200.ROM`.
Версия 2.18 есть в каталоге ZOL, запрос файла вернул HTTP 403.
Для **MPIO HD400** есть карточка `firmware_hd400_v01040us.zip`
с компонентом `Upgrade.HD400.dwu`. В архивном каталоге MPIO указан
ещё и отдельный пакет `downloads/misc/games_hd400.zip` для папки
`GAMES`. Сам ZIP пока не получен. Каталог FG200 называет международный
`firmware_fg200_v218.zip` и корейский `firmware_fg200_v521.zip`.
Среда выполнения игр этих моделей пока не установлена.
[Руководство FG200](https://content.etilize.com/User-Manual/1010061916.pdf),
[ZOL](https://xiazai.zol.com.cn/detail/60/595956.shtml),
[карточка HD400](https://www.driverguide.com/driver/detail.php?driverid=1718169),
[каталог MPIO FG200](https://web.archive.org/web/20070115234019id_/http://www.mpio.com:80/downloads/index.php?search_part=FG200),
[каталог MPIO HD400](https://web.archive.org/web/20070115234225id_/http://www.mpio.com:80/downloads/index.php?search_part=HD400).

Из официального `MPIOUtility_v1060.exe` извлечены 18 пакетов
`Recovery.*.dwu`. Эти файлы используют Microsoft CAB. FG200 содержит
настройки и шрифт, HD400 содержит настройки и заставку.
Проверка 141 извлечённого файла не обнаружила SGS. Версия 2.18 для FG200
есть также в каталоге MyDrivers, где текущая загрузка требует аккаунт
и монеты. [Утилита производителя](https://web.archive.org/web/20060328173033id_/http://www.mpio.com/downloads/software/MPIOUtility_v1060.exe),
[карточка FG200 2.18](https://drivers.mydrivers.com/drivers/150_60038.htm).

## Sanyo SCP-5300 и SA702i

В `SCP5300_V1036SP.bin` (10 274 308 байт, SHA-256
`04604e4f87d0715f7becf241a408b224ec94df042388c8d519e89706cbaf12b2`)
найдены три полных JAR. У каждого проверены границы каталога ZIP, CRC
всех членов и манифест. Все три используют MIDP 1.0 и CLDC 1.0.
[Архив Sanyo](https://archive.org/download/Sanyo/Sanyo.zip/),
[точный пакет V1036SP](https://archive.org/download/Sanyo/Sanyo.zip/Sanyo%2FSCP-5300%2FSCP5300_V1036SP.7z).

| Игра                                | Смещение   |  Байты |
| ----------------------------------- | ---------- | -----: |
| Ms. PAC-MAN DEMO 1.01, Namco        | `0x4ecf38` | 68 098 |
| Astrosmash 2.14, THQ                | `0x4fdaaf` | 60 310 |
| JAMDAT Bowling 1.0.9, JAMDAT Mobile | `0x50c7a2` | 59 445 |

По образу нельзя установить, все ли три игры были на каждом заводском
устройстве. Запуск не проверялся.
[Хеши и диапазоны извлечения](../validation/phone-firmware-20261105-extractions.json).

В образе **SA702i** на `0x18d153e` найдены название Age of Empires II
Mobile и адрес `www.stel-web.com/app/i/14_app/9999_4/AOEII.jam` в
контексте DoJa. Предустановку подтверждает пресса 2006 года. В данном
образе при проверке заголовков и центральных каталогов ZIP целый JAR
не извлечён. [Образ SA702i](https://archive.org/download/Sanyo/Sanyo.zip/Sanyo%2FSA702i%2FSA702i_Jly_20_2006.7z),
[4Gamer](https://www.4gamer.net/news/history/2006.07/20060711165039detail.html).

Проверка 11 образов Sanyo (123 365 416 байт) не дала валидных SGS
в открытом виде или с XOR `0xa5`. Это относится только к выборке из
архива. Исторический контракт Sinjisoft с Sanyo остаётся без привязки
к конкретной модели в этой выборке.

## Другие аппаратные и программные ветки

| Направление                                 | Полезный проект                                                                                      | Что ещё нужно проверить                                                                    |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Sony Ericsson T68i R8A015                   | [Mia](https://github.com/jmacato/Mia): AVR handset + ARM modem, GDFS                                 | Инвентарь игровых ресурсов и реальный игровой прогон; README этого не доказывает           |
| Siemens EL71/CX65/CX70/CX75, LG KE970/KE800 | [pmb887x-emu](https://github.com/siemens-mobile-hacks/pmb887x-emu): PMB8875/8876, board-профили, GDB | Конкретный fullflash, файловая система и список игр; проект early alpha                    |
| Symbian N80 / Massive Snowboarding          | [EKA2L1 PR866](https://github.com/EKA2L1/EKA2L1/pull/866): оригинальный ARM-код, DevSound, LCD       | Источник в Z:/ROFS/CNT; совместимость с ROM-профилем не доказывает заводскую предустановку |
| Symbian 9500 / Bounce; P900 / No Man’s Land | [EKA2L1 PR867](https://github.com/EKA2L1/EKA2L1/pull/867): палитры, framebuffer, ввод                | Отдельная проверка происхождения конкретного игрового файла                                |
| Mophun `.mpn`                               | [NoFun](https://github.com/RadratSoftworks/nofun), [MoRePhun](https://github.com/Luca1991/MoRePhun)  | Модельная привязка и оригинальные файлы; MoRePhun — ограниченный PoC                       |

## Приоритеты следующего извлечения

Новый результат — [пять игровых native PXO из обновления LG SV400](lg-sv400-games.md).
Все блоки распаковки совпали с C-эталоном; запуск ещё требует отдельной
среды PXO/WIPI. [Установочный CD Yepp](yepp-formatting-resources.md) дал
другие системные FNT J50/J70, но не игровые XOV. Для YM-PD1L руководство
называет Pipe Dream Plus и Hextris; оригинальный пакет этих игр ещё нужен.

Дополнительные оригиналы: [Samsung X120/E300/E470/E560 и EADS Bomb Link](samsung-early-gvm-followup.md),
[Sanyo SCP-A011 и инструкция корейской Nokia 8887](sanyo-nokia-korean-gvm.md),
[Curitel C-500 / Magic Ball](curitel-c500.md). Это новые привязки к конкретным
образам и руководствам. Новых рабочих SGS эти проверки пока не добавили.

Новый проход по восьми образам LG подтвердил код GVM2X в **SD100**
и региональном **SD7130**, но не дал новых восстановленных SGS.
[Дампы, метки, X-Ship/Poshong и границы сканирования](lg-memory-followup.md).
Направления поиска расширены по [оригинальным таблицам телефонов](gvm-historical-handsets.md),
а отдельно сохранён [Hellfire v1 из WI-TOP](gvm-community-recovery.md),
который пока останавливается на неподдерживаемой операции при START.

1. **YP-T8: получить T8_Game.zip / GameExt.bin / XOV.** Самая близкая новая
   Sinjisoft-ветка: известны точный ROM, runtime и исторический игровой комплект.
   [Разобраны оригинальные VM, загрузчик и структура XOV](yepp-xov-runtime.md);
   самостоятельный игровой XOV ещё требуется. Там же сохранён новый точный
   путь MPIO FG200 1.17 из архивной страницы mympio.com, пока без бинарных байтов.
2. **Samsung: определить ABI остальных EADS.** Для W830/W860/W770
   оригинальные DAT и эталонные игры уже восстановлены. Остаются
   неподтверждённые зависимости Bluetooth, Sudoku и Pangya.
3. **Nokia S40: небольшой CNT с несколькими предустановками.** Использовать
   predeftool, сохранять оригинальные пути, JAR/JAD и хеши контейнера. Это
   перспективнее случайного перебора многогигабайтных сборников.
4. **LG-SH150A: восстановить именно SW15A712_00.kdz.** Сначала разобрать KDZ
   и инвентаризировать разделы; GNEX пока остаётся проверяемым предположением.
5. **Nokia 2100/3310: эталонный запуск native-игр.** Сопоставить карту функций
   с конкретной прошивкой; сохранить кадры и ввод, отделить обёртку от реконструкции.
6. **Японские модели: комплектовать полные приложения.** Учитывать JAM/SP,
   внешнюю память, версии API/3D и происхождение данных, а не только JAR.

Установщики читались как данные. Отдельные игровые образы проверены
в эмуляторах, как указано в соответствующих разделах. Для девяти
включённых Cenix/Kingston ROM остаётся прежний результат: готовых SGS внутри
не обнаружено, меню получает отдельные игры через виртуальный FAT16.
[Отдельный отчёт по этим ROM](firmware-games.md).
