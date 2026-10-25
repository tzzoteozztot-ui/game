/**
 * Player progress for «Тёмный рубеж»: opened levels, stars, endless records.
 * Always kept in localStorage; after sign-in it is also synced with the account (cloud.ts).
 */

export interface Progress {
  unlocked: number; // highest opened level, 1..5
  stars: Record<number, number>; // level -> best stars
  endlessBest: Record<number, number>; // level -> best wave reached in endless mode
}

const KEYS = {
  unlocked: 'dark_frontier_unlocked',
  stars: 'dark_frontier_stars',
  endlessBest: 'dark_frontier_endless_best',
};

export const EMPTY_PROGRESS: Progress = { unlocked: 1, stars: {}, endlessBest: {} };

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

/** Accepts anything (old saves, cloud rows) and returns valid progress */
export function normalizeProgress(v: unknown): Progress {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const unlocked = typeof o.unlocked === 'number' ? Math.max(1, Math.min(5, Math.floor(o.unlocked))) : 1;
  return { unlocked, stars: numberMap(o.stars), endlessBest: numberMap(o.endlessBest) };
}

/** Best of both: the higher level, stars and record for every level */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const best = (x: Record<number, number>, y: Record<number, number>) => {
    const out = { ...x };
    for (const [k, n] of Object.entries(y)) out[Number(k)] = Math.max(out[Number(k)] || 0, n);
    return out;
  };
  return {
    unlocked: Math.max(a.unlocked, b.unlocked),
    stars: best(a.stars, b.stars),
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
