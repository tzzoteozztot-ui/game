/**
 * «Потасовка» (Артур, 2026-11-01, этап 1): eight players, each on their own field; the waves follow the
 * duel's shared clock, and every wave the opponents change. Who you face is who your bought enemies go
 * to and who sends enemies to you. With an odd number left, the field of the last player to fall stays
 * as a «призрак»: it keeps sending enemies, and the alive players take turns against it, from the
 * weakest (least artifact HP) to the strongest, never the same one twice in a row.
 *
 * Stage 1 is offline: the seven others are bots (BotField from duelBot.ts). The room is a DuelLink, so
 * App drives it exactly like a duel: it sends `send`/`lost`/`leave` and hears `send`/`state`/`lost`.
 * For network play (stage 2) a seat gets kind 'net': the host runs this room, takes the seat's HP and
 * sends from its messages, and when that player drops, a BotField takes the seat over at its HP.
 */

import { CONFIG, RACE_IDS, RaceId } from './game/config';
import type { DuelLink, DuelMessage } from './duel';
import { BotField, BotLevel } from './duelBot';

export type SeatKind = 'you' | 'bot' | 'net';

export interface BrawlSeatView {
  id: string;
  name: string;
  race: RaceId;
  kind: SeatKind;
  lives: number; // shown HP: a bot's loss drains over a few seconds
  out: boolean; // fell and its HP has drained to 0
  place: number | null; // final place, once fallen (1 — the winner)
}

export interface BrawlSnapshot {
  wave: number; // waves already out
  seats: BrawlSeatView[]; // the alive by HP, then the fallen by place
  opponentId: string | null; // whom you face now: your sends go there, its sends come to you
  ghostId: string | null; // the fallen field that plays for the odd one out
  ghostFoeId: string | null; // who faces the ghost now
  alive: number;
  yourPlace: number | null;
  over: boolean;
}

// -------------------------------------------------------------
// Pairing: pure, tested in logic.test.ts
// -------------------------------------------------------------
export interface PairState {
  lastOpp: Record<string, string>; // last wave's opponent of each player
  ghost: string | null; // the fallen player whose field stays, when the alive count is odd
  ghostCycle: string[]; // who already faced this ghost in the current turn order
  lastGhostFoe: string | null;
}

export function emptyPairState(): PairState {
  return { lastOpp: {}, ghost: null, ghostCycle: [], lastGhostFoe: null };
}

/**
 * Opponents for the next wave. `alive` with their HP; returns each alive player's opponent (another
 * player or the ghost), who faces the ghost, and the new state. The pairs are random, avoiding last
 * wave's opponent where possible.
 */
export function pairRound(
  alive: { id: string; lives: number }[],
  st: PairState,
  rand: () => number = Math.random
): { opp: Record<string, string>; ghostFoe: string | null; state: PairState } {
  const opp: Record<string, string> = {};
  const state: PairState = { ...st, ghostCycle: [...st.ghostCycle], lastOpp: {} };
  let rest = alive.map((p) => p.id);
  let ghostFoe: string | null = null;

  if (alive.length % 2 === 1 && alive.length > 1 && st.ghost) {
    // Turn order: the weakest of those who have not faced the ghost yet; then the order starts again
    let pool = alive.filter((p) => !state.ghostCycle.includes(p.id));
    if (pool.length === 0) {
      state.ghostCycle = [];
      pool = alive;
    }
    if (pool.length > 1) pool = pool.filter((p) => p.id !== st.lastGhostFoe);
    const least = Math.min(...pool.map((p) => p.lives));
    const weakest = pool.filter((p) => p.lives === least);
    ghostFoe = weakest[Math.floor(rand() * weakest.length)].id;
    state.ghostCycle.push(ghostFoe);
    state.lastGhostFoe = ghostFoe;
    opp[ghostFoe] = st.ghost;
    rest = rest.filter((id) => id !== ghostFoe);
  }

  // Random pairs; a few shuffles, the one with the fewest repeats of last wave's pairs
  let best: string[] = rest;
  let bestRepeats = Infinity;
  for (let attempt = 0; attempt < 24 && bestRepeats > 0; attempt++) {
    const order = [...rest];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    let repeats = 0;
    for (let i = 0; i + 1 < order.length; i += 2) if (st.lastOpp[order[i]] === order[i + 1]) repeats++;
    if (repeats < bestRepeats) {
      best = order;
      bestRepeats = repeats;
    }
  }
  for (let i = 0; i + 1 < best.length; i += 2) {
    opp[best[i]] = best[i + 1];
    opp[best[i + 1]] = best[i];
  }
  state.lastOpp = { ...opp };
  return { opp, ghostFoe, state };
}

/**
 * Places for the players who fell on the same wave: with `aliveBefore` players before it they take the
 * last places; the one with more HP before the wave places higher, a tie is random.
 */
export function placesForFallen(fallen: { id: string; livesBefore: number }[], aliveBefore: number, rand: () => number = Math.random): Record<string, number> {
  const order = fallen
    .map((f) => ({ ...f, r: rand() }))
    .sort((a, b) => b.livesBefore - a.livesBefore || a.r - b.r);
  const firstPlace = aliveBefore - fallen.length + 1;
  return Object.fromEntries(order.map((f, i) => [f.id, firstPlace + i]));
}

// -------------------------------------------------------------
// The room
// -------------------------------------------------------------
export const BOT_NAMES = ['Гром', 'Вереск', 'Кремень', 'Морока', 'Ясень', 'Сыч', 'Полынь', 'Ворон', 'Тлен', 'Бурелом', 'Зола', 'Терн'];

interface Seat {
  id: string;
  name: string;
  race: RaceId;
  kind: SeatKind;
  field: BotField | null; // a bot's field; null for you
  lives: number; // real HP
  shown: number; // HP on the board
  alive: boolean;
  place: number | null;
}

const YOU = 'you';

export class BrawlRoom implements DuelLink {
  role = 'host' as const;
  code = 'потасовка';
  private seats: Seat[] = [];
  private wave = 0;
  private opp: Record<string, string> = {};
  private ghostFoe: string | null = null;
  private pairState = emptyPairState();
  private handler: (msg: DuelMessage, from: string) => void = () => {};
  private listeners: ((s: BrawlSnapshot) => void)[] = [];
  private timer: number | null = null;
  private stopped = false;

  constructor(
    private level: number,
    yourRace: RaceId,
    botLevels: BotLevel[],
    private startAt: number,
    private yourLives: () => number
  ) {
    this.seats.push({ id: YOU, name: 'Вы', race: yourRace, kind: 'you', field: null, lives: CONFIG.lives.start, shown: CONFIG.lives.start, alive: true, place: null });
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    botLevels.slice(0, CONFIG.brawl.players - 1).forEach((lvl, i) => {
      this.seats.push({
        id: `bot${i + 1}`,
        name: names[i % names.length],
        race: RACE_IDS[Math.floor(Math.random() * RACE_IDS.length)],
        kind: 'bot',
        field: new BotField(level, lvl, 'brawl'),
        lives: CONFIG.lives.start,
        shown: CONFIG.lives.start,
        alive: true,
        place: null,
      });
    });
    this.repair();
  }

  // ---- DuelLink: what App sends ----
  send(msg: DuelMessage) {
    if (msg.t === 'send') {
      // Sends leave at a wave start; they go to whom you faced before it
      const w = Math.round((performance.now() - this.startAt) / 1000 / CONFIG.brawl.roundLength);
      const target = this.seat(this.prevOpp[w]?.[YOU] ?? this.opp[YOU]);
      if (target?.alive && target.field) target.field.receive(msg.enemies, w - 1); // bought at wave w's price
    } else if (msg.t === 'lost') this.youFell();
    else if (msg.t === 'leave') this.close();
  }

  onMessage(cb: (msg: DuelMessage, from: string) => void) {
    this.handler = cb;
    if (this.timer === null && !this.stopped) {
      this.timer = window.setInterval(() => this.tick(), 500);
      this.tick();
    }
  }

  pair() {}

  close() {
    this.stopped = true;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  /** The board, every half second */
  onChange(cb: (s: BrawlSnapshot) => void) {
    this.listeners.push(cb);
    cb(this.snapshot());
  }

  // ---- the clock ----
  private prevOpp: Record<number, Record<string, string>> = {}; // the pairs each wave started with

  private tick() {
    if (this.stopped) return;
    const you = this.seat(YOU)!;
    if (you.alive) you.lives = you.shown = Math.max(0, this.yourLives());
    const elapsed = (performance.now() - this.startAt) / 1000;
    while (!this.stopped && you.alive && this.aliveSeats().length > 1 && elapsed >= (this.wave + 1) * CONFIG.brawl.roundLength) {
      this.playWave();
    }
    // A bot's loss drains on the board over a few seconds
    const step = (CONFIG.lives.start / CONFIG.brawl.hpDrain) * 0.5;
    for (const s of this.seats) if (s.kind !== 'you' && s.shown > s.lives) s.shown = Math.max(s.lives, s.shown - Math.max(step, (s.shown - s.lives) / 6));
    // The opponent's line under your gold, live (it is also the duel's sign of life)
    const o = this.seat(this.opp[YOU]);
    this.emit({ t: 'state', lives: Math.round(o?.shown ?? 0), wave: Math.max(1, this.wave), income: o?.field?.income ?? 0 });
    const snap = this.snapshot();
    this.listeners.forEach((cb) => cb(snap));
  }

  /** One wave out on every field: bots defend and buy sends for their opponents; the fallen leave; new pairs */
  private playWave() {
    this.wave++;
    const w = this.wave;
    this.prevOpp[w] = { ...this.opp };
    const before = this.aliveSeats();
    const livesBefore = Object.fromEntries(before.map((s) => [s.id, s.lives]));
    const fallen: Seat[] = [];
    for (const s of before) {
      if (!s.field) continue;
      if (s.field.defend(w)) fallen.push(s);
      s.lives = s.field.lives;
    }
    // Sends from the bots still standing and from the ghost, to whom they faced
    const senders = before.filter((s) => s.field && !fallen.includes(s));
    const ghost = this.seat(this.pairState.ghost);
    if (ghost?.field && this.ghostFoe) senders.push(ghost);
    for (const s of senders) {
      const to = s === ghost ? this.ghostFoe : this.opp[s.id];
      const target = this.seat(to);
      const enemies = s.field!.buySends(w);
      if (!enemies || !target?.alive || fallen.includes(target)) continue;
      if (target.kind === 'you') this.emit({ t: 'send', enemies, army: CONFIG.races[s.race].faction });
      else target.field?.receive(enemies, w);
    }
    if (fallen.length > 0) this.fall(fallen, before.length, livesBefore);
    this.repair();
  }

  private fall(fallen: Seat[], aliveBefore: number, livesBefore: Record<string, number>) {
    const places = placesForFallen(fallen.map((s) => ({ id: s.id, livesBefore: livesBefore[s.id] ?? 0 })), aliveBefore);
    for (const s of fallen) {
      s.alive = false;
      s.lives = 0;
      s.place = places[s.id];
    }
    // The last to fall (the best place of them) leaves its field as the ghost
    const last = [...fallen].sort((a, b) => (a.place ?? 0) - (b.place ?? 0))[0];
    this.pairState = { ...this.pairState, ghost: last.id, ghostCycle: [], lastGhostFoe: null };
    const alive = this.aliveSeats();
    if (alive.length === 1) {
      alive[0].place = 1;
      if (alive[0].kind === 'you') this.emit({ t: 'lost', wave: this.wave }); // the last one standing: you win
    }
  }

  private repair() {
    const alive = this.aliveSeats();
    if (alive.length < 2) {
      this.opp = {};
      this.ghostFoe = null;
      return;
    }
    const res = pairRound(alive.map((s) => ({ id: s.id, lives: s.lives })), this.pairState);
    this.opp = res.opp;
    this.ghostFoe = res.ghostFoe;
    this.pairState = res.state;
  }

  /** Your artifact fell: your place now; the bots play on at once to settle the others' places */
  private youFell() {
    const you = this.seat(YOU)!;
    if (!you.alive) return;
    const alive = this.aliveSeats();
    you.alive = false;
    you.lives = you.shown = 0;
    you.place = alive.length;
    // Your field stays as the ghost (it sends nothing: it has no bot behind it)
    this.pairState = { ...this.pairState, ghost: YOU, ghostCycle: [], lastGhostFoe: null };
    const left = this.aliveSeats();
    if (left.length === 1) left[0].place = 1;
    this.repair();
    for (let guard = 0; guard < 400 && this.aliveSeats().length > 1; guard++) this.playWave();
    for (const s of this.seats) s.shown = s.lives;
    const snap = this.snapshot();
    this.listeners.forEach((cb) => cb(snap));
  }

  /** Whose enemies wave w brings to you: the army of the one you face before it (просьба Артура 2026-11-01) */
  factionForWave(w: number): number {
    const foe = this.seat(this.prevOpp[w]?.[YOU] ?? this.opp[YOU]);
    return foe ? CONFIG.races[foe.race].faction : this.level;
  }

  // ---- helpers ----
  private seat(id: string | null | undefined): Seat | undefined {
    return id ? this.seats.find((s) => s.id === id) : undefined;
  }

  private aliveSeats(): Seat[] {
    return this.seats.filter((s) => s.alive);
  }

  private emit(msg: DuelMessage) {
    if (!this.stopped) setTimeout(() => this.handler(msg, 'потасовка'), 0);
  }

  snapshot(): BrawlSnapshot {
    const view = (s: Seat): BrawlSeatView => ({
      id: s.id,
      name: s.name,
      race: s.race,
      kind: s.kind,
      lives: Math.round(s.shown),
      out: !s.alive && s.shown <= 0,
      place: s.alive ? null : s.place,
    });
    const seats = this.seats
      .map(view)
      .sort((a, b) => Number(a.out) - Number(b.out) || (a.out ? (a.place ?? 0) - (b.place ?? 0) : b.lives - a.lives));
    const alive = this.aliveSeats();
    const you = this.seat(YOU)!;
    return {
      wave: this.wave,
      seats,
      opponentId: you.alive ? (this.opp[YOU] ?? null) : null,
      ghostId: alive.length % 2 === 1 && alive.length > 1 ? this.pairState.ghost : null,
      ghostFoeId: this.ghostFoe,
      alive: alive.length,
      yourPlace: you.alive ? (alive.length === 1 ? 1 : null) : you.place,
      over: !you.alive || alive.length <= 1,
    };
  }
}

/** Bot strengths for a brawl by the difficulty picked in the menu */
export function brawlBots(difficulty: 'easy' | 'normal' | 'hard'): BotLevel[] {
  return [...CONFIG.brawl.bots[difficulty]] as BotLevel[];
}
