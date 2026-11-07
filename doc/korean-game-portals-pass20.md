# Игровые каталоги Daum, HandyGame и архив сайта Ddangguri

В архиве сохранены ранние карточки Daum, списки бета-тестов HandyGame,
заставка сайта Ddangguri и таблица телефонов из GVM Club. У комплекта есть
манифест SHA-256, размеров и CRC32. [Скачать ZIP](../research/archives/Korean-Game-Portals-and-GVM-Handsets.zip).
[Сводка проверки](../validation/game-hunt-pass20.json).

## Daum 폰게임

Daum объявила о запуске магазина в сентябре 2003 года и указала договор с
Sinjisoft о GNEX/GVM. Покупатель выбирал игру на сайте, а загружал на телефон.
Сохранились главные страницы [сентября 2003 года][daum-2003],
[января 2005 года][daum-2005] и [апреля 2008 года][daum-2008].
[Объявление Daum][daum-launch].

Ограниченный запрос CDX для `view.jsp` достиг предела в 1 000 строк.
Среди записей HTTP 200 с SHA-1 есть 378 разных значений `ctsid`. Это
идентификаторы URL, которые могут относиться к одной игре. Для 14 выбранных
снимков получено 11 тел с точным CDX SHA-1. Девять содержат кнопку покупки.
В восьми из девяти ID в URL карточки отличается от ID в коде этой кнопки.
Оба значения сохранены вместе с названием, разработчиком, размером из
карточки и адресом снимка.

| Название         | Разработчик          | ID карточки | ID кнопки покупки |
| ---------------- | -------------------- | ----------- | ----------------- |
| 용자의 무덤 2    | 소프트맥스 (Softmax) | `P1E62A9E6` | `E1E62A9E6`       |
| 단추 맞고 스페셜 | 단추                 | `U1B7401GD` | `Y1B7401GD`       |
| 골든다이스       | 아이코               | `Y1E62B107` | `G1E62B107`       |

В карточке Softmax указаны 128 kbyte и дата регистрации 2003-09-17.
Кнопка открывала `send.jsp?ctsid=E1E62A9E6`. Четыре точных CDX-запроса
по адресам покупки вернули пустые индексы. Запрос по префиксу `send.jsp`
завершился транспортной ошибкой. [Карточка 용자의 무덤 2][softmax].

## HandyGame и Ddangguri

Снимки HandyGame показывают переход на `/ver2/` в апреле 2005 года, затем
на `handy.kr`. В сохранённых списках найдено 60 ссылок на бета-темы.
В списке декабря 2004 года есть объявления Softgen о World Soccer, Ddangguri
о Princess Sword и Mobion о Forgotten Tales. Архивные запросы отдельных тем
в этом проходе не дали их полных текстов. Запросы к разделу `freegame`
на `handy.kr` завершились транспортной ошибкой либо HTTP 503.
[Список 2004 года][handy-beta], [версия 2005 года][handy-ver2],
[главная handy.kr][handy-new].

Из сайта Ddangguri получен исходный `Movie1.swf` размером 198 385 байт.
Его SHA-1 совпадает с семью записями CDX. Статический разбор кнопки
нашёл AVM1 GetURL на `index1.html`. В сохранённом frameset пять кадров,
из которых получен нижний, а остальные четыре вернули HTTP 404.
Flash не запускался. [Снимок заставки][ddanguri-swf],
[снимок frameset][ddanguri-index].

## Вложения GVM Club

Из старых CGI-загрузок получено десять тел с точным CDX SHA-1. Девять
совпадают с файлами в прежних комплектах. Новый `GVM_phone.xls` на
28 160 байт содержит лист `Sheet3` с датой **2002.01.03** и 47 строками
моделей. В столбце GVM указаны 30 записей 1X и 17 записей 2X. Исходные
ячейки и пустые значения сохранены в JSON. Это более ранняя редакция
таблицы, чем [публикация от декабря 2002 года](gvm-forum-attachments.md).
[Оригинальное вложение][gvm-xls].

Всего проверено 145 запросов и сохранено 84 уникальных тела ответов.
Сканирование полных HTTP 200 ответов и членов ZIP нашло один SGS, который
совпадает с уже доступным WI-TOP Hellfire. Игровые байты проверены также
на 79 положительных примерах из каталога. Новые исполняемые игры из
этого набора пока не получены.

[daum-launch]: https://www.kakaocorp.com/page/detail/5601
[daum-2003]: https://web.archive.org/web/20030919012546id_/http://mgame.daum.net/
[daum-2005]: https://web.archive.org/web/20050101022814id_/http://mgame.daum.net/
[daum-2008]: https://web.archive.org/web/20080417024658id_/http://mgame.daum.net/
[softmax]: https://web.archive.org/web/20040224085235id_/http://mgame.daum.net:80/view.jsp?cateid=222&ctsid=P1E62A9E6&arraynum=0&cpage=1
[handy-beta]: https://web.archive.org/web/20041212212551id_/http://handygame.co.kr/Mobilebeta_list.html?Bid=betanotice
[handy-ver2]: https://web.archive.org/web/20050409000741id_/http://www.handygame.co.kr/ver2/
[handy-new]: https://web.archive.org/web/20070831232500id_/http://handy.kr/
[ddanguri-swf]: https://web.archive.org/web/20041013162906id_/http://www.ddanguri.com/Movie1.swf
[ddanguri-index]: https://web.archive.org/web/20050307190320id_/http://www.ddanguri.com/index1.html
[gvm-xls]: https://web.archive.org/web/20020215151927id_/http://www.gvmclub.com:80/boardno/board.cgi?bd=&j=dl&i=46&c=0
