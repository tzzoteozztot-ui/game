// Shop cards: chances per slot plus the pseudo-random guarantee (Артур, 2026-11-01)
import { CONFIG } from './config';
import type { TowerType } from './config';

export interface RolledCard {
  type: TowerType | 'binder';
  isTriplet: boolean; // ★: comes at Ур.2
  level3: boolean; // a ready Ур.3 tower
}

/** Refreshes since the last ready (★ or Ур.3) card; one per player, reset with a new run */
export interface ShopPity {
  since: number;
}

/**
 * Five cards for `tier`. Chances stay as in CONFIG.shop; on top, within `CONFIG.shop.pity[tier]` refreshes
 * at least one ready card must appear: when the allowance is used up, one tower card is made ready.
 */
export function rollShop(
  tier: number,
  towerTypes: TowerType[],
  opts: { triplets: boolean; binders: boolean },
  pity: ShopPity,
  rnd: () => number = Math.random,
): RolledCard[] {
  const tripletChance = opts.triplets ? CONFIG.shop.tripletChances[tier - 1] || 0 : 0;
  const level3Chance = opts.triplets ? CONFIG.shop.level3Chances[tier - 1] || 0 : 0;
  const binderChance = opts.binders ? CONFIG.shop.binderChances[tier - 1] || 0 : 0;
  const cards: RolledCard[] = [];
  for (let i = 0; i < CONFIG.shop.slotsCount; i++) {
    if (rnd() < binderChance) {
      cards.push({ type: 'binder', isTriplet: false, level3: false });
      continue;
    }
    const type = towerTypes[Math.floor(rnd() * towerTypes.length)];
    const level3 = rnd() < level3Chance;
    const isTriplet = !level3 && rnd() < tripletChance;
    cards.push({ type, isTriplet, level3 });
  }
  const limit = opts.triplets ? CONFIG.shop.pity[tier - 1] || 0 : 0;
  if (limit <= 0) pity.since = 0;
  else {
    if (cards.some((c) => c.isTriplet || c.level3)) pity.since = 0;
    else {
      pity.since++;
      const towers = cards.filter((c) => c.type !== 'binder');
      if (pity.since >= limit && towers.length > 0) {
        towers[Math.floor(rnd() * towers.length)].isTriplet = true;
        pity.since = 0;
      }
    }
  }
  return cards;
}
