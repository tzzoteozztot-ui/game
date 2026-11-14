/**
 * Режим разработчика (просьба Артура 2026-11-12): заметки прямо во время игры — категория, текст и снимок
 * состояния игры в этот момент (режим, карта, волна, раса, золото, текущая сцена диалога…). Заметки лежат в
 * localStorage и выгружаются одним файлом JSON вместе с логом последней партии и (если заметки сделаны
 * в походе) логом кампании, чтобы всё разбиралось в одном месте. Баланса не касается: только записывает.
 *
 * Включается скрыто: 7 касаний по заголовку «Настройки» (или `?dev=1` в адресе, `?dev=0` — выключить).
 */
import { buildCampaignLog } from './campaign/worldLog';
import type { WorldState } from './campaign/world';

const MODE_KEY = 'dark_frontier_dev_mode';
const NOTES_KEY = 'dark_frontier_dev_notes';
const RUN_LOG_KEY = 'dark_frontier_last_log';
const MAX_NOTES = 500;

export const DEV_CATEGORIES = [
  { id: 'balance', label: 'Баланс' },
  { id: 'economy', label: 'Экономика' },
  { id: 'gameplay', label: 'Геймплей' },
  { id: 'story', label: 'Сюжет' },
  { id: 'dialog', label: 'Диалог' },
  { id: 'ui', label: 'Графика / интерфейс' },
  { id: 'other', label: 'Прочее' },
] as const;
export type DevCategory = (typeof DEV_CATEGORIES)[number]['id'];

export interface DevScene {
  id: string;
  line: number; // номер реплики с 1
  lines: number;
  who: string;
  text: string;
}

export interface DevNote {
  id: string;
  at: string; // ISO
  category: DevCategory;
  text: string;
  context: Record<string, unknown>;
}

// ---------- включение ----------

function readFlag(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get('dev');
    if (q === '1') localStorage.setItem(MODE_KEY, '1');
    else if (q === '0') localStorage.removeItem(MODE_KEY);
    return localStorage.getItem(MODE_KEY) === '1';
  } catch {
    return false;
  }
}

let devOn = readFlag();
const modeListeners = new Set<() => void>();

export const isDevMode = () => devOn;

export function setDevMode(on: boolean) {
  devOn = on;
  try {
    if (on) localStorage.setItem(MODE_KEY, '1');
    else localStorage.removeItem(MODE_KEY);
  } catch {
    /* хранилище закрыто — работает до перезагрузки */
  }
  modeListeners.forEach((f) => f());
}

export function onDevModeChange(fn: () => void): () => void {
  modeListeners.add(fn);
  return () => modeListeners.delete(fn);
}

// ---------- текущая сцена диалога (её сообщает DialogBox) ----------

let scene: DevScene | null = null;
export const setDevScene = (s: DevScene | null) => {
  scene = s;
};

// ---------- заметки ----------

export function loadDevNotes(): DevNote[] {
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    const list = raw ? (JSON.parse(raw) as DevNote[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveDevNotes(list: DevNote[]) {
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(list.slice(-MAX_NOTES)));
  } catch {
    /* нет места — заметки живут до выгрузки в памяти страницы нельзя, поэтому просто молчим */
  }
}

export function addDevNote(category: DevCategory, text: string, context: Record<string, unknown>): DevNote {
  const note: DevNote = {
    id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    at: new Date().toISOString(),
    category,
    text: text.trim(),
    context: { ...context, ...(scene ? { scene } : {}) },
  };
  saveDevNotes([...loadDevNotes(), note]);
  return note;
}

export function removeDevNote(id: string) {
  saveDevNotes(loadDevNotes().filter((n) => n.id !== id));
}

export function clearDevNotes() {
  saveDevNotes([]);
}

// ---------- выгрузка ----------

export interface DevExportFile {
  version: 1;
  game: 'Тёмный рубеж';
  kind: 'dev-notes';
  exportedAt: string;
  notes: DevNote[];
  /** Лог партии, к которой относятся заметки (`context.run.startedAt` совпадает с его `startedAt`); null — этой партии в хранилище уже нет */
  runLog: unknown | null;
  /** Лог похода — только если среди заметок есть сделанные в кампании */
  campaignLog: unknown | null;
}

export async function buildDevExport(world: WorldState | null): Promise<DevExportFile | null> {
  const notes = loadDevNotes();
  if (!notes.length) return null;
  let runLog: unknown | null = null;
  try {
    const raw = localStorage.getItem(RUN_LOG_KEY);
    if (raw) {
      const log = JSON.parse(raw) as { startedAt?: string };
      const wanted = new Set(notes.map((n) => (n.context.run as { startedAt?: string } | undefined)?.startedAt).filter(Boolean));
      if (log.startedAt && wanted.has(log.startedAt)) runLog = log;
    }
  } catch {
    /* лога нет или он испорчен */
  }
  let campaignLog: unknown | null = null;
  if (notes.some((n) => n.context.campaign)) {
    try {
      campaignLog = await buildCampaignLog(world);
    } catch {
      /* лог похода недоступен */
    }
  }
  return { version: 1, game: 'Тёмный рубеж', kind: 'dev-notes', exportedAt: new Date().toISOString(), notes, runLog, campaignLog };
}

/** Скачивает файл заметок; false — заметок нет */
export async function downloadDevNotes(world: WorldState | null): Promise<boolean> {
  const file = await buildDevExport(world);
  if (!file) return false;
  const stamp = file.exportedAt.slice(0, 16).replace(/[:T]/g, '-');
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `temny-rubezh-zametki-${file.notes.length}-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
