# Игры GVM в каталогах WebENG, NATE и M-Dream

В архиве сохранены 58 исходных ответов. Это страницы WebENG, NATE, M-Dream, Com2uS и других издателей, а также три демонстрационных SWF. Манифест фиксирует CRC32, размеры и SHA-256. Оригинальные страницы оставлены в исходной кодировке. Для чтения удобнее просматривать их как текст, поскольку в них остались ссылки на внешние ресурсы и старые формы.

[Скачать архив](../research/archives/WebENG-NATE-GVM-Game-Catalogues.zip) · [Даты снимков, URL, хеши и состав](../validation/webeng-nate-gvm-game-catalogues.json)

## WebENG Korea

В каталоге WebENG от 18 октября 2002 года 19 позиций с якорями `q1`–`q19`. Среди них `낚시왕` (рыбалка), `벽돌깨기2` (разбивание кирпичей), `손가락댄스댄스` (ритм-игра), `지하탐험` (подземелье) и `ENG 슈퍼 배구` (волейбол). Карточки `예쁜문자앨범` и `아바타채팅` входят в тот же каталог приложений. [Каталог разработчика](https://web.archive.org/web/20021018235628id_/http://www.webengkr.com:80/product_sub_01_GVM.htm) · [Портфолио со ссылками на игры](https://web.archive.org/web/20021019000027id_/http://www.webengkr.com:80/portfolio_sub_01_mobile.htm)

На странице выдачи ритм-игры сохранилось 169 выражений с кнопками загрузки, в том числе варианты `ddrconfirm1.asp` и `ddrconfirm2.asp` с параметром `gid` для песен. У кирпичей, головоломки, футбола и волейбола отдельные адреса. Кнопка сначала открывала форму NATE `GVMManageServlet` с командой `Device_Info`. Ответы формы с совпавшим архивным дайджестом указывают на старый обработчик WAP Push. В проверке использовались только архивные GET-запросы. [Страница выдачи DDR](https://web.archive.org/web/20021008004524id_/http://www.webengkr.com:80/gvmddr1/sub06-download-n.htm)

## NATE и M-Dream

Запрос CDX для одного префикса `GVMManageServlet` вернул 113 различных URL с кодом 200 за 2000–2005 годы. Из 23 выбранных записей скачано 12 тел, у всех SHA-1 совпал с CDX. Две страницы раздела `Game_iframe` дают прямые ссылки на игровые карточки издателей. Параметр `pGvmNo` в этих URL сохранён как идентификатор раздела, он не присвоен отдельным играм. [Список головоломок и аркад NATE](https://web.archive.org/web/20020806000727id_/http://www.nate.com:80/servlets/com/nate/www/gvm/servlet/GVMManageServlet?nate_cmd=Game_iframe&pGvmNo=2000200&pageNo=1)

У Galaga, Puzzle Bobble и Puzznic подтверждены страницы загрузки для SKT 011 и исходные адреса сервера GameTop. В ответе Wayback Availability для адреса Galaga снимок не указан. Два других адреса остаются отдельными целями. [Galaga](https://web.archive.org/web/20020602101823id_/http://www.m-dream.com/service/vm_galaga/011/game_connect.html) · [Puzzle Bobble](https://web.archive.org/web/20030414154133id_/http://www.m-dream.com:80/service/vm_puzzlebobble/011/game_connect.html) · [Puzznic](https://web.archive.org/web/20020729003929id_/http://www.m-dream.com/service/vm_puznic/011/game_connect.html)

| SWF из карточки      |  Байты | Кадры |
| -------------------- | -----: | ----: |
| Galaga, `galaga.swf` | 82 290 |   600 |
| Hidden, `hidden.swf` | 30 301 |   110 |
| Captain, `demo1.swf` |  9 984 |   105 |

Все три ролика прошли разбор структуры SWF v5 и заявленной длины. Запуск и интерактивность не проверялись. Поиск по сохранённым телам не подтвердил ни одного SGS.

В следующем проходе по каталогу GameTop восстановлены три WML, включая переход Puzzle Bobble на mPlayOn. [Тела WML и проверка адреса](gametop-nate-puzzle-bobble-hidden.md)
