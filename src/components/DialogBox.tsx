/**
 * Окно диалога похода: как в старых играх («Metal Gear») — портрет говорящего слева, имя и текст рядом, в рамке
 * из чёрного камня с бирюзовым свечением кристалла связи (просьба Артура 2026-11-12). Текст проявляется буква за буквой;
 * касание, Пробел или Enter, пока он идёт, — показать реплику целиком, ещё раз — следующая; «Пропустить» (Esc) — вся сцена.
 */
import { useEffect, useState } from 'react';
import { setDevScene } from '../devNotes';
import { Scene, SPEAKER_COLORS, SPEAKER_ROLES } from '../campaign/dialogs';

/** Портреты говорящих (public/portraits/) */
const PORTRAITS: Record<string, string> = {
  Рен: 'ren',
  Эхо: 'lina',
  Каллен: 'kallen',
  Наместник: 'oris',
  Мельхиор: 'melkhior',
  Гарт: 'gart',
  Сефира: 'sefira',
  Осип: 'osip',
};
const CHARS_PER_SECOND = 55;

interface DialogBoxProps {
  scene: Scene;
  onDone: () => void;
}

export function DialogBox({ scene, onDone }: DialogBoxProps) {
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(0); // сколько букв реплики уже проявилось
  const line = scene.lines[i];
  const total = line?.text.length ?? 0;
  const typing = shown < total;
  const next = () => {
    if (typing) return setShown(total);
    if (i + 1 < scene.lines.length) setI(i + 1);
    else onDone();
  };

  useEffect(() => setI(0), [scene.id]);
  useEffect(() => {
    setShown(0);
    if (!total) return;
    const t0 = performance.now();
    const id = setInterval(() => {
      const n = Math.min(total, Math.floor(((performance.now() - t0) / 1000) * CHARS_PER_SECOND) + 1);
      setShown(n);
      if (n >= total) clearInterval(id);
    }, 30);
    return () => clearInterval(id);
  }, [scene.id, i, total]);
  useEffect(() => {
    setDevScene(line ? { id: scene.id, line: i + 1, lines: scene.lines.length, who: line.who, text: line.text } : null);
  }, [scene, i, line]);
  useEffect(() => () => setDevScene(null), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return; // печатают заметку разработчика
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
  const portrait = PORTRAITS[line.who];
  const role = line.role ?? SPEAKER_ROLES[line.who];
  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none">
      <div
        role="dialog"
        aria-label={line.who}
        onClick={next}
        className="pointer-events-auto flex w-full max-w-3xl cursor-pointer gap-3 rounded-xl border-2 border-[#2f4a4a] bg-gradient-to-b from-[#1b1a22]/95 to-[#0d0c12]/95 p-2.5 shadow-[0_0_18px_rgba(80,220,200,0.25),inset_0_0_24px_rgba(0,0,0,0.6)] select-none"
      >
        <div
          className="relative shrink-0 w-[72px] h-[92px] sm:w-[104px] sm:h-[132px] overflow-hidden rounded-lg border-2 bg-[#2b2a33]"
          style={{ borderColor: color }}
        >
          {portrait ? (
            <img src={`portraits/${portrait}.jpg`} alt={line.who} draggable={false} className="h-full w-full object-cover object-top" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-4xl font-black" style={{ color }}>
              {line.who.slice(0, 1)}
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-teal-300 shadow-[0_0_8px_#5eead4] animate-pulse" />
            <span className="font-black tracking-wide text-sm sm:text-base" style={{ color }}>
              {line.who}
            </span>
            {role && <span className="text-[11px] sm:text-xs text-stone-400">({role})</span>}
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
          <p className="min-h-[3.6em] text-[13px] sm:text-[15px] leading-snug text-[#ece6d2]">
            {line.text.slice(0, shown)}
            <span className="invisible">{line.text.slice(shown)}</span>
          </p>
          <div className="mt-auto text-right text-[11px] text-teal-300/70">
            {typing ? '' : i + 1 < scene.lines.length ? 'Дальше ▸' : 'Закрыть ▸'}
          </div>
        </div>
      </div>
    </div>
  );
}
