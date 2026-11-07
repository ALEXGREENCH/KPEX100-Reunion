# Проверенная совместимость

На 7 ноября 2026 года в веб-версии подтверждены рабочие сценарии для 79 игровых сборок и одной утилиты. Сцены и ввод проверены на оригинальных SGS. Проверки охватывают отдельные игровые сценарии.

Для четырёх K-PEX игр проверяются точные кадры, события и системные вызовы относительно нативной модели. Остальные записи подтверждены сохранёнными нажатиями, таймерами, диагностикой и визуальным осмотром настоящего framebuffer. В репозитории сохранены JSON-сценарии, результаты и хеши кадров. Оригинальные игры включены в коллекцию; игровые PNG можно получить повторным прогоном. Готовые изображения в репозиторий не включены. Внутренние пути к PNG в отчётах обозначают результаты исходных прогонов, а не файлы этого репозитория.

Настольная Python-версия имеет отдельное покрытие: четыре игры K-PEX и экспериментальный полный запуск Kingston 2.12. Телефонная совместимость из таблицы ниже относится к веб-ядру. См. [настольную версию](desktop.md).

Отдельная вкладка «Примеры» содержит RANKING (GVM1X) и два учебных упражнения
с персонажем. Все три исходных SGS проверены парными прогонами с вводом и без
него; они не увеличивают число игровых сборок. Для RANKING подтверждено только
локальное меню, сетевой сервис не запускался. См. [источники и сценарии](korean-developer-samples.md).

| Приложение                              | SGS | Результат                                                  | Доказательство                                                               |
| --------------------------------------- | --: | ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Godori                                  |   4 | Сверено с нативным запуском                                | [нативные эталоны](../tests/native-goldens.json)                             |
| Hell Fire                               |   4 | Сверено с нативным запуском                                | [нативные эталоны](../tests/native-goldens.json)                             |
| Ikaria ep2                              |   4 | Сверено с нативным запуском                                | [нативные эталоны](../tests/native-goldens.json)                             |
| KPetris Beta                            |   4 | Сверено с нативным запуском                                | [нативные эталоны](../tests/native-goldens.json)                             |
| Battle Armor: Counter Attack            |   4 | Миссия 1, движение по базе, вход в гараж                   | [сценарий](../validation/kingston-naver-replays/battle-armor.json)           |
| Soul Sword                              |   4 | Тренировка, движение и бой                                 | [сценарий](../validation/kingston-naver-replays/soul-sword.json)             |
| Treasure Hunter                         |   4 | Первый этап и движение корабля                             | [сценарий](../validation/kingston-naver-replays/treasure-hunter.json)        |
| The Man-Jong                            |   4 | Начало партии и сброс кости                                | [сценарий](../validation/kingston-naver-replays/the-man-jong.json)           |
| Star Fighter                            |   4 | Первый этап, движение и выстрелы                           | [сценарий](../validation/kingston-naver-replays/star-fighter.json)           |
| Aiolos (K-PEX)                          |   4 | Первый этап, стрельба и очки                               | [сценарий](../validation/kingston-naver-replays/aiolos-kpex.json)            |
| Blocks                                  |   4 | Партия, сброс и удаление блока                             | [сценарий](../validation/kingston-naver-replays/blocks.json)                 |
| Exciting Drop                           |   4 | Первый этап и движение по платформам                       | [сценарий](../validation/kingston-naver-replays/exciting-drop.json)          |
| Blue Swallow (청연)                     |   4 | Первая тренировка, управление тягой                        | [сценарий](../validation/kingston-naver-replays/blue-swallow.json)           |
| 1Zimae                                  |   4 | Игровой сценарий работает                                  | [сценарий](../validation/modern-gameplay.json)                               |
| 2007 Pro Baseball                       |   4 | Игровой сценарий работает                                  | [сценарий](../validation/desktop-gameplay.json)                              |
| Alchemist                               |   4 | Игровой сценарий работает                                  | [сценарий](../validation/modern-gameplay.json)                               |
| Zzayo Zzayo Tycoon (Naver 2004)         |   2 | Отдельная сборка: доярка и MILK                            | [сценарий](../validation/mobaill-replays/zzayo-zzayo-tycoon-naver-2004.json) |
| Fighting Five · Part 1                  |   2 | Arcade-бой, движение и действия                            | [сценарий](../validation/mobaill-replays/fighting-five-part1.json)           |
| Fighting Five · Part 2                  |   2 | Arcade-бой, движение и действия                            | [сценарий](../validation/mobaill-replays/fighting-five-part2.json)           |
| Matgo Jjang (맞고짱)                    |   2 | Карточный стол, розыгрыш карт                              | [сценарий](../validation/mobaill-replays/matgo-jjang.json)                   |
| Storm of Silence Demo (S60)             |   4 | Тренировка и перемещение героя                             | [сценарий](../validation/replay-storm-of-silence-demo-s60.json)              |
| Waterski (S60)                          |   4 | Заезд и прыжок лыжника                                     | [сценарий](../validation/replay-waterski-s60.json)                           |
| Aiolos Fighter (S60)                    |   4 | Mission 1, перемещение самолёта                            | [сценарий](../validation/replay-aiolos-fighter-s60.json)                     |
| Pocket Baseball 2 (S60)                 |   4 | Игровое поле, действие бэттера кнопкой 5                   | [сценарий](../validation/replay-pocket-baseball2-s60.json)                   |
| World League 2005 Soccer (S60)          |   4 | Practice, перемещение и действия на поле; ограничения меню | [сценарий](../validation/replay-world-league-2005-soccer-s60.json)           |
| World League 2005 Soccer Demo (S60)     |   4 | Practice; New Game закрыт исходным демо                    | [сценарий](../validation/replay-world-league-2005-soccer-demo-s60.json)      |
| Bounce! Rubberball Story (S60)          |   4 | Первый ритмический уровень, два нажатия OK против контроля | [сценарий](../validation/replay-bounce-rubberball-story-s60.json)            |
| Pocket Golf (S60)                       |   4 | Удар, полёт мяча и перемещение камеры                      | [сценарий](../validation/replay-pocket-golf-s60.json)                        |
| Zola (졸라피이터)                       |   2 | Одиночный бой, движение и атаки; START data 1              | [сценарий](../validation/replay-zola.json)                                   |
| Bubble Bobble (LG SD1020)               |   2 | Первый уровень, ввод и пузыри                              | [сценарий](../validation/lg-sd1020-bubble-bobble-replay.json)                |
| Zzayo Zzayo Tycoon (LG SD810)           |   2 | Игровое поле, выбор клеток цифрами                         | [сценарий](../validation/lg-sd810-gameplay.json)                             |
| Sword Master Chronicle (LG SD810)       |   2 | Игровая сцена, движение героя                              | [сценарий](../validation/lg-sd810-gameplay.json)                             |
| TETRIS Classic (LG SD810)               |   2 | Игровое поле, управление фигурой                           | [сценарий](../validation/lg-sd810-gameplay.json)                             |
| Rolling Fry (LG SD810)                  |   2 | Этап запущен, движение по осям                             | [сценарий](../validation/lg-sd810-gameplay.json)                             |
| Shrek 2 (LG SD810)                      |   1 | Игровая сцена, движение и прыжок                           | [сценарий](../validation/lg-sd810-gameplay.json)                             |
| Bubble Bubble                           |   2 | Игровой сценарий работает                                  | [сценарий](../validation/legacy-gameplay.json)                               |
| Com2Us Soccer 2006                      |   4 | Игровой сценарий работает                                  | [сценарий](../validation/desktop-gameplay.json)                              |
| Crow2                                   |   4 | Игровой сценарий работает                                  | [сценарий](../validation/modern-gameplay.json)                               |
| Dungeon Fighter                         |   4 | Игровой сценарий работает                                  | [сценарий](../validation/modern-gameplay.json)                               |
| English Vocabulary Quiz King (LG SV130) |   2 | Два ответа, переход к третьему вопросу                     | [сценарий](../validation/lg-sv130-vocabulary-quiz-replay.json)               |
| Eska2                                   |   1 | Игровой сценарий работает                                  | [сценарий](../validation/legacy-gameplay.json)                               |
| Fist Of Fury2                           |   4 | Игровой сценарий работает                                  | [сценарий](../validation/modern-gameplay.json)                               |
| Galaga (LG SD1000)                      |   2 | Игровой сценарий работает                                  | [сценарий](../validation/galaga-sd1000-replay.json)                          |
| Gostop W                                |   2 | Игровой сценарий работает                                  | [сценарий](../validation/legacy-gameplay.json)                               |
| Hero                                    |   4 | Игровой сценарий работает                                  | [сценарий](../validation/modern-gameplay.json)                               |
| Independence Day 3D                     |  36 | Игровой сценарий работает                                  | [сценарий](../validation/swerve-gameplay.json)                               |
| Major2007                               |   4 | Игровой сценарий работает                                  | [сценарий](../validation/desktop-gameplay.json)                              |
| Marineblues                             |   4 | Игровой сценарий работает                                  | [сценарий](../validation/desktop-gameplay.json)                              |
| Mini Game2- Qvga                        |   4 | Игровой сценарий работает                                  | [сценарий](../validation/desktop-gameplay.json)                              |
| Mosquito                                |   2 | Рабочий режим утилиты                                      | [сценарий](../validation/legacy-gameplay.json)                               |
| Mu - Fairy                              |   2 | Игровой сценарий работает                                  | [сценарий](../validation/legacy-gameplay.json)                               |
| Nom                                     |   2 | Игровой сценарий работает                                  | [сценарий](../validation/legacy-gameplay.json)                               |
| Nom2                                    |   4 | Игровой сценарий работает                                  | [сценарий](../validation/modern-gameplay.json)                               |
| Pocket Pro Baseball3                    |   2 | Игровой сценарий работает                                  | [сценарий](../validation/legacy-gameplay.json)                               |
| Samgugji Hero5                          |   4 | Игровой сценарий работает                                  | [сценарий](../validation/modern-gameplay.json)                               |
| Shing Stone                             |   2 | Игровой сценарий работает                                  | [сценарий](../validation/legacy-gameplay.json)                               |
| Sketcher                                |   4 | Игровой сценарий работает                                  | [сценарий](../validation/desktop-gameplay.json)                              |
| Sketcher .2Inch                         |   4 | Игровой сценарий работает                                  | [сценарий](../validation/desktop-gameplay.json)                              |
| Squash                                  |   4 | Игровой сценарий работает                                  | [сценарий](../validation/desktop-gameplay.json)                              |
| Super Action Hero                       |   4 | Игровой сценарий работает                                  | [сценарий](../validation/modern-gameplay.json)                               |
| Susi Man3                               |   4 | Игровой сценарий работает                                  | [сценарий](../validation/modern-gameplay.json)                               |
| Traffic                                 |   2 | Игровой сценарий работает                                  | [сценарий](../validation/legacy-gameplay.json)                               |
| Virus                                   |   4 | Игровой сценарий работает                                  | [сценарий](../validation/desktop-gameplay.json)                              |
| Viva Soccer2006                         |   4 | Игровой сценарий работает                                  | [сценарий](../validation/desktop-gameplay.json)                              |
| Ys3 The Oath In Felghana                |   2 | Игровой сценарий работает                                  | [сценарий](../validation/legacy-gameplay.json)                               |
| Yulgang2 - 1                            |   4 | Игровой сценарий работает                                  | [сценарий](../validation/modern-gameplay.json)                               |
| Yulgang2 - 2                            |   4 | Игровой сценарий работает                                  | [сценарий](../validation/modern-gameplay.json)                               |
| Yulgang2 - 3                            |   4 | Игровой сценарий работает                                  | [сценарий](../validation/modern-gameplay.json)                               |

## Ввод и воспроизводимость

Пять игр из памяти LG SD810 SXS2V309 проверены с профилем 120×146: Zzayo Zzayo Tycoon (짜요짜요타이쿤), Sword Master Chronicle (소드마스터전기), TETRIS Classic, Rolling Fry (떼굴떼굴후라이) и Shrek 2 (슈렉2). Во всех пяти достигнут игровой режим и проверен ввод относительно запуска без нажатия при одинаковом виртуальном времени; [результаты](../validation/lg-sd810-gameplay.json). Английские названия используются как описательные подписи, исходные названия сохранены в каталоге. Размер 120×146 — проверенный профиль эмулятора; физический LCD телефона — 120×160, область GVM 120×146 также указана в исторической таблице SKT/STI, но трассы инициализации настоящего SD810 пока нет. Два извлечённых музыкальных приложения в игровой каталог не добавлены; [происхождение файлов](../validation/lg-sd810-gvm-evidence.json).

SDK передаёт отпускание как KEYPRESS 0xff в современный 32-битный GNEX v4/v36. Для старого 16-битного режима v1/v2 событие фильтруется. Это установлено по исходному руководству и точному dispatch SDK; [данные проверки](../validation/key-release.json).

То же событие независимо подтверждено в оригинальной Kingston 2.12 и теперь
включено по умолчанию для K-PEX; [трасса прошивки и повтор эталонов](kpex-key-release.md).

В играх с опросом кнопок внутри TIMEOUT мгновенные down/up до одного таймера не равны реальному нажатию. Для Major2007 сохранён сценарий с удержанием на один срок таймера. Тот же принцип применим к ручному вводу: удерживайте кнопку достаточно долго.

Трёхмерный сценарий Independence явно использует ускоренное виртуальное время для вступления; браузерный запуск дополнительно проверен с обычными таймерами. Время кадра ограничено программным ARM-рендерером; [подробности 3D](swerve.md).

Актуальная матрица опирается на SDK-корректную фильтрацию отпускания клавиш. Прогоны с ошибочной передачей FF старым приложениям в доказательства совместимости не включены.

## Дополнения GVM

[Семь сборок Brewgames](brewgames-gvm-games.md) добавляют .hack//SIGN, Ragnarok
Gaiden, Mashimaro Fighting Matgo, Bukbeol, Fresh Fruit Tycoon, альтернативную
сборку Zzayo Zzayo Tycoon и Fantasy Blue. Для каждой проверены одинаковый
префикс и пара с вводом/без ввода; игровые сцены и границы покрытия
перечислены в отчёте.

[Hellfire WI-TOP v1](witop-hellfire-legacy.md) отдельно проверен по исходному
ARM-интерпретатору, движению, огню и сравнению точного/ускоренного исполнения.

## Прошивки

В коллекцию включены 9 оригинальных ROM с проверенными SHA-256. Полный запуск меню и Hell Fire подтверждён на Kingston 2.12. Остальные восемь образов доступны для холодного запуска с экспериментальной совместимостью. Звук полного DAI/DMA-тракта прошивки, USB/SD/RTC и вся периферия не завершены.
