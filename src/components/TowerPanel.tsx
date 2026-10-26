/**
 * Tower Detail & Management Panel for «Тёмный рубеж»
 * Always visible beneath the shop with fixed height.
 * Shows selected tower stats; target priority, merge and sell share one row.
 * Shows "Коснитесь башни" when no tower is selected; for a selected «Связка» a note with
 * merge (three into a triple one) or raise (triple) and sell buttons. A bound tower shows both parts' stats as «main / second».
 */

import React from 'react';
import { Tower, TowerPart } from '../game/engine';
import { CONFIG } from '../game/config';
import { calculateSellRefund } from '../game/rules';
import { TowerSpriteIcon, BinderIcon } from './Icons';
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
}: TowerPanelProps) {
  if (!tower && selectedBinder) {
    const triple = selectedBinderTriple;
    const binderRefund = Math.floor(CONFIG.binder.cost * (triple ? 3 : 1) * sellRatio);
    const canAct = triple ? isUpgrading || upgradeTargetCount > 0 : canMergeBinders;
    return (
      <div className="w-full flex-1 min-h-[112px] flex flex-col justify-between gap-1 p-1.5 bg-[#171520] border-t border-[#2d2938] text-[#f4f2e6] text-[length:var(--fs-md)] shrink-0 select-none">
        <div className="flex items-center gap-2 h-[var(--h-head)] shrink-0">
          <div className="w-[var(--h-head)] h-[var(--h-head)] flex items-center justify-center bg-[#13111a] rounded border border-[#2e2a3b] shrink-0">
            <BinderIcon size="80%" />
          </div>
          <div className="font-bold text-[length:var(--fs-md)]" style={{ color: CONFIG.binder.color }}>
            {triple ? 'Тройная связка' : CONFIG.binder.name}
          </div>
        </div>
        <div className="flex-1 flex items-center text-[length:var(--fs-sm)] leading-tight text-stone-400">
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
                  : 'bg-[#1b1926] text-stone-600 border border-[#2d2938] cursor-not-allowed'
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
      </div>
    );
  }

  // No tower selected: a short reminder of the controls fills the panel on tall screens
  if (!tower) {
    return (
      <div className="w-full flex-1 min-h-[112px] flex flex-col items-center justify-center gap-2 p-1.5 text-center bg-[#171520] border-t border-[#2d2938] select-none">
        <div className="text-[length:var(--fs-md)] font-semibold text-stone-500">Коснитесь башни</div>
        <ul className="text-[length:var(--fs-xs)] leading-snug text-stone-500 space-y-1 [@container(max-height:520px)]:hidden">
          <li>Три одинаковые башни одного уровня сливаются в одну (M).</li>
          <li>На Ур.2 башня получает свойство, на Ур.3 — все свойства трёх башен.</li>
          <li>«Связка» объединяет две башни разных видов (B), три связки — в тройную (M, с 5-го яруса лавки).</li>
        </ul>
      </div>
    );
  }

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
    <div className="w-full flex-1 min-h-[112px] flex flex-col justify-between gap-1 p-1.5 bg-[#171520] border-t border-[#2d2938] text-[#f4f2e6] text-[length:var(--fs-md)] shrink-0 select-none">
      {/* 1. Header: Name, level, specialization */}
      <div className="flex items-center gap-2 h-[var(--h-head)] shrink-0">
        <div className="w-[var(--h-head)] h-[var(--h-head)] flex items-center justify-center bg-[#13111a] rounded border border-[#2e2a3b] shrink-0 overflow-hidden">
          <TowerSpriteIcon type={tower.type} size="85%" color={baseDef.color} />
        </div>
        <div className="min-w-0 flex-1 flex items-baseline justify-between gap-1 leading-none">
          <div className={`font-bold text-stone-200 text-[length:var(--fs-md)] ${second ? 'shrink-0' : 'truncate'}`}>
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
            className={`text-[length:var(--fs-sm)] text-amber-300 font-semibold truncate ${second ? 'min-w-0' : 'shrink-0'}`}
            title={specText}
          >
            {specText || (tower.level === 3 ? 'МАКС' : 'Базовая')}
          </div>
        </div>
      </div>

      {/* 2. Stats Grid: Damage, Period, Range */}
      <div className="grid grid-cols-3 gap-1 bg-[#121118] shrink-0 p-1 rounded border border-[#2d2938] text-center">
        <div>
          <div className="text-[length:var(--fs-xs)] text-stone-400 uppercase leading-none">Урон</div>
          <div className={`font-bold text-amber-200 ${second ? 'text-[length:var(--fs-md)]' : 'text-[length:var(--fs-lg)]'} whitespace-nowrap tabular-nums mt-0.5`}>
            {pair(main.damage, other?.damage)}
          </div>
        </div>
        <div>
          <div className="text-[length:var(--fs-xs)] text-stone-400 uppercase leading-none">Период</div>
          <div className={`font-bold text-stone-200 ${second ? 'text-[length:var(--fs-md)]' : 'text-[length:var(--fs-lg)]'} whitespace-nowrap tabular-nums mt-0.5`}>
            {pair(main.period, other?.period)}с
          </div>
        </div>
        <div>
          <div className="text-[length:var(--fs-xs)] text-stone-400 uppercase leading-none">Радиус</div>
          <div className={`font-bold text-stone-200 ${second ? 'text-[length:var(--fs-md)]' : 'text-[length:var(--fs-lg)]'} whitespace-nowrap tabular-nums mt-0.5`}>
            {pair(main.range, other?.range)}
          </div>
        </div>
      </div>

      {/* Specialization notes: fill the room tall screens leave, hidden when there is none */}
      {/* Column wrap: a note that doesn't fit whole moves to a clipped second column */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col flex-wrap gap-y-0.5 gap-x-4 text-[length:var(--fs-xs)] leading-snug text-stone-400 [@container(max-height:520px)]:hidden">
        {notes.map((n) => (
          <div key={n.title} className="w-full">
            <span className="text-amber-300 font-semibold">{n.title}</span> — {n.text}
          </div>
        ))}
      </div>

      {/* 3. Target priority, merge, bind and sell: one row, a 2×2 grid on tall screens */}
      <div
        className={`grid gap-1 h-[var(--h-btn)] shrink-0 [@container(min-height:560px)]:grid-cols-2 [@container(min-height:560px)]:[--fs-btn4:var(--fs-md)] [@container(min-height:560px)]:[--fs-xs:var(--fs-sm)] ${
          canUpgrade
            ? 'grid-cols-5 [@container(min-height:560px)]:h-[calc(var(--h-btn)*3+8px)]'
            : 'grid-cols-4 [@container(min-height:560px)]:h-[calc(var(--h-btn)*2+4px)]'
        }`}
      >
        <button
          type="button"
          onClick={onCyclePriority}
          className="h-[var(--h-btn)] px-1 rounded bg-[#221f2d] hover:bg-[#2c283a] border border-[#383347] flex flex-col items-center justify-center leading-none cursor-pointer"
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
              : 'bg-[#1b1926] text-stone-600 border border-[#2d2938] cursor-not-allowed'
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
              : 'bg-[#1b1926] text-stone-600 border border-[#2d2938] cursor-not-allowed'
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
    </div>
  );
}
