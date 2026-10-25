/**
 * Duel «Армия» panel for «Тёмный рубеж»: enemies bought for the opponent, in the same 3×2 grid as
 * the tower shop. They leave with the next wave; every send raises the gold of later rounds.
 */

import React from 'react';
import { CONFIG } from '../game/config';
import { SEND_TYPES, SendType, calculateSendIncome } from '../game/rules';
import { GoldIcon } from './Icons';

interface ArmyPanelProps {
  gold: number;
  prices: Record<SendType, number>;
  outgoing: Partial<Record<SendType, number>>;
  outgoingCost: number;
  income: number;
  onBuy: (type: SendType) => void;
  onClear: () => void;
}

export function ArmyPanel({ gold, prices, outgoing, outgoingCost, income, onBuy, onClear }: ArmyPanelProps) {
  const count = SEND_TYPES.reduce((n, t) => n + (outgoing[t] ?? 0), 0);
  const gain = calculateSendIncome(outgoingCost);

  return (
    <div className="w-full p-1.5 bg-[#171520] text-[#f4f2e6] text-[length:var(--fs-md)] flex flex-col gap-1 shrink-0 select-none">
      <div className="h-[var(--h-line)] flex items-center justify-between px-0.5 leading-none shrink-0">
        <span className="text-[length:var(--fs-sm)] uppercase font-semibold tracking-wider text-stone-400">Армия сопернику</span>
        <span className="text-amber-400 font-bold text-[length:var(--fs-sm)] tabular-nums" title="Золото в начале каждого раунда">
          доход +{income}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1 shrink-0">
        {SEND_TYPES.map((type, idx) => {
          const def = CONFIG.enemies[type];
          const price = prices[type];
          const canAfford = gold >= price;
          const n = outgoing[type] ?? 0;
          const name = type === 'swarm' ? `${def.name} (${CONFIG.swarmGroupCount} шт.)` : def.name;
          return (
            <button
              key={type}
              type="button"
              onClick={() => onBuy(type)}
              title={`${name} — ${price} золота, +${calculateSendIncome(price)} к доходу (${idx + 1})`}
              className={`h-[var(--h-card)] rounded border flex flex-col items-center justify-center relative transition-all cursor-pointer select-none shrink-0 ${
                n > 0
                  ? 'border-red-400/70 bg-red-950/30 hover:bg-red-950/45'
                  : canAfford
                    ? 'border-[#383347] bg-[#221f2d] hover:bg-[#2c283a]'
                    : 'border-[#262330] bg-[#181622] opacity-50'
              }`}
            >
              <span className="absolute top-0.5 left-1 max-w-[calc(100%-8px)] truncate text-stone-300 text-[length:var(--fs-xs)] font-semibold leading-none [text-shadow:0_1px_2px_#000]">
                {def.name}
              </span>
              {n > 0 && (
                <span className="absolute bottom-1 right-1 text-red-300 text-[length:var(--fs-md)] font-black leading-none tabular-nums">
                  ×{n}
                </span>
              )}
              <div className="w-full h-[calc(var(--h-card)-var(--fs-md)-10px)] flex items-center justify-center shrink-0">
                <img
                  src={`sprites/enemy_${type}.png`}
                  alt={def.name}
                  draggable={false}
                  style={{ height: '100%', width: 'auto', maxWidth: '100%', objectFit: 'contain' }}
                />
              </div>
              <div
                className={`flex items-center gap-0.5 font-bold text-[length:var(--fs-md)] tabular-nums leading-none mt-1 ${
                  canAfford ? 'text-amber-300' : 'text-stone-500'
                }`}
              >
                <GoldIcon size="0.95em" />
                <span>{price}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* What leaves with the next wave; a tap takes it back with its gold */}
      <button
        type="button"
        onClick={onClear}
        disabled={count === 0}
        title="Забрать купленных врагов и их золото"
        className={`h-[clamp(30px,9cqh_-_6px,56px)] w-full px-1 rounded border text-[length:var(--fs-md)] font-semibold flex items-center justify-center gap-1 transition-colors shrink-0 ${
          count > 0
            ? 'bg-[#221f2d] hover:bg-[#2c283a] text-stone-200 border-[#383347] cursor-pointer'
            : 'bg-[#181622] text-stone-500 border-[#262330] cursor-default'
        }`}
      >
        {count > 0 ? (
          <span>
            Уйдут {count} · +{gain} дохода · <span className="text-red-300">Сбросить</span>
          </span>
        ) : (
          <span>Купите врагов: уйдут с волной</span>
        )}
      </button>
    </div>
  );
}
