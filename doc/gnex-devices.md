# Устройства и игры Sinjisoft GNEX и GVM

Проверено 5 ноября 2026 года. Поддержка среды выполнения, наличие игры
в заводском меню и доступность её файла проверяются отдельно. Это список
моделей, для которых удалось найти конкретные свидетельства.

Восстановлены также [оригинальные справочники 2002–2003 годов](gvm-historical-handsets.md):
78 таблиц моделей Sinjisoft и 238 строк XLS с явным признаком GVM.
Повторные модели, варианты операторов и отрицательные строки сохранены;
эти числа не означают столько же новых уникальных устройств. Среди точных
профилей есть региональные Nokia TDC-8887/TDC-8587, ранние Hanwha,
Motorola, Curitel, LG и SKY. [Новые проверки дампов SD100 и SD7130](lg-memory-followup.md)
дополняют документацию конкретными байтами прошивок.

Теперь прочитаны все **52 карточки известного архивного реестра GNEX Zone**;
исходные HTML каждой сверены с CDX по SHA-1. [Полные профили и конфликты](gnex-zone-complete-profiles.md)
дополняют таблицу ниже, включая буквальные GVM4X и неоднозначные размеры.
Это весь известный список карточек, а не все когда-либо выпущенные телефоны.
[Новые дампы Prime800 и LG D520](motorola-prime800-lg-d520.md),
[сегменты SCH-X850](samsung-x850-round4.md) и
[нетелефонные платформы MediaOn/HEVM](nonphone-platforms-round4.md)
проверены отдельно; новых игровых SGS в этом проходе не извлечено.

В следующем проходе добавлены [реальные образы Samsung SCH-X120/E300/E470/E560](samsung-early-gvm-followup.md)
и [Sanyo SCP-A011 K2 V2000](sanyo-nokia-korean-gvm.md). У этих пяти семейств
проверены собственные компоненты GVM; версия среды и геометрия сверяются
с отдельными историческими источниками. Руководство [Curitel C-500](curitel-c500.md)
устанавливает название встроенной Magic Ball, но её игровой файл ещё нужен.
У Nokia 8887 инструкция называет Snake II; формат встроенной игры этим не установлен.

[Восстановленная таблица PowerPoint](gvm-early-service-guides.md) содержит ещё
26 датированных строк GVM2X, из которых 9 отмечены как планируемые. Точная
модель Hyundai Curitel DD-101 независимо подтверждена таблицей SKT и
современными ей публикациями; она не объединяется с DD-100 или DD-X10.
[LG SV400](lg-sv400-games.md) содержит проверенный исполнением маршрут выбора
игрока GNEX для SGS; установленный интерпретатор пока не подтверждён.
Пять извлечённых native PXO учитываются
отдельно. [Samsung YM-PD1L](yepp-formatting-resources.md) имеет две игры по
руководству, однако связь с GNEX/XEOVIA ещё не установлена.

## Устройства с документацией GNEX и GVM

[Сверка покрытия следующих целей](gnex-firmware-coverage.md) сохраняет
пробелы по Hanwha, Motorola, Curitel, VK и Nokia, условные/переименованные
строки. [Основные образы LG](lg-main-images.md) дополняют поиск в WDB/PXO.

| Устройство                                                 | Свидетельство                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Что известно об играх                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cenix GMP-M6                                               | Sinjisoft объявила поставку GNEX для этой модели 21 февраля 2006 года. [Релиз](https://www.newswire.co.kr/newsRead.php?no=125649)                                                                                                                                                                                                                                                                                                                                                                                      | Battle Armor и Star Fighter были предустановлены на экземпляре Cenix 2 ГБ. [Отчёт владельца](https://pocketg.blog.fc2.com/blog-entry-217.html)                                                                                                                                                                                                                                            |
| Oracom UB-880, UB-890, UB-950, UB-950M                     | В ROM каждого официального обновления есть `GAMEKIND_SINJI_BUILTIN`, `GNEX EXCEPTION` и `Invalid GNEX Version`.                                                                                                                                                                                                                                                                                                                                                                                                        | Из FNT всех четырёх извлечён Aiolos. Получены два уникальных SGS v4. [Образы и смещения](#oracom-игра-в-официальных-обновлениях)                                                                                                                                                                                                                                                          |
| MyRacer MF101, семейство MG22                              | Для MF101 найдены профиль Sinjisoft 320×240 и оригинальный ARM-загрузчик XGN в обновлении 2008 года. MG22 на 2 ГБ назван вариантом того же аппарата в опубликованном ответе производителя. [Исследование, стр. 11](https://dcollection.korea.ac.kr/srch/srchDetail/000000021966), [переписка, сообщение 17](https://pyra-handheld.com/boards/threads/myracer-mf-101.89993/)                                                                                                                                            | Все пять XGN с диска декодированы в SGS v4. Две игры подтверждены с управлением в Reunion. [Разбор файлов](phone-firmware-games.md#myracer-mf101-и-игры-с-комплектного-диска)                                                                                                                                                                                                             |
| Westrend WF101                                             | Французский каталог связывает WF101 с My Racer и описывает мобильные игры и Flash. Образ для проверки GNEX этой версии ещё не найден. [Карточка Westrend](https://web.archive.org/web/20080531163605id_/http://www.westrend.fr:80/FR_Products_Detail.asp?ID=147)                                                                                                                                                                                                                                                       | Отдельный комплект игр WF101 ещё не получен.                                                                                                                                                                                                                                                                                                                                              |
| Kingston K-PEX 100                                         | SGS выполняется оригинальным GNEX-интерпретатором Kingston 2.12. [Разбор прошивок](firmware-games.md)                                                                                                                                                                                                                                                                                                                                                                                                                  | Корейский форум сохранил все шесть имён с фотографии, включая Ikaria. Девять проверенных обновлений ROM не содержали структурно валидных SGS. [Вложения форума](kingston-observed-games.md)                                                                                                                                                                                               |
| SK Teletech SKY IM-2000                                    | GVM / Mobile C, запуск через SKT n.TOP в октябре 2000 года. [TTA Journal, печатная стр. 23](https://tta.or.kr/data/androReport/ttaJnal/JTGHBY_2002_s82_20.pdf)                                                                                                                                                                                                                                                                                                                                                         | В руководстве перечислены восемь встроенных игр. Формат их кода и образ памяти ещё не установлены. [Руководства SKY](#игры-в-руководствах-sky)                                                                                                                                                                                                                                            |
| LG CYON CX-300V / CX-300DV                                 | Авторы исследования запускали на телефоне приложение Mobile C/GVM. В тексте указан CX-300V, ссылка LG в сноске ведёт к CX-300DV. Публикация о выпуске подтверждает CX-300DV как вариант для SK Telecom. [Исследование, стр. 25 рукописи](https://citeseerx.ist.psu.edu/document?doi=8118cecf213ca462480d5d350eb1cbdd3dc13fdb&repid=rep1&type=pdf), [анонс](https://www.etnews.com/200108100254)                                                                                                                        | Образ и SGS для этого телефона пока не найдены.                                                                                                                                                                                                                                                                                                                                           |
| LG Cyber-5000 и Power-5000                                 | В публикациях об анонсе указана встроенная GVM и поддержка игр онлайн и офлайн. [KBench](https://kbench.com/?q=node%2F10258), [ETNews](https://m.etnews.com/200107110211)                                                                                                                                                                                                                                                                                                                                              | Названия игр в этих публикациях отсутствуют.                                                                                                                                                                                                                                                                                                                                              |
| Motorola V67 и Motorola 62                                 | В анонсах 2001 года прямо названа GVM для загрузок через n.TOP. Motorola 62 выпускала Appeal Telecom. [V67](https://www.inews24.com/view/34722), [Motorola 62](https://www.inews24.com/view/43817), [производитель](https://inews24.com/view/46602)                                                                                                                                                                                                                                                                    | Прошивки и SGS этих моделей пока не найдены.                                                                                                                                                                                                                                                                                                                                              |
| Motorola MS800                                             | В инструкции владельца для 49.11.36 GNEX SGS и SKVM JAR показаны отдельно. [Версия прошивки](https://ferralee.tistory.com/43), [игра и файлы](https://ferralee.tistory.com/46)                                                                                                                                                                                                                                                                                                                                         | На снимке **삼국지영웅전5**, `0053541897.SGS`, рядом `.mod` и `.wmr`. В Reunion сохранена другая сборка той же игры под именем `0053794639.SGS`.                                                                                                                                                                                                                                          |
| Samsung SCH-X130, SCH-X430SV, SCH-X700W, SCH-V300          | Руководства описывают загрузку GVM-игр. [X130, стр. 90–91](https://manualzilla.com/doc/6842499/samsung-sch-x130-user-manual), [X430SV](https://samsung.manymanuals.de/unknown/sch-x430sv/user-manual-3635/49), [X700W, стр. 80–82](https://samsung.manymanuals.com/unknown/sch-x700w/user-manual-14812/41), [V300, стр. 93–94](https://samsung.manymanuals-pt.com/unknown/SCH-V300/user-manual-48431/48)                                                                                                               | В том же руководстве X130, стр. 45–46, встроенными названы Push Push, Music Clip и 4×4. Формат этих трёх игр неизвестен.                                                                                                                                                                                                                                                                  |
| Samsung 624 и 824, Orange Israel                           | Оператор объявил сервис GVM obox для Samsung. Sinjisoft называет его версию GVM 2.5X. [White Paper, стр. 5](gnex-sdk-research.md#материалы-sinjisoft-2003-года) Для 824 сохранились отчёты об использовании прошивки T100 с obox и архивная WML-страница загрузчика GVM. [Partner, SEC](https://www.sec.gov/Archives/edgar/vprr/0203/02036533.pdf), [Ynet](https://www.ynet.co.il/articles/0%2C7340%2CL-1952316%2C00.html), [ветка GameDev.net](https://gamedev.net/forums/topic/145971-gvm-games-for-mobile-devices/) | Ветка T100.org называет израильскую сборку `T10JHVJ1` и перечисляет игры с CPID/GID. Бинарник этой сборки ещё в розыске. [T100.org](https://web.archive.org/web/20030717040451id_/http://www.t100.org:80/modules.php?name=Forums&file=viewtopic&t=1063&start=0&postdays=0&postorder=asc&highlight=)                                                                                       |
| Samsung SCH-E350, SCH-X850, SKY IM-6400, LG SV130 и SV9140 | Справочник Sinjisoft называет эти модели в таблицах аппаратного ускорения графических функций Mobile C. [Mobile C API, ClearPartialRGB и SaveLCD](https://cfile209.uf.daum.net/attach/165521104A3E87994E43CC)                                                                                                                                                                                                                                                                                                          | Push-Push III описана как штатная игра SCH-X850. ZIO 3D Gunner выпускалась как загрузка NATE для IM-6400 и прямо указана как GVM. [Руководство X850, стр. 134–135](https://manualzz.com/doc/4262613/samsung-sch-x850ly-user-manual), [запуск 3D Gunner](https://inews24.com/view/104053)                                                                                                  |
| Samsung SCH-W420, Pantech SKY IM-R300                      | Sinjisoft описывает разную последовательность событий двойного нажатия этих моделей в Mobile C Programming Guide, PDF стр. 85. В DAT W420 CD16 найдены MIME-тип SGS и строки GVM. [GNEX SDK 2.12](https://archive.org/details/gnex_sdk_v2.12), [разбор W420](phone-firmware-games.md#samsung-sch-w420-cd16)                                                                                                                                                                                                            | W420 имеет отдельные ARM Thumb-приложения в формате EADS. Соответствие конкретным мини-играм меню ещё не установлено. Pantech заявляла Gomoku и Othello во время видеозвонков на IM-R300. [Samsung, стр. 77–79](https://manualzz.com/doc/50008698/samsung-sch-w420-%EC%82%AC%EC%9A%A9%EC%9E%90-%EB%A7%A4%EB%89%B4%EC%96%BC), [Pantech](https://www.newswire.co.kr/newsRead.php?no=343205) |
| SK Teletech SKY IM-5000                                    | В частичном дампе S0121308 сохранились `SKA_MainGVM`, `SKY/SYS/GVM.SKY` и шаблон `%s/%d.sgs`. [Архив образа](https://archive.org/download/im-s-550-s/IM-5000.zip)                                                                                                                                                                                                                                                                                                                                                      | В проверенном фрагменте SGS не извлечены.                                                                                                                                                                                                                                                                                                                                                 |
| Pantech & Curitel PH-S5700                                 | На печатной стр. 176 руководства экран памяти ⓜPLAYON показывает отдельные разделы GVM и SKVM. [Руководство, PDF стр. 90](https://pfile.imholic.com:2822/Pantech/%ED%94%BC%EC%B2%98%ED%8F%B0_%EB%93%9C%EB%9D%BC%EC%9D%B4%EB%B2%84%EC%99%80_%EB%8D%B0%EC%9D%B4%ED%84%B0%EB%A7%A4%EB%8B%88%EC%A0%80/PH-S5700/PH-S5700_Manual.pdf#page=90)                                                                                                                                                                                | Дамп модели и игровые файлы ещё в розыске.                                                                                                                                                                                                                                                                                                                                                |
| Samsung SCH-G100, LG CYON SV360                            | Independence Day на GNEX выпустили для обеих моделей через SKT GXG. В JTAG-дампе SV360 есть MIME `application/x-gnex-sgs`. [Анонс 2005 года](https://www.etnews.com/200506280132), [проверка дампа](phone-firmware-games.md#дампы-lg-sv130-и-sv360)                                                                                                                                                                                                                                                                    | Capcom выпустила Resident Evil Director’s Cut для SCH-G100 и SPH-G1000. Формат кода Capcom ещё проверяется отдельно. [Релиз Capcom](https://www.capcom.co.jp/ir/english/news/pdf/e050615.pdf)                                                                                                                                                                                             |

В обзоре 2004 года приведён список телефонов для скачиваемой **Formula
Championship** от Com2uS в SKT с требованиями GNEX и GIGA. Это Samsung
SCH-E350 и SCH-X850, SKY IM-6400 и девять обозначений LG — SV130, SV140,
SV9140, SD330, SD310, SV510, SV520, SD230, SD9230. Название SV140 также
есть в дорелизном обзоре iNews24 и в отраслевой заметке о линейке LG и TI.
Отдельный серийный образ SV140 пока неизвестен. Версия для KTF вышла как
BMW Formula. [GameDonga](https://game.donga.com/21244/),
[iNews24](https://m.inews24.com/v/104352),
[RCR Wireless](https://www.rcrwireless.com/20030714/archived-articles/chip-company-announcements-continue).

Продажи **Samsung 824** с сервисом obox подтверждает израильская пресса
2002 года. Публикации о расширении сервиса отдельно называют Java/J2ME
на 824. Снимок `wap.typhone.com` сохраняет WML-страницу NightWing с
командой `Device:gvm/Multimedia.GameRun` и идентификаторами CPID/GID.
Сохранённая страница содержит инструкцию для телефона, а полезная нагрузка
игры выдавалась отдельно. [Кампания Orange](https://www.ynet.co.il/articles/0%2C7340%2CL-2316913%2C00.html),
[расширение obox](https://finance.walla.co.il/item/300557),
[снимок Typhone](https://web.archive.org/web/20030608215953id_/http://wap.typhone.com:80/).

SDK 2.12 также содержит эмуляционные профили Samsung SCH-E200, SCH-V330,
SCH-X270 и Pantech PG-S1200. Для E200 и V330 среда GVM подтверждена
бинарниками. Для X270 и PG-S1200 серийные прошивки ещё в розыске.
В том же SDK профиль Myracer задаёт игровой экран 320×240,
`AudioType=36` и `FreeMemSize=0x0f0000`. Он дополняет независимые
данные о GNEX на MF101 и структуру файлов с комплектного диска.
[Содержимое SDK](gnex-sdk-research.md),
[реестр XGN](../validation/myracer-mf101-xgn-evidence.json).

## Карточки телефонов GNEX Zone

В индексе Wayback сохранились **52 отдельных адреса карточек** из
лаборатории Sinjisoft за 2004–2005 годы. Это разделы Samsung, LG, Motorola,
Pantech & Curitel, SK Teletech, VK и Hanwha. Карточки различают физический
дисплей и область, доступную скриптам. В реестре версия VM и размеры
указаны только для открытых и прочитанных снимков. Для остальных сохранены
сами архивные адреса. [Анонс лаборатории](https://www.etnews.com/200406300157),
[реестр карточек](../validation/gnex-zone-handsets.json).

| Телефон                                                                                                                      | Версия VM          | Дисплей | Область VM |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------: | ---------: |
| [LG SD1100](https://web.archive.org/web/20041019110549id_/http://www.gnexclub.com:80/zone/htm/lg_p/lg-sd1100.htm)            | GVM2X              | 120×160 |    120×146 |
| [Hanwha CS-M210](https://web.archive.org/web/20040811210257id_/http://www.gnexclub.com/zone/htm/hw_p/cs-m210.htm)            | GVM2X              | 120×160 |    120×144 |
| [LG SD330](https://web.archive.org/web/20050214012958/http://www.gnexclub.com/zone/htm/lg_p/lg-sd330.htm)                    | GNEX               | 176×220 |    176×204 |
| [LG SD9230](https://web.archive.org/web/20040811212148id_/http://www.gnexclub.com:80/zone/htm/lg_p/lg-sd9230.htm)            | GNEX               | 120×160 |    120×146 |
| [LG SV130](https://web.archive.org/web/20041209135210/http://www.gnexclub.com/zone/htm/lg_p/lg-sv130.htm)                    | GNEX (GIGA)        | 176×220 |    176×204 |
| [LG SV510](https://web.archive.org/web/20041209135949id_/http://www.gnexclub.com:80/zone/htm/lg_p/lg-sv510.htm)              | GNEX               | 176×220 |    176×203 |
| [LG SV9120](https://web.archive.org/web/20040811213047/http://www.gnexclub.com/zone/htm/lg_p/lg-sv9120.htm)                  | GVM2X              | 120×160 |    120×146 |
| [Motorola MS100](https://web.archive.org/web/20040811213417id_/http://www.gnexclub.com/zone/htm/moto_p/ms100.htm)            | GVM2X              | 128×160 |    128×145 |
| [Motorola MS300](https://web.archive.org/web/20041214204829id_/http://www.gnexclub.com/zone/htm/moto_p/ms300.htm)            | GNEX               | 128×160 |    128×145 |
| [Motorola MS400](https://web.archive.org/web/20050214012411id_/http://www.gnexclub.com/zone/htm/moto_p/ms400.htm)            | GNEX GIGA          | 128×160 |    128×145 |
| [Pantech & Curitel P1](https://web.archive.org/web/20041015175320id_/http://www.gnexclub.com/zone/htm/pq_p/p1.htm)           | GNEX               | 220×176 |    220×160 |
| [Pantech & Curitel S4](https://web.archive.org/web/20041015180810id_/http://www.gnexclub.com/zone/htm/pq_p/s4.htm)           | GVM4X, SCRIPTVER 2 | 240×320 |    240×294 |
| [VK-200C](https://web.archive.org/web/20040811210507id_/http://www.gnexclub.com/zone/htm/vk_p/vk-200c.htm)                   | GNEX               | 176×220 |    176×205 |
| [Samsung SCH-V300](https://web.archive.org/web/20040811212839id_/http://www.gnexclub.com:80/zone/htm/samsung_p/SCH-V300.htm) | GVM2X              | 176×192 |    128×146 |
| [SKY IM-7100](https://web.archive.org/web/20040811213453id_/http://www.gnexclub.com:80/zone/htm/sk_p/im-7100.htm)            | GNEX               | 240×320 |    120×160 |
| [SKY IM-7300](https://web.archive.org/web/20040811205819id_/http://www.gnexclub.com:80/zone/htm/sk_p/im-7300.htm)            | GNEX               | 176×220 |    176×202 |

Для трёх карточек CS-M210, MS400 и VK-200C SHA-1 прочитанного HTML
совпал с индексом CDX. Карточка CS-M210 задаёт SCRIPTVER 2, Sliding
и MA2. У MS400 указаны WIPI 1.2 и MA5, у VK-200C — WITOP и MA5.
[Хеши и параметры](../validation/gnex-oem-card-evidence.json).

Ещё три прочитанные карточки MS300, P1 и S4 также совпали с CDX по SHA-1.
MS300 задаёт IMAGETYPE 5 / compressed 4, MA5 и WIPI. P1 задаёт
IMAGETYPE 12 / compressed 8, MA5 и WIPI 1.2. В карточке S4 прямо написано
`GVM4X`, SCRIPTVER 2 и Sliding; там же указаны IMAGETYPE 12 / compressed 8,
MA5 и WIPI 1.2. Это буквальные параметры источника, без переименования
GVM4X в GNEX. Названия моделей уже были в архивном реестре; новые данные
подтверждают содержимое карточек. Прошивки и игровые файлы этих трёх
телефонов пока не получены.
[Оригинальный текст, хеши и параметры](../validation/gnex-additional-zone-cards.json).

На фотографиях MS400 из обзора 2005 года видны титулы
`보글보글 동자승` и `AIR HAWK` с адресом `www.muncle.com`.
Их контейнеры и связь с игровым API пока не восстановлены.
[Обзор и оригинальные фотографии](https://kbench.com/?page=2&q=node/26653).

Карточка SD1100 прямо указывает GVM2X, IMAGETYPE 12 / compressed 8,
MA3 с совместимостью MA2. При AUDIOTYPE 32 автор отдельно предупреждает,
что `GetHwConfig()` на телефоне возвращает 36. Эти значения сохранены
раздельно. В обзоре Cetizen от 30 мая 2002 года предустановками названы
X-Ship и 뾰숑; в двух образах SD1100 найдены X-Ship и английская метка
Poshong. Формат этих встроенных игр пока не установлен.
[Оригинальные карточка, обзор и сверка ROM](../validation/gnex-lg-sky-card-followup.json).

В обзоре IM-5300 от 23 ноября 2002 года названы Brain Force и SKY Soccer,
с прямым сравнением с IM-5400. Обзор LG SD350 называет 사나칸 и 3D 레이스.
Это уточнения состава игровых меню, не доказательство формата SGS.
[Первичные обзоры и ограничения](../validation/gnex-lg-sky-card-followup.json).

## Oracom. Игра в официальных обновлениях

Пакеты восстановлены из архива сайта производителя. SHA-1 каждого ZIP
совпал с CDX Wayback, CRC файлов внутри проверены. В ROM UB-880, UB-890
и UB-950 есть строки USB-драйвера Telechips TCC760. В ROM пакета UB-950M
есть метки драйвера TCC82xx и внутренняя метка `[UB-892]`. Название
UB-950M взято из имени официального пакета и его компонентов.

| Модель и версия                                                                                                                                               | Компонент      | Смещение SGS |   Байты |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -----------: | ------: |
| [UB-880 1.06](https://web.archive.org/web/20150927085458id_/http://oracom.co.kr/data/fashion/bbs_data/bbs_upgrade/00000043/06_11_04_UB880FW4Dom.zip)          | `FontData.FNT` |   `0x4cdbb8` | 929 830 |
| [UB-890 1.16](https://web.archive.org/web/20150927024446id_/http://oracom.co.kr/data/fashion/bbs_data/bbs_upgrade/00000034/08_08_06_UB890FW%28Ver1.16%29.zip) | `FontData.FNT` |   `0x51c1ac` | 930 650 |
| [UB-950 1.16](https://web.archive.org/web/20150927033401id_/http://oracom.co.kr/data/fashion/bbs_data/bbs_upgrade/00000041/08_08_06_UB950FW%28Ver1.16%29.zip) | `FontData.FNT` |   `0x51c1ac` | 930 650 |
| [UB-950M 1.04](https://web.archive.org/web/20150927031206id_/http://oracom.co.kr/data/fashion/bbs_data/bbs_upgrade/00000051/09_02_26_UB950M_Ver1.04.zip)      | `UB950M.FNT`   |   `0x51c1ac` | 930 650 |

В обоих файлах заголовок SGS v4 открыт, без XOR и внешнего префикса.
Длина и границы секций совпадают с заголовком, в каждой сборке 267
переменных и 415 ресурсов. Три последние модели используют один и тот
же игровой файл. Обе сборки отличаются от версий из SDK и Symbian.
Обе сборки дошли до первого уровня в Reunion с оригинальным
интерпретатором Kingston 2.12. Проверены движение, стрельба и изменение
счёта. В профиле импорта 176×220 ускоренный и эталонный режимы дали
одинаковые контрольные кадры. После заставки → открывает меню,
а Q подтверждает выбор и стреляет. Часть текста пролога обрезана.
Полное прохождение и сохранения не проверялись.
[Хеши и результаты прогона](../validation/oracom-gnex-extractions.json).

Ещё 15 официальных пакетов Oracom проверены по CDX SHA-1 и ZIP CRC.
В 94 файлах не найдено SGS известных версий или длинных сигнатур GNEX и XEOVIA.
В W30 и Super AMI 1.22 есть метки `3D CUBIC` и `cubic.dat`. Формат этой
игры пока неизвестен. ROM W30 и Super AMI совпадает с ранее проверенным A10.
[Реестр пакетов](../validation/gnex-firmware-followup.json).

## Корейские телефоны с подтверждением по бинарникам

Следующие образцы содержат функции GVM, пути её файлового хранилища
или сообщения самой VM. Для части моделей доступны только фрагменты.
Смещения указаны от начала каждого файла.

| Модели                                                                                            | Прямое свидетельство                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LG CYON SD810                                                                                     | В самом SXS2V309 есть модель, сборка, пути GVM и SGS MIME. Из страниц памяти восстановлены 5 игр и 2 музыкальных SGS v1/v2. [Извлечение и управление](lg-sd810.md)                                                                                                                                                                                                                       |
| Samsung SCH-E170, SCH-E250, SCH-V450, SCH-X290, SCH-X420, SCH-X570                                | В восьми образах присутствуют внутренние обозначения соответствующих моделей, GVM1X и пути nvm/gvm; в V450 также GvmMain.c. Целые SGS не извлечены. [Хеши, источники и смещения](../validation/samsung-six-gvm-evidence.json)                                                                                                                                                            |
| SKY IM-2400, IM-3100, IM-5100, IM-5400, IM-6100                                                   | `n.TOP GVM` в IM-2400, `SKA_MainGVM` и `SKY/SYS/GVM.SKY` в IM-3100 и IM-5100, `/skp/c/GVM/` в IM-5400 и IM-6100. [Коллекция образов SKY](https://archive.org/details/im-s-550-s)                                                                                                                                                                                                         |
| SKY IM-6500 S0129150, IM-7200 S0134127                                                            | GVM и GNEX в одном образе. В IM-6500 `/fs/GNEX/system/` на 9 229 180, `GNEX EXCEPTION` на 9 242 424. В IM-7200 те же строки на 5 396 556 и 5 410 376. [IM-6500](https://archive.org/download/im-s-550-s/IM-6500.zip/IM-6500/IM6500_S0129150_usa.7z), [IM-7200](https://archive.org/download/im-s-550-s/IM-7200.zip/IM-7200/7200_16mb_S0134127%20%28Korean%29.7z)                         |
| SKY IM-U220 S0168173, IM-S330 S0174124a, IM-S350 S0175156                                         | После декодирования оригинальных BINX во всех трёх PDL есть внутренние имя модели, версия, MIME `application/x-gnex-sgs` и метки Sinjisoft. [Формат, образы и смещения](phone-firmware-games.md#декодирование-sky-binx)                                                                                                                                                                  |
| SKY IM-S390 S0177154, IM-S480S S0183142, IM-S550S S0188161, IM-S640S S0202126a, IM-U490S S0184128 | Подтверждены модель, сборка, GNEX MIME и Sinjisoft во всех пяти образах. S390 содержит открытый PDL, остальные распакованы из BINX с проверкой 4 500 ZIP CRC. Из RSC S390 извлечена Cube Cube в WIPI DAF. [Хеши и смещения](../validation/sky-additional-firmware-evidence.json), [игровые ресурсы](phone-firmware-games.md#ресурсы-sky-и-cube-cube)                                     |
| SKY IM-U580S S0191130a                                                                            | GNEX MIME и Sinjisoft в декодированном PDL. Из RSC извлечены четыре WIPI DAF, включая другую сборку Level Up 2. [Образ и хеши](../validation/sky-u580-ktf-firmware-evidence.json)                                                                                                                                                                                                        |
| Samsung SCH-V300, SCH-X600, SCH-X700, SCH-X720, SCH-X750, SCH-X800                                | Строки `GVM1X`, `nvm/gvm`, имена модулей VM и отдельные ресурсы Java. Частичный X750 содержит `/skp/c/GVM/`, `/skp/c/SKVM/`, MIME `application/x-gvm-sgs` и `application/x-skvm-jar`. [Коллекция Samsung](https://archive.org/details/gt-b-7722_20250528), [образ X750](https://archive.org/download/gt-b-7722_20250528/SCH-X750.zip)                                                    |
| Samsung SCH-E100, SCH-E110, SCH-E120, SCH-E140, SCH-X460                                          | Метки `GVM1X` и `nvm/gvm` с внутренним именем каждой модели. Для E120 доступен локализованный образ `e120rus.bin`. [Образы, хеши и смещения](../validation/samsung-gvm-inventory-evidence.json)                                                                                                                                                                                          |
| Samsung SCH-X210                                                                                  | В `X210UH22.bin` сохранились экран `n.TOP GVM` и сообщения загрузки и удаления. Руководство на печатных стр. 88–89 описывает запуск и хранение до трёх игр GVM. [Руководство Samsung](https://downloadcenter.samsung.com/content/UM/200311/20031104165253656_sch-x210.zip), [образ и смещения](../validation/samsung-gvm-inventory-evidence.json)                                        |
| Samsung SCH-E200, SCH-V330, SCH-E370, SCH-E380                                                    | `GVM1X` в каждом образе. Метка `GvmMain.c` в E200 и V330, `GvmRam.c` и `GvmRom.c` в E200. В E380 раздельные пути `/skp/c/GVM/` и `/skp/c/SKVM/`. [Коллекция Samsung](https://archive.org/details/gt-b-7722_20250528)                                                                                                                                                                     |
| Samsung SCH-V490, SCH-V540, SCH-X590, SCH-X780                                                    | В пяти образах найдены `GvmMain.c`, `GvmRom.c`, `GvmRam.c` и `nvm/gvm`. [Дампы, смещения и руководства](phone-firmware-games.md#samsung-sch-v490-v540-x590-и-x780)                                                                                                                                                                                                                       |
| Samsung SCH-E135, SCH-E150, SCH-V310, SCH-X250                                                    | В E135 есть `GVM1X` и `nvm/gvm`, в E150 сохранились отдельный путь GVM и MIME для SGS, в V310 и X250 есть `GvmMain.c`. [Хеши и смещения](../validation/samsung-early-game-firmware.json)                                                                                                                                                                                                 |
| Pantech PH-S1000, PH-S2700                                                                        | Раздельные пути GVM и SKVM. В PH-S1000 MIME `application/x-gvm-sgs` на `0xe32498`. [PH-S1000](https://archive.sunderland93.ru/Firmwares/Pantech/PH-S1000/PH-S1000.7z), [PH-S2700](https://archive.sunderland93.ru/Firmwares/Pantech/PH-S2700/phs2700_memory.7z)                                                                                                                          |
| Curitel S2 и PG-S5500C                                                                            | В двух архивах S2 и двух сборках PG-S5500 найдены пути `/skp/c/GVM/`. Маркировка `PG-S5500C` извлечена из S5.01.22. [S2.00.02](https://archive.sunderland93.ru/Firmwares/Curitel/S2/S2.00.02%20%5BMemory%20dump%5D.7z), [PG-S5500](https://archive.sunderland93.ru/Firmwares/Curitel/PG-S5500/S5.01.22%20%5BMemory%20Dump%5D.7z)                                                         |
| VK Mobile VK100                                                                                   | В 8-МиБ дампе присутствуют модель `VK100`, MIME `application/x-gvm-sgs` и сообщения загрузки GVM. Маркировку VK-100M из карточки GNEX Zone ещё нужно связать с этим образом. [Дамп VK100](https://archive.sunderland93.ru/Firmwares/VK%20Mobile/VK100/VK100_Memdump_FW.7z)                                                                                                               |
| Motorola MS500W 71.11.32                                                                          | В дампе памяти есть `application/x-gnex-sgs` на `0x8a16c0` и `0xcde608`. Сканирование открытых и XOR-контейнеров не нашло валидного SGS. [Дамп](https://archive.sunderland93.ru/Firmwares/Motorola/MS500w/71.11.32%20%5BMemory%20Dump%5D.7z)                                                                                                                                             |
| LG CYON SD840                                                                                     | В 32-МиБ образе восстановлены два музыкальных SGS и один рекламный SGS. Музыкальные приложения проверены в Reunion. [Разбор дампа](phone-firmware-games.md#lg-sd840-и-музыкальные-приложения-gvm)                                                                                                                                                                                        |
| LG CYON SV130                                                                                     | `GNEX EXCEPTION`, `/fs/GNEX/`, `application/x-gvm-sgs` и `/skp/c/GVM/` в одном образе. Восстановлена игра English Vocabulary Quiz King в SGS v2. [Разбор дампа](phone-firmware-games.md#дампы-lg-sv130-и-sv360)                                                                                                                                                                          |
| LG CYON SD1000, SD1100, SD200                                                                     | На SD1000 из файловой системы GVM2X извлечена Galaga SGS v2. SD1100 содержит `GVM1X` и `/gvm2x_%03d`, SD200 содержит отдельные пути GVM, SKVM и WIPI-C. [SD1000](phone-firmware-games.md#lg-sd1000-galaga-из-памяти-телефона), [SD1100](https://archive.sunderland93.ru/Firmwares/LG/SD1100/SD110I42.7z), [SD200](https://archive.sunderland93.ru/Firmwares/LG/SD200/SX40W339_memory.7z) |
| LG CYON SD1020, SD1250                                                                            | Из GVM2X на SD1020 извлечён SGS v2 Bubble Bobble. В образе SD1250 найден SGS v1 Ladder. [Разбор двух дампов](phone-firmware-games.md#lg-sd1020-и-sd1250-bubble-bobble-и-ladder)                                                                                                                                                                                                          |
| LG CYON SD910                                                                                     | В ROM указана GNEX `036.015.000`. В EFS2 найден SGS v4 с другой сборкой 2007 Pro Baseball. [Разбор SD910](phone-firmware-games.md#lg-sd910-другая-сборка-2007-pro-baseball)                                                                                                                                                                                                              |

В двух образах **SCH-X350** есть Java-класс `com/xce/jam/Gvm/GVMChatForm`.
Руководство описывает GVM-чат на печатной стр. 91. Совместимость
с Mobile C и SGS для этой модели остаётся открытой.
[Руководство Samsung](https://downloadcenter.samsung.com/content/UM/200311/20031104170151968_SCH-X350.zip).

В новых дампах VK100, Curitel и NaTruca отдельно проверены непрерывные
SGS и игровые записи EFS по структуре, подтверждённой на LG SD1000.
В этом наборе игр пока не извлечено. Архив с именем VK200 содержит
проект WaveCom и нативные игровые символы. Его связь с карточкой
VK-200C остаётся открытой. [Хеши и границы проверки](../validation/gnex-other-oem-evidence.json).

В девяти проверенных образах SKY и восьми Samsung SGS известных версий
в открытом виде или с XOR `0xa5` не найдено. Для IM-7300 проверен
`B22.skd`. Он и два образа семейства IM-7200 имеют общие
16-байтные блоки по смещениям `0x10–0x5f`. Внутренний идентификатор
B22 и способ декодирования ещё не установлены. AES в утилите
IM-6400 Data Manager используется для её файлов `*.enc`. Его связь
с форматом SKD остаётся открытой. Оригинальный ASTool SK-5000 помог
разобрать более ранние открытые SKD v1. В двух образцах заголовок
на 128 байт, два раздела и конечная таблица сходятся до конца файла.
[ASTool SK-5000](https://archive.sunderland93.ru/Programs%20and%20Utilities/SKY/Firmware%20Flashing/AStool/ASTool%20%28SK-5000%29.7z).
Проверен обычный SCH-X700. SCH-X700W отдельно фигурирует в руководстве.
В X720 отдельно учтены два разных образа UB12.
[Машинный реестр образов](../validation/gnex-device-firmware-evidence.json).

В следующем проходе проверены ещё шесть образов Samsung и Pantech и восемь
образов и фрагментов SKY. SGS известных версий не обнаружены. Альтернативная
сборка IM-6500 S0129143 подтверждает GNEX на тех же смещениях, что S0129150.
У SK-5000, SK-5000 Advance, SK-5100 и SK-5400 есть `SKA_MainGVM` и
пространство имён Java `com/xce/jam/Gvm`. Совместимость их GVM с SGS
остаётся открытой. [Хеши и смещения](../validation/gnex-firmware-followup.json).

У **IM-7200** уцелела запись `skp/c/GVM/1/1.inf` на смещении 9 765 917.
Она называет приложение **슈렉선물세트** (подарочный набор «Шрек»),
издателя **(주)보보스컴퍼니**, ID `3431910002` и тип `GVM`.
При повторной проверке найден заголовок страницы `0x005b` перед
записью `1.inf`. Страницу с именем `1.sgs` в образе найти не удалось.
В ней указан исходный адрес `http://wipi.nate.com:5100/EXE/34319/1000202FF0C04FF.SGS`.
Индексы Wayback и Arquivo.pt не вернули снимка этого адреса и варианта
без порта. Назначение приложения и наличие полного SGS в памяти пока
не установлены.

Поддержку **GXG** на **SKY IM-8300**, **Samsung SCH-G100** и **LG SV-360**
подтверждает оператор SKT. Тестировщик IM-8300 в мае 2005 года описал
запуск скачанной GNEX-игры `신고스톱2005`. В другом обзоре указаны штатные
MotoGP II и The Punisher. Дамп IM-8300 пока не получен, и формат
этих двух предустановок требует отдельной проверки. [Анонс SKT](https://www.sktelecom.com/en/press/press_detail.do?currentPage=1&idx=669),
[отзыв тестировщика](https://gall.dcinside.com/board/view/?id=cellularphone&no=8916),
[обзор IM-8300](https://footoo.com/62).

### Игры в руководствах SKY

Архив imholic сохранил официальные документы до закрытия сайта поддержки
Pantech в 2019 году. Названия ниже сверены по страницам оригинальных PDF.
Руководства устанавливают состав меню. Форматы исполняемых файлов и
авторство Sinjisoft по ним не определяются. [Архив imholic](https://imholic.com/wordpress/?p=309).

| Модель             | Игры в руководстве                                                                                                                                                                                | Страницы PDF |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| IM-2000 / IM-2000T | 프리덤파이터 (Freedom Fighter), 비틀랠리 (Beetle Rally), 아파치특공대 (Apache Commando), 남극탐험 (Antarctic Adventure), 문패트롤 (Moon Patrol), 삼트리스 (Samtris), 두더지 (Mole), 퍼즐 (Puzzle) | 81–84        |
| IM-6400            | Brain Force, Slime Hunter                                                                                                                                                                         | 165, 167     |
| IM-7100            | Brain Force, PUZ BUZ                                                                                                                                                                              | 171, 173     |
| IM-8300            | MOTO GP2, THE PUNISHER                                                                                                                                                                            | 157, 160     |

## Symbian S60

Sinjisoft в 2005 году запустила через Handango GNEX-игры, устанавливавшиеся
как приложения Symbian. Современный выпуску каталог относит Aiolos к
Series 60 на Symbian OS 6–8. Во вьетнамской теме 2005 года для игры
перечислены Nokia 3230, 3660, 6600, 6630, 6680, 7610, N-Gage и N-Gage QD.
Это список совместимости игры. Связь с заводским образом телефона
по нему установить нельзя.
[Сообщение о запуске](https://www.etnews.com/200507200074),
[карточка HPC.ru](https://hpc.ru/soft/software.phtml?id=12032),
[форум GSM.vn](https://gsm.vn/archive/threads/new-games-2005.8592/page-98).

Три сторонних пакета SIS 1.03 получены из коллекции 2010 года, ещё два
получены из сохранённого каталога Dertz в Internet Archive. В архивах
сохранились репаки. В каждом SIS проверен CRC контейнера.
Из записей SIS извлечены E32-приложения и ресурсы. Внутри каждого E32
нашлись строки `Powered by GNEX`, `GNEX EXCEPTION` и непрерывный SGS v4.
Тела SGS вырезаны по длине из заголовка, побайтово. Подлинность каждого
байта относительно оригинального установщика Handango пока не сверена.
[Архив и список файлов](https://www.pc-freak.net/archives/2010/01/22/download_nokia_sis_ultimate_pack_games/index.html),
[каталог Dertz](https://archive.org/details/dertz-part-5-s-z),
[структура SIS](https://thoukydides.github.io/riscos-psifs/sis.html),
[сканер Reunion](../tools/scan-firmware-games.py).

| Игра                            | Приложение, смещение SGS            | Байт в SGS | SHA-256 SGS                                                        |
| ------------------------------- | ----------------------------------- | ---------: | ------------------------------------------------------------------ |
| Aiolos Fighter                  | `Aiolos.app`, `0x431a0`             |    270 080 | `c635f8989ac112a3b1c10aef06e57d5c5b8e3d527fda87caba612798778f006b` |
| Pocket Baseball 2 / 포켓야구2   | `PocketBaseBall.app`, `0x43554`     |    162 384 | `a95c38d561423821bb4f14aec90011ec0deed11015b432731646ff6820719726` |
| Pocket Golf                     | `PocketGolf.app`, `0x43544`         |    326 528 | `38bab3117c4a3f4a9086173ef00427ecef10c0f9f94b6c6101138f396d32010b` |
| World League 2005 Soccer        | `WorldLeague.app`, `0x431b8`        |    172 604 | `439c7c59850dd58b265512a157ae65e67602055e01b2891dc0b3743046a38e08` |
| Bounce! Rubberball Story        | `Bounce.app`, `0x431a0`             |    169 388 | `e646fa49a6cef04971dad124c55bc9506a152a9d1f457e39db9b239c6ed06594` |
| Storm of Silence Demo, SIS 1.00 | `StormOfSilenceDemo.app`, `0x4339c` |    128 690 | `2ba38cd1dca989be5791807f2464f3b5256147b1008e06db75f8aee17eaeb88e` |
| Waterski, SIS 1.00              | `WaterSki.app`, `0x4353c`           |    147 636 | `e063fdb1cbae9ece9f4fcee2f111cfa2c3cf6ed73e2486de4825590d8b586207` |

На титульном экране World League 2005 Soccer указана ZIO Interactive.
Внутри скрипта есть упоминание Sinjisoft.

Размер и хеш каждого SGS отличаются от файлов, уже учтённых в каталоге
Reunion. Версия Aiolos из SDK 2.12 имеет 339 912 байт и отдельный SHA-256
`17334d4f22c9e467aabefeff1ec73123a345a2cb566c1d452e328632bfad28ee`.
Все пять файлов открываются в Reunion с Kingston 2.12 и реагируют на ввод.
Aiolos, Pocket Baseball 2 и Pocket Golf дошли до игрового экрана.
World League и Bounce дошли до интерактивных экранов, где часть элементов
интерфейса пока отображается неполно. На профиле 176×208 получено 125, 14,
17, 16 и 12 уникальных кадров соответственно. Некоторые запросы звука
остались необработанными. В SIS имеются отдельные WAV/MIDI. Полное
прохождение и сохранения не проверялись.

Waterski и Storm of Silence Demo восстановлены из
`s60v2(26684).7z` коллекции Largest J2ME and Symbian Collection.
В веб-просмотрщике архива ранее были видны 3 130 записей, но настоящий
заголовок 7z содержит 26 685. Оба точных имени нашлись при чтении
заголовка по HTTP Range. Для восстановления выбранного solid-блока
потребовалось получить 2 007 905 686 сжатых байт и потоково разобрать
2 346 478 882 распакованных байта. Декодирование закончено полностью,
CRC обоих SIS совпали с заголовком 7z; отдельно проверены UID/body CRC
установщиков и SHA-256 извлечённых файлов.
[Исходный архив](https://archive.org/details/largest-j2me-and-symbian-collection),
[контрольные суммы, смещения и результаты запуска](../validation/sinjisoft-s60-recovery.json).

Оба заголовка SIS указывают версию 1.00. Storm прямо обозначен как
демоверсия. Найденный Waterski поэтому нельзя автоматически считать
ранее упоминавшимся на форуме релизом 1.03. Внутри приложений извлечены
неизменённые SGS v4; сканер выводит для Storm первую строку
`미션 브리핑` («брифинг миссии»), а не название игры.
Первые прогоны давали всего три кадра: эмулятор читал рабочий буфер после
`RestoreLCD`, уже стёршего нарисованные меню и спрайты. Исправление захвата
по `Flush` восстановило изображение без изменения SGS, палитр и графики.
На родном профиле S60 176×208 Storm дал 149 уникальных кадров и дошёл
до тренировки; RIGHT/6 перемещает персонажа с x20 до x84 за восемь сроков
таймера. Waterski дал 78 кадров, дошёл до игры и выполняет прыжок по UP/2.
Для проверки управления созданы 20 независимых запусков с одинаковым
временем и сравнением с бездействием; все завершились без ошибки VM.
Полное прохождение, сохранения и подключение внешних WAV/MIDI не проверены.
Оба SGS включены в обычную библиотеку как **Storm of Silence Demo (S60)**
и **Waterski (S60)** с профилем 176×208. Свежие прогоны обычного replay
подтвердили управление при одинаковом виртуальном времени;
[сводка и точные сценарии](../validation/s60-catalog-gameplay.json).
Reunion исполняет извлечённый SGS своим GNEX-ядром; исходный Symbian APP
и операционная система S60 в браузере не запускаются.
Оригинальные установщики, приложения и ресурсы сохранены отдельно:
[архитектура и комплект S60-рантаймов](s60-runtimes.md).
[Сценарии и контрольные кадры](../validation/sinjisoft-s60-gameplay.json),
[семантика вывода и регрессии](gnex-display.md).

Повторное извлечение содержимого SIS требует Python 3.11+ и не запускает
старые приложения:

```sh
python tools/extract-old-sis.py stormofsilencedemo.sis storm-files
python tools/scan-firmware-games.py storm-files/17-StormOfSilenceDemo.app --extract storm-sgs --output storm-scan.json
python tools/extract-old-sis.py waterski.sis waterski-files
python tools/scan-firmware-games.py waterski-files/15-WaterSki.app --extract waterski-sgs --output waterski-scan.json
```

Повтор управления без добавления SGS в каталог:

```sh
node tools/replay-sgs.mjs --file storm-sgs/sgs-v4-2ba38cd1dca989be.sgs validation/replay-s60-storm.json validation/gameplay/storm-s60
node tools/replay-sgs.mjs --file waterski-sgs/sgs-v4-e063fdb1cbae9ece.sgs validation/replay-s60-waterski.json validation/gameplay/waterski-s60
```

Оба сценария проверены на файлах из готового архива восстановления;
последние PNG побайтово совпали после декодирования RGBA с независимыми
контрольными запусками.
[SHA-256 кадров и исходников](../validation/sinjisoft-s60-cli-replay.json),
[описание CLI](replay.md).

Выходные каталоги SIS должны быть новыми. Инструмент сохраняет плоские
имена, оригинальные полезные данные и JSON-манифест с путями назначения,
языками и хешами. Поддерживаются простые и многоязычные записи EPOC release 6;
условные и другие неподдерживаемые записи отвергаются до записи файлов.
CRC проверяет целостность контейнера, подлинность подписи издателя не заявляется.

Исторические следы прежнего поиска: для Storm найден товар Handango
`174822`; проверенные адреса демоверсии не дали архивного снимка.
Для Waterski 1.03 сохранился адрес Megaupload с кодом `WFHYM9R0`.
[Storm of Silence в iDNES, 14 октября 2005 года](https://www.idnes.cz/mobil/aplikace/ochrante-svet-pred-mimozemstany-ci-si-zalette-ve-vznasedle-hry-do-kapsy-165.A051012_5308940_ostatni),
[Waterski на GSM-Forum](https://forum.gsmhosting.com/vbb/f18/symbian-games-232307/index9.html),
[каталог Sinjisoft на HPC.ru](https://hpc.ru/soft/softlist.phtml?t=dvl&u=4318).

## Прошивки и соседние платформы

- В KTF-образе SKY IM-S240K S0812159 извлечён нативный модуль
  `JumpingPop Game`, 145 143 байта. Его зависимости и полнота игровых
  ресурсов пока неизвестны. В IM-U160K S0807136 есть меню
  `PUZ BUZ` / `JumpingPop` и функции `JumpingPop3Main`,
  `UisJumpingPop_create`. Привязка этих игр к GVM/GNEX остаётся
  открытой. [Байты, исходные образы и смещения](../validation/sky-u580-ktf-firmware-evidence.json).
- Для SCH-W420 восстановлены четыре файла CD16. Все четыре SHA-256
  совпали с профилем ARAM. Из DAT извлечены записи EADS Gamevil Nom 2,
  Bluetooth Janggi и запись со ссылкой на Com2uS. [Разбор образа](phone-firmware-games.md#samsung-sch-w420-cd16).
- Для SCH-X850 доступны два фрагмента дампа. В `X850-retry1.bin`
  найдены `gvmcafe.com` на 2 179 512, `GVM %s` на 2 860 520 и
  `/skp/c/GVM/` на 2 869 088. Строка `Push-Push` присутствует на
  1 206 444. Смещения десятичные. Формат игры и полнота образа ещё
  не установлены. [Архив X850](https://archive.org/download/gt-b-7722_20250528/SCH-X850.zip).
- Два проверенных образа обычного SCH-X430 содержат меню Push Push и
  ресурсы Java-интерфейса. Руководство о загрузке GVM относится к
  SCH-X430SV. Совпадающие маркировки семейства не устанавливают
  совместимость разных вариантов. [Архив X430](https://archive.org/download/gt-b-7722_20250528/SCH-X430.zip),
  [руководство X430SV](https://samsung.manymanuals.de/unknown/sch-x430sv/user-manual-3635/49).
- Для LG SH150A найдено руководство с четырьмя заводскими играми и точное
  имя KDZ SW15A712_00. Для SV510 доступен архив рингтонов MMF,
  а версию VM подтверждает карточка Sinjisoft. Образ памяти SV510
  с играми ещё не найден.
  [LG SH150A](phone-firmware-games.md#lg-cyon-gvm-и-ранние-oem-поставки-sinjisoft),
  [рингтоны SV510](https://3.onj.me/phonetones/unzipped/LG/SV510/).
- На iStation NetForce 2 игры из PrimePACK4 используют COGP/GXGPlayer
  под Windows CE. Для четырёх комплектов проверены MIPS PE и наличие
  внешних ресурсов CRA. Отдельно Sinjisoft сообщала о демонстрациях
  GNEX на WinCE без указания моделей. [Разбор GXG](phone-firmware-games.md#istation-netforce-2-и-cogp),
  [сообщение Sinjisoft о WinCE](https://www.newswire.co.kr/newsRead.php?no=114580).
- Samsung YP-T8 использует XEOVIA и `.XOV`, что подтверждено в образе
  производителя. Штатный Sokoban Emgeton M6 Cult известен из теста устройства.
  Данных о GNEX на Emgeton пока нет.
  [Бинарный разбор YP-T8](phone-firmware-games.md#samsung-yp-t8--xeovia-подтверждена-бинарно),
  [тест Emgeton](https://www.idnes.cz/technet/audio-foto-video/exkluzivni-recenze-zatim-nejlepsiho-mp3-prehravace-roku.A061025_172436_tec_audio_kuz).
- Выставочный Kingston KPEX 200 2 ГБ показан на Computex 2006. Данных
  об отдельной серийной модели и её ROM пока нет. Daewoo DEF-1000 близок
  к Kingston по характеристикам, а у ORIENT F85 отличаются дисплей,
  размеры и видеоформат. Для обоих торговых имён совместимость с SGS
  требует отдельной проверки.
  [Репортаж Computex](https://web.archive.org/web/20060613070044/http://www.oc.com.tw/article/0606/readpfarticle.asp?id=5218),
  [обсуждение Pyra](https://pyra-handheld.com/boards/threads/kingston-k-pex-100-tech-specs.33231/),
  [Daewoo](https://zoom.cnews.ru/goods_card/item/610882/daewoo-def1000-1gb),
  [ORIENT](https://zoom.cnews.ru/goods_card/item/40517/orient-f85).

## Grundig MPixx: точное железо и маршрут к комплектному диску

Оригинальный [service manual MPixx VP1000/1GB](https://audiocircuit.dk/downloads/grundig/Grundig-MPIXXVP1000-mp3-sm.pdf)
показывает **TCC-767** на U101 и 128 Mbit SDRAM. Это уточняет
распространявшееся на форуме предположение о TCC721Y/ребренде UB880.
Равенство устройств и наличие GNEX остаются неподтверждёнными.
У блока OLED в одном месте 120×160, на подробной схеме — 128×160;
расхождение сохранено. Точный номер комплектного CD: **759540666100**.
Именно этот диск и прошивка VP1000 пока отсутствуют.

Отдельно получен [Grundig MPixx2000 CD](https://archive.org/details/mp-2000-cd-driver),
107 446 272 байта: его содержимое относится к **MPixx2001/2002**,
SigmaTel и Host V2.99.6. Проверены 305 ISO-записей и 44 файла
InstallShield CAB. Скан 86 выбранных файлов, 19 893 499 байт,
не дал структурных SGS или длинных маркеров GNEX/XEOVIA/Sinjisoft.
У ISO сохранён хвост 12 288 байт; общий MD5/SHA-1 совпадает с IA.
Это ограниченный результат по другому семейству, а не найденный диск VP1000.
[Хеши, исходные страницы схемы и границы скана](../validation/grundig-player-followup-evidence.json).
