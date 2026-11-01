/**
 * Duel bot for «Тёмный рубеж» (Артур, 2026-10-25): an opponent for playing alone. It looks like
 * a player at the other end of the link: it sends state, buys enemies for the human every round,
 * and loses its castle when the waves (plus what the human sends) outgrow its defence.
 * It has no field of its own: its defence is a number, `strength`, compared with the price-weight of
 * the wave (the same unit as the send prices), so a sent enemy counts as much as it costs.
 */

import { BOONS, CONFIG } from './game/config';
import {
  SEND_TYPES,
  SendType,
  calculateEnemyCount,
  calculateKillGold,
  calculateSendIncome,
  calculateSendPrice,
  enemyWaveMult,
  waveDefinition,
} from './game/rules';
import type { DuelLink, DuelMessage } from './duel';

export type BotLevel = 'easy' | 'normal' | 'hard';

/** Артур can tune these: strength = a × round^p; sendShare = part of the wave's weight bought as sends */
export const BOT_LEVELS: Record<BotLevel, { label: string; hint: string; strength: number; sendShare: number }> = {
  easy: { label: 'Лёгкий', hint: 'Слабая защита, шлёт мало врагов', strength: 28, sendShare: 0.08 },
  normal: { label: 'Средний', hint: 'Держится до середины игры, шлёт понемногу', strength: 40, sendShare: 0.16 },
  hard: { label: 'Сильный', hint: 'Крепкая защита, шлёт много врагов', strength: 58, sendShare: 0.28 },
};

const STRENGTH_POWER = 1.6;
const STRENGTH_BASE = 100; // a start that holds the first waves on any level
// Bot losses were tuned for 20 lives; scaled to the artifact's HP so the bot holds as long as before
const HP_SCALE = CONFIG.lives.start / 20;
const LOSS_PER_OVERLOAD = 4 * HP_SCALE; // artifact HP lost per 100 % of overload
const MAX_LOSS_PER_WAVE = 8 * HP_SCALE;

/** Price-weight of the wave a defender meets in this round (half wave, as in a duel) */
export function waveWeight(round: number, level: number): number {
  const def = waveDefinition(round);
  let weight = 0;
  for (const [type, count] of Object.entries(def)) {
    const enemy = CONFIG.enemies[type as keyof typeof CONFIG.enemies];
    if (!enemy) continue;
    const n = type === 'boss' ? 1 : calculateEnemyCount(Number(count), level, round, true, 'normal', true);
    const group = type === 'swarm' ? CONFIG.swarmGroupCount : 1;
    weight += n * calculateKillGold(enemy.gold * group, level) * CONFIG.duel.sendPriceMult * enemyWaveMult(round);
  }
  return weight;
}

/** The bot's defence in this round, without the random swing */
export function botStrength(difficulty: BotLevel, round: number): number {
  return STRENGTH_BASE + BOT_LEVELS[difficulty].strength * Math.pow(round, STRENGTH_POWER);
}

/**
 * A bot's field without a board: its artifact HP, the income of its sends and the weight of what it
 * was sent. Shared by the duel bot and the brawl's seats (src/brawl.ts).
 */
export class BotField {
  lives = CONFIG.lives.start;
  income = 0;
  received = 0; // weight of enemies sent to it, waiting for its next wave

  /** model: 'duel' — the duel bot's strength; 'brawl' — fitted to the map's waves (brawlBotStrength) */
  form = 1; // brawl: each bot's own lasting form, so bots of one strength do not all fall on one wave
  boons: string[] = []; // brawl: the artifact's boons it took, like the player (CONFIG.brawl.boons)

  constructor(public level: number, public difficulty: BotLevel, public model: 'duel' | 'brawl' = 'duel') {
    if (model === 'brawl') this.form = 1 - CONFIG.brawl.botFormSpread + Math.random() * 2 * CONFIG.brawl.botFormSpread;
  }

  /** Wave `round` hits: what it was sent joins the wave; an overload costs HP. Returns true when the artifact fell */
  defend(round: number): boolean {
    if (this.model === 'brawl') this.takeBoons(round);
    const base = this.model === 'brawl' ? brawlBotStrength(this.difficulty, round, this.level) * this.form : botStrength(this.difficulty, round);
    const strength = base * this.boonGain('power') * (0.9 + Math.random() * 0.2);
    const weight = waveWeight(round, this.level) + this.received;
    this.received = 0;
    const overload = weight / strength - 1;
    if (overload > 0) {
      this.lives = Math.max(0, this.lives - Math.min(MAX_LOSS_PER_WAVE, Math.ceil(overload * LOSS_PER_OVERLOAD)));
    }
    return this.lives <= 0;
  }

  /** Brawl: with every 3rd wave one boon of three not taken yet (picked at random); walls and mending go to HP */
  private takeBoons(round: number) {
    const b = this.boonDefs();
    const k = CONFIG.brawl.botBoonScale;
    const max = CONFIG.lives.start + Math.round(k * b.reduce((n, d) => n + (d.bot.lives ?? 0), 0));
    const mend = Math.round(k * b.reduce((n, d) => n + (d.bot.mend ?? 0), 0));
    if (mend > 0 && this.lives > 0) this.lives = Math.min(max, this.lives + mend);
    if (round % CONFIG.brawl.boonEvery !== 0) return;
    const pool = BOONS.filter((d) => !this.boons.includes(d.id));
    if (pool.length === 0) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    this.boons.push(pick.id);
    if (pick.bot.lives) this.lives += Math.round(pick.bot.lives * CONFIG.brawl.botBoonScale);
  }

  private boonDefs() {
    return BOONS.filter((d) => this.boons.includes(d.id));
  }

  /** 1 + the sum of the boons' bot `key` (power, sends) */
  private boonGain(key: 'power' | 'sends'): number {
    return 1 + CONFIG.brawl.botBoonScale * this.boonDefs().reduce((n, d) => n + (d.bot[key] ?? 0), 0);
  }

  /** Buys enemies for its opponent at the start of wave `round`: a random mix for a part of this wave's weight */
  buySends(round: number): Partial<Record<SendType, number>> | null {
    const level = this.level;
    const budget = round >= 2 ? waveWeight(round, level) * BOT_LEVELS[this.difficulty].sendShare * this.boonGain('sends') : 0;
    const enemies: Partial<Record<SendType, number>> = {};
    let spent = 0;
    for (let guard = 0; guard < 400; guard++) {
      const type = SEND_TYPES[Math.floor(Math.random() * SEND_TYPES.length)];
      const price = calculateSendPrice(type, round + 1, level);
      if (spent + price > budget) {
        // a cheaper type may still fit; stop when even the cheapest does not
        const cheapest = Math.min(...SEND_TYPES.map((t) => calculateSendPrice(t, round + 1, level)));
        if (spent + cheapest > budget) break;
        continue;
      }
      enemies[type] = (enemies[type] ?? 0) + 1;
      spent += price;
    }
    if (spent <= 0) return null;
    this.income += calculateSendIncome(spent);
    return enemies;
  }

  /** Enemies sent to it come at its next wave, at what they cost (`round`: waves already out) */
  receive(enemies: Partial<Record<SendType, number>>, round: number) {
    for (const type of SEND_TYPES) {
      const n = Math.max(0, Math.floor(Number(enemies[type]) || 0));
      this.received += n * calculateSendPrice(type, round + 1, this.level);
    }
  }
}

/**
 * Brawl bot's defence: its own wave on this map × skill, fading with time (it falls behind like a player);
 * a boss wave is a little harder. So a bot fits any map: it does not all fall on a boss wave nor live forever.
 */
export function brawlBotStrength(difficulty: BotLevel, round: number, level: number): number {
  const boss = round % 12 === 0 ? CONFIG.brawl.botBossFactor : 1;
  return CONFIG.brawl.botSkill[difficulty] * waveWeight(round, level) * Math.exp(-round / CONFIG.brawl.botFade) * boss;
}

export function createBotLink(level: number, difficulty: BotLevel): DuelLink {
  const startedAt = performance.now();
  const field = new BotField(level, difficulty);
  let handler: (msg: DuelMessage, from: string) => void = () => {};
  let timer: number | null = null;
  let round = 0; // rounds already played
  let lastState = 0;
  let over = false;

  const emit = (msg: DuelMessage) => {
    if (!over) setTimeout(() => handler(msg, 'бот'), 0);
  };
  const stop = () => {
    over = true;
    if (timer !== null) window.clearInterval(timer);
    timer = null;
  };

  const nextRound = () => {
    round++;
    if (field.defend(round)) {
      emit({ t: 'lost', wave: round });
      stop();
      return;
    }
    const enemies = field.buySends(round);
    if (enemies) emit({ t: 'send', enemies });
  };

  const tick = () => {
    if (over) return;
    const elapsed = (performance.now() - startedAt) / 1000;
    while (!over && elapsed >= (round + 1) * CONFIG.duel.roundLength) nextRound();
    if (!over && elapsed - lastState >= CONFIG.duel.stateInterval) {
      lastState = elapsed;
      emit({ t: 'state', lives: field.lives, wave: Math.max(1, round), income: field.income });
    }
  };

  return {
    role: 'host',
    code: 'бот',
    send(msg) {
      // What the human sends comes at the bot's next wave, at what it cost
      if (msg.t === 'send') field.receive(msg.enemies, round);
      else if (msg.t === 'lost' || msg.t === 'leave') stop();
    },
    onMessage(cb) {
      handler = cb;
      if (timer === null && !over) {
        timer = window.setInterval(tick, 500);
        emit({ t: 'state', lives: field.lives, wave: Math.max(1, round), income: field.income });
      }
    },
    pair() {},
    close: stop,
  };
}
