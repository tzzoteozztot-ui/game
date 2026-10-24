/**
 * Portrait Orientation Screen Warning for «Тёмный рубеж»
 * Prompts user to rotate device to landscape.
 */

import React from 'react';

export function OrientationWarning() {
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
    </div>
  );
}
