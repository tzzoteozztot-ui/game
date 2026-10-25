/**
 * Duel room for «Тёмный рубеж»: create a room (a 4-digit code to tell the opponent) or join one by
 * its code. The one who creates the room picks the map (the level selected in the menu).
 */

import React, { useEffect, useRef, useState } from 'react';
import { CONFIG } from '../game/config';
import { DuelLink, newRoomCode, openDuel } from '../duel';
import { BOT_LEVELS, BotLevel, createBotLink } from '../duelBot';

interface DuelLobbyProps {
  level: number; // the map, when this player creates the room
  onStart: (link: DuelLink, level: number, startAt: number, opponentArmy: number, myArmy: number) => void;
  onBack: () => void;
}

type LobbyState =
  | { kind: 'choose' }
  | { kind: 'hosting'; code: string }
  | { kind: 'joining' }
  | { kind: 'bot' }
  | { kind: 'connecting'; code: string };

const JOIN_TIMEOUT_MS = 10000;

export function DuelLobby({ level, onStart, onBack }: DuelLobbyProps) {
  const [state, setState] = useState<LobbyState>({ kind: 'choose' });
  const [codeInput, setCodeInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [army, setArmy] = useState<number>(level); // faction id of the enemies this player sends
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

  const start = (link: DuelLink, lvl: number, opponentArmy: number) => {
    clearTimers();
    startedRef.current = true;
    onStart(link, lvl, performance.now(), opponentArmy, army);
  };
  const clampArmy = (a: unknown) => Math.max(1, Math.min(5, Math.floor(Number(a)) || 1));

  const handleCreate = async () => {
    setError(null);
    const code = newRoomCode();
    setState({ kind: 'hosting', code });
    try {
      const link = await openDuel(code, 'host');
      linkRef.current = link;
      // The first guest gets the map and the duel starts for both
      link.onMessage((msg, from) => {
        if (msg.t !== 'hello' || startedRef.current) return;
        link.pair(from);
        link.send({ t: 'start', level, army, inMs: 0 });
        start(link, level, clampArmy(msg.army));
      });
    } catch (e) {
      reset(e instanceof Error ? e.message : 'Не получилось создать комнату.');
    }
  };

  // Playing alone: the bot answers like a player at the other end of the link
  const handleBot = (difficulty: BotLevel) => {
    const botArmy = 1 + Math.floor(Math.random() * 5);
    const link = createBotLink(level, difficulty);
    linkRef.current = link;
    start(link, level, botArmy);
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
      link.onMessage((msg, from) => {
        if (startedRef.current) return;
        if (msg.t === 'full') {
          reset('В этой комнате уже идёт дуэль.');
          return;
        }
        if (msg.t !== 'start') return;
        link.pair(from);
        start(link, Math.max(1, Math.min(5, msg.level)), clampArmy(msg.army));
      });
      // Knock until the host answers; no answer: no such room
      link.send({ t: 'hello', army });
      const startedAt = Date.now();
      timersRef.current.push(
        window.setInterval(() => {
          if (startedRef.current) return;
          if (Date.now() - startedAt > JOIN_TIMEOUT_MS) reset('Комната не найдена. Проверьте код.');
          else link.send({ t: 'hello', army });
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

        {/* The army: the faction of the enemies that attack the opponent (its trait and boss) */}
        {(state.kind === 'choose' || state.kind === 'joining' || state.kind === 'bot') && (
          <div className="mb-3">
            <div className="text-xs text-stone-400 mb-1">Ваша армия против соперника:</div>
            <div className="grid grid-cols-5 gap-1">
              {CONFIG.factions.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setArmy(f.id)}
                  aria-pressed={army === f.id}
                  title={`${f.traitName}: ${f.traitDesc} Босс — ${f.bossName}.`}
                  className={`min-h-[36px] px-0.5 rounded border text-[11px] font-bold leading-tight cursor-pointer transition-colors ${
                    army === f.id
                      ? 'border-amber-400 bg-[#2a2236] text-amber-200'
                      : 'border-[#383347] bg-[#221f2d] hover:bg-[#2c283a] text-stone-300'
                  }`}
                >
                  <span className="inline-block w-2 h-2 rounded-full mr-0.5 align-middle" style={{ backgroundColor: CONFIG.palettes[f.id - 1].enemies }} />
                  {f.name}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-stone-400 mt-1 leading-snug">
              {CONFIG.factions[army - 1].traitName}: {CONFIG.factions[army - 1].traitDesc}
            </p>
          </div>
        )}

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
            <button
              type="button"
              onClick={() => {
                setError(null);
                setState({ kind: 'bot' });
              }}
              className={`${btn} bg-[#221f2d] hover:bg-[#2c283a] text-stone-200 border border-[#383347]`}
            >
              Играть с ботом
            </button>
          </div>
        )}

        {state.kind === 'bot' && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-stone-300">Бот играет за соперника: шлёт вам врагов и теряет замок, если волны его одолеют. Выберите силу бота:</p>
            {(Object.keys(BOT_LEVELS) as BotLevel[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => handleBot(d)}
                className={`${btn} bg-[#221f2d] hover:bg-[#2c283a] text-stone-200 border border-[#383347] text-left`}
              >
                <span className="text-amber-300">{BOT_LEVELS[d].label}</span>
                <span className="block text-[11px] font-normal text-stone-400 leading-snug">{BOT_LEVELS[d].hint}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => reset(null)}
              className={`${btn} bg-[#181622] hover:bg-[#221f2d] text-stone-400 border border-[#2a2636] text-xs`}
            >
              Назад
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
