# Sinjisoft: инструкции разработчикам и корейские публикации

7 ноября 2026 года сохранён следующий частичный снимок GNEX Club,
GVM Club, Sinjisoft и связанных сообществ: **53 659 записей CDX,
2 952 ответа с совпавшим digest, 3 263 объекта HTTP**. По сравнению
с [Pass 4](wayback-partial-pass4.md) добавились 593 подтверждённых ответа.
Все 53 659 буквальных записей предыдущего индекса сохранились без изменений.
Сбор продолжается; полученные индексы не означают загрузку всех тел.

- [Снимок Pass 5](../research/archives/GNEX-GVM-Wayback-Partial-Pass5-20261107.zip):
  38 584 526 байт, SHA-256 `c965cacbbf6a537d4a33bfa72a1f5fb7d6a9080aec24868a9dd9be5305c577c8`.
- [Подборка инструкций и публикаций](../research/archives/Sinjisoft-Korean-Programming-Tips-and-Press-Followup.zip):
  1 897 112 байт, SHA-256 `ccc0d71b2ea8df7e6386e0dbde41db44fbe7b8ad23e97a8327b7fb0c956b5b5b`.

[Проверка снимка](../validation/wayback-partial-pass5.json) охватывает
CRC 3 273 файлов и SHA-256 3 272 записей манифеста.
[Проверка подборки](../validation/sinjisoft-programming-press-preservation.json) —
CRC 43 файлов, SHA-256 42 записей, десять исходных корпоративных HTML
и четыре заново скачанных статьи корейских издателей.

## Десять сообщений Sinjisoft

Это выбранные страницы собственной доски `board2`, автор — Sinjisoft.
Пять тел уже были подтверждены в Pass 4; ещё пять подтверждены в Pass 5.
Они не объявляются десятью вновь найденными программами или пресс-релизами.
Для каждой страницы сохранены оригинальные байты, буквальная запись CDX,
HTTP-квитанция, дата на странице, дата снимка и отдельный текст UTF-8.
Все десять SHA-1 совпали с CDX, корейский текст декодирован без потерь.

| Дата на странице | Сообщение                                                                                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2001/07/16       | [78: GVM Application Programming Tips (01.07.13현재)](https://web.archive.org/web/20020924105943id_/http://www.sinjisoft.com:80/board/bbs.cgi?db=board2&mode=read&num=78&page=20&ftype=6&fval=&backdepth=4)       |
| 2001/07/30       | [93: n.TOP GVM Service Guide 게시 공지](https://web.archive.org/web/20020719170456id_/http://www.sinjisoft.com:80/board/bbs.cgi?db=board2&mode=read&num=93&page=14&ftype=6&fval=&backdepth=5)                     |
| 2001/09/21       | [155: GVM 기술세미나 개최](https://web.archive.org/web/20020316232414id_/http://sinjisoft.com:80/board/bbs.cgi?db=board2&mode=read&num=155&page=6&ftype=6&fval=&backdepth=3)                                      |
| 2001/11/05       | [193: SWAP Service Guide 재배포 공지](https://web.archive.org/web/20020717204125id_/http://www.sinjisoft.com:80/board/bbs.cgi?db=board2&mode=read&num=193&page=7&ftype=6&fval=&backdepth=6)                       |
| 2001/11/12       | [202: [API활용] LoadMedia() 사용시 에러처리방법](https://web.archive.org/web/20020312140147id_/http://sinjisoft.com:80/board/bbs.cgi?db=board2&mode=read&num=202&page=4&ftype=6&fval=&backdepth=3)                |
| 2002/04/09       | [330: True Color ImageMaster2 재배포](https://web.archive.org/web/20020908070811id_/http://www.sinjisoft.com:80/board/bbs.cgi?db=board2&mode=read&num=330&page=6&ftype=6&fval=&backdepth=3)                       |
| 2002/05/27       | [368: [study] Mobile C 스터디 자료 - 4](https://web.archive.org/web/20030227035158id_/http://www.sinjisoft.com:80/board/bbs.cgi?db=board2&mode=read&num=368&page=8&ftype=6&fval=&backdepth=3)                     |
| 2002/11/19       | [543: 모바일C Command Line 컴파일러 배포](https://web.archive.org/web/20040331124942id_/http://sinjisoft.com:80/board/bbs.cgi?db=board2&mode=read&num=543&page=18&ftype=6&fval=&backdepth=1)                      |
| 2002/12/09       | [560: 컴파일과정에서 제공하는 정보에 관하여 (FAQ-Mobile C)](https://web.archive.org/web/20030102021011id_/http://www.sinjisoft.com:80/board/bbs.cgi?db=board2&mode=read&num=560&page=0&ftype=6&fval=&backdepth=2) |
| 2003/02/25       | [629: Wi-Top 단말 다운로드 테스트](https://web.archive.org/web/20030924153127id_/http://sinjisoft.com:80/board/bbs.cgi?db=board2&mode=read&num=629&page=11&ftype=6&fval=&backdepth=1)                             |

В сообщении 78 компания объясняет возобновление контента после входящего
звонка и ограничения звука, вибратора и vocoder. Там же описаны отсутствие
короткого замыкания у `&&` / `||`, инициализация двумерных массивов,
ограничение `StrInput()` и отключение чата через `LockChatMode()`.
Это датированные указания для раннего Mobile C; они не переносятся
автоматически на все поздние GNEX.

Сообщение 560 разделяет ограничения GVM1X/2X и GVM3X: область кода,
символы, ресурсы и рабочая память. Оно объясняет смысл `Ram Max. Size`
и влияние отладочной сборки. Числа из этой страницы описывают указанные
версии, а не общий предел любого SGS.

Сообщения 93 и 193 дают оглавление сервисного руководства и исправления
протокола загрузки. Сообщение 202 описывает обработку отсутствия ответа
в `LoadMedia()` на уровне приложения. Ссылка в сообщении 368 ведёт к
уроку ImageMaster с `ring.mc`: в индексе найден снимок с HTTP 404,
поэтому сам урок и его вложение здесь не названы восстановленными.
Объявления компилятора и ImageMaster2 также не заменяют их бинарники.

## Четыре публикации корейских издателей

Получены полные исходные HTML с HTTP 200 и читаемым текстом статьи:

- [iNews24, 19 июня 2003: объявление о GNEX для WIPI](https://www.inews24.com/view/93095).
- [ETNews, 5 января 2001: объявление семинара GVM](https://www.etnews.com/200101050031).
- [iNews24, 20 ноября 2005: история и интервью Sinjisoft](https://www.inews24.com/view/179367).
- [ETNews, 9 сентября 2008: обновление GNEX для сенсорных телефонов](https://www.etnews.com/200809090112).

Это **редакционные публикации**, отдельно от собственных релизов компании.
Дата получения, заголовки HTTP, URL, размер и SHA-256 сопровождают каждый
оригинал. Сохранена вся полученная HTML-страница, включая оформление сайта;
извлечённый текст лежит отдельно. Заявления о скорости и доле рынка не
подменяют измерения эмулятора. Статья о сенсорном GNEX — зацепка для поиска
более позднего SDK и API, а не полученный телефонный проигрыватель.

[30 релизов Newswire](sinjisoft-press-preservation.md) и
[ранние объявления с двумя PDF семинара 2000 года](sinjisoft-corporate-seminar-2000.md)
остаются самостоятельными комплектами.

## Поиск и границы снимка

В `derived/wayback-pass5-text-index.json` находятся **2 441 различных
подтверждённых HTML с HTTP 200**, соответствующих 2 524 снимкам.
Десять тел имеют явно отмеченную потерю символов при декодировании.
Индекс включает также формы, перепечатки, спам и исторические страницы
ошибок с HTTP 200; совпадение слова не означает найденный документ.
Все исходные байты остаются в полном снимке.

После распаковки подборки можно искать по корейским оригиналам:

```sh
python tools/wayback-text-index.py search derived/wayback-pass5-text-index.json "기술자료"
python tools/wayback-text-index.py search derived/wayback-pass5-text-index.json "보도자료"
python tools/wayback-text-index.py search derived/wayback-pass5-text-index.json "컴파일"
python tools/wayback-text-index.py search derived/wayback-pass5-text-index.json "기술세미나"
```

В снимке 2 952 задачи `verified`, 302 `mismatch`, 9 `retry` и
50 396 `pending`. Совпадение digest подтверждает точные байты, включая
исторические ошибки и перенаправления; оно не подтверждает полезность ответа.
Архив не является полным WARC сайтов. JavaScript, исторические формы
и программы из страниц при подготовке подборки не исполнялись.

GNEX SDK **1.20/1.40**, `GVM_SDK_v152_031222.zip` и самостоятельный
телефонный GNEX-плеер в этом проходе не получены.
[Точные имена и оставшиеся направления](gnex-early-sdk-player-followup.md)
сохраняются с прежними статусами.
