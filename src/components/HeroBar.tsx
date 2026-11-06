/**
 * Умения героя на поле (поход, просьба Артура 2026-11-06): кнопки справа посередине поля, перезарядка поверх
 * кнопки. Клавиши Z, X, C. Умения — HERO_ABILITIES в config.ts, действие — engine.castHero.
 */
import type { GameStateSnapshot } from '../game/engine';

export const HERO_KEYS = ['Z', 'X', 'C'];

export function HeroBar({ skills, onCast }: { skills: GameStateSnapshot['heroSkills']; onCast: (id: string) => void }) {
  if (!skills.length) return null;
  return (
    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 z-10 pointer-events-none">
      {skills.map((s, i) => {
        const ready = s.left <= 0;
        return (
          <button
            key={s.id}
            title={`${s.name} (${HERO_KEYS[i]}): ${s.desc}. Перезарядка ${s.cooldown} с`}
            disabled={!ready}
            onClick={() => onCast(s.id)}
            className={`pointer-events-auto relative w-11 h-11 rounded-lg border text-xl flex items-center justify-center overflow-hidden ${
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
        );
      })}
    </div>
  );
}
