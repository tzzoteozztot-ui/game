#!/usr/bin/env python3
"""
Сценарий главы (markdown Лороведа) → данные диалогов игры src/campaign/script_ch<N>.ts.

    python3 scripts/dialogs_from_md.py /mnt/project-files/lore/campaign-ch1-dialogs-v2.md 1
    python3 scripts/dialogs_from_md.py /mnt/project-files/lore/campaign-ch2-bog.md 2   # и так же 3, 4, 5

Сцена в файле — заголовок «### Г1-02. …», реплика — «**Эхо (Лина):** текст». Метки `{подсказка: …}`
вырезаются. Какой сцене игры отдать заголовок — `SCENE_IDS` ниже (несколько заголовков могут идти в одну
сцену подряд; в главах 2–5 id сцены — сам повод: `before:bog_sq1`, `event:bog_event1`, `start:bog`). Реплики под
«**Вариант Б — …**» в сцене события звучат после этого выбора (`choice:<объект>:2`). Строка
«*Если торговля:* **Корх (…):** …» звучит только при флаге выбора (`CONDS`). Правки текста под то, что есть в игре, — `FIXUPS` (старый кусок → новый); если кусок не
найден, скрипт падает, чтобы правка не потерялась молча.
"""
import json
import re
import sys

# Заголовок сценария → id сцены в игре (см. SCENE_AT в src/campaign/dialogs.ts)
SCENE_IDS = {
    1: {
        'Г1-00': 'start', 'Г1-01': 'start',
        'Г1-02': 'sq1', 'Г1-03': 'sq1-after', 'Г1-04': 'chest1', 'Г1-05': 'sq2', 'Г1-06': 'sq2-after',
        'Г1-07': 'quarry-after', 'Г1-08': 'camp', 'Г1-09': 'saw', 'Г1-10': 'shrine', 'Г1-11': 'sq3',
        'Г1-12': 'levels', 'Г1-13': 'levels', 'Г1-14': 'warcamp', 'Г1-15': 'warcamp-after', 'Г1-16': 'sq4',
        'Г1-17': 'sq5', 'Г1-18а': 'goldmine-after', 'Г1-18б': 'node-after', 'Г1-19': 'sq6', 'Г1-20': 'sq7',
        'Г1-21': 'guard', 'Г1-22': 'stavka', 'Г1-23': 'fortress', 'Г1-24': 'boss', 'Г1-24а': 'kallen',
        'Г1-25': 'fortress-after',
    },
    # Главы 2–5: объекты — слоты src/campaign/chapters.ts с приставкой главы
    2: {
        'Г2-00': 'start:bog', 'Г2-01': 'before:bog_sq1', 'Г2-02': 'before:bog_sq2', 'Г2-02б': 'after:bog_sq2',
        'Г2-03': 'loot:bog_chest1', 'Г2-04': 'camp:bog', 'Г2-05': 'event:bog_event1', 'Г2-06': 'event:bog_forkB',
        'Г2-06а': 'loot:bog_forkA', 'Г2-07': 'before:bog_cross', 'Г2-08': 'after:bog_node', 'Г2-09': 'before:bog_sq3',
        'Г2-10': 'event:bog_event3', 'Г2-11': 'before:bog_guard', 'Г2-12': 'before:bog_fortress',
        'Г2-13': 'wave:bog_fortress:12', 'Г2-13а': 'wave:bog_fortress:13', 'Г2-13б': 'wave:bog_fortress:15',
        'Г2-13в': 'wave:bog_fortress:17', 'Г2-14': 'before:bog_fortress', 'Г2-15': 'after:bog_fortress',
        'Г2-16': 'after:bog_fortress',
    },
    3: {
        'Г3-00': 'start:ice', 'Г3-01': 'before:ice_sq1', 'Г3-02': 'event:ice_event1', 'Г3-03': 'after:ice_sq2',
        'Г3-04': 'after:ice_node', 'Г3-05': 'loot:ice_forkA', 'Г3-06': 'after:ice_sq3', 'Г3-07': 'after:ice_sq3',
        'Г3-08': 'before:ice_event3', 'Г3-09': 'wave:ice_event3:8', 'Г3-10': 'after:ice_event3',
        'Г3-11': 'after:ice_event3', 'Г3-12': 'after:ice_event3', 'Г3-13': 'before:ice_rich',
        'Г3-14': 'before:ice_fortress', 'Г3-15': 'before:ice_fortress', 'Г3-16': 'after:ice_fortress',
    },
    4: {
        'Г4-00': 'start:ash', 'Г4-01': 'before:ash_sq1', 'Г4-02': 'event:ash_event1', 'Г4-03': 'after:ash_event1',
        'Г4-04': 'event:ash_forkA', 'Г4-05': 'event:ash_forkB', 'Г4-06': 'after:ash_node', 'Г4-07': 'before:ash_sq3',
        'Г4-08': 'event:ash_event3', 'Г4-09': 'before:ash_rich', 'Г4-10': 'before:ash_guard', 'Г4-11': 'after:ash_guard',
        'Г4-12': 'before:ash_fortress', 'Г4-13': 'before:ash_fortress', 'Г4-14': 'after:ash_fortress',
    },
    5: {
        'Г5-00': 'start:dusk', 'Г5-01': 'before:dusk_sq1', 'Г5-02': 'event:dusk_event1', 'Г5-03': 'event:dusk_forkA',
        'Г5-04': 'after:dusk_node', 'Г5-05': 'event:dusk_forkB', 'Г5-06': 'event:dusk_event3', 'Г5-07': 'after:dusk_guard',
        'Г5-08': 'before:dusk_fortress', 'Г5-09': 'before:dusk_fortress', 'Г5-09а': 'after:dusk_fortress',
        'Г5-10': 'after:dusk_fortress', 'Г5-11': 'after:dusk_fortress', 'Г5-12': 'after:dusk_fortress',
    },
}

# Как зовут говорящего в игре: «Страж (Рен)» → Рен, «Наместник (Орис Вельд)» → Наместник
SPEAKERS = {'Страж': 'Рен', 'Лейтенант Ивар Сорн': 'Сорн', 'Лейтенант': 'Сорн', 'Командор Айден Корх': 'Корх'}

# Подпись по умолчанию (как SPEAKER_ROLES в dialogs.ts): другая подпись в скобках пишется в реплику (`role`)
ROLES = {'Рен': 'капитан', 'Эхо': 'Лина', 'Каллен': 'друг Рена', 'Наместник': 'Орис Вельд', 'Мельхиор': 'хронист',
         'Гарт': 'кузнец', 'Сефира': 'маг', 'Осип': 'казначей', 'Шаман': 'через Мельхиора', 'Сорн': 'чужое знамя',
         'Корх': 'чужое знамя', 'Фелла': 'грибной народ', 'Бо-Рок': 'обезьянолюди', 'Исс': 'культист'}

# «*Если …:*» → условие на флаги выбора (WorldState.flags); «!» — флага нет
CONDS = {'торговля': 'korh-trade', 'бой': 'korh-fight', 'нейтрал': '!korh-trade,!korh-fight'}

# Текст под то, что есть в игре (ход наверху, слияние только башен на поле, просмотра поля ещё нет)
FIXUPS = {
    1: [
        ('Под картой — запас очков хода.', 'Наверху — запас очков хода.'),
        ('Откройте лавку. Там можно подготовить оборону.', 'Лавка — справа от поля. Там можно подготовить оборону.'),
        ('Купите три одинаковые башни. Две можно оставить на поле, а третью убрать в рюкзак.',
         'Купите три одинаковые башни. Покупки ждут в рюкзаке под лавкой, пока вы их не поставите. Поставьте все три.'),
        ('Теперь соедините их.', 'Теперь выберите одну и нажмите «Слить».'),
        ('и смотреть, какие силы его защищают.', 'и следить за прочностью их лагеря на плашке соперника.'),
    ],
    2: [
        ('## Финальная сцена главы — переход к следующему региону', '## Г2-16. Перед переходом'),
        (' Вы можете наблюдать за продвижением отряда на поле противника.', ' Прочность их лагеря видна на плашке соперника.'),
        ('*После столкновения.*', '## Г2-02б. После столкновения'),
        # Шёпот Ксаара по фазам боя: каждая реплика — своя волна (после главной сцены босса)
        ('**Ксаар (шёпот из кристалла):** Они снова встают.', '## Г2-13а. Шёпот\n**Ксаар (шёпот из кристалла):** Они снова встают.'),
        ('**Ксаар (шёпот из кристалла):** Вы называете это смертью.', '## Г2-13б. Шёпот\n**Ксаар (шёпот из кристалла):** Вы называете это смертью.'),
        ('**Ксаар (шёпот из кристалла):** Вы не слышите их.', '## Г2-13в. Шёпот\n**Ксаар (шёпот из кристалла):** Вы не слышите их.'),
    ],
    3: [(' Отправьте армию, смотрите поле.', ' Отправьте армию во вкладке «Армия».')],
    4: [(' Отправьте армию, смотрите поле.', ' Отправьте армию во вкладке «Армия».')],
    5: [
        (' Отправьте армию, смотрите поле.', ' Отправьте армию во вкладке «Армия».'),
        ('**Сайрит (последний шёпот):**', '### Г5-09а. Последний шёпот\n**Сайрит (последний шёпот):**'),
    ],
}

COND = re.compile(r'^\*Если ([^:*]+):\*\s*')
LINE = re.compile(r'^\*\*(.+?)(?:\s*\(([^)]*)\))?:\*\*\s*(.+)$')
HEAD = re.compile(r'^#{2,3}\s+(Г\d+-\d+[а-я]?)\.')
# «**Вариант Б — …**» в сцене события: реплики после выбора (`choice:<объект>:<номер>`, номер с 1)
VARIANT = re.compile(r'^\*\*Вариант ([А-Г])\b.*\*\*$')


def parse(path, chapter):
    text = open(path, encoding='utf-8').read()
    for old, new in FIXUPS.get(chapter, []):
        if old not in text:
            sys.exit(f'Правка не найдена: {old!r}')
        text = text.replace(old, new)
    ids = SCENE_IDS[chapter]
    scenes, order, cur = {}, [], None
    for raw in text.splitlines():
        m = HEAD.match(raw)
        if m:
            cur = ids.get(m.group(1))
            if cur and cur not in scenes:
                scenes[cur] = []
                order.append(cur)
            continue
        if raw.startswith('## '):
            cur = None
            continue
        raw = raw.strip()
        v = VARIANT.match(raw)
        if v and cur and (cur.startswith('event:') or cur.startswith('choice:')):
            obj = cur.split(':')[1]
            cur = f'choice:{obj}:{"АБВГ".index(v.group(1)) + 1}'
            scenes.setdefault(cur, [])
            if cur not in order:
                order.append(cur)
            continue
        c = COND.match(raw)
        if c:
            raw = raw[c.end():]
        m = LINE.match(raw)
        if cur and m:
            name = m.group(1).strip()
            who = SPEAKERS.get(name, name)
            line = re.sub(r'\s*\{[^}]*\}', '', m.group(3)).replace('*', '').strip()
            if line:
                d = {'who': who, 'text': line}
                role = (m.group(2) or '').strip()
                if role and name not in SPEAKERS and role != ROLES.get(who):
                    d['role'] = role
                if c:
                    d['if'] = CONDS[c.group(1).strip()]
                scenes[cur].append(d)
    missing = [s for s in dict.fromkeys(ids.values()) if s not in scenes]
    if missing:
        sys.exit(f'В сценарии нет сцен: {missing}')
    return [{'id': s, 'lines': scenes[s]} for s in order]


def main():
    path, chapter = sys.argv[1], int(sys.argv[2])
    scenes = parse(path, chapter)
    out = f'src/campaign/script_ch{chapter}.ts'
    with open(out, 'w', encoding='utf-8') as f:
        f.write(f'// Создано scripts/dialogs_from_md.py из {path.split("/")[-1]} — правьте сценарий и запускайте скрипт заново\n')
        f.write("import type { Scene } from './dialogs';\n\n")
        f.write(f'export const SCRIPT_CH{chapter}: Scene[] = ')
        f.write(json.dumps(scenes, ensure_ascii=False, indent=2))
        f.write(';\n')
    print(out, len(scenes), 'сцен,', sum(len(s['lines']) for s in scenes), 'реплик')


if __name__ == '__main__':
    main()
