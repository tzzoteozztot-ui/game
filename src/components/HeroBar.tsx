/**
 * Умения героя на поле (поход, просьба Артура 2026-11-06): кнопки справа посередине поля, перезарядка поверх
 * кнопки. Клавиши Z, X, C. Умения — HERO_ABILITIES в config.ts, действие — engine.castHero.
 */
import { useState } from 'react';
import type { GameStateSnapshot } from '../game/engine';

export const HERO_KEYS = ['Z', 'X', 'C'];

export function HeroBar({ skills, onCast }: { skills: GameStateSnapshot['heroSkills']; onCast: (id: string) => void }) {
  const [help, setHelp] = useState(false); // «?» — описание каждого умения (на телефоне нет всплывающих подсказок)
  if (!skills.length) return null;
  return (
    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex flex-col items-end gap-1.5 z-10 pointer-events-none">
      <button
        title="Что умеет герой"
        onClick={() => setHelp((h) => !h)}
        className={`pointer-events-auto w-6 h-6 rounded-full border text-xs font-bold ${help ? 'bg-amber-700 border-amber-400 text-white' : 'bg-black/60 border-[#3b354a] text-amber-100'}`}
      >
        ?
      </button>
      {skills.map((s, i) => {
        const ready = s.left <= 0;
        return (
          <div key={s.id} className="flex items-center gap-1.5">
            <div className="pointer-events-none max-w-[9rem] rounded bg-black/60 px-1.5 py-0.5 text-right leading-tight">
              <div className="text-[11px] font-bold text-amber-100">{s.name}</div>
              {help && <div className="text-[10px] text-stone-300">{s.desc}. Перезарядка {s.cooldown} с</div>}
            </div>
            <button
              title={`${s.name} (${HERO_KEYS[i]}): ${s.desc}. Перезарядка ${s.cooldown} с`}
              disabled={!ready}
              onClick={() => onCast(s.id)}
              className={`pointer-events-auto relative w-11 h-11 shrink-0 rounded-lg border text-xl flex items-center justify-center overflow-hidden ${
                ready ? 'bg-black/60 border-amber-500/80 hover:bg-black/80 active:scale-95 shadow-[0_0_8px_rgba(244,192,106,0.5)]' : 'bg-black/50 border-[#3b354a] opacity-80'
              }`}
            >
              <span className={ready ? '' : 'grayscale opacity-50'}>{s.icon}</span>
              {!ready && (
                <>
                  <span className="absolute bottom-0 left-0 right-0 bg-black/60" style={{ height: `${(s.left / s.cooldown) * 100}%` }} />
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-amber-100">{s.left}</span>
                </>
              )}
              <span className="absolute top-0 left-0.5 text-[9px] text-stone-400">{HERO_KEYS[i]}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
