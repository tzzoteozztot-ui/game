// Модульный декор глобальной карты (просьба Артура 2026-11-14): башни, стены, ворота, руины и природа
// ставятся в редакторе карты по одному и собираются в замки и поселения как конструктор.
// Картинки — public/modules/<файл>.webp (scripts/make_modules.py из Draw Things). Только вид: на ходы, туман и бои не влияют.

export type ModuleGroup = 'tower' | 'wall' | 'gate' | 'ruin' | 'tree' | 'rock' | 'mount' | 'misc';

export interface ModuleDef {
  id: string;
  name: string;
  group: ModuleGroup;
  file: string; // имя в public/modules без .webp
  w: number; // ширина на карте в px мира (гекс — 128 по горизонтали)
}

/** Единый масштаб набора замков: 0,5 от файла — башня, стена и ворота подходят друг к другу */
const KIT = 0.5;
const kit = (id: string, name: string, group: ModuleGroup, srcW: number): ModuleDef => ({ id, name, group, file: id, w: Math.round(srcW * KIT) });
const nat = (id: string, name: string, group: ModuleGroup, w: number): ModuleDef => ({ id: `n_${id}`, name, group, file: `n_${id}`, w });

export const MODULES: ModuleDef[] = [
  kit('tower_0', 'Круглая башня', 'tower', 109),
  kit('tower_1', 'Башня с шатром', 'tower', 137),
  kit('tower_2', 'Башня-бастион', 'tower', 133),
  kit('tower_3', 'Башня со знаменем', 'tower', 87),
  kit('tower_4', 'Донжон', 'tower', 138),
  kit('tower_7', 'Островерхая башня', 'tower', 92),
  kit('wall_0', 'Стена «/»', 'wall', 254),
  kit('wall_2', 'Стена, низкая', 'wall', 216),
  kit('wall_3', 'Стена, разрушенная', 'wall', 222),
  kit('gate_1', 'Ворота', 'gate', 149),
  kit('gate_2', 'Ворота с мостом', 'gate', 202),
  kit('gate_4', 'Ворота с черепом', 'gate', 175),
  kit('gate_5', 'Ворота с решёткой', 'gate', 165),
  kit('ruin_0', 'Башня в руинах', 'ruin', 164),
  kit('ruin_1', 'Башня без крыши', 'ruin', 150),
  kit('ruin_2', 'Арка в плюще', 'ruin', 178),
  kit('ruin_3', 'Развалины стен', 'ruin', 199),
  kit('ruin_4', 'Разрушенная арка', 'ruin', 189),
  kit('ruin_6', 'Колонны', 'ruin', 198),
  kit('ruin_7', 'Ветхая башня', 'ruin', 160),
  nat('oak_a', 'Дуб', 'tree', 90),
  nat('oak_b', 'Осенний дуб', 'tree', 90),
  nat('oak_c', 'Старый дуб', 'tree', 84),
  nat('pine_a', 'Ель', 'tree', 56),
  nat('dead_a', 'Сухое дерево', 'tree', 70),
  nat('dead_b', 'Мёртвое дерево', 'tree', 76),
  nat('palm_dead', 'Корявый пень-дерево', 'tree', 84),
  nat('bush_a', 'Куст', 'misc', 50),
  nat('bush_b', 'Ягодный куст', 'misc', 56),
  nat('stump_b', 'Пень', 'misc', 46),
  nat('dead_log', 'Бревно', 'misc', 66),
  nat('bones', 'Кости', 'misc', 46),
  nat('rock_a', 'Валун', 'rock', 74),
  nat('rock_big', 'Скала-кристаллы', 'rock', 74),
  nat('rock_c', 'Руническая стела', 'rock', 44),
  nat('rock_d', 'Груда камней', 'rock', 76),
  nat('rock_e', 'Глыба', 'rock', 70),
  nat('rock_f', 'Менгиры', 'rock', 64),
  nat('cliff', 'Утёс', 'rock', 64),
  nat('mount_a', 'Гора со снегом', 'mount', 150),
  nat('mount_b', 'Горы', 'mount', 170),
  nat('mount_c', 'Холм', 'mount', 150),
  nat('mountain_range', 'Хребет', 'mount', 170),
];

export const MODULE_GROUPS: { id: ModuleGroup; name: string }[] = [
  { id: 'tower', name: 'Башни' },
  { id: 'wall', name: 'Стены' },
  { id: 'gate', name: 'Ворота' },
  { id: 'ruin', name: 'Руины' },
  { id: 'tree', name: 'Деревья' },
  { id: 'rock', name: 'Камни' },
  { id: 'mount', name: 'Горы' },
  { id: 'misc', name: 'Мелочь' },
];

export const MODULE_BY_ID: Record<string, ModuleDef> = Object.fromEntries(MODULES.map((m) => [m.id, m]));
export const MODULE_PREFIX = 'mod:';
export const moduleOf = (kind: string): ModuleDef | null => (kind.startsWith(MODULE_PREFIX) ? MODULE_BY_ID[kind.slice(MODULE_PREFIX.length)] ?? null : null);
/** Ключ картинки в `extras` (worldRender.loadExtras) */
export const moduleImageKey = (m: ModuleDef) => `m_${m.file}`;
export const moduleUrl = (m: ModuleDef) => `modules/${m.file}.webp`;
/** Шаг тонкой привязки модуля внутри гекса, px мира */
export const MODULE_SNAP = 16;
