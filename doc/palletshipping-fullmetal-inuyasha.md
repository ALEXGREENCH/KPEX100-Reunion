# Fullmetal Alchemist и Inuyasha для KTF

В двух исходных пакетах из Palletshipping найдены полные SGS v4. Обе игры подписаны `일렉트릭아일랜드` в операторских дескрипторах. Извлечённые байты совпали с диапазонами исходных нативных файлов. ZIP и JAR прошли проверку CRC. [Оригиналы, SGS и сценарии](../research/archives/Palletshipping-Fullmetal-Alchemist-and-Inuyasha-KTF.zip) · [Размеры, хеши и результаты](../validation/palletshipping-fullmetal-inuyasha.json)

| Игра                | Операторская сборка             | Место в исходнике                                                                                                   |
| ------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Fullmetal Alchemist | `PD003014`, `01.00.00`, 176×220 | `01030CEA.jar / client.bin29068`, `0x2ca48`. [Вложение Naver](https://m.blog.naver.com/palletshipping/222268432266) |
| Inuyasha            | `PD004023`, `01.00.00`, 240×320 | `0103412C.jar / client.bin29276`, `0x32f94`. [Вложение Naver](https://m.blog.naver.com/palletshipping/222268432617) |

**Fullmetal Alchemist.** После пропуска вступления клавишей `*` открывается первый бой в вагоне. На 24 775 мс виртуального времени стрелка вправо и цифра `6` дали одинаковый кадр с перемещением Эдварда вправо. От кадра без ввода он отличается на 16 424 пикселя.

**Inuyasha.** После подтверждения новой игры открывается карта. В парном прогоне на 21 730 мс два нажатия OK переводят с карты к диалогу в деревне. Без ввода остаётся карта. Сценарии проходят со штатным бюджетом исполнения. Полные прохождения не проверялись.

```sh
node tools/replay-sgs.mjs fullmetal-alchemist-ktf replays/fullmetal-alchemist-ktf/world/actions.json
node tools/replay-sgs.mjs inuyasha-ktf replays/inuyasha-ktf/world/actions.json
```

Оба сценария лежат внутри комплекта. Из 25 проверенных вложений Palletshipping эти два содержали структурно валидные SGS. Хеши и результаты сканирования всех вложений перечислены в `evidence/survey.json`.
