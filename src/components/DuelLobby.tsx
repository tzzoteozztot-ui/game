/**
 * Duel room for «Тёмный рубеж»: create a room (a 4-digit code to tell the opponent) or join one by
 * its code. The one who creates the room picks the map (the level selected in the menu).
 */

import React, { useEffect, useRef, useState } from 'react';
import { CONFIG } from '../game/config';
import { DuelLink, newRoomCode, openDuel } from '../duel';

interface DuelLobbyProps {
  level: number; // the map, when this player creates the room
  onStart: (link: DuelLink, level: number, startAt: number) => void;
  onBack: () => void;
}

type LobbyState =
  | { kind: 'choose' }
  | { kind: 'hosting'; code: string }
  | { kind: 'joining' }
  | { kind: 'connecting'; code: string };

const JOIN_TIMEOUT_MS = 10000;

export function DuelLobby({ level, onStart, onBack }: DuelLobbyProps) {
  const [state, setState] = useState<LobbyState>({ kind: 'choose' });
  const [codeInput, setCodeInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const linkRef = useRef<DuelLink | null>(null);
  const startedRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach((t) => window.clearInterval(t));
    timersRef.current = [];
  };

  // Leaving the lobby without a started duel closes the room
  useEffect(
    () => () => {
      clearTimers();
      if (!startedRef.current) linkRef.current?.close();
    },
    []
  );

  const reset = (message: string | null) => {
    clearTimers();
    linkRef.current?.close();
    linkRef.current = null;
    setError(message);
    setState({ kind: 'choose' });
  };

  const start = (link: DuelLink, lvl: number) => {
    clearTimers();
    startedRef.current = true;
    onStart(link, lvl, performance.now());
  };

  const handleCreate = async () => {
    setError(null);
    const code = newRoomCode();
    setState({ kind: 'hosting', code });
    try {
      const link = await openDuel(code, 'host');
      linkRef.current = link;
      // The first guest gets the map and the duel starts for both
      link.onMessage((msg) => {
        if (msg.t !== 'hello' || startedRef.current) return;
        link.send({ t: 'start', level, inMs: 0 });
        start(link, level);
      });
    } catch (e) {
      reset(e instanceof Error ? e.message : 'Не получилось создать комнату.');
    }
  };

  const handleJoin = async () => {
    const code = codeInput.trim();
    if (!/^\d{4}$/.test(code)) {
      setError('Код — четыре цифры.');
      return;
    }
    setError(null);
    setState({ kind: 'connecting', code });
    try {
      const link = await openDuel(code, 'guest');
      linkRef.current = link;
      link.onMessage((msg) => {
        if (msg.t !== 'start' || startedRef.current) return;
        start(link, Math.max(1, Math.min(5, msg.level)));
      });
      // Knock until the host answers; no answer: no such room
      link.send({ t: 'hello' });
      const startedAt = Date.now();
      timersRef.current.push(
        window.setInterval(() => {
          if (startedRef.current) return;
          if (Date.now() - startedAt > JOIN_TIMEOUT_MS) reset('Комната не найдена. Проверьте код.');
          else link.send({ t: 'hello' });
        }, 1000)
      );
    } catch (e) {
      reset(e instanceof Error ? e.message : 'Не получилось войти в комнату.');
    }
  };

  const faction = CONFIG.factions[level - 1];
  const btn =
    'w-full min-h-[44px] py-2 px-4 rounded font-bold text-sm tracking-wide transition-colors cursor-pointer';

  return (
    <div className="fixed inset-0 z-40 bg-[#121118] text-[#f4f2e6] flex flex-col items-center overflow-y-auto p-4 short:p-2 select-none animate-fade-in">
      <div className="my-auto max-w-sm w-full bg-[#171520] border-2 border-[#3b354a] rounded-xl p-5 short:p-4 shadow-2xl">
        <div className="text-center mb-4 pb-3 border-b border-[#2d2938]">
          <div className="text-xs uppercase tracking-widest font-bold text-amber-500 mb-1">Дуэль</div>
          <h2 className="text-2xl font-black text-amber-300 tracking-wide">Двое на рубеже</h2>
          <p className="text-xs text-stone-400 mt-1 leading-relaxed">
            У каждого своё поле. Волны выходят у обоих разом, каждые {CONFIG.duel.roundLength} с. Кто
            первым потеряет замок, тот проиграл.
          </p>
        </div>

        {state.kind === 'choose' && (
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={handleCreate}
              className={`${btn} bg-amber-500 hover:bg-amber-400 text-stone-950 font-black uppercase`}
            >
              Создать комнату · {faction.location}
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setState({ kind: 'joining' });
              }}
              className={`${btn} bg-[#221f2d] hover:bg-[#2c283a] text-stone-200 border border-[#383347]`}
            >
              Войти по коду
            </button>
          </div>
        )}

        {state.kind === 'hosting' && (
          <div className="text-center">
            <p className="text-xs text-stone-300 mb-2">Скажите сопернику код комнаты:</p>
            <div className="text-4xl font-black tracking-[0.3em] text-amber-300 tabular-nums mb-2" data-room-code={state.code}>
              {state.code}
            </div>
            <p className="text-xs text-stone-400 mb-4">Ждём соперника… Карта: {faction.location}.</p>
            <button
              type="button"
              onClick={() => reset(null)}
              className={`${btn} bg-[#221f2d] hover:bg-[#2c283a] text-stone-300 border border-[#383347] text-xs`}
            >
              Отменить
            </button>
          </div>
        )}

        {state.kind === 'joining' && (
          <form
            className="flex flex-col gap-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              handleJoin();
            }}
          >
            <label className="text-xs text-stone-300" htmlFor="duel-code">
              Код комнаты от соперника:
            </label>
            <input
              id="duel-code"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              autoFocus
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, ''))}
              className="w-full min-h-[44px] px-3 rounded bg-[#121118] border border-[#383347] text-center text-2xl font-black tracking-[0.3em] tabular-nums text-amber-300 outline-none focus:border-amber-500"
            />
            <button type="submit" className={`${btn} bg-amber-500 hover:bg-amber-400 text-stone-950 font-black uppercase`}>
              Войти
            </button>
            <button
              type="button"
              onClick={() => reset(null)}
              className={`${btn} bg-[#221f2d] hover:bg-[#2c283a] text-stone-300 border border-[#383347] text-xs`}
            >
              Назад
            </button>
          </form>
        )}

        {state.kind === 'connecting' && (
          <p className="text-center text-sm text-stone-300 py-4">Входим в комнату {state.code}…</p>
        )}

        {error && <p className="mt-3 text-xs text-red-400 text-center">{error}</p>}

        {state.kind === 'choose' && (
          <button
            type="button"
            onClick={onBack}
            className={`${btn} mt-2.5 bg-[#181622] hover:bg-[#221f2d] text-stone-400 border border-[#2a2636] text-xs`}
          >
            ← Назад в меню
          </button>
        )}
      </div>
    </div>
  );
}
