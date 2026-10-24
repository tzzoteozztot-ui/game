/**
 * Specialization Choice Modal for «Тёмный рубеж»
 * Triggered upon reaching Level 2. Mandatory and irreversible.
 */

import React from 'react';
import { TowerType, CONFIG } from '../game/config';
import { TowerShapeIcon } from './Icons';

interface SpecModalProps {
  towerType: TowerType;
  onSelectSpec: (specId: string) => void;
}

export function SpecModal({ towerType, onSelectSpec }: SpecModalProps) {
  const baseDef = CONFIG.towers[towerType];

  return (
    <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-[#171520] border-2 border-amber-600/70 rounded-xl p-5 sm:p-6 max-w-md w-full shadow-2xl text-[#f4f2e6]">
        {/* Header */}
        <div className="text-center mb-5">
          <div className="w-12 h-12 mx-auto mb-2 flex items-center justify-center bg-[#13111a] rounded-lg border border-[#383347]">
            <TowerShapeIcon type={towerType} size={32} color={baseDef.color} />
          </div>
          <h2 className="text-xl font-black text-amber-300 tracking-wide">
            Выберите специализацию
          </h2>
          <p className="text-xs text-stone-400 mt-1">
            Башня {baseDef.name} достигла Уровня 2. Выбор специализации необратим!
          </p>
        </div>

        {/* 3 Specialization Options */}
        <div className="flex flex-col gap-3">
          {baseDef.specs.map((spec) => (
            <button
              key={spec.id}
              type="button"
              onClick={() => onSelectSpec(spec.id)}
              className="p-3.5 rounded-lg border border-[#3d384d] bg-[#221f2d] hover:bg-amber-950/40 hover:border-amber-400 text-left transition-all group flex flex-col gap-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-stone-100 group-hover:text-amber-300">
                  {spec.name}
                </span>
                <span className="text-[11px] text-amber-500/80 uppercase font-semibold">
                  Выбрать →
                </span>
              </div>
              <p className="text-xs text-stone-300 leading-relaxed">{spec.desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
