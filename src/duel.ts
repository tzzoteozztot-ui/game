/**
 * Duel link for «Тёмный рубеж» (Артур, 2026-10-25): two players, each plays their own field,
 * only a few messages go between them (start, state, defeat). Supabase Realtime broadcast on a
 * channel named after the room code; no table, no account needed.
 * `?duel=local` in the address uses BroadcastChannel instead: two tabs of one browser, for testing
 * without the network.
 */

import type { RealtimeChannel } from '@supabase/supabase-js';
import { client, cloudEnabled } from './cloud';

export type DuelRole = 'host' | 'guest';

export type DuelMessage =
  | { t: 'hello' } // guest → host: I am in the room
  | { t: 'start'; level: number; inMs: number } // host → guest: the map, and the duel starts in inMs
  | { t: 'state'; lives: number; wave: number } // both, every few seconds; also a sign of life
  | { t: 'lost'; wave: number } // my castle fell
  | { t: 'leave' }; // I left the duel

export interface DuelLink {
  role: DuelRole;
  code: string;
  send(msg: DuelMessage): void;
  onMessage(cb: (msg: DuelMessage) => void): void;
  close(): void;
}

const EVENT = 'm';

export const duelAvailable = cloudEnabled || isLocalDuel();

function isLocalDuel(): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('duel') === 'local';
}

/** Four digits, the room's name */
export function newRoomCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/** Opens the room's channel; rejects with a Russian text when there is no connection */
export async function openDuel(code: string, role: DuelRole): Promise<DuelLink> {
  return isLocalDuel() ? openLocal(code, role) : openRealtime(code, role);
}

async function openRealtime(code: string, role: DuelRole): Promise<DuelLink> {
  const supabase = await client();
  let handler: (msg: DuelMessage) => void = () => {};
  const channel: RealtimeChannel = supabase.channel(`duel-${code}`, { config: { broadcast: { self: false } } });
  channel.on('broadcast', { event: EVENT }, ({ payload }) => handler(payload as DuelMessage));
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
    role,
    code,
    send: (msg) => void channel.send({ type: 'broadcast', event: EVENT, payload: msg }),
    onMessage: (cb) => (handler = cb),
    close: () => void supabase.removeChannel(channel),
  };
}

function openLocal(code: string, role: DuelRole): DuelLink {
  const bc = new BroadcastChannel(`dark_frontier_duel_${code}`);
  return {
    role,
    code,
    send: (msg) => bc.postMessage(msg),
    onMessage: (cb) => (bc.onmessage = (e) => cb(e.data as DuelMessage)),
    close: () => bc.close(),
  };
}
