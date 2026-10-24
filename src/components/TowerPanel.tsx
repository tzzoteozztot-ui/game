/**
 * Tower Detail & Management Panel for «Тёмный рубеж»
 * Always visible beneath the shop with fixed height.
 * Shows selected tower stats; target priority, merge and sell share one row.
 * Shows "Коснитесь башни" when no tower is selected, and a short note with a sell button
 * for a selected «Связка». A bound tower shows both parts' stats as «main / second».
 */

import React from 'react';
import { Tower, TowerPart } from '../game/engine';
import { CONFIG } from '../game/config';
import { calculateSellRefund } from '../game/rules';
import { TowerSpriteIcon, BinderIcon } from './Icons';
import { attackStats, specSummary } from '../game/towerStats';

interface TowerPanelProps {
  tower: Tower | null;
  eligibleMergeCount: number;
  selectedBinder: boolean;
  binderCount: number;
  bindPartnerCount: number;
  isBinding: boolean;
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
  selectedBinder,
  binderCount,
  bindPartnerCount,
  isBinding,
  onCyclePriority,
  onMerge,
  onBind,
  onSell,
}: TowerPanelProps) {
  if (!tower && selectedBinder) {
    const binderRefund = Math.floor(CONFIG.binder.cost * CONFIG.upgrade.sellRatio);
    return (
      <div className="w-full h-[112px] flex flex-col justify-between gap-1 p-1.5 bg-[#171520] border-t border-[#2d2938] text-[#f4f2e6] text-xs shrink-0 select-none">
        <div className="flex items-center gap-2 h-7 shrink-0">
          <div className="w-7 h-7 flex items-center justify-center bg-[#13111a] rounded border border-[#2e2a3b] shrink-0">
            <BinderIcon size={22} />
          </div>
          <div className="font-bold text-xs" style={{ color: CONFIG.binder.color }}>
            {CONFIG.binder.name}
          </div>
        </div>
        <div className="text-[10px] leading-tight text-stone-400">
          Выберите башню, нажмите «Связать» и коснитесь башни другого вида: обе станут одной.
        </div>
        <button
          type="button"
          onClick={onSell}
          className="h-10 w-full px-1 rounded bg-red-950/40 hover:bg-red-900/50 text-red-300 border border-red-800/50 flex items-center justify-center gap-1.5 leading-none transition-colors cursor-pointer shrink-0"
          title="Продать связку (S)"
        >
          <span className="text-[11px] font-semibold">Продать</span>
          <span className="text-amber-300 font-bold text-[10px] tabular-nums">{binderRefund}</span>
        </button>
      </div>
    );
  }

  // If no tower selected, render fixed-height placeholder
  if (!tower) {
    return (
      <div className="w-full h-[112px] flex items-center justify-center p-1.5 text-center text-xs font-semibold text-stone-500 bg-[#171520] border-t border-[#2d2938] shrink-0 select-none">
        Коснитесь башни
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

  let refund = calculateSellRefund(baseDef.cost, tower.level);
  if (second && secondDef) {
    refund += calculateSellRefund(secondDef.cost, second.level);
    refund += Math.floor(CONFIG.binder.cost * CONFIG.upgrade.sellRatio);
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

  const priorityLabel =
    tower.priority === 'first'
      ? 'Первый'
      : tower.priority === 'strongest'
      ? 'Сильный'
      : 'Ближний';

  return (
    <div className="w-full h-[112px] flex flex-col justify-between gap-1 p-1.5 bg-[#171520] border-t border-[#2d2938] text-[#f4f2e6] text-xs shrink-0 select-none">
      {/* 1. Header: Name, level, specialization */}
      <div className="flex items-center gap-2 h-7 shrink-0">
        <div className="w-7 h-7 flex items-center justify-center bg-[#13111a] rounded border border-[#2e2a3b] shrink-0 overflow-hidden">
          <TowerSpriteIcon type={tower.type} size={22} color={baseDef.color} />
        </div>
        <div className="min-w-0 flex-1 flex items-baseline justify-between gap-1 leading-none">
          <div className={`font-bold text-stone-200 text-xs ${second ? 'shrink-0' : 'truncate'}`}>
            {baseDef.name}{' '}
            <span className="text-amber-400 text-[11px] font-bold">{second ? tower.level : `Ур.${tower.level}`}</span>
            {second && secondDef && (
              <>
                <span style={{ color: CONFIG.binder.color }}> + </span>
                {secondDef.name} <span className="text-amber-400 text-[11px] font-bold">{second.level}</span>
              </>
            )}
          </div>
          <div
            className={`text-[10px] text-amber-300 font-semibold truncate ${second ? 'min-w-0' : 'shrink-0'}`}
            title={specText}
          >
            {specText || (tower.level === 3 ? 'МАКС' : 'Базовая')}
          </div>
        </div>
      </div>

      {/* 2. Stats Grid: Damage, Period, Range */}
      <div className="grid grid-cols-3 gap-1 bg-[#121118] p-1 rounded border border-[#2d2938] text-center shrink-0">
        <div>
          <div className="text-[9px] text-stone-400 uppercase leading-none">Урон</div>
          <div className="font-bold text-amber-200 text-xs tabular-nums mt-0.5">
            {pair(main.damage, other?.damage)}
          </div>
        </div>
        <div>
          <div className="text-[9px] text-stone-400 uppercase leading-none">Период</div>
          <div className="font-bold text-stone-200 text-xs tabular-nums mt-0.5">
            {pair(main.period, other?.period)}с
          </div>
        </div>
        <div>
          <div className="text-[9px] text-stone-400 uppercase leading-none">Радиус</div>
          <div className="font-bold text-stone-200 text-xs tabular-nums mt-0.5">
            {pair(main.range, other?.range)}
          </div>
        </div>
      </div>

      {/* 3. Target priority, merge and sell in one row */}
      <div className="grid grid-cols-4 gap-1 h-10 shrink-0">
        <button
          type="button"
          onClick={onCyclePriority}
          className="h-10 px-1 rounded bg-[#221f2d] hover:bg-[#2c283a] border border-[#383347] flex flex-col items-center justify-center leading-none cursor-pointer"
          title="Приоритет цели (Tab)"
        >
          <span className="text-[9px] text-stone-400">Цель</span>
          <span className="text-amber-300 font-bold text-[11px] mt-0.5">{priorityLabel}</span>
        </button>

        <button
          type="button"
          onClick={onMerge}
          disabled={!canMerge}
          className={`h-10 px-1 rounded font-bold flex flex-col items-center justify-center leading-none transition-all ${
            canMerge
              ? 'bg-amber-500 hover:bg-amber-400 text-stone-950 border border-amber-300 shadow-md shadow-amber-950/40 animate-pulse cursor-pointer'
              : 'bg-[#1b1926] text-stone-600 border border-[#2d2938] cursor-not-allowed'
          }`}
          title="Слить 3 башни в одну (M)"
        >
          <span className="text-[11px]">Слить</span>
          <span className="text-[10px] tabular-nums mt-0.5">
            {second ? '—' : tower.level >= 3 ? 'макс' : `${eligibleMergeCount}/3`}
          </span>
        </button>

        <button
          type="button"
          onClick={onBind}
          disabled={!canBind}
          className={`h-10 px-0.5 rounded font-bold flex flex-col items-center justify-center leading-none transition-all ${
            isBinding
              ? 'bg-[#3ed6c4] text-stone-950 border border-teal-200 cursor-pointer'
              : canBind
              ? 'bg-teal-950/60 hover:bg-teal-900/60 text-[#3ed6c4] border border-[#3ed6c4]/60 cursor-pointer'
              : 'bg-[#1b1926] text-stone-600 border border-[#2d2938] cursor-not-allowed'
          }`}
          title="Связать с башней другого вида (B)"
        >
          <span className="text-[11px]">Связать</span>
          <span className="text-[10px] mt-0.5 whitespace-nowrap">{bindLabel}</span>
        </button>

        <button
          type="button"
          onClick={onSell}
          className="h-10 px-1 rounded bg-red-950/40 hover:bg-red-900/50 text-red-300 border border-red-800/50 flex flex-col items-center justify-center leading-none transition-colors cursor-pointer"
          title="Продать башню (S)"
        >
          <span className="text-[11px] font-semibold">Продать</span>
          <span className="text-amber-300 font-bold text-[10px] tabular-nums mt-0.5">{refund}</span>
        </button>
      </div>
    </div>
  );
}
