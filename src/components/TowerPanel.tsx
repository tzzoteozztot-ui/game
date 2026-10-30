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
import { CONFIG } from '../game/config';
import { calculateSellRefund } from '../game/rules';
import { TowerSpriteIcon, BinderIcon } from './Icons';

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
import { attackStats, specSummary } from '../game/towerStats';

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
}

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');

// The card's frame: App puts it in a bottom corner of the field, inside an inline-size container as wide as the field
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="pointer-events-auto flex flex-col gap-1 p-1.5 rounded-lg bg-[#121018]/70 border border-white/15 backdrop-blur-[3px] shadow-xl text-[#f4f2e6] text-[length:var(--fs-md)] select-none overflow-y-auto"
      style={{
        ...PANEL_VARS,
        width: `clamp(232px, calc(${CELL} * 4.9), 420px)`,
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
  const smiteOnly = !stats.normalAttack;
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
}: TowerPanelProps) {
  const closeBtn = (
    <button type="button" onClick={onClose} title="Закрыть (Esc)" className={`${glassBtn} w-[var(--h-head)] h-[var(--h-head)] text-[length:var(--fs-lg)] shrink-0`}>
      ×
    </button>
  );
  if (!tower && selectedBinder) {
    const triple = selectedBinderTriple;
    const binderRefund = Math.floor(CONFIG.binder.cost * (triple ? 3 : 1) * sellRatio);
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
            : 'Выберите башню, нажмите «Связать» и коснитесь башни другого вида. Три связки сливаются в тройную с ' + CONFIG.binder.tripleFromTier + '-го яруса лавки.'}
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

  const baseDef = CONFIG.towers[tower.type];
  const canMerge = eligibleMergeCount >= 3 && tower.level < 3;

  const second = tower.second;
  const secondDef = second ? CONFIG.towers[second.type] : null;
  const main = partStats(tower);
  const other = second ? partStats(second) : null;
  const pair = (a: string | number, b: string | number | undefined) => (b === undefined ? `${a}` : `${a} / ${b}`);

  let refund = calculateSellRefund(baseDef.cost, tower.level, sellRatio);
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
    if (seen.length === 0) {
      notes.push({
        title: def.name,
        text:
          (part.type === 'priest'
            ? `метка: замедление ${Math.round(CONFIG.priestBase.slow * 100)}% и +${Math.round(CONFIG.priestBase.markBonus * 100)}% урона от всех башен на ${CONFIG.priestBase.time} с цели и врагам в ${CONFIG.priestSupport.radius} клетке. `
            : `${def.damageType === 'phys' ? 'физический' : 'магический'} урон. `) +
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
    <Card>
      {/* 1. Header: Name, level, specialization; details and close */}
      <div className="flex items-center gap-1.5 h-[var(--h-head)] shrink-0">
        <div className="w-[var(--h-head)] h-[var(--h-head)] flex items-center justify-center bg-black/30 rounded border border-white/10 shrink-0 overflow-hidden">
          <TowerSpriteIcon type={tower.type} size="85%" color={baseDef.color} />
        </div>
        <div className="min-w-0 flex-1 flex items-baseline justify-between gap-1 leading-none">
          <div className={`font-bold text-stone-200 text-[length:var(--fs-md)] shrink-0`}>
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
            {specText || (tower.level === 3 ? 'МАКС' : 'Базовая')}
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
          { label: 'Урон', value: pair(main.damage, other?.damage), color: 'text-amber-200' },
          { label: 'Период', value: `${pair(main.period, other?.period)}с`, color: 'text-stone-200' },
          { label: 'Радиус', value: pair(main.range, other?.range), color: 'text-stone-200' },
        ].map((st) => (
          <div key={st.label} className="flex items-baseline justify-center gap-1 min-w-0">
            <span className="text-[length:var(--fs-xs)] text-stone-400">{st.label}</span>
            <span className={`font-bold ${st.color} text-[length:var(--fs-md)]`}>{st.value}</span>
          </div>
        ))}
      </div>

      {/* Details: what each specialization does and the damage dealt */}
      {details && (
        <div className="flex flex-col gap-y-0.5 text-[length:var(--fs-xs)] leading-snug text-stone-300">
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
      <div className={`grid gap-1 h-[var(--h-btn)] shrink-0 ${canUpgrade ? 'grid-cols-5' : 'grid-cols-4'}`}>
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
          title="Слить 3 башни в одну (M); связка заменяет третью: обычная для Ур.1, тройная для Ур.2"
        >
          <span className="text-[length:var(--fs-btn4)]">Слить</span>
          <span className="text-[length:var(--fs-xs)] tabular-nums mt-0.5">
            {second ? '—' : tower.level >= 3 ? 'макс' : mergeUsesBinder ? '2+связка' : `${eligibleMergeCount}/3`}
          </span>
        </button>

        {canUpgrade && (
          <button
            type="button"
            onClick={onUpgradeTower}
            className="h-[var(--h-btn)] px-0.5 rounded font-bold flex flex-col items-center justify-center leading-none bg-teal-500 hover:bg-teal-400 text-stone-950 border border-teal-200 shadow-md shadow-teal-950/40 animate-pulse cursor-pointer"
            title="Поднять уровень тройной связкой (U)"
          >
            <span className="text-[length:var(--fs-btn4)]">Усилить</span>
            <span className="text-[length:var(--fs-xs)] mt-0.5 whitespace-nowrap">связкой</span>
          </button>
        )}

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
          title="Связать с башней другого вида (B)"
        >
          <span className="text-[length:var(--fs-btn4)]">Связать</span>
          <span className="text-[length:var(--fs-xs)] mt-0.5 whitespace-nowrap">{bindLabel}</span>
        </button>

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
