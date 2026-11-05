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

| Устройство / прошивка             | Игры или комплект                                             | Формат / способ сохранения                 | Текущий результат                                                           |
| --------------------------------- | ------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------- |
| Nokia 3410, NHM-2 5.46            | Munkiki’s Castles 1.06                                        | Java ME JAR из gzip-потоков сервисного EXE | **Извлечено и проверено**, 15 упаковок / 14 наборов файлов одной игры       |
| Nokia 2100, 5.49                  | Snake II, Space Impact, Link5                                 | Нативный код в `2100.fls`                  | Автор Nokstalgia документирует запуск игр                                   |
| Nokia 3310, NHM-5 6.39            | Snake II, Space Impact, Bantumi, Pairs II                     | Нативный код и ресурсы MCU/PPM/PMM         | Есть карты кода, извлечение ресурсов и C-реконструкции                      |
| Nokia 3210 / 5110                 | Snake, Memory, Rotation / Snake, Memory, Logic                | Нативные игры                              | Есть модельные исследования и реконструкции                                 |
| Nokia S40 DCT4 / BB5              | Предустановленные JAR, темы, Flash Lite                       | CNT / файловая система / FAT16             | Готовый массовый извлекатель `predeftool`; ограничения зависят от поколения |
| Samsung SCH-W830 DL21 / W860 DA06 | MinigameQVGAOEM                                               | ARM/Thumb EADS                             | Опубликованы точные хеши извлечённых образов и reference tests              |
| Samsung SCH-W770 DA05             | Minigame WQVGA                                                | ARM/Thumb EADS                             | То же; оригинальный DAT здесь не скачан                                     |
| Samsung SCH-W210 / W240           | Bomb Link                                                     | ARM/Thumb EADS                             | Связь с моделями и хеш опубликованы ARAM                                    |
| Samsung SGH-A800                  | Fortress, Space War, X-Flighter                               | Пока не установлен                         | Названия подтверждены руководством; извлечённого образа нет                 |
| Samsung SGH-E700                  | Honey Ball, Go! Hamster, Bowling                              | Пока не установлен                         | Набор подтверждён руководством Orange                                       |
| LG CYON SH150A, SW15A712_00       | Названия ещё не установлены                                   | KDZ; платформа игр не подтверждена         | Найдена точная прошивка SKT, пока только метаданные                         |
| Panasonic P903i / P903iX          | Dirge of Cerberus: Lost Episode, предустановленная демоверсия | DoJa: JAR + JAM + SP + внешние ресурсы     | **Архив демоверсии проверен**; предустановка подтверждена Square Enix       |
| Panasonic P-01A                   | Kingdom Hearts coded: Olympus Coliseum — Side Episode         | i-appli / MascotCapsule eruption           | Предустановка подтверждена Square Enix; есть отчёт об извлечении            |
| Sony Ericsson W53S                | Metal Gear Solid Mobile trial                                 | BREW                                       | Сохранение предустановленной версии описано участниками проекта             |
| Panasonic P-06C                   | Rockman.EXE Phantom / Legend of Network                       | i-appli и файловая система телефона        | Полные игры восстановлены другим проектом; это пользовательские загрузки    |
| Samsung YP-T8, 1.38 FR            | Hurdle, Hextris, PipePlus, Dart                               | XEOVIA / `.XOV`                            | **Проверен runtime в ROM**; отдельные XOV ещё не извлечены                  |
| Samsung YH-J70                    | ClearScreen, Othello, Omok, Tetris, Chips                     | Движок пока не установлен                  | Названия из руководства производителя                                       |
| iRiver U10 / clix                 | LogJam и другие Flash-игры                                    | SWF из отдельных комплектов                | **LogJam скачан и проверен**; это не извлечение из ROM                      |

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

[ARAM Core](https://github.com/mirusu400/aram-core) содержит реальный разбор
Samsung firmware и тесты извлечённых игр. Проверена ревизия
`fea299cba15696ed1460f965b76626d6edab5e03`.

| Модель / build      | Запись                | SHA-256 игрового образа                                            |
| ------------------- | --------------------- | ------------------------------------------------------------------ |
| SCH-W830 DL21       | `MinigameQVGAOEM.dat` | `c83d4f4ee9cbf6ba4280b17f8f8a3dd26157ce9f07849583c04a60ebf9c00429` |
| SCH-W860 DA06       | `MinigameQVGAOEM.dat` | `6b48455bc86e151967d75ec1b596cdd7a09838e495d3a8a1717bd5d67158ee71` |
| SCH-W770 DA05       | `Minigame_WQVGA.dat`  | `16f0ccdf370069e2342aee29c05e22fa64577b7ca5e9d7cc87a98d87b50d391f` |
| SCH-W210 / SCH-W240 | `Bomb_Link.dat`       | `a8c47d3045639b12afd0de213a1c2ef1467f0495c8edad1bb5483a3ab74dc629` |

Источник хешей — [reference test автора](https://github.com/mirusu400/aram-core/blob/fea299cba15696ed1460f965b76626d6edab5e03/application/eads_native_games_reference_test.go),
связь Bomb Link с W210/W240 — README. Тест использует закрытые оригинальные
данные, исполняет кадры, проверяет ввод и сохранение/восстановление состояния.
В Reunion этот прогон не повторялся, файлы игр не скачаны.

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

Отдельные более ранние цели: руководство Samsung SGH-A800, страницы 124–127,
называет [Fortress, Space War и X-Flighter](https://manualzz.com/doc/4296800/samsung-sgh-a800-owner-s-manual).
Руководство Orange для E700 перечисляет [Honey Ball, Go! Hamster и Bowling](https://device.report/m/f98fcc7d7c956a0d3a67692d7d5f2967b428140ca90f56cf82595c7867b115ea.pdf).
Формат этих игр здесь не установлен. Для дальнейшей работы нужны точные
versioned BIN и карта вызовов игрового меню, а не предположение «все Samsung — GNEX».

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
проверке. Байты не получены. **GNEX и названия предустановленных игр SH150A
по этим сведениям не подтверждены.** Соседние SH130/150/170/210/240/400/410/460/
470/640/650 — дополнительные модельные цели, не доказанный каталог игр.

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

Samsung YH-J70 имеет **ClearScreen, Othello, Omok, Tetris, Chips**, согласно
[руководству производителя](https://doczz.net/doc/3810595/view-owner-s-manual-for-yh-j70).
Платформа этих игр здесь не подтверждена. У того же исторического куратора
сохранились ссылки на игровой комплект YP-T9 и
`T10_GAMES[20080625145603].zip` для YP-T10. Это отдельные цели для поиска;
называть их GNEX или Flash только по модели нельзя.

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

## Другие аппаратные и программные ветки

| Направление                                 | Полезный проект                                                                                      | Что ещё нужно проверить                                                                    |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Sony Ericsson T68i R8A015                   | [Mia](https://github.com/jmacato/Mia): AVR handset + ARM modem, GDFS                                 | Инвентарь игровых ресурсов и реальный игровой прогон; README этого не доказывает           |
| Siemens EL71/CX65/CX70/CX75, LG KE970/KE800 | [pmb887x-emu](https://github.com/siemens-mobile-hacks/pmb887x-emu): PMB8875/8876, board-профили, GDB | Конкретный fullflash, файловая система и список игр; проект early alpha                    |
| Symbian N80 / Massive Snowboarding          | [EKA2L1 PR866](https://github.com/EKA2L1/EKA2L1/pull/866): оригинальный ARM-код, DevSound, LCD       | Источник в Z:/ROFS/CNT; совместимость с ROM-профилем не доказывает заводскую предустановку |
| Symbian 9500 / Bounce; P900 / No Man’s Land | [EKA2L1 PR867](https://github.com/EKA2L1/EKA2L1/pull/867): палитры, framebuffer, ввод                | Отдельная проверка происхождения конкретного игрового файла                                |
| Mophun `.mpn`                               | [NoFun](https://github.com/RadratSoftworks/nofun), [MoRePhun](https://github.com/Luca1991/MoRePhun)  | Модельная привязка и оригинальные файлы; MoRePhun — ограниченный PoC                       |

## Приоритеты следующего извлечения

1. **YP-T8: получить T8_Game.zip / GameExt.bin / XOV.** Самая близкая новая
   Sinjisoft-ветка: известны точный ROM, runtime и исторический игровой комплект.
2. **Samsung W830/W860/W770: получить точные stock DAT.** Есть модельные
   профили, хеши игровых EADS и опубликованная структура; можно независимо
   реализовать статическое извлечение и затем исследовать API.
3. **Nokia S40: небольшой CNT с несколькими предустановками.** Использовать
   predeftool, сохранять оригинальные пути, JAR/JAD и хеши контейнера. Это
   перспективнее случайного перебора многогигабайтных сборников.
4. **LG-SH150A: восстановить именно SW15A712_00.kdz.** Сначала разобрать KDZ
   и инвентаризировать разделы; GNEX пока остаётся проверяемым предположением.
5. **Nokia 2100/3310: эталонный запуск native-игр.** Сопоставить карту функций
   с конкретной прошивкой; сохранить кадры и ввод, отделить обёртку от реконструкции.
6. **Японские модели: комплектовать полные приложения.** Учитывать JAM/SP,
   внешнюю память, версии API/3D и происхождение данных, а не только JAR.

Все установщики и игровые архивы в этом исследовании читались как данные.
Новых форматов исполнения в Reunion эта работа не добавляет. Для девяти
включённых Cenix/Kingston ROM остаётся прежний результат: готовых SGS внутри
не обнаружено, меню получает отдельные игры через виртуальный FAT16.
[Отдельный отчёт по этим ROM](firmware-games.md).
