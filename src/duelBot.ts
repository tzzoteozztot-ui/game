/**
 * Duel bot for «Тёмный рубеж» (Артур, 2026-10-25): an opponent for playing alone. It looks like
 * a player at the other end of the link: it sends state, buys enemies for the human every round,
 * and loses its castle when the waves (plus what the human sends) outgrow its defence.
 * It has no field of its own: its defence is a number, `strength`, compared with the price-weight of
 * the wave (the same unit as the send prices), so a sent enemy counts as much as it costs.
 */

import { CONFIG } from './game/config';
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

export function createBotLink(level: number, difficulty: BotLevel): DuelLink {
  const cfg = BOT_LEVELS[difficulty];
  const startedAt = performance.now();
  let handler: (msg: DuelMessage, from: string) => void = () => {};
  let timer: number | null = null;
  let lives = CONFIG.lives.start;
  let income = 0;
  let round = 0; // rounds already played
  let received = 0; // weight of enemies the human sent, waiting for the next wave
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
    const strength = botStrength(difficulty, round) * (0.9 + Math.random() * 0.2);
    const weight = waveWeight(round, level) + received;
    received = 0;
    const overload = weight / strength - 1;
    if (overload > 0) {
      lives = Math.max(0, lives - Math.min(MAX_LOSS_PER_WAVE, Math.ceil(overload * LOSS_PER_OVERLOAD)));
    }
    if (lives <= 0) {
      emit({ t: 'lost', wave: round });
      stop();
      return;
    }
    // Buys enemies for the human: a random mix for a part of this wave's weight
    const budget = round >= 2 ? waveWeight(round, level) * cfg.sendShare : 0;
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
    if (spent > 0) {
      income += calculateSendIncome(spent);
      emit({ t: 'send', enemies });
    }
  };

  const tick = () => {
    if (over) return;
    const elapsed = (performance.now() - startedAt) / 1000;
    while (!over && elapsed >= (round + 1) * CONFIG.duel.roundLength) nextRound();
    if (!over && elapsed - lastState >= CONFIG.duel.stateInterval) {
      lastState = elapsed;
      emit({ t: 'state', lives, wave: Math.max(1, round), income });
    }
  };

  return {
    role: 'host',
    code: 'бот',
    send(msg) {
      if (msg.t === 'send') {
        // What the human sends comes at the bot's next wave, at what it cost
        for (const type of SEND_TYPES) {
          const n = Math.max(0, Math.floor(Number(msg.enemies[type]) || 0));
          received += n * calculateSendPrice(type, round + 1, level);
        }
      } else if (msg.t === 'lost' || msg.t === 'leave') stop();
    },
    onMessage(cb) {
      handler = cb;
      if (timer === null && !over) {
        timer = window.setInterval(tick, 500);
        emit({ t: 'state', lives, wave: Math.max(1, round), income });
      }
    },
    pair() {},
    close: stop,
  };
}
