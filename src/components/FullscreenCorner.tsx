/** Кнопка «Во весь экран» в правом верхнем углу: есть на всех экранах вне боя (просьба Артура 2026-11-14). */
import { useState } from 'react';
import { FullscreenIcon } from './Icons';
import { useFullscreen, isStandalone, HOME_SCREEN_HINT } from '../fullscreen';

export function FullscreenCorner() {
  const fullscreen = useFullscreen();
  const [hint, setHint] = useState(false);
  if (isStandalone()) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => (fullscreen.supported ? fullscreen.toggle() : setHint(!hint))}
        title={fullscreen.active ? 'Обычный экран (F)' : 'Во весь экран (F)'}
        aria-label={fullscreen.active ? 'Обычный экран' : 'Во весь экран'}
        className="fixed top-2 right-2 sm:top-3 sm:right-3 w-10 h-10 flex items-center justify-center rounded bg-[#1a1724]/90 hover:bg-[#252033] border border-[#383347] text-stone-300 text-lg cursor-pointer z-[60]"
      >
        <FullscreenIcon active={fullscreen.active} />
      </button>
      {hint && (
        <div
          className="fixed top-14 right-2 sm:right-3 max-w-xs bg-[#171520] border border-[#3b354a] rounded-lg p-3 text-xs text-stone-200 shadow-xl z-[60]"
          onClick={() => setHint(false)}
        >
          {HOME_SCREEN_HINT}
        </div>
      )}
    </>
  );
}
