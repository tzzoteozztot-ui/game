/**
 * Режим разработчика: кнопка «✎» на краю экрана (и клавиша ` — «ё»), окно заметки с категорией и выгрузкой файла.
 * Показывается только при включённом режиме (см. src/devNotes.ts).
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { addDevNote, DEV_CATEGORIES, DevCategory, DevNote, isDevMode, loadDevNotes, onDevModeChange, removeDevNote, clearDevNotes, downloadDevNotes } from '../devNotes';
import type { WorldState } from '../campaign/world';

interface Props {
  /** Снимок состояния игры на момент заметки */
  getContext: () => Record<string, unknown>;
  /** Заметка сохранена: App дописывает её в логи партии и похода */
  onSaved: (note: DevNote) => void;
  /** Окно открыто или закрыто: App ставит бой на паузу */
  onOpenChange: (open: boolean) => void;
  getWorld: () => WorldState | null;
}

export function DevNotes({ getContext, onSaved, onOpenChange, getWorld }: Props) {
  const on = useSyncExternalStore(onDevModeChange, isDevMode);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<DevCategory>('balance');
  const [text, setText] = useState('');
  const [notes, setNotes] = useState<DevNote[]>(() => loadDevNotes());
  const [msg, setMsg] = useState('');

  const toggle = (v: boolean) => {
    setOpen(v);
    onOpenChange(v);
    if (v) {
      setNotes(loadDevNotes());
      setMsg('');
    }
  };

  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Backquote' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const t = e.target as HTMLElement | null;
        if (open && t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return; // ` внутри текста — просто символ
        e.preventDefault();
        e.stopImmediatePropagation();
        toggle(!open);
      } else if (e.code === 'Escape' && open) {
        e.preventDefault();
        e.stopImmediatePropagation();
        toggle(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!on) return null;

  const save = () => {
    if (!text.trim()) return;
    const note = addDevNote(category, text, getContext());
    onSaved(note);
    setText('');
    setNotes(loadDevNotes());
    setMsg('Записано');
  };

  const download = async () => {
    const ok = await downloadDevNotes(getWorld());
    setMsg(ok ? 'Файл скачан' : 'Заметок пока нет');
  };

  const catLabel = (id: string) => DEV_CATEGORIES.find((c) => c.id === id)?.label ?? id;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => toggle(true)}
          title="Заметка разработчика (`)"
          aria-label="Заметка разработчика"
          className="fixed left-1 top-1/2 -translate-y-1/2 z-[65] w-9 h-9 rounded-full bg-fuchsia-900/60 hover:bg-fuchsia-800/80 border border-fuchsia-400/50 text-fuchsia-100 text-base font-black cursor-pointer select-none"
        >
          ✎
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-2" onClick={() => toggle(false)}>
          <div
            className="w-full max-w-lg max-h-full overflow-y-auto bg-[#171520] border border-fuchsia-500/50 rounded-xl p-3 shadow-2xl text-stone-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-2">
              <h3 className="flex-1 text-base font-black text-fuchsia-300 tracking-wide">Заметка разработчика</h3>
              <button type="button" onClick={() => toggle(false)} className="px-2 py-1 rounded bg-[#25232f] border border-[#3b354a] text-xs cursor-pointer">
                Закрыть (Esc)
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {DEV_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={`px-2.5 py-1.5 rounded text-xs font-bold border cursor-pointer ${
                    category === c.id ? 'bg-fuchsia-700 border-fuchsia-300 text-white' : 'bg-[#221f2d] border-[#383347] text-stone-300'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  save();
                }
              }}
              placeholder="Что заметили? К заметке сама прикрепится картина игры: режим, карта, волна, золото, сцена диалога…"
              rows={4}
              className="w-full rounded bg-[#0f0e15] border border-[#383347] p-2 text-sm text-stone-100 outline-none focus:border-fuchsia-400 select-text"
            />
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <button
                type="button"
                onClick={() => save()}
                disabled={!text.trim()}
                className="min-h-[38px] px-4 rounded bg-fuchsia-700 hover:bg-fuchsia-600 disabled:opacity-40 text-sm font-black text-white cursor-pointer"
              >
                Записать (Ctrl+Enter)
              </button>
              <button
                type="button"
                onClick={() => void download()}
                className="min-h-[38px] px-3 rounded bg-[#221f2d] hover:bg-[#2c283a] border border-[#383347] text-xs font-bold cursor-pointer"
              >
                Скачать файл ({notes.length})
              </button>
              {msg && <span className="text-xs text-teal-300">{msg}</span>}
            </div>
            {notes.length > 0 && (
              <div className="mt-3 border-t border-[#2d2938] pt-2">
                <div className="flex items-center mb-1">
                  <span className="flex-1 text-[11px] uppercase font-bold text-stone-400 tracking-wider">Записано: {notes.length}</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Удалить все заметки? Скачайте файл заранее.')) {
                        clearDevNotes();
                        setNotes([]);
                      }
                    }}
                    className="text-[11px] text-red-300 hover:text-red-200 cursor-pointer"
                  >
                    Очистить все
                  </button>
                </div>
                <ul className="space-y-1 max-h-40 overflow-y-auto">
                  {[...notes].reverse().map((n) => (
                    <li key={n.id} className="flex gap-2 items-start text-xs bg-[#0f0e15] rounded p-1.5">
                      <span className="shrink-0 text-fuchsia-300 font-bold">{catLabel(n.category)}</span>
                      <span className="flex-1 text-stone-300 break-words">{n.text}</span>
                      <button
                        type="button"
                        aria-label="Удалить заметку"
                        onClick={() => {
                          removeDevNote(n.id);
                          setNotes(loadDevNotes());
                        }}
                        className="shrink-0 text-stone-500 hover:text-red-300 cursor-pointer"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
