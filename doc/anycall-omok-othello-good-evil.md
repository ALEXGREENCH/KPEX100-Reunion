# Omok и Othello Good & Evil на Samsung Anycall

Два оригинальных MBIN из папки `버전 다름` в коллекции Anycall Land. Архивы содержат независимые кадры Python Unicorn и сценарии для проверки веб-ядра ARM/WASM. [Играть](https://alexgreench.github.io/KPEX100-Reunion/) · [Исходный архив Anycall Land](../research/archives/Samsung-Anycall-ADS-MBIN.zip)

## Omok (오목)

На доске 15 × 15 нужно поставить пять камней в ряд. Стрелки двигают курсор, Enter или Z соответствуют OK и ставят камень. Q, Tab и экранная MENU открывают меню партии. E и экранная UNDO отменяют ход вместе с ответом компьютера в одиночном режиме. Проверены ход компьютера, партия для двоих и завершение партии с возвратом в меню. [Оригинальный MBIN](../web/data/games/anycall/omok.mbin) · [Архив кадров](../research/archives/Samsung-Anycall-Omok-Replay.zip)

Экран 120 × 128. ADS `+0x24` переключает таймеры 1 и 2. Запрошенные интервалы округляются до тактов 60 Гц. Таймер партии использует прошедшие секунды. Команды Save и Load сохраняют запись партии в текущей сессии. [28 кадров и последовательности ввода](../validation/anycall-omok.json)

## Othello Good & Evil (오델로 선악전)

После заставки OK подтверждает режим, затем персонажа. Стрелки двигают курсор, OK ставит фишку. В проверенном начале два нажатия вверх переводят курсор на легальную клетку. После хода и ответа компьютера счёт меняется с 02:02 на 03:03. Отдельный прогон дошёл через 30 ходов игрока с ответами компьютера до экрана результата. [Оригинальный MBIN](../web/data/games/anycall/othello-good-evil.mbin) · [Архив кадров](../research/archives/Samsung-Anycall-Othello-Good-Evil-Replay.zip)

Для кадра 120 × 144 подтверждён вызов `+0xac` для региона 16 × 16. Два чистых цикла задержки по 50 000 и 250 000 итераций заменены эквивалентным изменением регистров, флагов и счётчика работы. В одном замере Node медленный такт занял около 5 мс после изменения вместо 102–108 мс. Во всех 114 контрольных кадрах, включая два прогона по 1 800 тактов, совпали пиксели и счётчики событий. Нижняя часть некоторых экранов настройки отрисовывается с наложением элементов. [Манифест](../validation/anycall-othello-good-evil.json)

```sh
python tools/replay-anycall-jumping-baby.py research/archives/Samsung-Anycall-ADS-MBIN.zip omok-replay --game omok
python tools/replay-anycall-jumping-baby.py research/archives/Samsung-Anycall-ADS-MBIN.zip othello-replay --game othello-good-evil
```
