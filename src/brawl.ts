/**
 * «Потасовка» (Артур, 2026-11-01, этап 1): eight players, each on their own field; the waves follow the
 * duel's shared clock, and every wave the opponents change. Who you face is who your bought enemies go
 * to and who sends enemies to you. With an odd number left, the field of the last player to fall stays
 * as a «призрак»: it keeps sending enemies, and the alive players take turns against it, from the
 * weakest (least artifact HP) to the strongest, never the same one twice in a row.
 *
 * The room is a DuelLink, so App drives it exactly like a duel: it sends `send`/`lost`/`leave` and hears
 * `send`/`state`/`lost`. Offline (этап 1) the seven others are bots (BotField from duelBot.ts).
 * Online (этап 2): a lobby by a 4-digit code, made by one of the eight (BrawlLobby.tsx); empty seats are
 * bots. The host's room runs everything: the clock of pairs, the bots, who fell, and every second sends
 * the whole board. The others play their own fields and send the host their HP («beat»), their sends
 * and their fall. A player silent for 15 s or gone: a bot takes their field at its HP (and gives it back
 * if they come back). The host gone: the next player online in the lobby's order hosts from the last board.
 */

import { CONFIG, RACE_IDS, RaceId } from './game/config';
import { SEND_TYPES, type SendType } from './game/rules';
import type { DuelLink, DuelMessage, RoomLink } from './duel';
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
  online: boolean; // a network game (players, not only bots)
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
// The network (этап 2, Артур 2026-11-01: лобби создаёт один из восьми)
// -------------------------------------------------------------
export interface LobbyPlayer {
  id: string;
  name: string;
  race: RaceId;
}

/** A bot field on the wire: enough to go on with it when the host changes */
interface BotState {
  difficulty: BotLevel;
  lives: number;
  income: number;
  received: number;
  form: number;
  boons?: string[];
}

interface SeatState {
  id: string;
  name: string;
  race: RaceId;
  human: boolean;
  took: boolean; // a player's seat a bot took over
  online: boolean; // a player heard lately (who may host next)
  lives: number;
  shown: number;
  alive: boolean;
  place: number | null;
  bot?: BotState;
}

/** The whole room, from its host every second */
export interface BoardState {
  host: string;
  epoch: number; // grows each time the host changes
  level: number;
  elapsed: number; // ms since the start on the host's clock
  wave: number;
  seats: SeatState[];
  opp: Record<string, string>;
  ghostFoe: string | null;
  pair: PairState;
  prev: Record<string, string>; // the pairs the last wave started with
}

export type BrawlWire =
  | { t: 'join'; name: string; race: RaceId } // guest → host, every second in the lobby (also its sign of life)
  | { t: 'lobby'; level: number; bots: string; players: LobbyPlayer[] } // host → all, every second in the lobby
  | { t: 'full' } // host → a guest: eight already
  | { t: 'go'; level: number } // host → all: the game starts now
  | { t: 'board'; b: BoardState } // host → all, every second in the game
  | { t: 'beat'; lives: number; lost: boolean } // player → host, every 2 s in the game
  | { t: 'send'; enemies: Partial<Record<SendType, number>>; wave?: number; army?: number } // player → host: bought at a wave start; host → player: enemies for you
  | { t: 'lost' } // player → host: my artifact fell; host → player: you are the last one standing
  | { t: 'leave' }; // anyone: I left

const BOARD_EVERY_MS = 1000;
const BEAT_EVERY_MS = 2000;
const NET_TIMEOUT_MS = 15000; // a player silent this long: a bot takes the seat (it comes back with the player's next message)
const HOST_TIMEOUT_MS = 8000; // no board this long: the next player hosts

export const NAME_MAX = 14;

export function cleanName(v: unknown): string {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : '';
  return s || 'Игрок';
}

export function cleanRace(v: unknown): RaceId {
  return RACE_IDS.includes(v as RaceId) ? (v as RaceId) : 'humans';
}

function cleanSends(v: unknown): Partial<Record<SendType, number>> {
  const out: Partial<Record<SendType, number>> = {};
  if (!v || typeof v !== 'object') return out;
  for (const type of SEND_TYPES) {
    const n = Math.floor(Number((v as Record<string, unknown>)[type]) || 0);
    if (n > 0) out[type] = Math.min(n, CONFIG.duel.sendMaxPerType);
  }
  return out;
}

/**
 * Who hosts after `dead` hosts: the first player still online in the seat order (the lobby's order:
 * the room's creator first). Pure, tested in logic.test.ts; every player picks the same one from the same board.
 */
export function nextHost(seats: { id: string; human: boolean; online: boolean }[], dead: Set<string>): string | null {
  return seats.find((s) => s.human && s.online && !dead.has(s.id))?.id ?? null;
}

// -------------------------------------------------------------
// The room
// -------------------------------------------------------------
export const BOT_NAMES = ['Гром', 'Вереск', 'Кремень', 'Морока', 'Ясень', 'Сыч', 'Полынь', 'Ворон', 'Тлен', 'Бурелом', 'Зола', 'Терн'];

interface Seat {
  id: string;
  name: string;
  race: RaceId;
  human: boolean; // a player (you or over the network); false — a bot
  took: boolean;
  field: BotField | null; // a bot's field; null for a player
  lives: number; // real HP
  shown: number; // HP on the board
  alive: boolean;
  place: number | null;
  seen: number; // performance.now() of a network player's last message
  left: boolean; // the player said they left
}

const YOU = 'you';

/** Network play: the room's channel, the players from the lobby, and whether this one is its host */
export interface BrawlNetSetup {
  link: RoomLink<BrawlWire>;
  players: LobbyPlayer[]; // the lobby's order, the host first
  hosting: boolean;
  hostId: string;
}

export class BrawlRoom implements DuelLink {
  role = 'host' as const;
  code = 'потасовка';
  private me: string;
  private hosting: boolean;
  private hostId: string;
  private epoch = 0;
  private net: RoomLink<BrawlWire> | null;
  private seats: Seat[] = [];
  private wave = 0;
  private opp: Record<string, string> = {};
  private ghostFoe: string | null = null;
  private pairState = emptyPairState();
  private prevOpp: Record<number, Record<string, string>> = {}; // the pairs each wave started with
  private handler: (msg: DuelMessage, from: string) => void = () => {};
  private listeners: ((s: BrawlSnapshot) => void)[] = [];
  private timer: number | null = null;
  private stopped = false;
  // network
  private lastBoardSent = 0;
  private lastBeat = 0;
  private lastBoardAt = performance.now(); // client: when the host's last board came
  private board: BoardState | null = null; // client: the host's last board
  private deadHosts = new Set<string>();
  private lostSent = false; // client: my artifact fell (the host may not know yet)
  private factionByWave: Record<number, number> = {}; // client: whose enemies each wave brings me

  constructor(
    private level: number,
    yourRace: RaceId,
    private botLevels: BotLevel[],
    private startAt: number,
    private yourLives: () => number,
    net?: BrawlNetSetup
  ) {
    this.net = net?.link ?? null;
    this.me = net ? net.link.me : YOU;
    this.hosting = net ? net.hosting : true;
    this.hostId = net ? net.hostId : YOU;
    const now = performance.now();
    const humans: LobbyPlayer[] = net
      ? net.players.slice(0, CONFIG.brawl.players)
      : [{ id: YOU, name: 'Вы', race: yourRace }];
    for (const p of humans) {
      this.seats.push({ id: p.id, name: p.name, race: p.race, human: true, took: false, field: null, lives: CONFIG.lives.start, shown: CONFIG.lives.start, alive: true, place: null, seen: now, left: false });
    }
    if (!net || net.hosting) {
      this.fillBots();
      this.repair();
    }
    this.net?.onMessage((msg, from) => this.onWire(msg, from));
    // The network keeps going whether or not App listens yet
    if (this.net) this.startTimer();
  }

  /** Empty seats: bots of the strengths picked in the lobby */
  private fillBots() {
    const now = performance.now();
    const taken = new Set(this.seats.map((p) => p.name));
    const names = [...BOT_NAMES].filter((n) => !taken.has(n)).sort(() => Math.random() - 0.5);
    const levels = [...this.botLevels].sort(() => Math.random() - 0.5);
    for (let i = 0; this.seats.length < CONFIG.brawl.players && i < levels.length; i++) {
      this.seats.push({
        id: `bot${i + 1}`,
        name: names[i % names.length],
        race: RACE_IDS[Math.floor(Math.random() * RACE_IDS.length)],
        human: false,
        took: false,
        field: new BotField(this.level, levels[i], 'brawl'),
        lives: CONFIG.lives.start,
        shown: CONFIG.lives.start,
        alive: true,
        place: null,
        seen: now,
        left: false,
      });
    }
  }

  // ---- DuelLink: what App sends ----
  send(msg: DuelMessage) {
    if (msg.t === 'send') {
      // Sends leave at a wave start; they go to whom you faced before it
      const w = msg.wave ?? Math.round((performance.now() - this.startAt) / 1000 / CONFIG.brawl.roundLength);
      if (this.hosting) this.routeSend(this.me, msg.enemies, w);
      else this.net?.send({ t: 'send', enemies: msg.enemies, wave: w }, this.hostId);
    } else if (msg.t === 'lost') {
      this.lostSent = true;
      if (this.hosting) this.humanFell(this.seat(this.me));
      else this.net?.send({ t: 'lost' }, this.hostId);
    } else if (msg.t === 'leave') {
      this.net?.send({ t: 'leave' });
      this.close();
    }
  }

  onMessage(cb: (msg: DuelMessage, from: string) => void) {
    this.handler = cb;
    this.startTimer();
  }

  pair() {}

  close() {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    const net = this.net;
    if (net) setTimeout(() => net.close(), 500); // let «leave» go out first
  }

  /** The board, every half second */
  onChange(cb: (s: BrawlSnapshot) => void) {
    this.listeners.push(cb);
    cb(this.snapshot());
  }

  /** Whose enemies wave w brings to you: the army of the one you face before it (просьба Артура 2026-11-01) */
  factionForWave(w: number): number {
    if (!this.hosting && this.factionByWave[w]) return this.factionByWave[w];
    const foe = this.seat(this.prevOpp[w]?.[this.me] ?? this.opp[this.me]);
    return foe ? CONFIG.races[foe.race].faction : this.level;
  }

  private startTimer() {
    if (this.timer === null && !this.stopped) {
      this.timer = window.setInterval(() => this.tick(), 500);
      this.tick();
    }
  }

  // ---- the clock ----
  private tick() {
    if (this.stopped) return;
    const now = performance.now();
    if (this.hosting) this.hostTick(now);
    else this.clientTick(now);
    if (this.stopped) return;
    // The opponent's line under your gold, live (it is also the duel's sign of life)
    const snap = this.snapshot();
    const o = snap.seats.find((s) => s.id === snap.opponentId);
    const field = this.seat(snap.opponentId)?.field;
    this.emit({ t: 'state', lives: o?.lives ?? 0, wave: Math.max(1, this.wave), income: field?.income ?? 0 });
    this.listeners.forEach((cb) => cb(snap));
  }

  private hostTick(now: number) {
    const you = this.seat(this.me);
    if (you?.alive) you.lives = you.shown = Math.max(0, this.yourLives());
    // A player gone silent: a bot takes the seat
    for (const s of this.seats) if (s.human && s.id !== this.me && s.alive && now - s.seen > NET_TIMEOUT_MS) this.takeOver(s);
    const elapsed = (now - this.startAt) / 1000;
    while (!this.stopped && this.humansAlive() > 0 && this.aliveSeats().length > 1 && elapsed >= (this.wave + 1) * CONFIG.brawl.roundLength) {
      this.playWave();
    }
    // A bot's loss drains on the board over a few seconds
    const step = (CONFIG.lives.start / CONFIG.brawl.hpDrain) * 0.5;
    for (const s of this.seats) {
      if (s.human) s.shown = s.lives;
      else if (s.shown > s.lives) s.shown = Math.max(s.lives, s.shown - Math.max(step, (s.shown - s.lives) / 6));
    }
    if (this.net && now - this.lastBoardSent >= BOARD_EVERY_MS) {
      this.lastBoardSent = now;
      this.net.send({ t: 'board', b: this.boardState(now) });
    }
  }

  private clientTick(now: number) {
    if (now - this.lastBeat >= BEAT_EVERY_MS) {
      this.lastBeat = now;
      this.net?.send({ t: 'beat', lives: Math.max(0, Math.round(this.yourLives())), lost: this.lostSent }, this.hostId);
    }
    if (now - this.lastBoardAt > HOST_TIMEOUT_MS) this.hostGone(now);
  }

  /** One wave out on every field: bots defend and buy sends for their opponents; the fallen leave; new pairs */
  private playWave() {
    this.wave++;
    const w = this.wave;
    this.prevOpp[w] = { ...this.opp };
    delete this.prevOpp[w - 3];
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
      this.deliver(target, enemies, w, CONFIG.races[s.race].faction);
    }
    if (fallen.length > 0) this.fall(fallen, before.length, livesBefore);
    this.repair();
  }

  /** Enemies bought at wave w's start reach their target: a bot's next wave, or a player's field */
  private deliver(target: Seat, enemies: Partial<Record<SendType, number>>, w: number, army: number) {
    if (target.field) target.field.receive(enemies, w - 1); // bought at wave w's price
    else if (target.id === this.me) this.emit({ t: 'send', enemies, army });
    else this.net?.send({ t: 'send', enemies, army }, target.id);
  }

  /** A player's sends at wave w's start: to whom they faced before it */
  private routeSend(from: string, enemies: Partial<Record<SendType, number>>, w: number) {
    const sender = this.seat(from);
    const target = this.seat(this.prevOpp[w]?.[from] ?? this.opp[from]);
    if (!sender || !target?.alive || target === sender) return;
    this.deliver(target, cleanSends(enemies), w, CONFIG.races[sender.race].faction);
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
    this.crownIfLast();
  }

  /** One left standing: first place; a player hears they won */
  private crownIfLast() {
    const alive = this.aliveSeats();
    if (alive.length !== 1) return;
    const w = alive[0];
    w.place = 1;
    if (!w.human) return;
    if (w.id === this.me) this.emit({ t: 'lost', wave: this.wave }); // the last one standing: you win
    else this.net?.send({ t: 'lost' }, w.id);
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

  /** A player's artifact fell: their place now; with no player left standing the bots play on at once to settle the places */
  private humanFell(seat: Seat | undefined) {
    if (!seat?.alive) return;
    const alive = this.aliveSeats();
    seat.alive = false;
    seat.lives = seat.shown = 0;
    seat.place = alive.length;
    // The field stays as the ghost (it sends nothing: it has no bot behind it)
    this.pairState = { ...this.pairState, ghost: seat.id, ghostCycle: [], lastGhostFoe: null };
    this.crownIfLast();
    this.repair();
    this.settleIfNoPlayers();
  }

  /** No player left standing: the bots play on at once to settle the places */
  private settleIfNoPlayers() {
    if (this.humansAlive() > 0) return;
    for (let guard = 0; guard < 400 && this.aliveSeats().length > 1; guard++) this.playWave();
    for (const s of this.seats) s.shown = s.lives;
    const snap = this.snapshot();
    this.listeners.forEach((cb) => cb(snap));
  }

  /** A player dropped: a bot plays their field from its HP on */
  private takeOver(s: Seat) {
    if (!s.human || !s.alive) return;
    s.human = false;
    s.took = true;
    s.field = new BotField(this.level, 'normal', 'brawl');
    s.field.lives = s.lives;
    this.settleIfNoPlayers();
  }

  // ---- the wire ----
  private onWire(msg: BrawlWire, from: string) {
    if (this.stopped || !msg || typeof msg !== 'object') return;
    if (msg.t === 'board') {
      this.onBoard(msg.b, from);
      return;
    }
    if (this.hosting) {
      const s = this.seat(from);
      if (!s || s.id === this.me || !(s.human || s.took)) return;
      s.seen = performance.now();
      if (msg.t === 'leave') {
        s.left = true;
        this.takeOver(s);
        return;
      }
      s.left = false;
      // A player back after a drop gets their seat back from the bot
      if (s.took && s.alive) {
        s.human = true;
        s.field = null;
      }
      if (msg.t === 'beat') {
        if (s.alive) s.lives = s.shown = Math.max(0, Math.min(CONFIG.lives.start * 3, Math.floor(Number(msg.lives)) || 0));
        if (msg.lost) this.humanFell(s);
      } else if (msg.t === 'lost') this.humanFell(s);
      else if (msg.t === 'send') this.routeSend(s.id, msg.enemies, Math.floor(Number(msg.wave)) || this.wave + 1);
      return;
    }
    if (from !== this.hostId) return;
    if (msg.t === 'send') this.emit({ t: 'send', enemies: cleanSends(msg.enemies), army: Math.floor(Number(msg.army)) || undefined });
    else if (msg.t === 'lost') {
      if (!this.lostSent) this.emit({ t: 'lost', wave: this.wave });
    } else if (msg.t === 'leave') this.hostGone(performance.now(), true);
  }

  private onBoard(b: BoardState, from: string) {
    if (!b || typeof b !== 'object' || !Array.isArray(b.seats) || b.host !== from) return;
    const now = performance.now();
    if (this.hosting) {
      if (from === this.me) return;
      // Two hosts (one was cut off): the one with more players online stays
      const mine = this.boardState(now).seats.filter((s) => s.online).length;
      const theirs = b.seats.filter((s) => s.human && s.online).length;
      if (theirs > mine || (theirs === mine && (b.epoch > this.epoch || (b.epoch === this.epoch && from < this.me)))) {
        this.hosting = false;
        this.hostId = from;
      } else return;
    }
    // Follow the current host; while it is silent, whoever hosts next
    const waiting = now - this.lastBoardAt > HOST_TIMEOUT_MS / 2;
    if (from !== this.hostId && !(waiting && !this.deadHosts.has(from))) return;
    this.hostId = from;
    this.epoch = Math.max(this.epoch, Number(b.epoch) || 0);
    this.board = b;
    this.lastBoardAt = now;
    this.wave = Math.max(0, Math.floor(Number(b.wave)) || 0);
    // The opponent shown now is the one the next wave brings
    const foe = b.seats.find((s) => s.id === b.opp?.[this.me]);
    if (foe) this.factionByWave[this.wave + 1] = CONFIG.races[cleanRace(foe.race)].faction;
    const prevFoe = b.seats.find((s) => s.id === b.prev?.[this.me]);
    if (prevFoe && !this.factionByWave[this.wave]) this.factionByWave[this.wave] = CONFIG.races[cleanRace(prevFoe.race)].faction;
  }

  /** The host is gone: the next player online hosts, from the last board */
  private hostGone(now: number, left = false) {
    if (!left && now - this.lastBoardAt <= HOST_TIMEOUT_MS) return;
    this.deadHosts.add(this.hostId);
    this.lastBoardAt = now;
    const seats = this.board?.seats ?? this.seats.map((s) => ({ id: s.id, human: s.human, online: true }));
    const next = nextHost(seats, this.deadHosts) ?? this.me;
    if (next === this.me) this.becomeHost(now);
    else this.hostId = next;
  }

  private becomeHost(now: number) {
    const b = this.board;
    this.hosting = true;
    this.epoch++;
    this.hostId = this.me;
    if (b) {
      this.epoch = Math.max(this.epoch, (Number(b.epoch) || 0) + 1);
      this.wave = b.wave;
      this.opp = { ...b.opp };
      this.ghostFoe = b.ghostFoe;
      this.pairState = { ...emptyPairState(), ...b.pair };
      this.prevOpp = { [b.wave]: { ...b.prev } };
      this.seats = b.seats.map((s) => {
        const seat: Seat = {
          id: s.id,
          name: cleanName(s.name),
          race: cleanRace(s.race),
          human: !!s.human,
          took: !!s.took,
          field: null,
          lives: Number(s.lives) || 0,
          shown: Number(s.shown) || 0,
          alive: !!s.alive,
          place: s.place ?? null,
          seen: now,
          left: false,
        };
        if (s.bot) {
          const f = new BotField(this.level, s.bot.difficulty, 'brawl');
          Object.assign(f, { lives: s.bot.lives, income: s.bot.income, received: s.bot.received, form: s.bot.form, boons: Array.isArray(s.bot.boons) ? s.bot.boons.map(String) : [] });
          seat.field = f;
        }
        return seat;
      });
    }
    if (!this.seat(this.me)) {
      this.seats.unshift({ id: this.me, name: 'Вы', race: 'humans', human: true, took: false, field: null, lives: this.yourLives(), shown: this.yourLives(), alive: !this.lostSent, place: null, seen: now, left: false });
    }
    if (!b) {
      this.fillBots();
      this.repair();
    }
    const me = this.seat(this.me)!;
    if (this.lostSent && me.alive) this.humanFell(me);
    // The hosts that are gone: bots take their seats
    for (const id of this.deadHosts) {
      const s = this.seat(id);
      if (s) this.takeOver(s);
    }
    this.lastBoardSent = 0;
  }

  private boardState(now: number): BoardState {
    return {
      host: this.me,
      epoch: this.epoch,
      level: this.level,
      elapsed: Math.round(now - this.startAt),
      wave: this.wave,
      seats: this.seats.map((s) => ({
        id: s.id,
        name: s.name,
        race: s.race,
        human: s.human,
        took: s.took,
        online: s.human && (s.id === this.me || (!s.left && now - s.seen < NET_TIMEOUT_MS)),
        lives: Math.round(s.lives),
        shown: Math.round(s.shown),
        alive: s.alive,
        place: s.place,
        ...(s.field
          ? { bot: { difficulty: s.field.difficulty, lives: s.field.lives, income: s.field.income, received: s.field.received, form: s.field.form, boons: s.field.boons } }
          : {}),
      })),
      opp: this.opp,
      ghostFoe: this.ghostFoe,
      pair: this.pairState,
      prev: this.prevOpp[this.wave] ?? {},
    };
  }

  // ---- helpers ----
  private seat(id: string | null | undefined): Seat | undefined {
    return id ? this.seats.find((s) => s.id === id) : undefined;
  }

  private aliveSeats(): Seat[] {
    return this.seats.filter((s) => s.alive);
  }

  private humansAlive(): number {
    return this.seats.filter((s) => s.alive && s.human).length;
  }

  private emit(msg: DuelMessage) {
    if (!this.stopped) setTimeout(() => this.handler(msg, 'потасовка'), 0);
  }

  snapshot(): BrawlSnapshot {
    const me = this.me;
    type Row = { id: string; name: string; race: RaceId; human: boolean; took: boolean; shown: number; alive: boolean; place: number | null };
    let rows: Row[];
    let opp: Record<string, string>;
    let ghost: string | null;
    let ghostFoe: string | null;
    if (this.hosting || !this.board) {
      rows = this.seats.map((s) => ({ ...s }));
      opp = this.opp;
      ghost = this.pairState.ghost;
      ghostFoe = this.ghostFoe;
    } else {
      const b = this.board;
      rows = b.seats.map((s) => ({ id: s.id, name: cleanName(s.name), race: cleanRace(s.race), human: !!s.human, took: !!s.took, shown: Number(s.shown) || 0, alive: !!s.alive, place: s.place ?? null }));
      opp = b.opp ?? {};
      ghost = b.pair?.ghost ?? null;
      ghostFoe = b.ghostFoe ?? null;
    }
    // Your fall counts at once, before the host's next board
    const mine = rows.find((r) => r.id === me);
    if (mine && mine.alive && this.lostSent) {
      mine.place = rows.filter((r) => r.alive).length;
      mine.alive = false;
      mine.shown = 0;
    }
    const view = (s: Row): BrawlSeatView => ({
      id: s.id,
      name: s.took ? `${s.name} (бот)` : s.name,
      race: s.race,
      kind: s.id === me ? 'you' : s.human ? 'net' : 'bot',
      lives: Math.round(s.shown),
      out: !s.alive && s.shown <= 0,
      place: s.alive ? null : s.place,
    });
    const seats = rows
      .map(view)
      .sort((a, b) => Number(a.out) - Number(b.out) || (a.out ? (a.place ?? 0) - (b.place ?? 0) : b.lives - a.lives));
    const alive = rows.filter((r) => r.alive);
    const youAlive = !!mine?.alive;
    return {
      wave: this.wave,
      seats,
      opponentId: youAlive ? (opp[me] ?? null) : null,
      ghostId: alive.length % 2 === 1 && alive.length > 1 ? ghost : null,
      ghostFoeId: ghostFoe,
      alive: alive.length,
      yourPlace: youAlive ? (alive.length === 1 ? 1 : null) : (mine?.place ?? null),
      over: !youAlive || alive.length <= 1,
      online: this.net !== null,
    };
  }
}

/** Bot strengths for a brawl by the difficulty picked in the menu */
export function brawlBots(difficulty: 'easy' | 'normal' | 'hard'): BotLevel[] {
  return [...CONFIG.brawl.bots[difficulty]] as BotLevel[];
}
