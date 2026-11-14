/**
 * Внутриигровые вопросы вместо window.confirm / window.prompt: браузерное окно выводит игру
 * из полноэкранного режима (просьба Артура 2026-11-14). `askConfirm` и `askText` возвращают обещание;
 * окно рисует `AskHost`, он стоит в App один раз.
 */
import { useEffect, useState } from 'react';

type Ask =
  | { kind: 'confirm'; text: string; yes: string; no: string; done: (v: boolean) => void }
  | { kind: 'text'; text: string; value: string; done: (v: string | null) => void };

let setter: ((a: Ask | null) => void) | null = null;
let queue: Ask[] = [];
let current: Ask | null = null;

function push(a: Ask) {
  queue.push(a);
  if (!current && setter) next();
}
function next() {
  current = queue.shift() ?? null;
  setter?.(current);
}

export function askConfirm(text: string, yes = 'Да', no = 'Отмена'): Promise<boolean> {
  return new Promise((done) => push({ kind: 'confirm', text, yes, no, done }));
}

export function askText(text: string, value: string): Promise<string | null> {
  return new Promise((done) => push({ kind: 'text', text, value, done }));
}

export function AskHost() {
  const [ask, setAsk] = useState<Ask | null>(null);
  const [val, setVal] = useState('');
  useEffect(() => {
    setter = setAsk;
    if (!current && queue.length) next();
    else setAsk(current);
    return () => {
      setter = null;
    };
  }, []);
  useEffect(() => {
    if (ask?.kind === 'text') setVal(ask.value);
  }, [ask]);

  const close = (result: boolean | string | null) => {
    if (!ask) return;
    if (ask.kind === 'confirm') ask.done(result === true);
    else ask.done(typeof result === 'string' ? result : null);
    next();
  };

  useEffect(() => {
    if (!ask) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(ask.kind === 'confirm' ? false : null);
      } else if (e.key === 'Enter' && ask.kind === 'confirm') {
        e.preventDefault();
        e.stopPropagation();
        close(true);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!ask) return null;
  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-[100]" role="dialog" aria-modal="true">
      <div className="bg-[#171520] border border-[#3b354a] rounded-xl p-4 max-w-sm w-full shadow-2xl text-[#f4f2e6]">
        <p className="text-sm leading-snug mb-3">{ask.text}</p>
        {ask.kind === 'text' && (
          <input
            autoFocus
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') close(val);
            }}
            className="w-full mb-3 px-2 py-1.5 rounded bg-[#121118] border border-[#3b354a] text-sm"
          />
        )}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            className="px-3 py-2 rounded bg-[#2a2635] hover:bg-[#3a3448] text-sm font-bold"
            onClick={() => close(ask.kind === 'confirm' ? false : null)}
          >
            {ask.kind === 'confirm' ? ask.no : 'Отмена'}
          </button>
          <button
            type="button"
            autoFocus={ask.kind === 'confirm'}
            className="px-3 py-2 rounded bg-amber-800/80 hover:bg-amber-700 text-sm font-bold"
            onClick={() => close(ask.kind === 'confirm' ? true : val)}
          >
            {ask.kind === 'confirm' ? ask.yes : 'Готово'}
          </button>
        </div>
      </div>
    </div>
  );
}
