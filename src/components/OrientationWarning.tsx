/**
 * Portrait Orientation Screen Warning for «Тёмный рубеж»
 * Prompts user to rotate device to landscape.
 */

import React from 'react';
import { HOME_SCREEN_HINT, isStandalone, toggleFullscreen, useFullscreen } from '../fullscreen';

export function OrientationWarning() {
  const { supported, active } = useFullscreen();
  return (
    <div className="fixed inset-0 z-50 bg-[#121118] text-[#f4f2e6] flex flex-col items-center justify-center p-6 text-center select-none">
      <div className="w-16 h-16 mb-4 flex items-center justify-center text-amber-400">
        <svg
          className="w-14 h-14 animate-pulse"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="4" y="2" width="16" height="20" rx="2" />
          <line x1="10" y1="18" x2="14" y2="18" />
        </svg>
      </div>
      <h2 className="text-xl font-black text-amber-300 tracking-wide mb-2">
        Поверните устройство
      </h2>
      <p className="text-sm text-stone-300 max-w-xs leading-relaxed">
        Игра «Тёмный рубеж» оптимизирована для альбомной (горизонтальной) ориентации экрана.
      </p>
      {/* Full screen also locks the landscape orientation where the browser allows it */}
      {supported ? (
        <button
          type="button"
          onClick={toggleFullscreen}
          className="mt-5 min-h-[44px] px-5 rounded bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-sm cursor-pointer"
        >
          {active ? 'Выйти из полного экрана' : 'На весь экран'}
        </button>
      ) : (
        !isStandalone() && <p className="text-xs text-stone-400 max-w-xs leading-relaxed mt-4">{HOME_SCREEN_HINT}</p>
      )}
    </div>
  );
}
