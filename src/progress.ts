/**
 * Player progress for «Тёмный рубеж»: opened levels, stars, endless records.
 * Always kept in localStorage; after sign-in it is also synced with the account (cloud.ts).
 */

export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

export type StarsByDifficulty = Record<Difficulty, Record<number, number>>;

export interface Progress {
  unlocked: number; // highest opened level, 1..5
  stars: StarsByDifficulty; // difficulty -> level -> best stars
  endlessBest: Record<number, number>; // level -> best wave reached in endless mode
}

const KEYS = {
  unlocked: 'dark_frontier_unlocked',
  stars: 'dark_frontier_stars',
  endlessBest: 'dark_frontier_endless_best',
};

const emptyStars = (): StarsByDifficulty => ({ easy: {}, normal: {}, hard: {} });

export const EMPTY_PROGRESS: Progress = { unlocked: 1, stars: emptyStars(), endlessBest: {} };

function numberMap(v: unknown): Record<number, number> {
  const out: Record<number, number> = {};
  if (v && typeof v === 'object') {
    for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
      const lvl = Number(k);
      if (Number.isInteger(lvl) && lvl >= 1 && lvl <= 5 && typeof n === 'number' && n > 0) out[lvl] = n;
    }
  }
  return out;
}

/**
 * Stars per difficulty. Older saves kept one flat level -> stars map without the difficulty
 * it was earned on: it goes to «normal» (the default), so nothing is lost.
 */
function starsMap(v: unknown): StarsByDifficulty {
  const out = emptyStars();
  if (!v || typeof v !== 'object') return out;
  const o = v as Record<string, unknown>;
  const flat = numberMap(Object.fromEntries(Object.entries(o).filter(([k]) => /^\d+$/.test(k))));
  out.normal = flat;
  for (const d of DIFFICULTIES) {
    const own = numberMap(o[d]);
    for (const [k, n] of Object.entries(own)) out[d][Number(k)] = Math.max(out[d][Number(k)] || 0, n);
  }
  return out;
}

/** Accepts anything (old saves, cloud rows) and returns valid progress */
export function normalizeProgress(v: unknown): Progress {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const unlocked = typeof o.unlocked === 'number' ? Math.max(1, Math.min(5, Math.floor(o.unlocked))) : 1;
  return { unlocked, stars: starsMap(o.stars), endlessBest: numberMap(o.endlessBest) };
}

/** Best of both: the higher level, stars (per difficulty) and record for every level */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const best = (x: Record<number, number>, y: Record<number, number>) => {
    const out = { ...x };
    for (const [k, n] of Object.entries(y)) out[Number(k)] = Math.max(out[Number(k)] || 0, n);
    return out;
  };
  return {
    unlocked: Math.max(a.unlocked, b.unlocked),
    stars: {
      easy: best(a.stars.easy, b.stars.easy),
      normal: best(a.stars.normal, b.stars.normal),
      hard: best(a.stars.hard, b.stars.hard),
    },
    endlessBest: best(a.endlessBest, b.endlessBest),
  };
}

export function sameProgress(a: Progress, b: Progress): boolean {
  return JSON.stringify(normalizeProgress(a)) === JSON.stringify(normalizeProgress(b));
}

export function readLocalProgress(): Progress {
  try {
    const parse = (key: string) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : undefined;
    };
    return normalizeProgress({
      unlocked: parseInt(localStorage.getItem(KEYS.unlocked) || '1', 10),
      stars: parse(KEYS.stars),
      endlessBest: parse(KEYS.endlessBest),
    });
  } catch {
    return EMPTY_PROGRESS;
  }
}

export function writeLocalProgress(p: Progress) {
  try {
    localStorage.setItem(KEYS.unlocked, String(p.unlocked));
    localStorage.setItem(KEYS.stars, JSON.stringify(p.stars));
    localStorage.setItem(KEYS.endlessBest, JSON.stringify(p.endlessBest));
  } catch {
    // private mode or full storage: progress lives until the page is closed
  }
}
