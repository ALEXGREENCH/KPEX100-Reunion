# Все сохранённые профили GNEX Zone

5 ноября 2026 года завершено чтение **52 известных карточек** лаборатории Sinjisoft GNEX Zone. Ранее были прочитаны 16; этот проход добавил содержимое оставшихся **36**. Новых названий устройств за пределами прежнего реестра, прошивок и SGS в этом проходе не получено.

Для всех 52 карточек теперь сохранены исходные HTML, SHA-256 и совпадение SHA-1 с прежним индексом CDX. Три старых копии оказались страницами с оформлением Wayback: для LG-SD330, LG-SV130 и LG-SV9120 отдельно получены точные raw-представления. Ещё 13 ранее полученных raw-карточек повторно использованы с локального диска.

[Полный реестр, буквальные значения, хеши и происхождение](../validation/gnex-zone-round4-profiles.json) · [общий реестр устройств](../validation/gnex-zone-handsets.json) · [прежний обзор устройств](gnex-devices.md).

## Оригинальные материалы

[Скачать комплект карточек](../research/archives/Sinjisoft-GNEX-Zone-Handset-Cards.zip): **164 696 байт**, SHA-256 `8e3e659eab1896361cf334712a36ff611ae19475ef092466abd003b1fb03bf8d`. В ZIP 56 файлов: 52 карточки, связанная HTML-таблица лаборатории, навигационный SWF, README и manifest. Все 54 исходных файла совпадают с CDX; ZIP CRC и хеши 55 файлов manifest проверены после извлечения в пустую папку.

Карточки относятся к разным архивным снимкам 2004–2005 годов. [Общая таблица лаборатории от 3 августа 2004 года](https://web.archive.org/web/20040803221958id_/http://www.gnexclub.com:80/zone/htm/phone.htm) — отдельный датированный список: её приблизительное число аппаратов нельзя подменять суммой всех позднейших карточек. [Навигационный SWF](https://web.archive.org/web/20041020233513id_/http://www.gnexclub.com:80/zone/swf/zone.swf) сохранён как часть сайта, без исполнения. Это не игровой файл.

## Подтверждённые параметры

В таблице приведены буквальные обозначения VM, физический LCD и область GVM из каждой карточки. Номер SCRIPTVER указан только там, где он явно напечатан. Пробелы внутри разорванных HTML слов GNEX/GVM нормализованы для чтения; исходная запись остаётся в `vm_raw` и оригинале.

| Модель и оригинальная карточка                                                                                        | VM / явный SCRIPTVER           | LCD     | Область GVM | Платформа  |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------- | ----------- | ---------- |
| [CS-M210](https://web.archive.org/web/20040811210257id_/http://www.gnexclub.com/zone/htm/hw_p/cs-m210.htm)            | GVM2X; SCRIPTVER 2             | 120×160 | 120×144     | GVM        |
| [LG-SD1100](https://web.archive.org/web/20041019110549id_/http://www.gnexclub.com/zone/htm/lg_p/lg-sd1100.htm)        | GVM2X                          | 120×160 | 120×146     | Не указана |
| [LG-SD230](https://web.archive.org/web/20040811211101id_/http://www.gnexclub.com/zone/htm/lg_p/lg-sd230.htm)          | GNEX                           | 120×160 | 120×146     | WIPI 1.2   |
| [LG-SD330](https://web.archive.org/web/20050214012958id_/http://www.gnexclub.com/zone/htm/lg_p/lg-sd330.htm)          | GNEX                           | 176×220 | 176×204     | WIPI 1.2   |
| [LG-SD340](https://web.archive.org/web/20050214012448id_/http://www.gnexclub.com:80/zone/htm/lg_p/lg-sd340.htm)       | GNEX                           | 176×220 | 176×203     | WIPI 1.2   |
| [LG-SD350](https://web.archive.org/web/20041019225834id_/http://www.gnexclub.com/zone/htm/lg_p/lg-sd350.htm)          | GNEX                           | 176×220 | 176×203     | WIPI 1.2   |
| [LG-SD840](https://web.archive.org/web/20040811211747id_/http://www.gnexclub.com/zone/htm/lg_p/lg-sd840.htm)          | GVM2X                          | 120×160 | 120×146     | WI-TOP     |
| [LG-SD9230](https://web.archive.org/web/20040811212148id_/http://www.gnexclub.com/zone/htm/lg_p/lg-sd9230.htm)        | GNEX                           | 120×160 | 120×146     | WITOP 1,2  |
| [LG-SV130](https://web.archive.org/web/20041209135210id_/http://www.gnexclub.com/zone/htm/lg_p/lg-sv130.htm)          | GNEX (GIGA)                    | 176×220 | 176×204     | WITOP      |
| [LG-SV510](https://web.archive.org/web/20041209135949id_/http://www.gnexclub.com/zone/htm/lg_p/lg-sv510.htm)          | GNEX                           | 176×220 | 176×203     | WIT OP     |
| [LG-SV9120](https://web.archive.org/web/20040811213047id_/http://www.gnexclub.com/zone/htm/lg_p/lg-sv9120.htm)        | GVM2X; SCRIPTVER 2             | 120×160 | 120×146     | WITOP      |
| [LG-SV9140](https://web.archive.org/web/20050214012516id_/http://www.gnexclub.com/zone/htm/lg_p/lg-sv9140.htm)        | GNEX (GIGA)                    | 176×220 | 176×204     | WITOP      |
| [MS100](https://web.archive.org/web/20040811213417id_/http://www.gnexclub.com/zone/htm/moto_p/ms100.htm)              | GVM2X; SCRIPTVER 2             | 128×160 | 128×145     | WITOP      |
| [MS 280](https://web.archive.org/web/20040811205526id_/http://www.gnexclub.com/zone/htm/moto_p/ms280.htm)             | GNEX                           | 176×220 | 176×202     | WITOP      |
| [MS300](https://web.archive.org/web/20041214204829id_/http://www.gnexclub.com/zone/htm/moto_p/ms300.htm)              | GNEX                           | 128×160 | 128×145     | WIPI       |
| [MS400](https://web.archive.org/web/20050214012411id_/http://www.gnexclub.com/zone/htm/moto_p/ms400.htm)              | GNEX GIGA                      | 128×160 | 128×145     | WIPI 1.2   |
| [StarTAC 2004](https://web.archive.org/web/20040811210129id_/http://www.gnexclub.com/zone/htm/moto_p/startac2004.htm) | GNEX                           | 128×160 | 128×145     | WITOP      |
| [DD-600](https://web.archive.org/web/20040811210553id_/http://www.gnexclub.com/zone/htm/pq_p/dd-600.htm)              | GVM2X; SCRIPTVER 2             | 120×160 | 120×?       | GVM        |
| [DD-630](https://web.archive.org/web/20040811211000id_/http://www.gnexclub.com/zone/htm/pq_p/dd-630.htm)              | GVM2X; SCRIPTVER 2             | 128×160 | 128×144     | GVM        |
| [P1](https://web.archive.org/web/20041015175320id_/http://www.gnexclub.com/zone/htm/pq_p/p1.htm)                      | GNEX                           | 220×176 | 220×160     | WIPI 1.2   |
| [PG-S5000](https://web.archive.org/web/20040811211412id_/http://www.gnexclub.com/zone/htm/pq_p/pg-s5000.htm)          | GVM2X; SCRIPTVER 2             | 120×146 | 120×146     | WITOP      |
| [PH-S3000V](https://web.archive.org/web/20050214012826id_/http://www.gnexclub.com/zone/htm/pq_p/ph-s3000v.htm)        | GNEX                           | 176×240 | 176×224     | WIPI 1.2   |
| [PH-S3500](https://web.archive.org/web/20041020004756id_/http://www.gnexclub.com/zone/htm/pq_p/ph-s3500.htm)          | GNEX(GIGA)                     | 240×176 | 240×160     | WIPI 1.2   |
| [PH-S5700](https://web.archive.org/web/20050214012047id_/http://www.gnexclub.com/zone/htm/pq_p/ph-s5700.htm)          | GVM                            | 128×160 | 128×147     | OEM        |
| [S2](https://web.archive.org/web/20040811211503id_/http://www.gnexclub.com/zone/htm/pq_p/s2.htm)                      | GVM2X; SCRIPTVER 2             | 128×145 | 128×145     | WITOP      |
| [S4](https://web.archive.org/web/20041015180810id_/http://www.gnexclub.com/zone/htm/pq_p/s4.htm)                      | GVM4X; SCRIPTVER 2             | 240×320 | 240×294     | WIPI 1.2   |
| [SCH-E200](https://web.archive.org/web/20040811211827id_/http://www.gnexclub.com/zone/htm/samsung_p/SCH-E200.htm)     | GVM2X; SCRIPTVER 2             | 120×160 | 120×146     | Не указана |
| [SCH-E350](https://web.archive.org/web/20041214204443id_/http://www.gnexclub.com/zone/htm/samsung_p/SCH-E350.htm)     | 4 (GNEX GIGA)                  | 120×160 | 120×146     | GNEX GIGA  |
| [SCH-S140](https://web.archive.org/web/20050214012940id_/http://www.gnexclub.com/zone/htm/samsung_p/SCH-S140.htm)     | GNEX                           | 176×220 | 176×204     | WIPI 1.2   |
| [SCH-S200](https://web.archive.org/web/20050214012425id_/http://www.gnexclub.com/zone/htm/samsung_p/SCH-S200.htm)     | GNEX                           | 176×220 | 176×204     | WIPI 1.2   |
| [SCH-S230](https://web.archive.org/web/20050214012854id_/http://www.gnexclub.com/zone/htm/samsung_p/SCH-S230.htm)     | GNEX GIGA                      | 176×220 | 176×204     | WIPI 1.2   |
| [SCH-V300](https://web.archive.org/web/20040811212839id_/http://www.gnexclub.com/zone/htm/samsung_p/SCH-V300.htm)     | GVM2X                          | 176×192 | 128×146     | Не указана |
| [SCH-V330](https://web.archive.org/web/20040811213607id_/http://www.gnexclub.com/zone/htm/samsung_p/SCH-V330.htm)     | GVM2X                          | 176×192 | 128×178     | Не указана |
| [SCH-V 490](https://web.archive.org/web/20050214012802id_/http://www.gnexclub.com/zone/htm/samsung_p/SCH-V490.htm)    | GVM                            | 176×220 | 176×202     | OEM        |
| [SCH-V 500](https://web.archive.org/web/20041020014400id_/http://www.gnexclub.com/zone/htm/samsung_p/SCH-V500.htm)    | GNEX                           | 240×320 | 120×148     | WIPI 1.2   |
| [SCH-V 540](https://web.archive.org/web/20041020015548id_/http://www.gnexclub.com/zone/htm/samsung_p/SCH-V540.htm)    | GNEX                           | 176×220 | 176×202     | OEM        |
| [SCH-X2 30](https://web.archive.org/web/20041020020151id_/http://www.gnexclub.com/zone/htm/samsung_p/SCH-X230.htm)    | GVM1X                          | 120×160 | 176×149     | Не указана |
| [SCH-X590](https://web.archive.org/web/20040811205541id_/http://www.gnexclub.com/zone/htm/samsung_p/SCH-X590.htm)     | GVM2X; SCRIPTVER 2             | 120×160 | 120×146     | Не указана |
| [SCH-X600](https://web.archive.org/web/20040811210112id_/http://www.gnexclub.com/zone/htm/samsung_p/SCH-X600.htm)     | GVM2X; SCRIPTVER 2             | 128×160 | 128×146     | Не указана |
| [SCH-X780](https://web.archive.org/web/20040811210544id_/http://www.gnexclub.com/zone/htm/samsung_p/SCH-X780.htm)     | GVM2X; SCRIPTVER 2             | 128×160 | 128×146     | Не указана |
| [SCH-X850](https://web.archive.org/web/20041019211355id_/http://www.gnexclub.com/zone/htm/samsung_p/SCH-X850.htm)     | GVM4X(GNEX GIGA)               | 176×220 | 176×205     | WITOP      |
| [IM-3100](https://web.archive.org/web/20040811211348id_/http://www.gnexclub.com/zone/htm/sk_p/im-3100.htm)            | GVM1X; SCRIPTVER 1             | 120×120 | 120×106     | Не указана |
| [IM-5000](https://web.archive.org/web/20040811211624id_/http://www.gnexclub.com/zone/htm/sk_p/im-5000.htm)            | GVM2X; SCRIPTVER 2             | 128×160 | 128×149     | Не указана |
| [IM-5300](https://web.archive.org/web/20040811211852id_/http://www.gnexclub.com/zone/htm/sk_p/im-5300.htm)            | GVM2X; SCRIPTVER 2             | 128×160 | 128×144     | WITOP      |
| [IM-6100](https://web.archive.org/web/20040811212446id_/http://www.gnexclub.com/zone/htm/sk_p/im-6100.htm)            | GVM2X; SCRIPTVER 2             | 128×160 | 128×144     | WITOP      |
| [IM-6400](https://web.archive.org/web/20040811213033id_/http://www.gnexclub.com/zone/htm/sk_p/im-6400.htm)            | GVM4X (GNEX GIGA); SCRIPTVER 2 | 128×160 | 128×144     | WITOP      |
| [IM-7100](https://web.archive.org/web/20040811213453id_/http://www.gnexclub.com/zone/htm/sk_p/im-7100.htm)            | GNEX                           | 240×320 | 120×160     | WITOP      |
| [IM-7200](https://web.archive.org/web/20041019222146id_/http://www.gnexclub.com/zone/htm/sk_p/im-7200.htm)            | GNEX                           | 176×240 | 176×222     | WITOP      |
| [IM-7300](https://web.archive.org/web/20040811205819id_/http://www.gnexclub.com/zone/htm/sk_p/im-7300.htm)            | GNEX                           | 176×220 | 176×202     | WITOP 1,2  |
| [IM-7400](https://web.archive.org/web/20041019223449id_/http://www.gnexclub.com/zone/htm/sk_p/im-7400.htm)            | GNEX(GIGA)                     | 176×220 | 176×202     | WIPI 1.2   |
| [VK-100M](https://web.archive.org/web/20040811205953id_/http://www.gnexclub.com/zone/htm/vk_p/vk-100m.htm)            | GVM2X                          | 128×160 | 128×146     | WITOP      |
| [VK-200C](https://web.archive.org/web/20040811210507id_/http://www.gnexclub.com/zone/htm/vk_p/vk-200c.htm)            | GNEX                           | 176×220 | 176×205     | WITOP      |

## Расхождения и особенности источников

- **SCH-X230:** карточка печатает область GVM 176×149 при LCD 120×160; справочник Sinjisoft 2002 года, стр. 36, даёт 120×149. Оба значения сохранены с происхождением.
- **SCH-V330:** карточка даёт 128×178, тогда как профиль `SCH_V330.ini` SDK 2.10 и 2.12 содержит Width=176, Height=178. Карточка сама по себе не разрешает этот конфликт. [Исследование исходных профилей SDK](gnex-sdk-internal-sources.md).
- **DD-600:** высота области GVM остаётся `?`, как в карточке 120×?.
- **S2:** рядом с MA5 буквально стоит AUDIOTYPE=5 и compressed=4; **PG-S5000** одновременно указывает MA3 и AUDIOTYPE=64; **SCH-S140** печатает цветовую метку `650K Color`. Эти записи не исправлены предположениями.
- У **IM-5000, IM-5300, IM-6100, DD-600, DD-630, SCH-E200, SCH-E350, SCH-V330, SCH-X590, SCH-X600 и SCH-X780** отдельно напечатаны AUDIOTYPE=32 и фактический GetHwConfig()=36. Числа хранятся в отдельных полях.
- Для **IM-3100 и IM-6100** карточки сообщают о неработающей RS232C-связи. У **IM-5000** отдельно перечислены варианты SK1711 и SK1211; они не превращены в новые модели по одному этому тексту.
- **IM-6400** имеет метку GVM4X (GNEX GIGA) и одновременно явный SCRIPTVER=2. **SCH-X850** также помечен GVM4X (GNEX GIGA), **SCH-E350** — буквально `4 (GNEX GIGA)`. Это обозначения карточек, а не найденные SGS-заголовки. **PH-S5700** и **SCH-V490** называют GVM без номера; версия не додумана.

## Границы результата и следующие источники

Это датированные сведения производителя VM о конфигурациях аппаратов. Они не устанавливают совместимость каждой редакции прошивки, формат предустановленных игр или их работоспособность в Reunion. Параметры исполняемых профилей эмулятора этим проходом не менялись.

Полезные точные цели для дальнейшего поиска памяти: Motorola MS 280 и StarTAC 2004, Pantech PH-S3000V и PH-S3500, VK-100M, LG-SD340 и SKY IM-7400. Здесь уточнены их профили; новых образов этих моделей комплект не содержит. Эти названия уже присутствовали в реестре, поэтому не учитываются как вновь обнаруженные устройства.

[Страница Sinjisoft о внутреннем рынке, снимок 18 декабря 2003 года](https://web.archive.org/web/20031218222053id_/http://sinjisoft.co.kr:80/html/gnex_domestic.htm), содержит ссылки на mobile.daum.net и mobile.naver.com и описывает загрузки GNEX с компьютера с конца 2003 года. Это исторические направления поиска; игровой файл по ним в этом проходе не получен. [Корпоративная страница об obox](https://web.archive.org/web/20031017131608id_/http://www.sinjisoft.co.kr:80/html/gnex_oversea.htm) датирует сервис Orange/Partner июнем 2002 года, но не добавляет точных моделей.

Всего выполнено 46 успешных raw HTTP-запросов к 45 различным URL: 39 запросов карточек и 7 запросов корпоративных/каталожных материалов, включая один повтор английской страницы. Предыдущие временные 429 и отложенные карточки сохранены как история в evidence; в этом проходе все запрошенные raw-карточки получены успешно. Форумная очередь Naver из прежнего прохода повторно не обходилась.
