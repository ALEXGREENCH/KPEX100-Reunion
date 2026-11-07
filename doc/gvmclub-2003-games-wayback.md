# Две игры GVM Club 2003 года и снимок Pass 8

В разделе обмена исходниками GVM Club сохранились объявления двух игр.
Оригинальные HTML и квитанции Wayback лежат в опубликованном снимке.
[Список публикаций](https://web.archive.org/web/20040423023742id_/http://www.gvmclub.com:80/data/source/list.php3?table=tbl_pds_source&page=4).

| Публикация                                   | Что указал автор                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Tetris**, 야니, 5 марта 2003 года          | В `Tetris.zip` лежали бинарник, исходник и изображения. [Пост](https://web.archive.org/web/20041118175551id_/http://www.gvmclub.com:80/data/source/read.php3?table=tbl_pds_source&no=7&page=4)                                                                                                                                             |
| **묵!찌!빠!**, Xobject, 21 февраля 2003 года | Первую игру автор проверял на Motorola V730. Для повторной сборки из `MookZiPa11.zip` нужны `MookZiPa11.mc`, `res_img_mid.sbm` и `basic_snd1.ssd`. В инструкции указан каталог `GVM_SDK_v152_20021001`. [Пост](https://web.archive.org/web/20040123180545id_/http://gvmclub.com:80/data/source/read.php3?table=tbl_pds_source&no=6&page=4) |

Точные пути вложений восстановлены из HTML. В текущем CDX-индексе
коллекции по ним нет записей. Wayback Availability вернул HTTP 429,
а два индекса Common Crawl, 2008–2009 и 2014-52, вернули 404
для обоих точных адресов. Оба ZIP и упомянутая редакция SDK остаются
в поиске. [Адреса, результаты и хеши страниц](../validation/wayback-delta-pass8.json).

По модели из сообщения Xobject сохранены [пять образов V730 AOne R-UIM](motorola-v730-firmware.md).

## Сохранённые ответы

На 7 ноября 2026 года в очереди 53 659 записей CDX, из которых **10 987**
сверены по исходной контрольной сумме. Это **1 640** проверенных ответов
сверх Pass 7. Остаётся 41 387 ожидающих запросов, 1 222 несовпадения
хешей и 63 записи на повтор. В дополнении 1 476 новых объектов SHA-256,
включая исторические страницы и ответы с другими статусами.

Комплект после восстановления использует 10 734 объекта. Их SHA-256
пересчитаны, для всех записей `verified` также повторно проверен CDX
SHA-1. Прочитана восстановленная SQLite-очередь. Новые объекты проверены
на сигнатуры ZIP, 7z, RAR, PE, gzip, CAB и на полный SGS в начале тела.
Ни одна из этих проверок не обнаружила нового контейнера игры.
[Результаты](../validation/wayback-delta-pass8.json).

## Восстановление и поиск

Дополнение [Pass 8](../research/archives/GNEX-GVM-Wayback-Delta-Pass8-20261107.zip)
требует самостоятельный [Pass 7](../research/archives/GNEX-GVM-Wayback-Partial-Pass7-20261107.zip).
Для Pass 7 ожидается SHA-256
`f9a373528e4de958ac0a947b42613f652e98375503648748d7a5f373b71ff019`.
Сначала распакуйте Pass 7 в пустой каталог, затем поверх него Pass 8.
После этого `restored/collection` содержит текущую очередь и оригинальные
ответы, а `restored/manifest.json` описывает файлы последнего дополнения.

```sh
python -m zipfile -e GNEX-GVM-Wayback-Partial-Pass7-20261107.zip restored
python -m zipfile -e GNEX-GVM-Wayback-Delta-Pass8-20261107.zip restored
python tools/wayback-harvest.py restored/collection --index --download --retry
```

Для текстового поиска распаковывать архивы не требуется.

```sh
python tools/wayback-text-index.py build GNEX-GVM-Wayback-Delta-Pass8-20261107.zip --base GNEX-GVM-Wayback-Partial-Pass7-20261107.zip --output pass8-index.json
python tools/wayback-text-index.py search pass8-index.json "MookZiPa11"
```

Индекс проверен на опубликованной паре архивов. Строка
`GVM_SDK_v152_20021001` найдена в четырёх разных снимках одного поста.
