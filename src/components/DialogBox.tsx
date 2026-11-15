/**
 * Окно диалога на весь экран (просьба Артура 2026-11-15, схема как в «Metal Gear»): сверху портреты участников слева и справа
 * от центральной панели с именем, снизу широкая рамка с текстом. Закрывает всё остальное, кнопок три — «Назад», «Далее» и «Пропустить» (вся сцена).
 * Участник виден от своей первой реплики в сцене до последней, потом уходит из окна; участников больше двух — места им больше.
 * Говорящий ярче остальных. Текст проявляется буква за буквой; касание, Пробел или Enter — показать реплику целиком, ещё раз — следующая;
 * Backspace или стрелка влево — назад; Esc — пропустить сцену.
 */
import { useEffect, useMemo, useState } from 'react';
import { sound } from '../game/audio';
import { setDevScene } from '../devNotes';
import { DialogLine, Scene, SPEAKER_COLORS, SPEAKER_ROLES } from '../campaign/dialogs';
import { portraitFile, portraitFiles } from '../campaign/portraits';

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

  const prev = () => {
    if (i > 0) setI(i - 1);
  };
  // Участники: сторона (по порядку появления; Рен — слева), первая и последняя реплика
  const cast = useMemo(() => {
    const info = new Map<string, { first: number; last: number }>();
    scene.lines.forEach((l, k) => {
      const c = info.get(l.who);
      if (c) c.last = k;
      else info.set(l.who, { first: k, last: k });
    });
    const order = [...info.keys()].sort((a, b) => (a === 'Рен' ? -1 : b === 'Рен' ? 1 : info.get(a)!.first - info.get(b)!.first));
    return order.map((who, k) => ({ who, side: (k % 2 === 0 ? 'left' : 'right') as 'left' | 'right', ...info.get(who)! }));
  }, [scene]);

  useEffect(() => setI(0), [scene.id]);
  // Портреты сцены грузим заранее, чтобы смена эмоции не мигала
  useEffect(() => {
    for (const who of new Set(scene.lines.map((l) => l.who))) for (const f of portraitFiles(who)) new Image().src = `portraits/${f}.jpg`;
  }, [scene]);
  // Свои звуки: щелчок реплики и озвучка (public/sounds/README.md)
  useEffect(() => {
    sound.play('dialog.line');
    sound.playVoice(scene.id, i + 1);
  }, [scene.id, i]);
  useEffect(() => () => sound.playVoice('', 0), []);
  useEffect(() => {
    setShown(0);
    if (!total) return;
    const t0 = performance.now();
    const id = setInterval(() => {
      const n = Math.min(total, Math.floor(((performance.now() - t0) / 1000) * CHARS_PER_SECOND) + 1);
      setShown((p) => Math.max(p, n)); // касание уже показало реплику целиком — таймер не откатывает её назад
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
      } else if (e.code === 'Backspace' || e.code === 'ArrowLeft') {
        e.preventDefault();
        e.stopImmediatePropagation();
        prev();
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
  const present = cast.filter((c) => c.first <= i && i <= c.last);
  const sides = (['left', 'right'] as const).map((side) => present.filter((c) => c.side === side));
  const many = present.length > 2;
  const color = SPEAKER_COLORS[line.who] ?? '#e8e2cf';
  const role = line.role ?? SPEAKER_ROLES[line.who];
  const lastLine = i + 1 >= scene.lines.length;
  const btn =
    'ui-btn min-w-[84px] px-2 py-0.5 whitespace-nowrap text-[13px] sm:text-sm font-bold tracking-wide disabled:opacity-35 disabled:pointer-events-none';
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={line.who}
      onClick={next}
      className="fixed inset-0 z-[90] flex cursor-pointer select-none flex-col gap-2 px-[max(0.75rem,env(safe-area-inset-left))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] sm:gap-3 sm:px-6 sm:pb-5 sm:pt-4"
      style={{
        background:
          'radial-gradient(ellipse at 50% 30%, #2a2433 0%, #15121b 55%, #07060a 100%)',
      }}
    >
      {/* тёмная ткань и виньетка */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.025) 0 2px, transparent 2px 7px)' }}
      />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_120px_rgba(0,0,0,0.85)]" />

      {/* верх: портреты — центральная панель — портреты */}
      <div className="relative flex min-h-0 flex-[1.35] items-stretch justify-center gap-2 sm:gap-4">
        {sides[0] && <PortraitSide members={sides[0]} line={line} align="end" />}
        <div className={`flex shrink-0 items-center ${many ? 'w-[22%]' : 'w-[30%]'} max-w-[340px]`}>
          <div className="ui-frame flex h-[88%] max-h-[260px] w-full flex-col items-center justify-center gap-1 px-1 text-center" style={{ borderImage: 'url(ui/frame_wide.webp) 40 / 12px stretch', borderWidth: 12 }}>
            <img src="ui/divider.webp" alt="" draggable={false} className="pointer-events-none h-3 w-full object-contain opacity-80 sm:h-4" />
            <div className="max-w-full truncate text-base font-black tracking-wide sm:text-2xl" style={{ color, textShadow: `0 0 12px ${color}66, 0 2px 2px #000` }}>
              {line.who}
            </div>
            {role && <div className="max-w-full truncate text-[11px] italic text-stone-400 sm:text-sm">{role}</div>}
            <img src="ui/divider.webp" alt="" draggable={false} className="pointer-events-none h-3 w-full rotate-180 object-contain opacity-80 sm:h-4" />
            <div className="text-[11px] tracking-widest text-stone-500 sm:text-xs">
              {i + 1} / {scene.lines.length}
            </div>
          </div>
        </div>
        {sides[1] && <PortraitSide members={sides[1]} line={line} align="start" />}
      </div>

      {/* низ: рамка с текстом */}
      <div className="relative flex min-h-0 flex-[0.85] gap-3">
        <div
          className="ui-frame flex min-w-0 flex-1 flex-col justify-center overflow-hidden px-2 sm:px-6"
          style={{ borderImage: 'url(ui/frame_wide.webp) 40 / 14px stretch', borderWidth: 14, background: 'linear-gradient(#1b1923, #121018)' }}
        >
          <p className="font-serif text-[14px] leading-snug text-[#ece6d2] sm:text-xl sm:leading-relaxed lg:text-2xl">
            {line.text.slice(0, shown)}
            <span className="invisible">{line.text.slice(shown)}</span>
          </p>
          {line.hint && !typing && (
            <p className="mt-1 rounded border border-amber-200/25 bg-amber-200/10 px-2 py-0.5 text-[11px] leading-snug text-amber-100/90 sm:text-sm">
              ⓘ {line.hint}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col justify-center gap-1.5 sm:gap-2">
          <button
            type="button"
            className={btn}
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
          >
            {lastLine && !typing ? 'Закрыть' : 'Далее'}
          </button>
          <button
            type="button"
            className={btn}
            disabled={i === 0}
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
          >
            Назад
          </button>
          <button
            type="button"
            className={btn}
            onClick={(e) => {
              e.stopPropagation();
              onDone();
            }}
          >
            Пропустить
          </button>
        </div>
      </div>
    </div>
  );
}

/** Одна сторона верхнего ряда: портреты участников в рамках, говорящий ярче */
function PortraitSide({ members, line, align }: { members: { who: string }[]; line: DialogLine; align: 'start' | 'end' }) {
  return (
    <div
      className={`flex min-w-0 items-stretch gap-1 sm:gap-3 ${align === 'end' ? 'justify-end' : 'justify-start'}`}
      style={{ flex: Math.max(1, members.length) }}
    >
      {members.map((m) => {
        const speaking = m.who === line.who;
        const color = SPEAKER_COLORS[m.who] ?? '#e8e2cf';
        const file = portraitFile(m.who, speaking ? line.mood : undefined);
        return (
          <div
            key={m.who}
            className="dlg-in relative min-w-0 transition-[filter,transform] duration-200"
            style={{
              aspectRatio: '336 / 400',
              maxWidth: '100%',
              filter: speaking ? `drop-shadow(0 0 14px ${color}88)` : 'brightness(0.45) saturate(0.6)',
              transform: speaking ? 'translateY(-2px)' : 'none',
            }}
          >
            <img src="ui/frame_small.webp" alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-fill" />
            <div className="absolute inset-[17.5%_18%_19.5%_19%] overflow-hidden bg-[#2b2a33]">
              {file ? (
                <img src={`portraits/${file}.jpg`} alt={m.who} key={file} draggable={false} className="h-full w-full object-cover object-top" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-5xl font-black" style={{ color }}>
                  {m.who.slice(0, 1)}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
