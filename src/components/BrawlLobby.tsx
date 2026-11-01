/**
 * «Потасовка» по сети (этап 2, Артур 2026-11-01: «лобби, в котором собираются игроки, создаёт его один из 8»).
 * One player creates the lobby and tells the others its 4-digit code; everyone sees the seats with names
 * and races; the creator picks the map and the bots' strength and starts. Empty seats are bots.
 * Lobby messages (BrawlWire in src/brawl.ts): guests knock with «join» every second (also their sign of
 * life), the host answers everyone with «lobby» every second, and «go» starts the game.
 */

import React, { useEffect, useRef, useState } from 'react';
import { CONFIG, Difficulty, RaceId } from '../game/config';
import { RacePicker } from './RacePicker';
import { RoomLink, newRoomCode, openRoom } from '../duel';
import { BrawlNetSetup, BrawlWire, LobbyPlayer, NAME_MAX, cleanName, cleanRace } from '../brawl';

interface BrawlLobbyProps {
  mode: 'host' | 'join';
  level: number;
  unlockedLevel: number;
  race: RaceId;
  onChangeRace: (race: RaceId) => void;
  bots: Difficulty;
  onStart: (setup: BrawlNetSetup, level: number, bots: Difficulty, startAt: number) => void;
  onBack: () => void;
}

const NAME_KEY = 'dark_frontier_name';
const GUEST_TIMEOUT_MS = 6000; // a guest silent this long leaves the lobby
const HOST_TIMEOUT_MS = 10000; // no word from the host this long: the lobby is gone

const BOT_CHOICES: { id: Difficulty; label: string }[] = [
  { id: 'easy', label: 'Слабые' },
  { id: 'normal', label: 'Средние' },
  { id: 'hard', label: 'Сильные' },
];

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

type Phase = { kind: 'code' } | { kind: 'connecting' } | { kind: 'lobby'; code: string };

export function BrawlLobby({ mode, level: firstLevel, unlockedLevel, race, onChangeRace, bots: firstBots, onStart, onBack }: BrawlLobbyProps) {
  const [phase, setPhase] = useState<Phase>(mode === 'host' ? { kind: 'connecting' } : { kind: 'code' });
  const [codeInput, setCodeInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(loadName);
  const [level, setLevel] = useState(firstLevel);
  const [bots, setBots] = useState<Difficulty>(firstBots);
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);

  const linkRef = useRef<RoomLink<BrawlWire> | null>(null);
  const startedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  // What the lobby's timers read: the latest values without restarting them
  const live = useRef({ name, race, level, bots, players });
  live.current = { name, race, level, bots, players };
  const guestsRef = useRef<Map<string, { name: string; race: RaceId; seen: number }>>(new Map());

  const stopTimer = () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const leave = (message: string | null) => {
    stopTimer();
    const link = linkRef.current;
    linkRef.current = null;
    if (link) {
      link.send({ t: 'leave' });
      setTimeout(() => link.close(), 300);
    }
    guestsRef.current.clear();
    setPlayers([]);
    setError(message);
    if (mode === 'join') setPhase({ kind: 'code' });
    else if (message) setPhase({ kind: 'code' });
  };

  // Leaving the screen without a started game closes the lobby
  useEffect(
    () => () => {
      stopTimer();
      if (!startedRef.current && linkRef.current) {
        const link = linkRef.current;
        link.send({ t: 'leave' });
        setTimeout(() => link.close(), 300);
      }
    },
    []
  );

  useEffect(() => {
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      /* private mode: the name is not kept */
    }
  }, [name]);

  const me = (): LobbyPlayer => ({ id: linkRef.current?.me ?? 'me', name: cleanName(live.current.name), race: live.current.race });

  // ---- host ----
  const hostPlayers = (): LobbyPlayer[] => [me(), ...[...guestsRef.current.entries()].map(([id, g]) => ({ id, name: g.name, race: g.race }))];

  const createLobby = async () => {
    setError(null);
    setPhase({ kind: 'connecting' });
    const code = newRoomCode();
    try {
      const link = await openRoom<BrawlWire>(code);
      linkRef.current = link;
      link.onMessage((msg, from) => {
        if (startedRef.current) return;
        const guests = guestsRef.current;
        if (msg.t === 'join') {
          if (!guests.has(from) && guests.size + 1 >= CONFIG.brawl.players) {
            link.send({ t: 'full' }, from);
            return;
          }
          guests.set(from, { name: cleanName(msg.name), race: cleanRace(msg.race), seen: performance.now() });
        } else if (msg.t === 'leave') guests.delete(from);
      });
      const tick = () => {
        const now = performance.now();
        for (const [id, g] of guestsRef.current) if (now - g.seen > GUEST_TIMEOUT_MS) guestsRef.current.delete(id);
        const list = hostPlayers();
        setPlayers(list);
        link.send({ t: 'lobby', level: live.current.level, bots: live.current.bots, players: list });
      };
      tick();
      timerRef.current = window.setInterval(tick, 1000);
      setPhase({ kind: 'lobby', code });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось создать лобби.');
      setPhase({ kind: 'code' });
    }
  };

  const startGame = () => {
    const link = linkRef.current;
    if (!link || startedRef.current) return;
    startedRef.current = true;
    stopTimer();
    const list = hostPlayers().slice(0, CONFIG.brawl.players);
    link.send({ t: 'go', level });
    onStart({ link, players: list, hosting: true, hostId: link.me }, level, bots, performance.now());
  };

  // ---- guest ----
  const joinLobby = async () => {
    const code = codeInput.trim();
    if (!/^\d{4}$/.test(code)) {
      setError('Код — четыре цифры.');
      return;
    }
    setError(null);
    setPhase({ kind: 'connecting' });
    try {
      const link = await openRoom<BrawlWire>(code);
      linkRef.current = link;
      let hostId: string | null = null;
      let heard = performance.now();
      let lastPlayers: LobbyPlayer[] = [];
      const begin = (lvl: number, elapsed: number) => {
        if (startedRef.current || !hostId) return;
        startedRef.current = true;
        stopTimer();
        const startAt = performance.now() - Math.max(0, Math.min(elapsed, 60000));
        onStart({ link, players: lastPlayers, hosting: false, hostId }, Math.max(1, Math.min(CONFIG.levelCount, Math.floor(lvl) || 1)), live.current.bots, startAt);
      };
      link.onMessage((msg, from) => {
        if (startedRef.current) return;
        if (hostId !== null && from !== hostId) return;
        if (msg.t === 'full') {
          leave('В этом лобби уже восемь игроков.');
        } else if (msg.t === 'lobby' && Array.isArray(msg.players)) {
          hostId = from;
          heard = performance.now();
          lastPlayers = msg.players.slice(0, CONFIG.brawl.players).map((p) => ({ id: String(p.id), name: cleanName(p.name), race: cleanRace(p.race) }));
          setPlayers(lastPlayers);
          setLevel(Math.max(1, Math.min(CONFIG.levelCount, Math.floor(Number(msg.level)) || 1)));
          if (BOT_CHOICES.some((b) => b.id === msg.bots)) setBots(msg.bots as Difficulty);
          setPhase({ kind: 'lobby', code });
        } else if (hostId !== null && msg.t === 'go') begin(msg.level, 0);
        else if (hostId !== null && msg.t === 'board') begin(msg.b?.level, Number(msg.b?.elapsed) || 0);
        else if (hostId !== null && msg.t === 'leave') leave('Создатель закрыл лобби.');
      });
      const knock = () => {
        if (performance.now() - heard > HOST_TIMEOUT_MS) {
          leave(hostId ? 'Связь с лобби потеряна.' : 'Лобби не найдено. Проверьте код.');
          return;
        }
        link.send({ t: 'join', name: cleanName(live.current.name), race: live.current.race }, hostId ?? undefined);
      };
      knock();
      timerRef.current = window.setInterval(knock, 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось войти в лобби.');
      setPhase({ kind: 'code' });
    }
  };

  // The creator opens the lobby at once
  const opened = useRef(false);
  useEffect(() => {
    if (mode === 'host' && !opened.current) {
      opened.current = true;
      void createLobby();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const btn = 'w-full min-h-[44px] py-2 px-4 rounded font-bold text-sm tracking-wide transition-colors cursor-pointer';
  const isHost = mode === 'host';
  const myId = linkRef.current?.me;
  const seats = Array.from({ length: CONFIG.brawl.players }, (_, i) => players[i] ?? null);
  const maxLevel = Math.min(CONFIG.levelCount, Math.max(1, unlockedLevel));

  return (
    <div className="fixed inset-0 z-40 bg-[#121118] text-[#f4f2e6] flex flex-col items-center overflow-y-auto p-4 short:p-2 select-none animate-fade-in">
      <div className="my-auto max-w-sm short:max-w-2xl w-full bg-[#171520] border-2 border-[#3b354a] rounded-xl p-5 short:p-3 shadow-2xl">
        <div className="text-center mb-3 pb-2 border-b border-[#2d2938]">
          <div className="text-xs uppercase tracking-widest font-bold text-amber-500 mb-1">Потасовка по сети</div>
          <h2 className="text-2xl short:text-xl font-black text-amber-300 tracking-wide">{isHost ? 'Своё лобби' : 'Вход в лобби'}</h2>
        </div>

        {phase.kind === 'code' && !isHost && (
          <form
            className="flex flex-col gap-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              void joinLobby();
            }}
          >
            <NameField name={name} onChange={setName} />
            <label className="text-xs text-stone-300" htmlFor="brawl-code">
              Код лобби:
            </label>
            <input
              id="brawl-code"
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
          </form>
        )}

        {phase.kind === 'code' && isHost && (
          <button type="button" onClick={() => void createLobby()} className={`${btn} bg-amber-500 hover:bg-amber-400 text-stone-950 font-black uppercase`}>
            Создать лобби ещё раз
          </button>
        )}

        {phase.kind === 'connecting' && <p className="text-center text-sm text-stone-300 py-4">Связываемся с сервером…</p>}

        {phase.kind === 'lobby' && (
          <div className="flex flex-col gap-2 short:grid short:grid-cols-2 short:gap-3 short:items-start">
            <div className="flex flex-col gap-2">
              <div className="text-center">
                <p className="text-xs text-stone-400">{isHost ? 'Скажите игрокам код лобби:' : 'Лобби'}</p>
                <div className="text-4xl short:text-3xl font-black tracking-[0.3em] text-amber-300 tabular-nums" data-room-code={phase.code}>
                  {phase.code}
                </div>
              </div>
              <ol className="bg-[#121118] rounded border border-[#2d2938] text-xs" data-lobby-seats={players.length}>
                {seats.map((p, i) => (
                  <li key={p?.id ?? `empty${i}`} className="flex items-center gap-2 px-2 py-1 border-b border-[#221f2d] last:border-b-0 min-h-[26px]">
                    <span className="w-4 text-stone-500 tabular-nums">{i + 1}</span>
                    {p ? (
                      <>
                        <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CONFIG.palettes[CONFIG.races[p.race].faction - 1].enemies }} />
                        <span className={`flex-1 truncate ${p.id === myId ? 'text-amber-300 font-black' : 'text-stone-200 font-semibold'}`}>
                          {p.name}
                          {i === 0 && ' 👑'}
                        </span>
                        <span className="text-stone-500">{CONFIG.races[p.race].name}</span>
                      </>
                    ) : (
                      <span className="flex-1 text-stone-600 italic">свободно — бот</span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
            <div className="flex flex-col gap-2">
              <NameField name={name} onChange={setName} />
              <RacePicker race={race} onChange={onChangeRace} compact />
              {isHost ? (
                <>
                  <label className="flex items-center justify-between gap-2">
                    <span className="text-xs text-stone-400">Карта:</span>
                    <select
                      value={level}
                      onChange={(e) => setLevel(Number(e.target.value))}
                      className="min-h-[36px] flex-1 max-w-[220px] rounded bg-[#221f2d] border border-[#383347] px-2 text-xs font-bold text-stone-200 cursor-pointer"
                    >
                      {CONFIG.factions.slice(0, maxLevel).map((f, i) => (
                        <option key={f.id} value={i + 1}>
                          {f.location}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs text-stone-400">Боты:</span>
                    <div className="flex items-center gap-1">
                      {BOT_CHOICES.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setBots(b.id)}
                          aria-pressed={bots === b.id}
                          className={`px-2.5 py-1.5 min-h-[34px] rounded text-xs font-bold transition-colors cursor-pointer ${
                            bots === b.id ? 'bg-amber-600 text-stone-950 font-black' : 'text-stone-400 hover:text-stone-200 hover:bg-[#221f2d]'
                          }`}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button type="button" onClick={startGame} className={`${btn} bg-amber-500 hover:bg-amber-400 text-stone-950 font-black uppercase`}>
                    Начать · {players.length} из {CONFIG.brawl.players}
                  </button>
                </>
              ) : (
                <p className="text-xs text-stone-400 leading-snug">
                  Карта: <b className="text-stone-200">{CONFIG.factions[level - 1]?.location}</b>, боты:{' '}
                  <b className="text-stone-200">{BOT_CHOICES.find((b) => b.id === bots)?.label.toLowerCase()}</b>. Ждём, пока создатель лобби начнёт игру…
                </p>
              )}
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-xs text-red-400 text-center">{error}</p>}

        <button
          type="button"
          onClick={() => {
            leave(null);
            onBack();
          }}
          className={`${btn} mt-2.5 bg-[#181622] hover:bg-[#221f2d] text-stone-400 border border-[#2a2636] text-xs`}
        >
          {phase.kind === 'lobby' ? 'Выйти из лобби' : '← Назад'}
        </button>
      </div>
    </div>
  );
}

function NameField({ name, onChange }: { name: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-xs text-stone-400">Ваше имя:</span>
      <input
        value={name}
        maxLength={NAME_MAX}
        placeholder="Игрок"
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[36px] flex-1 max-w-[220px] rounded bg-[#221f2d] border border-[#383347] px-2 text-xs font-bold text-stone-200 outline-none focus:border-amber-500"
      />
    </label>
  );
}
