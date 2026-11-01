/**
 * Tower Detail & Management Panel for «Тёмный рубеж»
 * A semi-transparent card over the field, shown while a tower or «Связка» is selected (App puts it in the
 * bottom corner away from it). Shows the tower's stats; target priority, merge, bind and sell share one row; «Подробнее»
 * opens what each specialization does and the damage the tower has dealt. For a selected «Связка» a note with
 * merge (three into a triple one) or raise (triple) and sell buttons. A bound tower shows both parts' stats as «main / second».
 * Same cell unit as FieldHud: one cell is 100cqw / CONFIG.grid.cols. Only the card takes taps: the rest of the field stays free.
 */

import React from 'react';
import { Tower, TowerPart } from '../game/engine';
import { CONFIG, DAMAGE_TYPES, RaceId } from '../game/config';
import { calculateSellRefund } from '../game/rules';
import { TowerSpriteIcon, BinderIcon, HeartCastleIcon } from './Icons';
import type { GameStateSnapshot } from '../game/engine';

const CELL = `calc(100cqw / ${CONFIG.grid.cols})`;

// Sizes follow the field's cell, with phone minimums and desktop caps
const PANEL_VARS = {
  '--cell': CELL,
  '--fs-xs': `clamp(9px, calc(${CELL} * 0.22), 14px)`,
  '--fs-sm': `clamp(10px, calc(${CELL} * 0.25), 15px)`,
  '--fs-md': `clamp(11px, calc(${CELL} * 0.28), 17px)`,
  '--fs-lg': `clamp(12px, calc(${CELL} * 0.33), 20px)`,
  '--fs-btn4': `clamp(10px, calc(${CELL} * 0.26), 16px)`,
  '--h-btn': `clamp(32px, calc(${CELL} * 0.8), 54px)`,
  '--h-head': `clamp(24px, calc(${CELL} * 0.6), 40px)`,
} as React.CSSProperties;

const glassBtn = 'rounded border border-white/15 bg-white/5 hover:bg-white/15 text-white/85 flex items-center justify-center leading-none cursor-pointer';
import { attackStats, specSummary, towerDamageType } from '../game/towerStats';

interface TowerPanelProps {
  sellRatio?: number; // share of the price paid back on sale
  tower: Tower | null;
  eligibleMergeCount: number;
  mergeUsesBinder?: boolean;
  selectedBinder: boolean;
  binderCount: number;
  bindPartnerCount: number;
  isBinding: boolean;
  selectedBinderTriple: boolean;
  canMergeBinders: boolean;
  shopTier?: number;
  upgradeTargetCount: number;
  isUpgrading: boolean;
  canUpgrade?: boolean;
  onUpgradeTower?: () => void;
  onMergeBinders: () => void;
  onUpgradeWithBinder: () => void;
  onCyclePriority: () => void;
  onMerge: () => void;
  onBind: () => void;
  onSell: () => void;
  onClose: () => void;
  details: boolean; // «Подробнее» is open: what the specializations do, the damage dealt
  onToggleDetails: () => void;
  damage: { wave: number; run: number } | null; // damage the selected tower has dealt
  castle?: GameStateSnapshot['castle']; // the artifact's card: HP and its defence
  boons?: GameStateSnapshot['boons']; // brawl: the artifact's boons
  gold?: number;
  onUpgradeCastle?: () => void;
  mergeNeed?: number; // towers that merge into the next level
  maxLevel?: number;
  race?: RaceId;
  info?: GameStateSnapshot['selectedInfo']; // faction bonuses, souls, crit, ability of the selected tower
  onCastAbility?: () => void;
  onToggleAuto?: () => void;
  onSacrifice?: () => void;
}

// Waiting for a tap on a target (raise with a triple binder, bind): the hint with «Отмена» stands outside the field
// (App puts it in the side column), so no tower is covered and a tap on the field never cancels by accident
export function WaitingHint({ text, onCancel }: { text: string; onCancel: () => void }) {
  return (
    <div className="shrink-0 m-1.5 p-1.5 rounded-lg bg-teal-950/50 border border-[#3ed6c4]/50 text-[#3ed6c4] flex flex-col gap-1 text-[length:var(--fs-sm,13px)] leading-tight">
      <span className="font-bold">{text}</span>
      <button type="button" onClick={onCancel} className={`${glassBtn} h-8 text-[length:var(--fs-sm,13px)] font-bold`}>
        Отмена
      </button>
    </div>
  );
}

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');

// The card's frame: App puts it in a bottom corner of the field, inside an inline-size container as wide as the field
function Card({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div
      className="pointer-events-auto flex flex-col gap-1 p-1.5 rounded-lg bg-[#121018]/70 border border-white/15 backdrop-blur-[3px] shadow-xl text-[#f4f2e6] text-[length:var(--fs-md)] select-none overflow-y-auto"
      style={{
        ...PANEL_VARS,
        width: wide ? `clamp(290px, calc(${CELL} * 6), 460px)` : `clamp(232px, calc(${CELL} * 4.9), 420px)`,
        maxHeight: `calc(${CELL} * ${CONFIG.grid.rows - 2.2})`,
      }}
    >
      {children}
    </div>
  );
}

// Live stats of one part: a part whose only specialization is «Кара» shows its pulse
function partStats(part: TowerPart) {
  const stats = attackStats(part.type, part.level, part.specs);
  const smiteOnly = !stats.normalAttack && !CONFIG.towers[part.type].special;
  return {
    damage: Math.round((smiteOnly ? stats.smiteDamage : stats.damage) * 10) / 10,
    period: (smiteOnly ? 2.5 : stats.cooldown).toFixed(1),
    range: stats.range.toFixed(1),
  };
}

export function TowerPanel({
  tower,
  eligibleMergeCount,
  mergeUsesBinder = false,
  selectedBinder,
  binderCount,
  bindPartnerCount,
  isBinding,
  selectedBinderTriple,
  canMergeBinders,
  shopTier = 1,
  upgradeTargetCount,
  isUpgrading,
  canUpgrade = false,
  sellRatio = CONFIG.upgrade.sellRatio,
  onUpgradeTower,
  onMergeBinders,
  onUpgradeWithBinder,
  onCyclePriority,
  onMerge,
  onBind,
  onSell,
  onClose,
  damage,
  details,
  onToggleDetails,
  castle = null,
  boons = [],
  gold = 0,
  onUpgradeCastle,
  mergeNeed = 3,
  maxLevel = 3,
  race = 'humans',
  info = null,
  onCastAbility,
  onToggleAuto,
  onSacrifice,
}: TowerPanelProps) {
  const closeBtn = (
    <button type="button" onClick={onClose} title="Закрыть (Esc)" className={`${glassBtn} w-[var(--h-head)] h-[var(--h-head)] text-[length:var(--fs-lg)] shrink-0`}>
      ×
    </button>
  );
  if (!tower && castle) {
    const canBuy = castle.cost !== null && gold >= castle.cost;
    return (
      <Card>
        <div className="flex items-center gap-2 h-[var(--h-head)] shrink-0">
          <div className="w-[var(--h-head)] h-[var(--h-head)] flex items-center justify-center bg-black/30 rounded border border-white/10 shrink-0 text-red-400">
            <HeartCastleIcon size="70%" />
          </div>
          <div className="flex-1 font-bold text-[length:var(--fs-md)] text-[#7fd6e0]">Артефакт</div>
          {closeBtn}
        </div>
        <div className="grid grid-cols-3 gap-1 text-[length:var(--fs-sm)] tabular-nums leading-tight">
          <div>
            <div className="text-stone-400 text-[length:var(--fs-xs)]">Прочность</div>
            <div className="font-bold text-red-300">
              {castle.hp}/{castle.maxHp}
            </div>
          </div>
          <div>
            <div className="text-stone-400 text-[length:var(--fs-xs)]">Защита</div>
            <div className="font-bold">
              ур. {castle.level}/{castle.maxLevel}
            </div>
          </div>
          <div>
            <div className="text-stone-400 text-[length:var(--fs-xs)]">Урон</div>
            <div className="font-bold">
              {castle.damage}
              {castle.nextDamage !== null && <span className="text-[#7fd6e0]"> → {castle.nextDamage}</span>}
            </div>
          </div>
        </div>
        <div className="text-[length:var(--fs-xs)] leading-tight text-stone-300">
          Раз в {String(CONFIG.siege.guard.every).replace('.', ',')} с бьёт магией ближайшего врага в {String(CONFIG.siege.guard.radius).replace('.', ',')} клетки.
        </div>
        {boons.length > 0 && (
          <div className="text-[length:var(--fs-xs)] leading-tight max-h-[30cqh] overflow-y-auto">
            <div className="text-[#c9a2ff] font-bold mb-0.5">Усиления</div>
            {boons.map((b) => (
              <div key={b.id} className="text-stone-300">
                <span className="text-[#d9c2ff]">{b.name}</span> — {b.desc}
              </div>
            ))}
          </div>
        )}
        {CONFIG.shop.tierLinksGuard ? (
          <div className="text-[length:var(--fs-xs)] leading-tight text-[#7fd6e0]">
            Защита растёт вместе с ярусом лавки{castle.level >= castle.maxLevel ? ' — на пределе' : ''}.
          </div>
        ) : (
        <button
          type="button"
          onClick={onUpgradeCastle}
          disabled={!canBuy}
          title="Усилить защиту артефакта"
          className={`h-[var(--h-btn)] px-1 rounded font-bold flex flex-col items-center justify-center leading-none transition-all shrink-0 ${
            canBuy
              ? 'bg-teal-950/60 hover:bg-teal-900/60 text-[#7fd6e0] border border-[#7fd6e0]/60 cursor-pointer'
              : 'bg-black/30 text-stone-500 border border-white/10 cursor-not-allowed'
          }`}
        >
          <span className="text-[length:var(--fs-btn4)]">{castle.cost === null ? 'Защита на пределе' : 'Усилить защиту'}</span>
          {castle.cost !== null && <span className="text-amber-300 text-[length:var(--fs-xs)] mt-0.5 tabular-nums">{castle.cost}</span>}
        </button>
        )}
      </Card>
    );
  }
  if (!tower && selectedBinder) {
    const triple = selectedBinderTriple;
    const binderRefund = Math.floor(CONFIG.binder.cost * (triple ? 3 : 1) * sellRatio);
    if (triple && isUpgrading) return null;
    const canAct = triple ? isUpgrading || upgradeTargetCount > 0 : canMergeBinders;
    return (
      <Card>
        <div className="flex items-center gap-2 h-[var(--h-head)] shrink-0">
          <div className="w-[var(--h-head)] h-[var(--h-head)] flex items-center justify-center bg-black/30 rounded border border-white/10 shrink-0">
            <BinderIcon size="80%" />
          </div>
          <div className="flex-1 font-bold text-[length:var(--fs-md)]" style={{ color: CONFIG.binder.color }}>
            {triple ? 'Тройная связка' : CONFIG.binder.name}
          </div>
          {closeBtn}
        </div>
        <div className="flex items-center text-[length:var(--fs-sm)] leading-tight text-stone-300">
          {triple
            ? isUpgrading
              ? 'Коснитесь башни или пары: каждая её башня ниже Ур.3 поднимется на уровень.'
              : 'Поднимает любую башню или пару на уровень, кроме Ур.3.'
            : 'Выберите башню Ур.2 или Ур.3, нажмите «Связать» и коснитесь башни другого вида, тоже Ур.2 или Ур.3. Три связки сливаются в тройную с ' + CONFIG.binder.tripleFromTier + '-го яруса лавки.'}
        </div>
        <div className="grid grid-cols-2 gap-1 h-[var(--h-btn)] shrink-0">
          <button
            type="button"
            onClick={triple ? onUpgradeWithBinder : onMergeBinders}
            disabled={!canAct}
            className={`h-[var(--h-btn)] px-1 rounded font-bold flex flex-col items-center justify-center leading-none transition-all ${
              isUpgrading
                ? 'bg-[#3ed6c4] text-stone-950 border border-teal-200 cursor-pointer'
                : canAct
                  ? 'bg-teal-950/60 hover:bg-teal-900/60 text-[#3ed6c4] border border-[#3ed6c4]/60 cursor-pointer'
                  : 'bg-black/30 text-stone-500 border border-white/10 cursor-not-allowed'
            }`}
            title={triple ? 'Поднять уровень башни (B)' : shopTier < CONFIG.binder.tripleFromTier ? `Три связки сливаются в тройную с ${CONFIG.binder.tripleFromTier}-го яруса лавки` : 'Слить три связки в тройную (M)'}
          >
            <span className="text-[length:var(--fs-btn4)]">{triple ? 'Усилить' : 'Слить'}</span>
            <span className="text-[length:var(--fs-xs)] mt-0.5 tabular-nums">
              {triple ? (isUpgrading ? 'отмена' : 'башню') : shopTier < CONFIG.binder.tripleFromTier ? `с яруса ${CONFIG.binder.tripleFromTier}` : `${Math.min(binderCount, 3)}/3`}
            </span>
          </button>
          <button
            type="button"
            onClick={onSell}
            className="h-[var(--h-btn)] px-1 rounded bg-red-950/40 hover:bg-red-900/50 text-red-300 border border-red-800/50 flex flex-col items-center justify-center leading-none transition-colors cursor-pointer"
            title="Продать связку (S)"
          >
            <span className="text-[length:var(--fs-btn4)] font-semibold">Продать</span>
            <span className="text-amber-300 font-bold text-[length:var(--fs-xs)] tabular-nums mt-0.5">{binderRefund}</span>
          </button>
        </div>
      </Card>
    );
  }

  if (!tower) return null;

  if (isBinding) return null;

  const baseDef = CONFIG.towers[tower.type];
  const canMerge = eligibleMergeCount >= mergeNeed && tower.level < maxLevel;
  const humans = race === 'humans';
  const ability = info?.ability ?? null;

  const second = tower.second;
  const secondDef = second ? CONFIG.towers[second.type] : null;
  const main = partStats(tower);
  const other = second ? partStats(second) : null;
  const pair = (a: string | number, b: string | number | undefined) => (b === undefined ? `${a}` : `${a} / ${b}`);
  const dmgType = (p: TowerPart) => DAMAGE_TYPES[towerDamageType(p.type, p.specs)];
  const typeIcon = pair(dmgType(tower).icon, second ? dmgType(second).icon : undefined);
  const typeTitle = pair(dmgType(tower).name, second ? dmgType(second).name : undefined);

  let refund = calculateSellRefund(baseDef.cost, tower.level, sellRatio, mergeNeed);
  if (second && secondDef) {
    refund += calculateSellRefund(secondDef.cost, second.level, sellRatio);
    refund += Math.floor(CONFIG.binder.cost * sellRatio);
  }
  const specText = specSummary(second ? [...tower.specs, ...second.specs] : tower.specs);

  const canBind = !second && (isBinding || bindPartnerCount > 0);
  const bindLabel = isBinding
    ? 'отмена'
    : second
    ? 'готово'
    : binderCount === 0
    ? 'нет'
    : tower.level < CONFIG.binder.minLevel
    ? `с Ур.${CONFIG.binder.minLevel}`
    : bindPartnerCount === 0
    ? 'нет пары'
    : 'выбрать';

  // Notes: what each specialization does, or which ones the tower can still pick
  const notes: { title: string; text: string }[] = [];
  for (const part of second ? [tower, second] : [tower]) {
    const def = CONFIG.towers[part.type];
    const seen = [...new Set(part.specs)];
    for (const id of seen) {
      const spec = def.specs.find((x) => x.id === id);
      if (!spec) continue;
      const n = part.specs.filter((x) => x === id).length;
      const text =
        n === 1
          ? spec.desc
          : id === 'execute'
          ? `Цель с HP < ${25 + 10 * (n - 1)}% гибнет сразу; босс получает +${50 * n}% урона`
          : `${spec.desc} (прибавка ×${n})`;
      notes.push({ title: n > 1 ? `${spec.name} ×${n}` : spec.name, text });
    }
    if (def.race && def.race !== 'humans') {
      if (def.desc) notes.unshift({ title: def.name, text: def.desc });
      continue;
    }
    if (seen.length === 0) {
      notes.push({
        title: def.name,
        text:
          (part.type === 'priest'
            ? `метка: замедление ${Math.round(CONFIG.priestBase.slow * 100)}% и +${Math.round(CONFIG.priestBase.markBonus * 100)}% урона от всех башен на ${CONFIG.priestBase.time} с цели и врагам в ${CONFIG.priestSupport.radius} клетке. `
            : `урон: ${DAMAGE_TYPES[towerDamageType(part.type, part.specs)].name.toLowerCase()}. `) +
          `Свойства с Ур.2: ${def.specs.map((x) => x.name).join(', ')}`,
      });
    }
  }
  if (second && (tower.type === 'priest' || second.type === 'priest')) {
    notes.push({ title: 'Со Жрецом', text: `вторая башня стреляет на +${Math.round(CONFIG.priestBase.pairBonus * 100)}% сильнее` });
  }

  const priorityLabel =
    tower.priority === 'first'
      ? 'Первый'
      : tower.priority === 'strongest'
      ? 'Сильный'
      : 'Ближний';

  return (
    <Card wide={(humans && canUpgrade) || tower.type === 'dem_gate'}>
      {/* 1. Header: Name, level, specialization; details and close */}
      <div className="flex items-center gap-1.5 h-[var(--h-head)] shrink-0">
        <div className="w-[var(--h-head)] h-[var(--h-head)] flex items-center justify-center bg-black/30 rounded border border-white/10 shrink-0 overflow-hidden">
          <TowerSpriteIcon type={tower.type} size="85%" color={baseDef.color} />
        </div>
        <div className="min-w-0 flex-1 flex items-baseline justify-between gap-1 leading-none">
          <div className={`font-bold text-stone-200 text-[length:var(--fs-md)] truncate min-w-0`}>
            {baseDef.name}{' '}
            <span className="text-amber-400 text-[length:var(--fs-md)] font-bold">{second ? tower.level : `Ур.${tower.level}`}</span>
            {second && secondDef && (
              <>
                <span style={{ color: CONFIG.binder.color }}> + </span>
                {secondDef.name} <span className="text-amber-400 text-[length:var(--fs-md)] font-bold">{second.level}</span>
              </>
            )}
          </div>
          <div
            className={`text-[length:var(--fs-sm)] text-amber-300 font-semibold truncate min-w-0`}
            title={specText}
          >
            {specText || (tower.level >= maxLevel ? "МАКС" : "Базовая")}
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleDetails}
          aria-expanded={details}
          title="Подробнее о башне (I)"
          className={`${glassBtn} h-[var(--h-head)] px-1.5 text-[length:var(--fs-sm)] font-bold shrink-0 ${details ? '!bg-amber-600/60 !border-amber-300/50 !text-white' : ''}`}
        >
          ⓘ
        </button>
        {closeBtn}
      </div>

      {/* 2. Stats line: Damage, Period, Range */}
      <div className="grid grid-cols-3 gap-1 bg-black/30 shrink-0 px-1 py-0.5 rounded border border-white/10 text-center leading-none whitespace-nowrap tabular-nums">
        {[
          { label: typeIcon, value: pair(main.damage, other?.damage), color: 'text-amber-200', title: `Урон: ${typeTitle}` },
          { label: 'Период', value: `${pair(main.period, other?.period)}с`, color: 'text-stone-200' },
          { label: 'Радиус', value: pair(main.range, other?.range), color: 'text-stone-200' },
        ].map((st) => (
          <div key={st.label} title={'title' in st ? st.title : undefined} className="flex items-baseline justify-center gap-1 min-w-0">
            <span className="text-[length:var(--fs-xs)] text-stone-400">{st.label}</span>
            <span className={`font-bold ${st.color} text-[length:var(--fs-md)]`}>{st.value}</span>
          </div>
        ))}
      </div>

      {/* Faction: an ability with its auto switch, bonuses from where the tower stands */}
      {ability && (
        <button
          type="button"
          onClick={onToggleAuto}
          aria-pressed={ability.auto}
          title={`${ability.name}: ${ability.desc}. Авто — само, когда рядом трое врагов, тяжёлый или босс`}
          className={`${glassBtn} h-[calc(var(--h-btn)*0.6)] px-1 text-[length:var(--fs-xs)] gap-1 shrink-0 ${ability.auto ? '!bg-orange-700/60 !border-orange-300/50 !text-white' : ''}`}
        >
          <span className="font-bold">{ability.name}</span>
          <span className="truncate text-stone-300">— {ability.desc}</span>
          <span className="ml-auto font-bold whitespace-nowrap">авто: {ability.auto ? 'вкл' : 'выкл'}</span>
        </button>
      )}
      {info && info.lines.length > 0 && !details && (
        <div className="text-[length:var(--fs-xs)] leading-tight text-[#bfe8ff] truncate" title={info.lines.join('; ')}>
          {info.lines.join(' · ')}
        </div>
      )}

      {/* Details: what each specialization does and the damage dealt */}
      {details && (
        <div className="flex flex-col gap-y-0.5 text-[length:var(--fs-xs)] leading-snug text-stone-300">
          {info?.lines.map((l) => (
            <div key={l} className="text-[#bfe8ff]">
              {l}
            </div>
          ))}
          {notes.map((n) => (
            <div key={n.title}>
              <span className="text-amber-300 font-semibold">{n.title}</span> — {n.text}
            </div>
          ))}
          {damage && (
            <div className="tabular-nums text-stone-400">
              Урон: в этой волне <span className="text-amber-200 font-semibold">{fmt(damage.wave)}</span>, за бой{' '}
              <span className="text-amber-200 font-semibold">{fmt(damage.run)}</span>
            </div>
          )}
        </div>
      )}

      {/* 3. Target priority, merge, bind and sell: one row */}
      <div
        className={`grid gap-1 h-[var(--h-btn)] shrink-0 ${
          humans ? (canUpgrade ? 'grid-cols-5' : 'grid-cols-4') : ability ? (info?.sacrifice !== undefined && tower.type === 'dem_gate' ? 'grid-cols-5' : 'grid-cols-4') : 'grid-cols-3'
        }`}
      >
        <button
          type="button"
          onClick={onCyclePriority}
          className="h-[var(--h-btn)] px-1 rounded bg-white/5 hover:bg-white/15 border border-white/15 flex flex-col items-center justify-center leading-none cursor-pointer"
          title="Приоритет цели (Tab)"
        >
          <span className="text-[length:var(--fs-xs)] text-stone-400">Цель</span>
          <span className="text-amber-300 font-bold text-[length:var(--fs-btn4)] mt-0.5">{priorityLabel}</span>
        </button>

        <button
          type="button"
          onClick={onMerge}
          disabled={!canMerge}
          className={`h-[var(--h-btn)] px-1 rounded font-bold flex flex-col items-center justify-center leading-none transition-all ${
            canMerge
              ? 'bg-amber-500 hover:bg-amber-400 text-stone-950 border border-amber-300 shadow-md shadow-amber-950/40 animate-pulse cursor-pointer'
              : 'bg-black/30 text-stone-500 border border-white/10 cursor-not-allowed'
          }`}
          title={humans ? 'Слить 3 башни в одну (M); обычная связка заменяет третью башню Ур.1' : `Слить ${mergeNeed} одинаковые башни в одну (M)`}
        >
          <span className="text-[length:var(--fs-btn4)]">Слить</span>
          <span className="text-[length:var(--fs-xs)] tabular-nums mt-0.5">
            {second ? '—' : tower.level >= maxLevel ? 'макс' : mergeUsesBinder ? '2+связка' : `${eligibleMergeCount}/${mergeNeed}`}
          </span>
        </button>

        {ability && (
          <button
            type="button"
            onClick={onCastAbility}
            disabled={!ability.ready || gold < ability.cost}
            className={`h-[var(--h-btn)] px-0.5 rounded font-bold flex flex-col items-center justify-center leading-none transition-all ${
              ability.left > 0
                ? 'bg-orange-500 text-stone-950 border border-orange-200'
                : ability.ready && gold >= ability.cost
                  ? 'bg-orange-950/60 hover:bg-orange-900/60 text-orange-300 border border-orange-400/60 cursor-pointer'
                  : 'bg-black/30 text-stone-500 border border-white/10 cursor-not-allowed'
            }`}
            title={`${ability.name}: ${ability.desc} (A)`}
          >
            <span className="text-[length:var(--fs-btn4)] truncate max-w-full">{ability.name}</span>
            <span className="text-[length:var(--fs-xs)] mt-0.5 tabular-nums whitespace-nowrap">
              {ability.left > 0 ? `${ability.left} с` : ability.cooldown > 0 ? `через ${ability.cooldown} с` : `${ability.cost} зол.`}
            </span>
          </button>
        )}

        {tower.type === 'dem_gate' && (
          <button
            type="button"
            onClick={onSacrifice}
            disabled={!info?.sacrifice}
            className={`h-[var(--h-btn)] px-0.5 rounded font-bold flex flex-col items-center justify-center leading-none transition-all ${
              info?.sacrifice ? 'bg-red-950/60 hover:bg-red-900/60 text-red-300 border border-red-500/60 cursor-pointer' : 'bg-black/30 text-stone-500 border border-white/10 cursor-not-allowed'
            }`}
            title="Жертва: самая дешёвая башня рядом сгорает, залп по всем врагам в радиусе"
          >
            <span className="text-[length:var(--fs-btn4)]">Жертва</span>
            <span className="text-[length:var(--fs-xs)] mt-0.5 tabular-nums whitespace-nowrap">{info?.sacrifice ? `урон ${info.sacrifice}` : 'нет башни'}</span>
          </button>
        )}

        {humans && canUpgrade && (
          <button
            type="button"
            onClick={onUpgradeTower}
            className="h-[var(--h-btn)] px-0.5 rounded font-bold flex flex-col items-center justify-center leading-none bg-teal-500 hover:bg-teal-400 text-stone-950 border border-teal-200 shadow-md shadow-teal-950/40 animate-pulse cursor-pointer"
            title="Поднять уровень тройной связкой (U)"
          >
            <span className="text-[length:var(--fs-btn4)]">Уровень!</span>
            <span className="text-[length:var(--fs-xs)] mt-0.5 whitespace-nowrap">связкой</span>
          </button>
        )}

        {humans && (
        <button
          type="button"
          onClick={onBind}
          disabled={!canBind}
          className={`h-[var(--h-btn)] px-0.5 rounded font-bold flex flex-col items-center justify-center leading-none transition-all ${
            isBinding
              ? 'bg-[#3ed6c4] text-stone-950 border border-teal-200 cursor-pointer'
              : canBind
              ? 'bg-teal-950/60 hover:bg-teal-900/60 text-[#3ed6c4] border border-[#3ed6c4]/60 cursor-pointer'
              : 'bg-black/30 text-stone-500 border border-white/10 cursor-not-allowed'
          }`}
          title={`Связать с башней другого вида (B); обе башни — Ур.${CONFIG.binder.minLevel} или Ур.3`}
        >
          <span className="text-[length:var(--fs-btn4)]">Связать</span>
          <span className="text-[length:var(--fs-xs)] mt-0.5 whitespace-nowrap">{bindLabel}</span>
        </button>
        )}

        <button
          type="button"
          onClick={onSell}
          className="h-[var(--h-btn)] px-1 rounded bg-red-950/40 hover:bg-red-900/50 text-red-300 border border-red-800/50 flex flex-col items-center justify-center leading-none transition-colors cursor-pointer"
          title="Продать башню (S)"
        >
          <span className="text-[length:var(--fs-btn4)] font-semibold">Продать</span>
          <span className="text-amber-300 font-bold text-[length:var(--fs-xs)] tabular-nums mt-0.5">{refund}</span>
        </button>
      </div>
    </Card>
  );
}
