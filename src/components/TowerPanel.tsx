/**
 * Tower Detail & Management Panel for «Тёмный рубеж»
 * Always visible beneath the shop with fixed height.
 * Shows selected tower stats, target priority switch, sell and merge in one line.
 * Shows "Коснитесь башни" when no tower is selected.
 */

import React from 'react';
import { Tower } from '../game/engine';
import { CONFIG } from '../game/config';
import { calculateSellRefund } from '../game/rules';
import { TowerSpriteIcon } from './Icons';

interface TowerPanelProps {
  tower: Tower | null;
  eligibleMergeCount: number;
  onCyclePriority: () => void;
  onMerge: () => void;
  onSell: () => void;
}

export function TowerPanel({
  tower,
  eligibleMergeCount,
  onCyclePriority,
  onMerge,
  onSell,
}: TowerPanelProps) {
  // If no tower selected, render fixed-height placeholder
  if (!tower) {
    return (
      <div className="w-full h-[156px] flex flex-col items-center justify-center p-1.5 text-center text-stone-500 bg-[#171520] border-t border-[#2d2938] shrink-0 select-none">
        <div className="w-7 h-7 rounded-full border border-dashed border-stone-700 flex items-center justify-center mb-1 text-stone-500 text-xs">
          ⚔
        </div>
        <div className="text-xs font-semibold text-stone-400">Коснитесь башни</div>
        <div className="text-[10px] text-stone-600 mt-0.5">на поле для просмотра параметров</div>
      </div>
    );
  }

  const baseDef = CONFIG.towers[tower.type];
  const canMerge = eligibleMergeCount >= 3 && tower.level < 3;

  // Calculate live displayed stats
  let rawDmg = baseDef.damage;
  if (tower.level >= 2) rawDmg *= CONFIG.upgrade.lvl2DamageMult;
  if (tower.level >= 3) rawDmg *= CONFIG.upgrade.lvl3DamageMult;
  if (tower.spec === 'sniper') rawDmg *= 1.8;
  if (tower.spec === 'arrow_hail') rawDmg *= 0.8;
  if (tower.spec === 'frost') rawDmg *= 0.8;
  if (tower.spec === 'ram') rawDmg *= 0.8;
  if (tower.spec === 'siege') rawDmg *= 0.9;
  if (tower.spec === 'smite') rawDmg *= 2.5;

  let period = baseDef.cooldown;
  if (tower.spec === 'sniper') period *= 1.6;
  if (tower.spec === 'arrow_hail') period *= 0.6;
  if (tower.spec === 'siege') period *= 1.15;
  if (tower.spec === 'smite') period = 2.5;

  let range = baseDef.range;
  if (tower.level >= 2) range *= CONFIG.upgrade.lvl2RangeMult;
  if (tower.level >= 3) range *= CONFIG.upgrade.lvl3RangeMult;
  if (tower.spec === 'sniper') range *= 1.6;

  const refund = calculateSellRefund(baseDef.cost, tower.level);
  const specDef = tower.spec ? baseDef.specs.find((s) => s.id === tower.spec) : null;

  const priorityLabel =
    tower.priority === 'first'
      ? 'Первый'
      : tower.priority === 'strongest'
      ? 'Сильный'
      : 'Ближний';

  return (
    <div className="w-full h-[156px] flex flex-col justify-between p-1.5 bg-[#171520] border-t border-[#2d2938] text-[#f4f2e6] text-xs shrink-0 select-none">
      {/* 1. Header: Name, level, specialization */}
      <div className="flex items-center gap-2 h-7 shrink-0">
        <div className="w-7 h-7 flex items-center justify-center bg-[#13111a] rounded border border-[#2e2a3b] shrink-0 overflow-hidden">
          <TowerSpriteIcon type={tower.type} size={22} color={baseDef.color} />
        </div>
        <div className="min-w-0 flex-1 flex items-baseline justify-between gap-1 leading-none">
          <div className="font-bold text-stone-200 text-xs truncate">
            {baseDef.name}{' '}
            <span className="text-amber-400 text-[11px] font-bold">
              Ур.{tower.level}
            </span>
          </div>
          <div className="text-[10px] text-amber-300 font-semibold truncate shrink-0">
            {specDef ? specDef.name : tower.level === 3 ? 'МАКС' : 'Базовая'}
          </div>
        </div>
      </div>

      {/* 2. Stats Grid: Damage, Period, Range */}
      <div className="grid grid-cols-3 gap-1 bg-[#121118] p-1 rounded border border-[#2d2938] text-center shrink-0">
        <div>
          <div className="text-[9px] text-stone-400 uppercase leading-none">Урон</div>
          <div className="font-bold text-amber-200 text-xs tabular-nums mt-0.5">
            {Math.round(rawDmg * 10) / 10}
          </div>
        </div>
        <div>
          <div className="text-[9px] text-stone-400 uppercase leading-none">Период</div>
          <div className="font-bold text-stone-200 text-xs tabular-nums mt-0.5">
            {(Math.round(period * 10) / 10).toFixed(1)}с
          </div>
        </div>
        <div>
          <div className="text-[9px] text-stone-400 uppercase leading-none">Радиус</div>
          <div className="font-bold text-stone-200 text-xs tabular-nums mt-0.5">
            {(Math.round(range * 10) / 10).toFixed(1)}кл
          </div>
        </div>
      </div>

      {/* 3. Target Priority Switcher */}
      <button
        type="button"
        onClick={onCyclePriority}
        className="w-full h-10 px-2 rounded bg-[#221f2d] hover:bg-[#2c283a] border border-[#383347] flex items-center justify-between text-xs font-semibold cursor-pointer shrink-0"
        title="Приоритет цели (Tab)"
      >
        <span className="text-stone-400 text-[11px]">Цель (Tab):</span>
        <span className="text-amber-300 font-bold text-xs">{priorityLabel}</span>
      </button>

      {/* 4. Action Buttons in One Row: Merge & Sell */}
      <div className="grid grid-cols-2 gap-1.5 h-10 shrink-0">
        <button
          type="button"
          onClick={onMerge}
          disabled={!canMerge}
          className={`h-10 px-1 rounded font-bold text-xs flex items-center justify-center gap-1 transition-all ${
            canMerge
              ? 'bg-amber-500 hover:bg-amber-400 text-stone-950 border border-amber-300 shadow-md shadow-amber-950/40 animate-pulse cursor-pointer'
              : 'bg-[#1b1926] text-stone-600 border border-[#2d2938] cursor-not-allowed'
          }`}
          title="Слить 3 башни в одну (M)"
        >
          <span>Слить</span>
          <span className="text-[11px] tabular-nums">
            [{tower.level >= 3 ? 'MAX' : `${eligibleMergeCount}/3`}]
          </span>
        </button>

        <button
          type="button"
          onClick={onSell}
          className="h-10 px-1 rounded bg-red-950/40 hover:bg-red-900/50 text-red-300 border border-red-800/50 text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
          title="Продать башню (S)"
        >
          <span>Продать</span>
          <span className="text-amber-300 font-bold tabular-nums">({refund})</span>
        </button>
      </div>
    </div>
  );
}
