#!/usr/bin/env python3
"""
Сценарий главы (markdown Лороведа) → данные диалогов игры src/campaign/script_ch<N>.ts.

    python3 scripts/dialogs_from_md.py /mnt/project-files/lore/campaign-ch1-dialogs-v2.md 1

Сцена в файле — заголовок «### Г1-02. …», реплика — «**Эхо (Лина):** текст». Метки `{подсказка: …}`
вырезаются. Какой сцене игры отдать заголовок — `SCENE_IDS` ниже (несколько заголовков могут идти в одну
сцену подряд). Правки текста под то, что есть в игре, — `FIXUPS` (старый кусок → новый); если кусок не
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
}

# Как зовут говорящего в игре: «Страж (Рен)» → Рен, «Наместник (Орис Вельд)» → Наместник
SPEAKERS = {'Страж': 'Рен'}

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
}

LINE = re.compile(r'^\*\*(.+?)(?:\s*\(([^)]*)\))?:\*\*\s*(.+)$')
HEAD = re.compile(r'^###\s+(Г\d+-\d+[а-я]?)\.')


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
        m = LINE.match(raw.strip())
        if cur and m:
            who = SPEAKERS.get(m.group(1).strip(), m.group(1).strip())
            line = re.sub(r'\s*\{[^}]*\}', '', m.group(3)).strip()
            if line:
                scenes[cur].append({'who': who, 'text': line})
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
