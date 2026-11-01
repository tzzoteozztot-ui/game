/**
 * Лог партии (просьба Артура 2026-11-01): что строили и когда, какие враги шли, сколько урона нанесено.
 * Пишется во всех режимах, главный — Потасовка. Хранится только в браузере (localStorage, последняя партия)
 * и скачивается файлом JSON с экрана итогов или из Настроек. Баланса не касается: только записывает.
 *
 * Время `t` — игровые секунды забега (как «Игровое время» в итогах). Урон по башням в срезах волн
 * накопительный: урон волны — разность соседних срезов.
 */

const STORAGE_KEY = 'dark_frontier_last_log';
const MAX_EVENTS = 4000;
const MAX_BYTES = 3_000_000;

export interface LogTowerPart {
  type: string;
  level: number;
  specs: string[];
}

export interface LogTower {
  id: string;
  x: number;
  y: number;
  main: LogTowerPart;
  second: LogTowerPart | null;
  damage: number; // накопительно за забег
}

export interface LogEnemyStat {
  spawned: number;
  sent: number; // из них присланных соперником
  killed: number;
  leaked: number; // дошли до артефакта
  castleDamage: number; // отнято у артефакта
  hpByWave?: Record<number, number>; // здоровье такого врага, вышедшего на этой волне
}

export interface LogWaveRow {
  wave: number; // сколько волн запущено
  t: number;
  gold: number;
  lives: number;
  supplyPower: number;
  killed: number;
  leaked: number;
  goldEarned: number;
  livesLost: number;
  enemiesOnField: number;
  queued: number; // ждут выхода
  composition: Record<string, number>; // вид врага в «фракция:вид» → сколько вышло с этой волной
  towers: LogTower[];
  damageOther: number;
  boons: string[];
  brawl?: unknown; // доска Потасовки: HP участников, текущий и следующий соперник
}

export interface LogEvent {
  t: number;
  wave: number;
  kind: string;
  [key: string]: unknown;
}

export interface RunLogData {
  version: 1;
  game: 'Тёмный рубеж';
  startedAt: string;
  endedAt: string | null;
  mode: 'campaign' | 'endless' | 'duel' | 'brawl';
  map: number;
  mapSeed: number | null;
  difficulty: string;
  race: string;
  faction: number;
  result: 'running' | 'victory' | 'defeat';
  finalWave: number;
  seconds: number;
  waves: LogWaveRow[];
  events: LogEvent[];
  eventsDropped: number;
  enemies: Record<string, LogEnemyStat>; // «фракция:вид»
  boons: { id: string; wave: number; t: number }[];
}

export interface RunLogMeta {
  mode: RunLogData['mode'];
  map: number;
  mapSeed: number | null;
  difficulty: string;
  race: string;
  faction: number;
}

export class RunLog {
  data: RunLogData;

  constructor(meta: RunLogMeta) {
    this.data = {
      version: 1,
      game: 'Тёмный рубеж',
      startedAt: new Date().toISOString(),
      endedAt: null,
      ...meta,
      result: 'running',
      finalWave: 0,
      seconds: 0,
      waves: [],
      events: [],
      eventsDropped: 0,
      enemies: {},
      boons: [],
    };
  }

  event(t: number, wave: number, kind: string, fields: Record<string, unknown> = {}) {
    if (this.data.events.length >= MAX_EVENTS) {
      this.data.eventsDropped++;
      return;
    }
    this.data.events.push({ t: Math.round(t * 10) / 10, wave, kind, ...fields });
  }

  enemy(key: string): LogEnemyStat {
    return (this.data.enemies[key] ??= { spawned: 0, sent: 0, killed: 0, leaked: 0, castleDamage: 0 });
  }

  wave(row: LogWaveRow) {
    this.data.waves.push(row);
    this.save();
  }

  finish(result: 'victory' | 'defeat', wave: number, seconds: number) {
    this.data.result = result;
    this.data.endedAt = new Date().toISOString();
    this.data.finalWave = wave;
    this.data.seconds = Math.round(seconds);
    this.save();
  }

  /** Копия в localStorage: переживает закрытую вкладку; слишком большую не пишем */
  save() {
    try {
      const json = JSON.stringify(this.data);
      if (json.length <= MAX_BYTES) localStorage.setItem(STORAGE_KEY, json);
    } catch {
      /* нет места или хранилище закрыто — скачать по-прежнему можно из памяти */
    }
  }
}

export function hasSavedRunLog(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/** Скачивает лог последней партии файлом JSON; false — лога нет */
export function downloadRunLog(): boolean {
  let json: string | null = null;
  try {
    json = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  if (!json) return false;
  let name = 'log';
  try {
    const d = JSON.parse(json) as RunLogData;
    name = `${d.mode}-карта${d.map}-${d.race}-волна${d.finalWave || (d.waves.at(-1)?.wave ?? 0)}-${d.startedAt.slice(0, 16).replace(/[:T]/g, '-')}`;
  } catch {
    /* имя по умолчанию */
  }
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `temny-rubezh-${name}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
