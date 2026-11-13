# Задники неба над гексовым полем — 5 картинок (2026-11-06)

Это продолжение PR #133–135. Поле теперь из гексов и стоит под наклоном, а над ним идёт полоса неба: на телефоне это примерно верхняя четверть поля, по пропорциям около 7:1. Сейчас небо нарисовано кодом, это заглушка (`src/game/hexScene.ts`). Картинки ниже её заменят.

**Как работаем.** Каждый задник — отдельная картинка GPT, одна в сутки на биом. Образец стиля прикладывать один: `game-screens/hex-field/1-frontier-phone.png` (там видно, как полоса неба лежит над полем). Если GPT ошибся в мелочи, чиним в Gemini, а не тратим новую попытку GPT.
**Как вставим.** Из картинки вырезаем горизонтальную полосу у линии горизонта, поэтому всё важное должно лежать в этой полосе. Кромка у поля в игре сливается с травой.

---

## Общий промт (подставлять блок биома из списка ниже)

```
Fantasy game background, wide landscape panorama, 1536x1024, hand-painted dark-fantasy style matching the attached screenshot (muted, painterly, not photoreal, no outlines).
This is the distant backdrop seen BEHIND a battlefield, like the sky strip above a hex battle map in classic strategy games.

Composition (strict):
- Horizon line exactly at 78% of the image height.
- All interesting shapes (mountains, silhouettes, landmarks) sit in a horizontal band between 50% and 78% of the height. Nothing important above 45% — only sky there.
- Below the horizon (78%–100%): flat, plain ground in the biome's ground color, no objects, no texture details, no shadows — it will be cropped and blended into the game field.
- The landmark row must be readable when the image is cropped to a thin strip 1536x220 around the horizon.
- Wide and even across the whole width: no single huge centered object, so it can be cropped left/right freely.
- No characters, no creatures, no buildings in the foreground, no text, no frame, no UI, no vignette, no lens effects.
- Calm, low-contrast so units on the field stay brighter than the background.

Biome:
<BIOME>
```

## Блоки биомов

1. **Пограничье** (карта 1, орки):
   `Frontier at dusk: deep blue-violet sky fading to warm orange at the horizon, a distant snowy mountain ridge, dark pine forest line along the horizon, thin smoke columns from a distant human camp on the right third. Ground below horizon: muted olive green.`
2. **Болотный склеп** (карта 2, нежить):
   `Haunted swamp: heavy grey-green fog, pale sickly light low in the sky, silhouettes of dead twisted trees and crooked old gravestones and a ruined crypt on the horizon, mist pooling low. Ground below horizon: dark mossy green-grey.`
3. **Ледяные пустоши** (карта 3, Культисты льда):
   `Frozen wastes at night: deep navy sky with faint green and violet aurora bands, jagged icy peaks with blue shadows, a few sharp ice spires of a cult shrine far away. Ground below horizon: muted pale blue-grey snow (not bright white).`
4. **Выжженные земли** (карта 4, демоны):
   `Scorched lands: dark crimson sky glowing orange-red at the horizon, a volcano on the left third with a faint lava glow, black jagged rocks, drifting ash, a far demonic gate silhouette. Ground below horizon: dark burnt brown-red.`
5. **Цитадель сумерек** (карта 5, тёмные эльфы):
   `Twilight citadel: very dark indigo sky, a large pale moon in the upper right third, tall slender dark-elf spires and thin bridges on the horizon, cold violet light. Ground below horizon: dark slate blue.`

## Проверка перед отправкой

- Горизонт на высоте ~78 %, а ниже него ровная земля без предметов.
- Полоса 1536×220 у горизонта читается сама по себе.
- Небо спокойное, а фон темнее и мягче юнитов.

Готовые картинки класть в `art-pipeline/incoming/backdrop-<биом>.jpg` (frontier, swamp, ice, scorched, citadel). Нарезку и встраивание делаю я.
