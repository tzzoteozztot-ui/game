/**
 * Attack parameters of a tower from its type, level and specializations.
 *
 * A tower keeps a list of specialization ids. A level-2 tower has one; a level-3 tower made
 * from three level-2 towers keeps all three, so it can hold different specializations at once.
 * The same id repeated is its power n (1..3): the bonus part of the effect is multiplied by n
 * (×1,8 damage becomes ×(1 + 0,8·n), 2 targets become 2·n), drawbacks stay as for n = 1.
 * With n = 1 every number matches the single-specialization rules.
 */

import { CONFIG, TowerType } from './config';

export function specPower(specs: readonly string[], id: string): number {
  let n = 0;
  for (const s of specs) if (s === id) n++;
  return n;
}

/** Specializations of `specs` that belong to towers of `type`. */
export function specsOfType(type: TowerType, specs: readonly string[]): string[] {
  const own = new Set(CONFIG.towers[type].specs.map((s) => s.id));
  return specs.filter((s) => own.has(s));
}

export interface AttackStats {
  damage: number;
  cooldown: number; // seconds
  range: number; // cells
  targets: number; // projectiles per volley
  chain: number; // lightning bounces, 0 without lightning
  aoeRadius: number; // cells, 0 for single-target shots
  pierce: boolean; // ballista «Таран»
  smiteDamage: number; // pulse damage, 0 without «Кара»
  normalAttack: boolean; // false for a tower whose only specialization is «Кара»
}

export function attackStats(type: TowerType, level: number, allSpecs: readonly string[]): AttackStats {
  const def = CONFIG.towers[type];
  if (def.race && def.race !== 'humans') return raceAttackStats(type, level, allSpecs);
  const specs = specsOfType(type, allSpecs);
  const n = (id: string) => specPower(specs, id);

  let levelDmg = 1;
  let range = def.range;
  if (level >= 2) {
    levelDmg *= CONFIG.upgrade.lvl2DamageMult;
    range *= CONFIG.upgrade.lvl2RangeMult;
  }
  if (level >= 3) {
    levelDmg *= CONFIG.upgrade.lvl3DamageMult;
    range *= CONFIG.upgrade.lvl3RangeMult;
  }

  let damage = def.damage * levelDmg;
  let cooldown = def.cooldown;
  let targets = 1;

  if (n('sniper')) {
    range *= 1 + 0.6 * n('sniper');
    damage *= 1 + 0.8 * n('sniper');
    cooldown *= 1.6;
  }
  if (n('arrow_hail')) {
    damage *= 0.8;
    cooldown *= 0.6;
    targets = (level >= 3 ? 3 : 2) * n('arrow_hail');
    // Every target beyond two takes 5% off the damage of each arrow (9 targets: ×0,65)
    damage *= 1 - CONFIG.arrowHail.perExtraTarget * (targets - 2);
  }
  if (n('frost')) damage *= 0.8;
  if (n('ram')) damage *= 0.8 * n('ram');
  if (n('siege')) {
    damage *= 0.9;
    cooldown *= 1.15;
  }

  const chain = n('lightning') ? (level >= 3 ? 5 : 4) * n('lightning') : 0;

  let aoeRadius = 0;
  if (type === 'mage') {
    aoeRadius = 0.9;
    if (n('fire')) aoeRadius *= 1 + 0.4 * n('fire');
    if (n('frost')) aoeRadius *= 1 + 0.2 * n('frost');
  }
  if (n('siege')) aoeRadius = Math.max(aoeRadius, 1.0 * n('siege'));

  const smiteDamage = n('smite') ? def.damage * levelDmg * 2.5 * n('smite') : 0;
  const normalAttack = !(n('smite') && specs.every((s) => s === 'smite'));

  return {
    damage,
    cooldown,
    range,
    targets,
    chain,
    aoeRadius,
    pierce: n('ram') > 0,
    smiteDamage,
    normalAttack,
  };
}

/** Towers of the playable factions: level growth of the faction, orc tempering, undead merge choices */
function raceAttackStats(type: TowerType, level: number, allSpecs: readonly string[]): AttackStats {
  const def = CONFIG.towers[type];
  const race = CONFIG.races[def.race!];
  const specs = specsOfType(type, allSpecs);
  const n = (id: string) => specPower(specs, id);
  const lv = Math.min(3, Math.max(1, level)) - 1;
  let damage = def.damage;
  let cooldown = def.cooldown;
  let range = def.range * Math.pow(race.levelRange, lv);
  if (race.id === 'undead') {
    damage *= Math.pow(race.levelDamage, n('und_dmg'));
    cooldown /= Math.pow(race.levelDamage, n('und_speed'));
  } else {
    damage *= Math.pow(race.levelDamage, lv);
  }
  if (race.id === 'orcs') {
    const up = CONFIG.raceMech.orcUpgrade;
    damage *= 1 + up.dmg * n('orc_dmg');
    cooldown /= 1 + up.speed * n('orc_speed');
    range += up.range * n('orc_range');
  }
  return {
    damage,
    cooldown,
    range,
    targets: 1,
    chain: 0,
    aoeRadius: def.aoe ?? 0,
    pierce: false,
    smiteDamage: 0,
    normalAttack: !def.special,
  };
}

/** Slow fraction for a base slow and power n: each extra copy slows the rest again. */
export function stackedSlow(base: number, n: number): number {
  return 1 - Math.pow(1 - base, n);
}

function specName(id: string): string {
  for (const def of Object.values(CONFIG.towers)) {
    const s = def.specs.find((x) => x.id === id);
    if (s) return s.name;
  }
  return id;
}

/** «Огонь ×2 · Мороз»: specialization names with their power, in order of first appearance. */
export function specSummary(specs: readonly string[]): string {
  const seen: string[] = [];
  for (const s of specs) if (!seen.includes(s)) seen.push(s);
  return seen
    .map((id) => {
      const n = specPower(specs, id);
      return n > 1 ? `${specName(id)} ×${n}` : specName(id);
    })
    .join(' · ');
}

/** Short field codes of the specializations: two letters, none repeats */
const SPEC_CODE: Record<string, string> = {
  sniper: 'Сн',
  arrow_hail: 'Гр',
  hunter: 'Ох',
  ward: 'Об',
  curse: 'Пр',
  smite: 'Кр',
  fire: 'Ог',
  lightning: 'Мл',
  frost: 'Мр',
  ram: 'Тр',
  siege: 'Ос',
  execute: 'Кз',
  orc_dmg: 'Сл',
  orc_speed: 'Бс',
  orc_range: 'Зр',
  und_dmg: 'Ур',
  und_speed: 'Ск',
};

/** Badge text on the field: code of each specialization with its power, «Ог», «Ог×3», «Ог×2·Мр». */
export function specBadge(specs: readonly string[]): string {
  const seen: string[] = [];
  for (const s of specs) if (!seen.includes(s)) seen.push(s);
  return seen
    .map((id) => {
      const code = SPEC_CODE[id] ?? specName(id).slice(0, 2);
      const n = specPower(specs, id);
      return n > 1 ? `${code}×${n}` : code;
    })
    .join('·');
}
