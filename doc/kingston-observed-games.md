# Игры на фотографии Kingston K-PEX 100

На предоставленной пользователем фотографии виден экран `GAME` одного Kingston
K-PEX 100 с шестью именами SGS. Это свидетельство содержимого списка на конкретном
устройстве. Фотография не показывает запуск игр, размеры или хеши файлов, версию
прошивки и историю заполнения накопителя. Она не устанавливает заводской комплект
из шести игр. Дата съёмки и первоначальный источник фотографии не установлены;
само изображение в репозитории не распространяется.

## Точная запись имён

| Имя на экране            | Историческое соответствие                                                     | Что сохранено в Reunion                                      |
| ------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `Armor_eng_drm.sgs`      | Battle Armor / 배틀아머                                                       | Бинарник с этим именем не найден                             |
| `SoulSword_k.sgs`        | Soul Sword / 귀혼마도 (鬼魂魔刀)                                              | Бинарник с этим именем не найден                             |
| `TresureHunter_k.sgs`    | Treasure Hunter / 트레져헌터                                                  | Бинарник с этим именем не найден                             |
| `ikaria.sgs`             | Ikaria; сохранённый одноимённый файл имеет внутреннее название `이카리아 ep2` | Один файл, 822 550 байт; тождество фотографии не установлено |
| `majak_20060313_drm.sgs` | The Man-Jong / Majak                                                          | Бинарник с этим именем не найден                             |
| `sf_eng_drm.sgs`         | Star Fighter / 스타파이터                                                     | Бинарник с этим именем не найден                             |

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
карточка Cenix в проверенном наборе не установлена. Слово **Star Force** встречается
в [вопросе участника форума 2007 года][pyra], пересказывающего руководство;
оснований считать его отдельной сохранённой игрой или подтверждённым внутренним
названием `sf_eng_drm.sgs` нет.

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

## Что удалось восстановить и что искать дальше

Проверка 5 ноября 2026 года сопоставила фотографию с локальными оригиналами,
каталогом Reunion и предоставленным исследовательским архивом
`KPEX100_GMP-M6_games_and_SGS_research.zip`. Пять отсутствующих SGS в этих
наборах не обнаружены. Первичные HTML-страницы Freewebs, Markosoft, VSTU
и четырёх карточек Cenix повторно получены из Wayback; новые игровые бинарники
в ходе этой проверки не восстановлены.

Индекс Wayback с фильтром HTTP 200 вернул пустой результат для шаблонов
`www.freewebs.com/kingstonkpex/*.sgs`, `files.myopera.com/Markosoft/blog/*.sgs`
и всех пяти точных адресов RAR с VSTU. Wayback Availability также не вернул
снимки этих RAR. [Запросы по адресам VSTU](../validation/kingston-vstu-binary-checks.json).
Результат относится к проверенным адресам; копии могут сохраниться на других
сайтах или накопителях.

Приоритетные имена для поиска в резервных копиях владельцев и образах накопителей:

| Цель            | Исторические имена и варианты упаковки                                      |
| --------------- | --------------------------------------------------------------------------- |
| Battle Armor    | `Armor_eng_drm.sgs`, `Battle Armor.sgs`, `Armor.rar`                        |
| Soul Sword      | `SoulSword_k.sgs`, `Soul Sword (korean).sgs`, `SoulSword_k.rar`             |
| Treasure Hunter | `TresureHunter_k.sgs`, `Tresure Hunter (korean).sgs`, `TresureHunter_k.rar` |
| Man-Jong        | `majak_20060313_drm.sgs`, `Majak.sgs`, `majak_20060313_drm.rar`             |
| Star Fighter    | `sf_eng_drm.sgs`, `Star Fighter.sgs`, `sf_eng_drm.rar`                      |

До получения исходных файлов нельзя добавлять эти пять позиций в список
запускаемых игр. Для найденного кандидата следует сохранить оригинальное имя,
размер, SHA-256, источник и структуру SGS; только затем проверять его запуск.
Игры из меню устройства следует отличать от контейнеров внутри ROM:
[проверка девяти прошивок](firmware-games.md) описывает это различие.

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
