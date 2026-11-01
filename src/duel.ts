/**
 * Duel link for «Тёмный рубеж» (Артур, 2026-10-25): two players, each plays their own field,
 * only a few messages go between them (start, state, defeat). Supabase Realtime broadcast on a
 * channel named after the room code; no table, no account needed.
 * `?duel=local` in the address uses BroadcastChannel instead: two tabs of one browser, for testing
 * without the network.
 */

import type { RealtimeChannel } from '@supabase/supabase-js';
import type { SendType } from './game/rules';
import { client, cloudEnabled } from './cloud';

export type DuelRole = 'host' | 'guest';

export type DuelMessage =
  | { t: 'hello'; army: number } // guest → host: I am in the room, with this army (faction id)
  | { t: 'start'; level: number; army: number; inMs: number } // host → guest: the map, the host's army, start in inMs
  | { t: 'state'; lives: number; wave: number; income: number } // both, every few seconds; also a sign of life
  | { t: 'send'; enemies: Partial<Record<SendType, number>>; army?: number; wave?: number } // enemies bought for the opponent, at a round start; army: whose (brawl); wave: the wave they leave with
  | { t: 'lost'; wave: number } // my castle fell
  | { t: 'leave' } // I left the duel
  | { t: 'full' }; // host → a third player: the room already has a duel

export interface DuelLink {
  role: DuelRole;
  code: string;
  send(msg: DuelMessage): void;
  /** from: the sender's id in the room */
  onMessage(cb: (msg: DuelMessage, from: string) => void): void;
  /** From now on only this sender is heard and messages go to it alone; a third player gets «full» */
  pair(peer: string): void;
  close(): void;
}

/** On the wire every message carries its sender and, once paired, its addressee */
type Envelope = DuelMessage & { from?: string; to?: string };

const EVENT = 'm';

export const duelAvailable = cloudEnabled || isLocalDuel();

function isLocalDuel(): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('duel') === 'local';
}

/** Four digits, the room's name */
export function newRoomCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/**
 * The room is open to anyone with its code, so the two players pair by random ids: after the start
 * each hears only the other, and the host turns away whoever else knocks.
 */
function pairedLink(
  role: DuelRole,
  code: string,
  post: (env: Envelope) => void,
  listen: (cb: (env: Envelope) => void) => void,
  close: () => void
): DuelLink {
  const me = Math.random().toString(36).slice(2, 10);
  let peer: string | null = null;
  let handler: (msg: DuelMessage, from: string) => void = () => {};
  listen((env) => {
    if (!env || typeof env !== 'object' || typeof env.from !== 'string' || env.from === me) return;
    if (env.to && env.to !== me) return;
    if (peer !== null && env.from !== peer) {
      if (env.t === 'hello' && role === 'host') post({ t: 'full', from: me, to: env.from });
      return;
    }
    const { from, to: _to, ...msg } = env;
    handler(msg as DuelMessage, from);
  });
  return {
    role,
    code,
    send: (msg) => post({ ...msg, from: me, ...(peer !== null ? { to: peer } : {}) }),
    onMessage: (cb) => (handler = cb),
    pair: (id) => (peer = id),
    close,
  };
}

/** A broadcast channel: everyone on it hears everyone (Supabase Realtime, or BroadcastChannel with ?duel=local) */
interface Channel {
  post(env: unknown): void;
  listen(cb: (env: unknown) => void): void;
  close(): void;
}

async function openChannel(topic: string): Promise<Channel> {
  if (isLocalDuel()) {
    const bc = new BroadcastChannel(`dark_frontier_${topic}`);
    return {
      post: (env) => bc.postMessage(env),
      listen: (cb) => (bc.onmessage = (e) => cb(e.data)),
      close: () => bc.close(),
    };
  }
  const supabase = await client();
  let handler: (env: unknown) => void = () => {};
  const channel: RealtimeChannel = supabase.channel(topic, { config: { broadcast: { self: false } } });
  channel.on('broadcast', { event: EVENT }, ({ payload }) => handler(payload));
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Нет связи с сервером. Проверьте интернет.')), 10000);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer);
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer);
        reject(new Error('Нет связи с сервером. Проверьте интернет.'));
      }
    });
  });
  return {
    post: (env) => void channel.send({ type: 'broadcast', event: EVENT, payload: env }),
    listen: (cb) => (handler = cb),
    close: () => void supabase.removeChannel(channel),
  };
}

/** Opens the room's channel; rejects with a Russian text when there is no connection */
export async function openDuel(code: string, role: DuelRole): Promise<DuelLink> {
  const ch = await openChannel(`duel-${code}`);
  return pairedLink(role, code, (env) => ch.post(env), (cb) => ch.listen((env) => cb(env as Envelope)), () => ch.close());
}

/**
 * A room of many (the brawl, src/brawl.ts): every message carries its sender's random id and, when it
 * is meant for one player, the addressee's. No pairing: the room's host keeps the list of players.
 */
export interface RoomLink<M extends { t: string }> {
  me: string;
  code: string;
  send(msg: M, to?: string): void;
  onMessage(cb: (msg: M, from: string) => void): void;
  close(): void;
}

export async function openRoom<M extends { t: string }>(code: string): Promise<RoomLink<M>> {
  const ch = await openChannel(`brawl-${code}`);
  const me = Math.random().toString(36).slice(2, 10);
  let handler: (msg: M, from: string) => void = () => {};
  ch.listen((raw) => {
    const env = raw as (M & { from?: unknown; to?: unknown }) | null;
    if (!env || typeof env !== 'object' || typeof env.from !== 'string' || env.from === me) return;
    if (env.to !== undefined && env.to !== me) return;
    if (typeof env.t !== 'string') return;
    const { from, to: _to, ...msg } = env;
    handler(msg as unknown as M, from as string);
  });
  return {
    me,
    code,
    send: (msg, to) => ch.post({ ...msg, from: me, ...(to !== undefined ? { to } : {}) }),
    onMessage: (cb) => (handler = cb),
    close: () => ch.close(),
  };
}
