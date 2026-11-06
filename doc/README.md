# Документация Reunion

## Запуск и разработка

- [Игровой интерфейс](web-interface.md): неподвижный LCD, корпуса, управление и уровни громкости.

- [README](../README.md): запуск веб-версии, импорт оригиналов, управление.
- [GitHub Pages](github-pages.md): статическая сборка и автоматическая публикация.
- [Настольная версия](desktop.md): Python, Tkinter и сборка Windows.
- [Архитектура](architecture.md): два режима исполнения, модули и границы модели.
- [Совместимость](compatibility.md): каталог SGS-приложений, проверенные сценарии и ограничения.
- [Производительность веб-версии](web-performance.md): ускорение ARM, таймеры, показ кадров и воспроизводимые измерения.
- [Участие в разработке](../CONTRIBUTING.md): оформление, проверки и воспроизводимые сообщения об ошибках.

## GNEX и аппаратная модель

- [Telechips TCC76x / ARM940T](hardware.md): память, LCD, периферия, IRQ и завершение работы ROM.
- [GNEX SDK 2.10/2.12](gnex-sdk-research.md): найденные инструменты, Mobile C API, VM и ABI.
- [GVM → GNEX](gvm-gnex-lineage.md): первичный White Paper 2003 года, обратная совместимость и реально проверенные GVM-сборки.
- [Windows-эмуляторы SDK](gnex-emulators.md): сохранённые дистрибутивы, интерпретаторы, IDE и происхождение сборок.
- [Рантаймы Symbian S60](s60-runtimes.md): исходные SIS/APP, встроенный SGS и границы понятия «эмулятор».
- [Проверка большого архива S60](s60-corpus-audit.md): 379 SIS, структурный поиск SGS и три уже известных сборки.
- [Следующий проход S60 и устройств](platform-recovery-pass8.md): новая World League Demo, проверка 5 412 файлов и сохранённые исходные страницы.
- [Вывод кадров GNEX](gnex-display.md): Flush, RestoreLCD, частичный вывод и проверки оригинальным ARM.
- [Устройства GNEX и GVM](gnex-devices.md): подтверждённые модели, прошивки и результаты извлечения SGS.
- [Справочники GVM 2002–2003 годов](gvm-historical-handsets.md): 78 таблиц Sinjisoft, строки SKT/STI, версии VM и области экрана.
- [Swerve 3D](swerve.md): оригинальный ARM-модуль, GNEX/BREW-мост, проверка миссии.
- [Звук](browser-audio.md): Web Audio, SMAF, известные форматы и пересборка WASM.

## Инструменты и первичные данные

- [Условные SIS](sis-conditional-recovery.md): все ветки установки, варианты языков и повторный поиск SGS.

- [Сохранение платформы](preservation.md): полные SDK, эмуляторы, исходные PDF/ZIP и проверяемый реестр полученных файлов.

- [Обзор tools](../tools/README.md): команды для разработчика и исследователя.
- [Статический анализ SDK](tools-guide.md): распаковка InstallShield и извлечение таблицы функций.
- [Повтор игровых сценариев](replay.md): клавиши, таймеры и сохранение framebuffer.
- [Поиск игр в прошивках](firmware-games.md): сканер SGS, проверенные ROM и происхождение игр в меню.
- [Игры с фотографии Kingston](kingston-observed-games.md): шесть точных имён и исторические источники.
- [Проверки полной прошивки](firmware-validation.md): холодные прогоны девяти ROM, аппаратные регрессии и скорость.
- [Игры телефонов и плееров](phone-firmware-games.md): оригиналы из Nokia, Sanyo и Samsung, LG CYON, DoJa/BREW и плееры с XEOVIA и COGP.
- [LG SD810](lg-sd810.md): пять восстановленных игр, два музыкальных SGS и разбор фрагментированной файловой системы.
- [Следующие дампы LG](lg-memory-followup.md): SD100, региональный SD7130 и границы поиска в восьми образах.
- [Вложения старого GVM Club](gvm-community-recovery.md): комплекты WI-TOP, исходник Mobile C и оригинальный Hellfire v1.
- [Новый проход старых форумов](gvm-forum-attachments.md): 13 оригинальных вложений, SGS файтинга zola, презентации и таблицы устройств.
- [GVM в документах разработчика](gvm-service-deployment.md): 17 тестовых телефонов, варианты SGS/RES, иконки и серверный пример.
- [XEOVIA в Samsung YP-T8](yepp-xov-runtime.md): оригинальный загрузчик XOV, структура VM и архивные маршруты MPIO.
- [Ранние Samsung: X120, E300, E470, E560](samsung-early-gvm-followup.md): новые подтверждения GVM и отдельный native EADS Bomb Link.
- [Корейские Sanyo и Nokia](sanyo-nokia-korean-gvm.md): реальная SCP-A011 K2 V2000, региональные профили и Snake II в инструкции 8887.
- [Curitel C-500](curitel-c500.md): встроенная Magic Ball, скачиваемые NATE-приложения и сохранившийся PCSync.
- [LG SV400](lg-sv400-games.md): пять извлечённых native PXO, проверенная декомпрессия и границы свидетельств GNEX.
- [Основной код SH130/KH1300/KH1400](lg-main-images.md): три восстановленных software ELF и 3 475 блоков LZO1F.
- [Покрытие следующих целей](gnex-firmware-coverage.md): исходные профили, отсутствующие дампы и отдельная BREW-находка CX-800V.
- [Дополнительные дампы телефонов](additional-phone-dumps.md): два сегмента Motorola V740, сырой NAND Curitel PT-K1000 и две редакции Hyundai HGC-600E; границы отрицательного SGS-скана.
- [Ранние сервисные документы GVM](gvm-early-service-guides.md): таблица из PPT, DD-101, особенности телефонов и исходные примеры 2001–2002 годов.
- [Внутренние материалы SDK](gnex-sdk-internal-sources.md): исходные фрагменты, имена legacy-операций и четыре проверенных SGS-примера.
- [Ресурсы форматирования Yepp](yepp-formatting-resources.md): новые FNT из установочного CD и отдельный кандидат YM-PD1L.
- [908 системных функций SDK](sdk-syscalls.json), [хеши файлов SDK](sdk-file-hashes.json), [x86-свидетельства](sdk-x86-evidence.txt).
- [Происхождение Swerve-модуля](swerve-provenance.json).

## История и источники

- [SCH-S390 и загружаемый GNEX-проигрыватель](samsung-s390-wipi-player.md): новый BIN, официальные PDF и первичный отчёт SK Telecom о WIPI-приложении GNEX.
- [Samsung SCH-S250 и SCH-S380](samsung-s250-s380.md): новые код и сегменты памяти, маршруты GNEX, две встроенные игры и оригинальные документы/PC Link.
- [Innocom, Китай и Super GNEX](innocom-super-gnex.md): меморандум, исходные релизы ICOLS, OEM-направления и границы подтверждения устройств.
- [Ранние страницы GNEX Club и SDK](gnex-club-early-sdk-sources.md): анонсы SDK 1.20/1.40, точные имена пакетов и оригинальный буклет июня 2003 года.
- [Сверка целей прошивок](phone-firmware-target-join.md): 129 наблюдений, каталоги-кандидаты, локальные хеши и пробелы без объединения вариантов.
- [Часофон Telson STING и Nokia](telson-watch-nokia-frontier.md): строка GVM у TWC-1030, конфликт размеров и непроверенные поисковые имена прошивок 8887.
- [MHP-GNEX и конкурсные архивы](mediaon-dmb-contest-followup.md): ранняя DMB-ветка, новые адреса и статическая проверка двух ZIP.
- [Конечная очередь конкурсных архивов](contest-finite-archive-followup.md): ещё пять пакетов, Linux-материалы и границы отрицательного результата.
- [Sinjisoft в 2002 году](sinjisoft-2002-sdk-content.md): Mobile C, варианты GVM Emulator, 24 записи каталога и изготовители встроенных игр.

- [Полный известный реестр GNEX Zone](gnex-zone-complete-profiles.md): 52 прочитанные карточки, версии VM, размеры, исходные HTML и расхождения.
- [Motorola Prime800 / LG D520](motorola-prime800-lg-d520.md): новые дампы и раздельная идентификация вариантов.
- [Samsung SCH-X850](samsung-x850-round4.md): два оригинальных сегмента и пути GVM.
- [MediaOn и HEVM](nonphone-platforms-round4.md): XEOVIA/VELOS/MMSP2, приставки и DMB; границы доказательств серийных устройств.

- [Три учебных SGS из корейских блогов](korean-developer-samples.md): оригиналы, локальные сценарии и отдельная вкладка примеров.
- [Новые исходники и книжные CD](gnex-book-source-followup.md): GNEX3D, Mobile C и проверенные границы поиска.
- [LG SB260 / SV730](lg-sb260-sv730-games.md): native PXO и FreeKick Flash с ресурсами.
- [Исторические сборки AHYANE](ahyane-historical-builds.md): 13 версий авторского прототипа, семь читаемых и шесть сжатых.
- [Архивы для скачивания](../web/research/catalog.json): сохранённые комплекты, источники и SHA-256.

- [Четыре SGS с Mobaill](mobaill-games.md): открытые вложения, оригинальные GVM2-сборки и парные проверки управления.
- [Следующий проход по плеерам](player-game-hunt-followup.md): проверенные архивы Grundig и зависимость VGN от NAND-конфигурации.

- [Библиография](reference-index.md): Sinjisoft Mobile C Reference, Telechips, Cenix и LG CYON SH150A.
- [Sinjisoft, GNEX и XEOVIA](sinjisoft-history.md): первичные сообщения о телефонах, плеерах и встраиваемых играх.
- [Сторонние компоненты и условия распространения](../THIRD_PARTY.md).

Документы отделяют сведения первичного источника от вывода по конкретному
бинарному файлу и от ещё не подтверждённой гипотезы. Каталог поддерживаемых
форматов или найденный SDK сам по себе не доказывает работоспособность любой
SGS на любом устройстве. SDK и руководства описаны ссылками, хешами и результатами анализа.
Игровая коллекция включена в репозиторий отдельно: исходные ROM/SGS, быстрые
состояния и Swerve сохранены без изменений и проверяются по SHA-256.
