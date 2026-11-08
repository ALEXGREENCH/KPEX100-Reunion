# RPG и мини-игры KTF BREW из Brewgames

Из двух публичных разделов Brewgames получены 89 ZIP. **88 ранее не сохранённых пакетов** вошли в архив. ZIP Magna Carta M совпал по SHA-256 с копией из [подборки Softmax](softmax-mobile-and-symbian.md). Для него сохранена исходная страница и ссылка на прежний архив. [Скачать комплект](../research/archives/Brewgames-KTF-BREW-RPG-and-Mini-Games.zip) · [Список сборок, хеши и источники](../validation/brewgames-ktf-brew-rpg.json)

| Игра                         | Исходная публикация                                                            |
| ---------------------------- | ------------------------------------------------------------------------------ |
| Ragnarok Gaiden: Kafra Quest | [라그나로크외전-카프라퀘스트](https://m.blog.naver.com/brewgames/223962791195) |
| MapleStory: Magician         | [메이플스토리 법사편](https://m.blog.naver.com/brewgames/223943930269)         |
| The War of Genesis: Crow 2   | [창세기전 크로우2](https://m.blog.naver.com/brewgames/223943944642)            |
| Astonishia Story, Episode 1  | [어스토니시아 스토리(EP1)](https://m.blog.naver.com/brewgames/223943938890)    |
| Wonders                      | [원더즈 영웅의길](https://m.blog.naver.com/brewgames/223960727936)             |
| Legend of Darkness           | [어둠의전설](https://m.blog.naver.com/brewgames/223956567499)                  |

У 89 проверенных пакетов разные основные MOD. Пакет Wonders дополнительно содержит `7400/billcom3.mod` со своими MIF и SIG. В Ragnarok Gaiden один и тот же MOD сохранён и в папке, и во вложенном ZIP. Все исходные ZIP прошли проверку CRC. Полных SGS в проверенных данных не найдено. Запуск этих сборок не проверялся.

В Legend of Darkness ресурс `lod.bar` содержит 92 совпадающие записи локальных заголовков и центрального каталога ZIP. В конце файла отсутствует завершающая запись ZIP. Для разбора добавлена производная копия `lod-resources-compatible.zip` с этой 22-байтной записью. CRC всех 92 ресурсов прошли проверку. Исходный пакет и `lod.bar` сохранены без изменения.
