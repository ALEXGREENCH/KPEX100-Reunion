# Dubigame. Astonishia Story, Wonders и другие игры KTF/SKT

В комплекте шесть исходных ZIP, извлечённых из зеркала Dubigame за 2021 год.
Для чтения оглавления и выбранных файлов использованы HTTP-диапазоны.
Каждый пакет проверен по CRC внешнего архива и вложенного JAR.
[Скачать комплект](../research/archives/Dubigame-Astonishia-Wonders-KTF-SKT.zip) ·
[Зеркало Dubigame](https://archive.org/details/dubi_20210525) ·
[Хеши и проверка](../validation/dubigame-mirror-ktf-skt.json).

| Сборка                    | Метаданные пакета         | Проверено в ARAM                                |
| ------------------------- | ------------------------- | ----------------------------------------------- |
| Astonishia Story EP1, KTF | `PD001990`, `01.00.05`    | Меню, новая игра, первая сцена и реплики        |
| Astonishia Story EP2, KTF | `PD002345`, `01.00.04`    | Меню, новая игра, первая сцена и реплики        |
| Astonishia Story EP3, KTF | `PD002530`, `01.00.04`    | Меню, новая игра, первая сцена и реплики        |
| Wonders: Hero’s Path, KTF | `PD003603`, `01.00.06`    | Настройка качества, вступление, выбор персонажа |
| Pirate King 2007, KTF     | `PD005122`, `01.00.00`    | Загрузчик, строка состояния телефона            |
| 2006 Germany Soccer, SKT  | `0000000006.jar`, 128×160 | Выбор команд, начало товарищеского матча и ввод |

Пять пакетов KTF содержат `__adf__`, JAR и нативный Thumb-код
`client.bin*`. В пакете 2006 Germany Soccer есть классы Java со
ссылками на API XCE и файлы `.mod`, `.msd`, `.wmr`. В `.msd`
указаны Nexon Mobile, версия `1.0.0`, ID `0053688813` и исходный
маршрут `/EXE/00264/99354_0053688813_0/0053688813.smf` на `wipi.nate.com:9100`.
Копия футбола
из зеркала совпала по SHA-256 с вложением, проверенным ранее.
Все шесть пакетов и их вложения проверены на заголовки SGS, совпадений
нет. Пакеты опубликованы в исследовательском разделе Reunion.
[Astonishia Story на Dubigame](https://dubigame.tistory.com/116) ·
[Wonders на Dubigame](https://dubigame.tistory.com/133) ·
[Релиз футбола от Nexon Mobile](https://www.newswire.co.kr/newsRead.php?no=148478) ·
[Предыдущая проверка SKT](wayback-game-search-pass22.md#dubigame-и-nexon).

Вложение Wonders с живой страницы Dubigame тоже скачалось и совпало
с зеркалом по SHA-256. В проверенной сборке от Jelly Oasis после вступления
клавиша `#` открывает выбор класса. Сетевой режим и прохождение игр
не проверялись. Для каждого запуска сохранены сценарий Lua, журнал
и снимки с проверяемыми хешами.
[Ветка WIE о мобильных сборках](https://github.com/dlunch/wie/issues/980) ·
[Исходники проверенной версии ARAM](https://github.com/mirusu400/aram-core/tree/fea299cba15696ed1460f965b76626d6edab5e03).

**Pirate King 2007: Second Ocean** в пакете подписана Entaz.
Это отдельный релиз, поиск [Pirate King от Lionlogics](lionlogics-gvm-game-search.md)
продолжается. В веб-версии WIE пакет Entaz импортируется, движок
показывает холст 176×220, но после запуска в контрольном прогоне
игровой кадр не появился. В ARAM на экране осталась строка состояния.
[Вложение Pirate King 2007](https://dubigame.tistory.com/190) ·
[Веб-версия WIE](https://wie.dlunch.net/).
