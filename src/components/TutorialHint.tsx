/**
 * Подсказка обучения в бою (просьба Артура 2026-11-12): Эхо над полем говорит, что сделать; нужная кнопка подсвечена
 * (`data-tut`, класс `tut-pulse`). Касаний поля не берёт, только свою кнопку «Пропустить обучение».
 */
import { useEffect } from 'react';

interface TutorialHintProps {
  text: string;
  mark: string | null;
  onSkip: () => void;
}

export function TutorialHint({ text, mark, onSkip }: TutorialHintProps) {
  useEffect(() => {
    if (!mark) return;
    const targets = mark.split('|').map((m) => `[data-tut="${m}"]`).join(',');
    const apply = () => {
      document.querySelectorAll('.tut-pulse').forEach((el) => el.classList.remove('tut-pulse'));
      document.querySelectorAll(targets).forEach((el) => el.classList.add('tut-pulse'));
    };
    apply();
    const id = setInterval(apply, 250);
    return () => {
      clearInterval(id);
      document.querySelectorAll('.tut-pulse').forEach((el) => el.classList.remove('tut-pulse'));
    };
  }, [mark]);

  return (
    <div className="fixed inset-x-0 top-12 z-[55] flex justify-center px-3 pointer-events-none">
      <div className="pointer-events-auto flex max-w-xl items-center gap-2 rounded-xl border-2 border-[#2f4a4a] bg-[#14131a]/95 p-2 shadow-[0_0_14px_rgba(80,220,200,0.3)]">
        <img src="portraits/lina.jpg" alt="Эхо" className="h-12 w-10 shrink-0 rounded border border-[#6fe0d2] object-cover object-top" draggable={false} />
        <div className="min-w-0 text-[13px] sm:text-sm leading-snug text-[#ece6d2]">
          <span className="font-black text-[#6fe0d2]">Эхо: </span>
          {text}
        </div>
        <button type="button" className="shrink-0 rounded border border-[#3b354a] bg-[#25232f] px-2 py-1 text-[11px] text-stone-300 hover:bg-[#332f40]" onClick={onSkip}>
          Пропустить обучение
        </button>
      </div>
    </div>
  );
}
