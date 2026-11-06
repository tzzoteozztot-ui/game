/**
 * Окно диалога похода (глава 1 — обучение): плашка внизу экрана в рамке из чёрного камня с бирюзовым
 * свечением кристалла связи. Касание, Пробел или Enter — следующая реплика, «Пропустить» (Esc) — вся сцена.
 */
import { useEffect, useState } from 'react';
import { Scene, SPEAKER_COLORS } from '../campaign/dialogs';

interface DialogBoxProps {
  scene: Scene;
  onDone: () => void;
}

export function DialogBox({ scene, onDone }: DialogBoxProps) {
  const [i, setI] = useState(0);
  const line = scene.lines[i];
  const next = () => (i + 1 < scene.lines.length ? setI(i + 1) : onDone());

  useEffect(() => setI(0), [scene.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        e.stopImmediatePropagation();
        next();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onDone();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!line) return null;
  const color = SPEAKER_COLORS[line.who] ?? '#e8e2cf';
  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none">
      <div
        role="dialog"
        aria-label={line.who}
        onClick={next}
        className="pointer-events-auto w-full max-w-2xl cursor-pointer rounded-xl border-2 border-[#2f4a4a] bg-gradient-to-b from-[#1b1a22]/95 to-[#0d0c12]/95 px-4 py-3 shadow-[0_0_18px_rgba(80,220,200,0.25),inset_0_0_24px_rgba(0,0,0,0.6)] select-none"
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full bg-teal-300 shadow-[0_0_8px_#5eead4] animate-pulse" />
          <span className="font-black tracking-wide text-sm sm:text-base" style={{ color }}>
            {line.who}
          </span>
          <span className="flex-1" />
          <span className="text-[11px] text-stone-500">
            {i + 1}/{scene.lines.length}
          </span>
          <button
            type="button"
            className="ml-1 px-2 py-0.5 rounded text-[11px] sm:text-xs bg-[#25232f] border border-[#3b354a] text-stone-300 hover:bg-[#332f40]"
            onClick={(e) => {
              e.stopPropagation();
              onDone();
            }}
          >
            Пропустить
          </button>
        </div>
        <p className="text-[13px] sm:text-[15px] leading-snug text-[#ece6d2]">{line.text}</p>
        <div className="text-right text-[11px] text-teal-300/70 mt-1">{i + 1 < scene.lines.length ? 'Дальше ▸' : 'Закрыть ▸'}</div>
      </div>
    </div>
  );
}
