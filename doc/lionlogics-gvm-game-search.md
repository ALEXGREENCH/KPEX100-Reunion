# Lionlogics и Eternal Ranger для GVM

[Архив Lionlogics](../research/archives/Lionlogics-Eternal-Ranger-and-Pirate-King.zip) содержит оригинальные страницы и Flash-файлы за 2003–2005 годы, квитанции и манифест с SHA-256 и CRC32. Файлы игр в проверенных ответах пока не найдены.

## Eternal Ranger и Storm Bringer

В карточке `/03_mobile/game1_01.asp` разработчик указывает **SKT GVM**,
цветной экран, звук `16Poly` и называет игру первым эпизодом
Eternal Ranger Apocalypse. В карточке сохранены описание, управление
и путь через меню SKT. Отдельные объявления студии датируют выход для
KTF 24 ноября 2004 года и для LGT 11 мая 2005 года. Формат этих двух
сборок ещё нужно подтвердить по файлам. [Карточка разработчика](https://web.archive.org/web/20051026014705id_/http://www.lionlogics.com/03_mobile/game1_01.asp) ·
[Объявление KTF](https://web.archive.org/web/20050206182632id_/http://lionlogics.com:80/04_news/news01_read.asp?seq=20&subseq=0) ·
[Главная страница с объявлением LGT](https://web.archive.org/web/20050525054959id_/http://www.lionlogics.com:80/).

В `gift/gift1.html` за 2003 год есть ссылки на `image/er1024.alz`
и `image/er800.alz`. Оба пути вернули HTTP 404 при запросе снимков
с доменом и без `www`. Каталог `game/game1.html` также ссылается
на `game1.swf` и `game3.html`. Статусы всех попыток и точные URL
сохранены в архиве. Назначение ALZ остаётся неизвестным.
[Страница подарков](https://web.archive.org/web/20030409192447id_/http://lionlogics.com/gift/gift1.html).

В списке игр Lionlogics Storm Bringer записан как **스톰블링거**, маршрут
`/03_mobile/game1_03.asp`. В интервью апреля 2003 года сотрудник студии
использовал написание **스톰 브링거** и говорил о подготовке выпуска
семи эпизодов в Китае. Релиз китайской версии пока не подтверждён.
Запросы карточки по обеим формам домена вернули 404.
[Список Lionlogics](https://web.archive.org/web/20041206052016id_/http://www.lionlogics.com/main.asp) ·
[Интервью Lionlogics](https://www.inews24.com/view/89694).

## Pirate King и Codename KIN

Сохранены объявление о выходе Pirate King (`해적왕`) для SKT
5 ноября 2004 года, главная страница игры и её файлы
`pking/img/menu.swf` и `pking/img/index.swf`. Из меню извлечены
пять адресов `pking/menuN/mapN.htm`. Все пять запросов снимков
вернули HTTP 404. Оба SWF проверены по заголовку и длине развёрнутого
содержимого. [Объявление](https://web.archive.org/web/20050206181234id_/http://lionlogics.com:80/04_news/news01_read.asp?seq=18&subseq=0) ·
[Сайт игры](https://web.archive.org/web/20041206052858id_/http://www.lionlogics.com/pking/index.asp).

Объявление Lionlogics о выходе Codename KIN (`코드네임KIN`) для SKT
от 7 января 2005 года
содержит точную ссылку на `/cnkin/handy/img/kin.swf`. Снимок HTML
получен. Запрос SWF вернул HTTP 404. Формат телефонного пакета
ещё не подтверждён. [Объявление Lionlogics](https://web.archive.org/web/20050206184839id_/http://lionlogics.com/04_news/news01_read.asp?seq=23&subseq=0).

Для полученных тел проверены размеры и SHA-256 по квитанциям, для
SWF также проверены развёрнутые данные. Применён строгий поиск SGS
версий 1, 2, 4 и 36, включая XOR 165. Совпадений нет.
Снимки подтверждены HTTP-квитанциями Wayback с датами захвата.
Совпадение с CDX digest для этих файлов не проверялось.
[Отчёт о проверке](../validation/lionlogics-gvm-game-search.json).

Отдельный релиз Entaz **Pirate King 2007: Second Ocean** сохранён
в [комплекте Dubigame](dubigame-mirror-ktf-skt.md).
