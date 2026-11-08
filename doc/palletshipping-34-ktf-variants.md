# 34 пакета KTF из Palletshipping

В выборке из 117 записей Naver скачано 118 вложений KTF и SKT. У 84 вложений SHA‑256 совпал с файлами в предыдущих архивах. В этот комплект вошли остальные 34 исходных пакета KTF. В 22 пакетах найдены JAR, которых ещё не было в проверенной коллекции. У остальных 12 внешний ZIP отличается, а вложенный JAR совпадает с уже сохранённым. Сканирование этой партии не подтвердило контейнеров SGS. [Скачать комплект](../research/archives/Palletshipping-34-KTF-Packages-and-Survival-Diary.zip) · [Хеши и список пакетов](../validation/palletshipping-34-ktf-variants.json)

Среди новых JAR есть Pop’n Music, Super Action Hero, Sudden Attack, Legend of Magic School 2, Chroisen для 240×400 и KOEI 삼국지2. В комплекте сохранены исходные страницы Naver, HTTP-заголовки, SHA‑256 и CRC32. Записи об одинаковых вложениях и сведения о ранних копиях JAR лежат в отчёте. [Pop’n Music](https://m.blog.naver.com/palletshipping/222241600518) · [Sudden Attack](https://m.blog.naver.com/palletshipping/222268440753) · [Chroisen](https://m.blog.naver.com/palletshipping/222268451872) · [KOEI 삼국지2](https://m.blog.naver.com/palletshipping/222274065373)

## Survival Diary

Пакет 생존일기, PID `PD003813`, подписан как ZIP. По сигнатуре это RAR с двумя байтами `0d0a` после конца контейнера. Исходное вложение сохранено целиком. В `derived/Survival-Diary-ARAM.zip` лежат те же 13 файлов. Их размеры и CRC сверены с оглавлением RAR, а SHA‑256 записаны в манифесте. Извлечение выполнено через 7‑Zip. [Исходное вложение](https://m.blog.naver.com/palletshipping/222274047461)

## Проверка ARAM

32 пакета дошли до конца короткого сценария из шести снимков. В семи из девяти парных прогонов кадр после нажатия отличался от кадра на том же виртуальном времени без ввода. Среди них Survival Diary, Super Action Hero, Legend of Magic School 2 и 귀혼 무사편. В Rhythm Star и 질풍노도 십칠대일 проверенное нажатие кадр не изменило. Эти прогоны охватывают запуск и первые сцены. [Ревизия ARAM](https://github.com/mirusu400/aram-core/tree/fea299cba15696ed1460f965b76626d6edab5e03)

Inotia 2 и 삼국쟁패2-전사편 остановились с ошибкой `invalid application machine state` на кадрах 1310 и 837 соответственно. Для 논스톱액션고고씽 в трёх снимках хеш декодированных пикселей отличается от хеша кадра в журнале ARAM. В отчёте записаны оба значения. Сценарии, снимки, журналы и ошибки лежат в `replays/`. [Inotia 2](https://m.blog.naver.com/palletshipping/222241652661) · [삼국쟁패2-전사편](https://m.blog.naver.com/palletshipping/222274064408)
