# Reakosys M3D. Справочник API и демонстрации 2003–2005 годов

**Lost Planet** для Samsung SPH-X9300 использовала программный 3D-движок M3D. Reakosys также показывала на E3 2004 **Sanakan**, **3D Floria** и **Run on 3D**. Это отдельное направление поиска телефонных игр. [Lost Planet и M3D в iNews24](https://www.inews24.com/view/144849) · [Программа корейского стенда E3](https://www.etnews.com/200405110085) · [Разбор дампа SPH-X9300](samsung-x9300-ffs.md)

[Скачать комплект](../research/archives/Reakosys-M3D-Documentation-and-Demos.zip) · [Квитанции, хеши и статусы](../validation/reakosys-m3d-archive.json)

## Оригинальные файлы

- **M3D API Reference**, 67 страниц. Справочник описывает передачу буфера экрана и кучи, создание камеры, загрузку мешей и анимаций из памяти, шаг кадра и отрисовку. В прототипах используется семейство `OEMH_M3D2`, `OEMH_M3DX` и `OEMH_IM3DX`. [Снимок PDF](https://web.archive.org/web/20050319044935id_/http://partner.reakosys.com:80/board/dev/download/M3D_API_Reference.pdf)
- **ReakoLite M3D Engine**, листок 2003 года. В нём описаны программный рендеринг и **ReakoLite OCP**. Это плагин для 3ds Max с конвертером объектов и эмуляцией телефона для предпросмотра. Сохранилось описание OCP, сам пакет пока не получен.
- **Четыре SWF**, в том числе `demo-phone.swf` и корейский и английский варианты презентации продуктов. Проверены объявленные размеры, поток zlib у CWS и границы тегов, включая вложенные спрайты. У `demo-phone.swf` найдено 578 JPEG-тегов. Выборочно декодированные кадры показывают корпус телефона и видеоролик на экране 100 × 75. Игровой пакет в этих материалах не подтверждён. Flash-код не выполнялся. [Историческая страница демонстрации](https://web.archive.org/web/20030101152430id_/http://www.reakosys.com:80/english/demo-phone.html)

Сохранены **12 страниц** портала разработчика и демораздела. Все шесть PDF/SWF и 12 страниц побайтно проверены по SHA‑1 из CDX. PDF разобраны до конца по таблицам страниц. У справочника есть предупреждение о нумерации в таблице xref. Сами PDF сохранены без изменений.

## Имена пакетов с портала

| Имя файла          | Страница источника                                                                                                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `M3D_SAMPLE.zip`   | [Раздел примеров](https://web.archive.org/web/20050326040032id_/http://partner.reakosys.com:80/board/dev/sample_view.asp?id=9&page=1&CateA=reakosys&CateB=comm_share&CateC=&CateD=&search=&SearchString=)         |
| `M3D_MODEL.pdf`    | [Руководства](https://web.archive.org/web/20050318223555id_/http://partner.reakosys.com:80/board/dev/manual_view.asp?id=5&page=1&CateA=reakosys&CateB=comm_share&CateC=&CateD=&search=&SearchString=)             |
| `MMZ_TOOLS.zip`    | [Загрузки CP, запись 15](https://web.archive.org/web/20050325103540id_/http://partner.reakosys.com:80/board/cpzone/pds_view.asp?id=15&page=1&CateA=reakosys&CateB=comm_share&CateC=&CateD=&search=&SearchString=) |
| `M3D_TOOLS.zip`    | [Загрузки CP, запись 16](https://web.archive.org/web/20050325175424id_/http://partner.reakosys.com:80/board/cpzone/pds_view.asp?id=16&page=1&CateA=reakosys&CateB=comm_share&CateC=&CateD=&search=&SearchString=) |
| `COMMON_TOOLS.zip` | [Загрузки CP, запись 17](https://web.archive.org/web/20050325221012id_/http://partner.reakosys.com:80/board/cpzone/pds_view.asp?id=17&page=1&CateA=reakosys&CateB=comm_share&CateC=&CateD=&search=&SearchString=) |

Точные исходные URL взяты из скачанных HTML. По каждому из пяти URL CDX вернул HTTP 200 с пустым массивом. Воспроизведение Wayback для соответствующей даты вернуло HTTP 404. В манифест вошли только полученные и проверенные файлы. Отдельно сохранён индекс домена за 2000–2010 годы с 1 003 URL и статусы восьми не полученных страниц. Индекс охватывает успешные захваты с одним результатом на URL.
