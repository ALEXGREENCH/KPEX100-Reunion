# 59 пакетов LGT из Palletshipping

Проверены 70 записей Naver и 72 скачанных вложения. У 11 вложений SHA‑256 совпал с уже сохранёнными файлами. В двух архивах сохранены остальные 59 исходных ZIP с 58 различными JAR и два отдельных файла. Структурная проверка не подтвердила контейнеров SGS. [Манифест и результаты](../validation/palletshipping-59-lgt-wipi.json)

- [33 RPG и игры из раздела RPG](../research/archives/Palletshipping-LGT-33-RPG-Game-Packages.zip), включая Zenonia 2, Grand Chase и 영웅서기3.
- [26 аркад, симуляторов и спортивных игр](../research/archives/Palletshipping-LGT-26-Arcade-Sports-and-Simulation-Packages.zip), включая Metal Slug Survival, Rhythm Star 2 и KBO 프로야구 2009.

Архивы содержат исходные страницы, HTTP-заголовки, размеры, SHA‑256, CRC32 и результаты запусков. Отдельные вложения `audio.adt` и `cert.c2s` сохранены рядом с квитанциями. Их содержимое не интерпретировалось. [Няо-тайкун 2](https://m.blog.naver.com/palletshipping/222337476590) · [Запись с cert.c2s](https://m.blog.naver.com/palletshipping/222337513166)

## Две упаковки Metal Slug Survival

У двух исходных ZIP различаются SHA‑256. Все вложенные файлы и все шесть кадров начального сценария совпали. Сохранились обе упаковки, выпущенные с PID `PD110823`. [Первое вложение](https://m.blog.naver.com/palletshipping/222287417788) · [Второе вложение](https://m.blog.naver.com/palletshipping/222382372968)

У исходного ZIP Inotia Chronicle все файлы находились в одном каталоге. В отдельной копии для ARAM убран этот префикс, содержимое файлов сверено по SHA‑256. [Исходный ZIP](https://m.blog.naver.com/palletshipping/222205248165)

## Проверка ARAM

58 пакетов завершили сценарий из шести снимков. В пяти из восьми парных прогонов нажатие изменило кадр относительно контроля на том же виртуальном времени. Это Zenonia 2, 영웅서기3, Grand Chase и обе упаковки Metal Slug Survival. NHN*데몬헌터 остановился при старте на `MC_GRP.MC_grpFlushLcd` с сообщением о владельце поверхности. Сценарии, журналы и снимки лежат в `replays/`. Проверка охватывала старт и первые сцены. [Ревизия ARAM](https://github.com/mirusu400/aram-core/tree/fea299cba15696ed1460f965b76626d6edab5e03) · [NHN*데몬헌터](https://m.blog.naver.com/palletshipping/222287971363)
