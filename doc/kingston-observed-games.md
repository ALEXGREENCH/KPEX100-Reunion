# Игры на фотографии Kingston K-PEX 100

На кадре из ролика KonfederatioN виден экран `GAME` одного Kingston
K-PEX 100 с шестью именами SGS. Это свидетельство содержимого списка на конкретном
устройстве. Фотография не показывает запуск игр, размеры или хеши файлов, версию
прошивки и историю заполнения накопителя. Она не устанавливает заводской комплект
из шести игр. Ролик опубликован 4 ноября 2026 года, дата съёмки неизвестна.
На момент первоначальной проверки в описании ролика ссылки на папку
`GAME` и дамп отсутствовали. 5 ноября 2026 года пользователь предоставил
архив, сообщив, что получил его от автора видео; проверка описана ниже.
[Кадр в исходном ролике, 0:24](https://www.youtube.com/watch?v=8A_Bdroo-lY&t=24s).

## Полученный архив автора видео

Пользователь передал `kpexgames.zip_pass_123.zip`, 2 383 383 байта,
SHA-256 `b6b6114a3dfb8176702a41c5ab769129115d2937b8ac0c22ba20f074f0bceeaf`.
Его единственное вложение, `kpexgames.zip`, содержит шесть SGS с теми же
именами, что видны на фотографии, и шесть файлов SAV/SYS. Проверки CRC
обоих уровней прошли. Атрибуция автору ролика основана на сообщении
пользователя; отдельной проверки отправителя не проводилось.

**Все шесть SGS побайтно совпадают с уже сохранёнными файлами каталога:**
Battle Armor, Ikaria, The Man-Jong, Star Fighter, Soul Sword и Treasure Hunter.
Новых хешей или изменённых сборок в этом архиве нет, каталог остаётся
из 55 приложений. Получена дополнительная копия именно этих версий,
а не основание увеличивать количество игр.
[Полный манифест и сравнение](../validation/kingston-author-archive.json).

Сопутствующие файлы сохранены без изменения:

| Файл          | Байты |
| ------------- | ----: |
| ARMOR_C.SAV   |    16 |
| ARMOR_G.SAV   | 1 476 |
| MAJAK\_~1.SYS |    64 |
| SF_ENG~1.SYS  |    60 |
| SSKR.SAV      |   800 |
| TRESUR~1.SYS  |    64 |

После снятия исходного XOR-A5 в Battle Armor найдены буквальные имена
ARMOR_C.SAV и ARMOR_G.SAV, в Soul Sword — SSKR.SAV. Это подтверждает
связь имён с этими играми. Смысл полей, соответствие трёх SYS области
user NV и импорт состояния в Reunion этим ещё не проверены.
Содержимое сохранений не включено в репозиторий автоматически.

Архив не устанавливает заводскую комплектацию, версию ROM, даты установки
или неизменность содержимого физического экземпляра с момента съёмки.

## Точная запись имён

| Имя на экране            | Историческое соответствие        | Публичное вложение KPEX100                                   |
| ------------------------ | -------------------------------- | ------------------------------------------------------------ |
| `Armor_eng_drm.sgs`      | Battle Armor: Counter Attack     | [756 382 байта, тема №15](https://cafe.naver.com/kpex100/15) |
| `SoulSword_k.sgs`        | Soul Sword / 귀혼마도 (鬼魂魔刀) | [783 000 байт, тема №23](https://cafe.naver.com/kpex100/23)  |
| `TresureHunter_k.sgs`    | Treasure Hunter / 트레져헌터     | [958 966 байт, тема №24](https://cafe.naver.com/kpex100/24)  |
| `ikaria.sgs`             | Ikaria ep2 / 이카리아 ep2        | [822 550 байт, тема №19](https://cafe.naver.com/kpex100/19)  |
| `majak_20060313_drm.sgs` | The Man-Jong / Majak             | [587 602 байта, тема №21](https://cafe.naver.com/kpex100/21) |
| `sf_eng_drm.sgs`         | Star Fighter / 스타파이터        | [512 942 байта, тема №22](https://cafe.naver.com/kpex100/22) |

В `TresureHunter_k.sgs` действительно отсутствует буква `a` после `Tre`.
Такое написание присутствует и в исторических ссылках; исправлять имя файла
на `TreasureHunter_k.sgs` при каталогизации не следует. Суффиксы `_k`, `_eng`
и `_drm` сохранены буквально. Сами по себе они не доказывают язык конкретного
бинарника, способ защиты или его работоспособность.

## Чем подтверждаются названия

[Снимок каталога kingstonkpex на Freewebs от 13 марта 2008 года][freewebs]
содержит все шесть имён и исторические URL файлов. Это современный устройству
каталог сообщества, а не официальный перечень комплектации. В его HTML есть
ошибки: текст `Armor_eng_drm.sgs` ведёт на `sf_eng_drm.sgs`, а текст
`majak_20060313_drm.sgs` — на `TresureHunter_k.sgs`. Правильные URL Armor и Majak
также присутствуют, но у пустых ссылок. Поэтому подпись одной ссылки нельзя
использовать как доказательство того, какие байты она возвращала.

Независимые страницы владельца на VSTU уточняют соответствия:

- [BATTLE ARMOR, архив 30 октября 2007 года][vstu-armor] прямо называет
  `Armor_eng_drm.sgs` английским вариантом и предлагает `Armor.rar`.
- [STAR FIGHTER, тот же архив][vstu-sf] предлагает `sf_eng_drm.rar`.
- [SOUL SWORD][vstu-ss] и [TRESURE HUNTER][vstu-th] предлагают соответственно
  `SoulSword_k.rar` и `TresureHunter_k.rar`.
- [The man-jong, тот же архив][vstu-majak] предлагает
  `majak_20060313_drm.rar`. Название даты внутри файла не устанавливает дату
  выпуска игры. Утверждения этой страницы о языках отдельно не проверены.

[Блог Markosoft, архив 21 декабря 2009 года][markosoft], дополнительно перечисляет
`Battle Armor.sgs`, `Soul Sword (korean).sgs`, `Tresure Hunter (korean).sgs`,
`Star Fighter.sgs`, `Majak.sgs` и `Ikaria.sgs`. Это альтернативные исторические
имена; равенство соответствующих файлов по байтам не установлено.

Официальные карточки Cenix подтверждают существование четырёх игр для GMP-M6:

| Игра            | Название в карточке        | Дата публикации карточки | Первичный источник                      |
| --------------- | -------------------------- | ------------------------ | --------------------------------------- |
| Battle Armor    | 전략시뮬액션-배틀아머      | 2005-12-12               | [Cenix, снимок 2006-04-21][cenix-armor] |
| Star Fighter    | 액션 슈팅-스타파이터       | 2005-12-12               | [Cenix, снимок 2006-04-21][cenix-sf]    |
| Treasure Hunter | Treasure Hunter 트레져헌터 | 2006-01-20               | [Cenix, снимок 2007-08-24][cenix-th]    |
| Soul Sword      | 귀혼마도 (鬼魂魔刀)        | 2006-03-03               | [Cenix, снимок 2006-08-27][cenix-ss]    |

Это даты страниц, не доказанные даты первого выпуска. Карточки не удостоверяют
английские варианты SGS с фотографии. Для Ikaria и Man-Jong официальная
карточка Cenix в проверенном наборе не установлена. **Star Force** встречается
в [вопросе участника форума 2007 года][pyra] и в заголовке корейской темы
№22. Вложенный SGS и его заставка называют игру **Star Fighter**.

Корейское интервью с руководителем NE Media подтверждает разработку
`귀혼마도` для мобильных телефонов ещё до появления карточки Cenix.
Каталог GG게임 датирует телефонный выпуск 16 марта 2005 года и указывает
SKT и KTF. Бинарник телефонного выпуска пока не найден. Его формат
и связь с конкретной сборкой `SoulSword_k.sgs` остаются открытыми.
[Интервью NE Media](https://www.sidae.com/article/2004122702001455072),
[карточка игры](https://www.ggemguide.com/mobile_view.htm?uid=702),
[каталог с операторами](https://www.ggemguide.com/mobile_small_list.htm?dpage=108&gkey=&nkey=).

## Сохранённый Ikaria и границы сравнения

В [каталоге Reunion](../web/data/catalog.json) находится
[`data/games/ikaria.sgs`](../web/data/games/ikaria.sgs):

```text
Размер: 822550 байт
SHA-256: c04204a6eec21188c4e499a8e2baa0ebb2d8d2007802e579085288edfdf5a5de
Внутреннее название: 이카리아 ep2
Формат SGS: 4
```

Источник этого файла — [архив kpex.hexmode.org, 22 июня 2007 года][ikaria-bin].
Индекс Wayback также содержит более раннюю запись от 17 мая 2007 года с тем же
SHA-1 `LED6I6IPM7ZVVWT4NNWOLZJ72C3L63WQ` в Base32. SHA-256 локального оригинала
пересчитан при этой проверке. Совпадение имени `ikaria.sgs` с фотографией
не устанавливает совпадение версии: для этого нужны исходные байты с показанного
накопителя или хотя бы его размер и криптографический хеш.

## Файлы с корейского форума KPEX100

Внутренний поиск Naver Cafe вывел на клуб KPEX100, основанный в 2009 году.
В разделе Game сохранились пять ранее отсутствовавших SGS. Страницы тем
открывались без входа, а API явно разрешил скачивание вложений. Имена
совпадают с фотографией без учёта регистра. Скачанные размеры совпали
с размерами вложений. У всех пяти полный заголовок и таблицы SGS v4,
закодированные XOR `0xa5`. Исходные файлы сохранены с этим кодированием.
Копия Ikaria из темы №19 совпала побайтно с ранее найденной копией Reunion.
[Раздел Game](https://cafe.naver.com/f-e/cafes/17921747/menus/47),
[посты, SHA-256 и проверка SGS](../validation/kingston-naver-game-recovery.json).

В Reunion проверены миссия Battle Armor, тренировка Soul Sword, первый
этап Treasure Hunter, партия The Man-Jong и первый уровень Star Fighter.
В Soul Sword заставка зависит от системных часов. Для Star Fighter
профиль отправляет событие `KEYPRESS 0xff` при отпускании клавиши.
Сценарии работают на интерпретаторе Kingston 2.12.
[Повторы и хеши кадров](../validation/kingston-naver-gameplay.json).

В том же разделе есть четыре других оригинальных вложения SGS v4,
`aiolos_k.sgs`, `blocks.sgs`, `letadylko.sgs` и `exciting_drop.sgs`.
По байтам они отличаются от ранее сохранённых файлов. Все четыре
дошли до игры с управлением. В `letadylko.sgs` находится авиасимулятор
`청연`. Телефонный выпуск с таким названием анонсирован для SKT в 2006 году.
Godori и KPetris из форума совпали с экземплярами Reunion.
[Aiolos](https://cafe.naver.com/kpex100/14),
[Blocks](https://cafe.naver.com/kpex100/16),
[Letadylko](https://cafe.naver.com/kpex100/25),
[Exciting Drop](https://cafe.naver.com/kpex100/26),
[анонс 청연](https://www.newswire.co.kr/newsRead.php?no=145616).

В теме Cenix 2.21 лежит `gmp-m6.rom` на 456 163 байта.
Вложение побайтно совпадает с началом полного Cenix 2.21 из каталога
Reunion. У полного образа 7 293 440 байт.
[Тема с вложением](https://cafe.naver.com/kpex100/10).

## Другие исторические ссылки

До находки на Naver пять файлов искались в локальных материалах, на
Freewebs, Markosoft, VSTU и в карточках Cenix. Эти источники подтвердили
написания имён и прежние каналы распространения.

Индекс Wayback с фильтром HTTP 200 вернул пустой результат для шаблонов
`www.freewebs.com/kingstonkpex/*.sgs`, `files.myopera.com/Markosoft/blog/*.sgs`
и всех пяти точных адресов RAR с VSTU. Wayback Availability также не вернул
снимки этих RAR. [Запросы по адресам VSTU](../validation/kingston-vstu-binary-checks.json).
Результат относится к проверенным адресам; копии могут сохраниться на других
сайтах или накопителях.

Полностью прочитаны 22 страницы темы iXBT о K-PEX. Сообщения в HTML хранятся
в вызовах `t_post(...)`. В сообщениях № 271–272 участники указали два
игровых зеркала. Первое вело на `slil.ru/23501149/898233944/GAME.rar`,
второе на `tatta.mylivepage.ru/file/376`. В сохранённом каталоге MyLivePage
записано `960_game.rar`, 5,42 МБ, 30 января 2007 года. Прямые ссылки
на байты этих архивов пока недоступны. [Ветка iXBT](https://forum.ixbt.com/topic.cgi?id=47:7038-9),
[снимок MyLivePage](https://web.archive.org/web/20080410110453id_/http://tatta.mylivepage.ru:80/file/376).

Владелец японского импортного Cenix GMP-M6 на 2 ГБ в 2008 году показал
Battle Armor и Star Fighter на своём экземпляре и описал их как
предустановленные игры. Это ещё один подтверждённый источник для поиска
оригинальной папки `GAME`. [Отчёт владельца с фотографиями](https://pocketg.blog.fc2.com/blog-entry-217.html).

В архиве чешского форума K-PEX сохранился индекс четырёх игровых тем
и часть обсуждения SDK. Публикации самих игр по проверенным адресам пока
не восстановлены. На корейской доске Cenix сохранился индекс Q&A и часть
тем свободного форума. Пять прочитанных тем не дали новых вложений.
[Игровой раздел чешского форума](https://web.archive.org/web/20071012114320/http://kpex.onlinesport.cz:80/index.php?board=10.0),
[доска Cenix](https://web.archive.org/web/20070820082240id_/http://www.cenix.co.kr/cenix/?doc=bbs/gnuboard.php&bo_table=qa).

Три следующие страницы свободного форума Cenix сохранили 38 ссылок
на темы. Среди них №71 `GMP 자료 공유 카페 개설` об открытии сообщества
обмена материалами GMP, №70 о Naver-блоге, №59 о Soul Sword, №49
об оплате игр, №31 об Aiolos. Тела этих тем по проверенным адресам
не восстановились, поэтому URL сообщества остаётся неизвестным.
[Страница 2](https://web.archive.org/web/20070823045516id_/http://www.cenix.co.kr/cenix/?doc=bbs/gnuboard.php&bo_table=f_board&page=2),
[страница 3](https://web.archive.org/web/20070823012424id_/http://www.cenix.co.kr/cenix/?doc=bbs/gnuboard.php&bo_table=f_board&page=3),
[страница 4](https://web.archive.org/web/20070823014647id_/http://www.cenix.co.kr/cenix/?doc=bbs/gnuboard.php&bo_table=f_board&page=4).

В открывшейся теме №116 от 9 февраля 2007 года владелец выставил
GMP-M6 на продажу и указал, что на нём много платных игр. В сообщении
нет названий, вложений и ссылок на копию накопителя.
[Объявление Cenix](https://web.archive.org/web/20070823152610id_/http://www.cenix.co.kr/cenix/?doc=bbs/gnuboard.php&bo_table=f_board&page=1&wr_id=116).

При дополнительной проверке открылась тема Cenix №98 от 25 ноября 2006 года
о покупке подержанного GMP-M6. В сохранённом HTML вложений с играми нет.
В заметке от 8 декабря 2005 года GameChosun называет Battle Armor и
Star Fighter штатными играми, а ITmedia в марте 2006 года пишет о семи
доступных играх. Точный состав этого набора и версии файлов с Kingston
по публикациям не устанавливаются. [Тема Cenix](https://web.archive.org/web/20070823035706id_/http://www.cenix.co.kr/cenix/?doc=bbs/gnuboard.php&bo_table=f_board&page=1&wr_id=98),
[GameChosun](https://www.gamechosun.co.kr/webzine/article/view.php?no=37191),
[ITmedia](https://www.itmedia.co.jp/bizmobile/spv/0603/13/news041_2.html).

Прочитаны два комментария к записи японского владельца и проверена его
связанная страница коллекции. Указан чёрный GMP-M6 на 2 ГБ. В этих
страницах ссылок на скачивание игр нет. В корейском сообществе Daum GVM
сохранился адрес старой темы. Страница самой темы требует входа и
членства. [Коллекция TEHRU](https://tehru.sakura.ne.jp/hard.html),
[Daum GVM](https://cafe.daum.net/GVM/Jckv/115).

В каталоге OASIS Национальной библиотеки Кореи есть запись Cenix
`CNTS-00071089746`. Сбор датирован 1 июня 2015 года. Общедоступные
результаты полнотекстового поиска описывают продукцию позднего периода
엠피탑. Просмотр самого снимка помечен как доступный в библиотеке.
В открытом поиске OASIS запросы `GMP-M6` и `귀혼마도` не дали совпадений.
[Карточка Cenix в OASIS](https://www.nl.go.kr/oasis/contents/O1010000.do?schM=view&schType=simple&kind=01&contentsId=CNTS-00071089746).

Альтернативные имена из старых каталогов:

| Цель            | Исторические имена и варианты упаковки                                      |
| --------------- | --------------------------------------------------------------------------- |
| Battle Armor    | `Armor_eng_drm.sgs`, `Battle Armor.sgs`, `Armor.rar`                        |
| Soul Sword      | `SoulSword_k.sgs`, `Soul Sword (korean).sgs`, `SoulSword_k.rar`             |
| Treasure Hunter | `TresureHunter_k.sgs`, `Tresure Hunter (korean).sgs`, `TresureHunter_k.rar` |
| Man-Jong        | `majak_20060313_drm.sgs`, `Majak.sgs`, `majak_20060313_drm.rar`             |
| Star Fighter    | `sf_eng_drm.sgs`, `Star Fighter.sgs`, `sf_eng_drm.rar`                      |

Тождество файлов с байтами физического экземпляра из ролика пока не
установлено. [Проверка девяти прошивок](firmware-games.md) описывает
поиск SGS внутри образов ROM.

[freewebs]: https://web.archive.org/web/20080313004013id_/http://www.freewebs.com:80/kingstonkpex/games.htm
[markosoft]: https://web.archive.org/web/20091221050042id_/http://my.opera.com:80/Markosoft/blog/
[vstu-armor]: https://web.archive.org/web/20071030165259id_/http://www.immortal.vstu.edu.ru:80/index.php?name=Files&op=view_file&lid=84
[vstu-sf]: https://web.archive.org/web/20071030165254id_/http://www.immortal.vstu.edu.ru:80/index.php?name=Files&op=view_file&lid=83
[vstu-majak]: https://web.archive.org/web/20071030165304id_/http://www.immortal.vstu.edu.ru:80/index.php?name=Files&op=view_file&lid=85
[vstu-ss]: https://web.archive.org/web/20071030165244id_/http://www.immortal.vstu.edu.ru:80/index.php?name=Files&op=view_file&lid=81
[vstu-th]: https://web.archive.org/web/20071030165239id_/http://www.immortal.vstu.edu.ru:80/index.php?name=Files&op=view_file&lid=80
[cenix-armor]: https://web.archive.org/web/20060421214656id_/http://www.cenix.co.kr/cenix/?doc=bbs/gnuboard.php&bo_table=game_rpg&page=1&wr_id=2
[cenix-sf]: https://web.archive.org/web/20060421214743id_/http://www.cenix.co.kr/cenix/?doc=bbs/gnuboard.php&bo_table=game_action&page=1&wr_id=2
[cenix-th]: https://web.archive.org/web/20070824031336id_/http://www.cenix.co.kr/cenix/?doc=bbs/gnuboard.php&bo_table=game_action&page=1&wr_id=9
[cenix-ss]: https://web.archive.org/web/20060827201749id_/http://www.cenix.co.kr/cenix/?doc=bbs/gnuboard.php&bo_table=game_rpg&page=1&wr_id=3
[ikaria-bin]: https://web.archive.org/web/20070622171707id_/http://kpex.hexmode.org:80/bin/ikaria.sgs
[pyra]: https://pyra-handheld.com/boards/threads/kingston-k-pex-100-tech-specs.33231/
