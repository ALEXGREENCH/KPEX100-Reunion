# WIPI Manager, реестр Motorola MS500 и инструменты для телефонов

В 30 записях Palletshipping просмотрены 30 вложений. Скачанные файлы и оригинальные страницы с вложениями распределены по четырём архивам. Все девять ZIP-контейнеров прошли тест CRC в 7-Zip, включая три комплекта с отдельными томами. Найденные Windows-программы проверены по заголовкам. У десяти образцов SMAF длина контейнера MMMD совпала с размером файла. [Хеши и результаты](../validation/palletshipping-wipi-tools-and-ms500.json)

- [WIPI Manager, MS500, WMRMake, BitPim и SMAF](../research/archives/Palletshipping-WIPI-Manager-MS500-Registry-and-SMAF.zip). В архиве есть `prjWIPIMgr.exe`, ZIP с побайтно совпадающей копией EXE, `wmrmake-leeka205.exe` в исходном ZIP, два тома BitPim 1.0.7, установщик Yamaha MidRadio Player, десять MMF и один MP3.
- [QPST и DFS](../research/archives/Palletshipping-QPST-and-DFS-Service-Tools.zip). Сохранены QPST 2.7.264, все три тома QPST 2.7.419 и DFS.
- [Драйвер Samsung USB](../research/archives/Palletshipping-Samsung-USB-Driver-Original-Volumes.zip). Сохранены четыре тома `.zip`, `.z01`, `.z02` и `.z03`.
- [Драйверы LG, Pantech и SKT](../research/archives/Palletshipping-LG-Pantech-and-SKT-USB-Drivers.zip). Сохранены LG United Mobile Driver 3.5, Pantech USB Driver 4.15.2.0 и UniUSBDriver SKT.

Для проверки многотомного ZIP распакуйте комплект, оставьте все его тома в одной папке и укажите файл с расширением `.zip` в 7-Zip. Установщики не запускались.

К инструкции для Motorola MS500 (RAZR) приложены два шаблона восстановления реестра. Первые 202 байта `registry(gnex).dat` совпадают со всем файлом `registry.dat`. Следующие 160 байт содержат поля с длинами, включая идентификатор `A000200001`, имя `GNEX_GIGA13`, версию `36.15.0` и связь `EXECUTABLE / PLAYER / application/x-gnex-sgs`. Смещения и хеши записаны в `evidence/ms500-registry.json`. Это образец регистрации из инструкции. В ZIP лежат только два файла реестра. [Инструкция и исходное вложение](https://m.blog.naver.com/palletshipping/222298326285) · [WIPI Manager](https://m.blog.naver.com/palletshipping/222267386146)
