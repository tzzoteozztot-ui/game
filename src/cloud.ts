/**
 * Account and progress sync for «Тёмный рубеж» (Supabase, chosen by Артур).
 * Sign-in by a 6-digit code from an e-mail, no password. The game works without an account:
 * progress stays in localStorage, the account only copies it between devices.
 * The key below is the public (anon) one: row level security lets a player read and write
 * only their own row in `progress`.
 */

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { Progress, normalizeProgress } from './progress';

const SUPABASE_URL: string = 'https://opxkyqszjirxncjdvwff.supabase.co';
const SUPABASE_ANON_KEY: string = '';

export const cloudEnabled = SUPABASE_URL !== '' && SUPABASE_ANON_KEY !== '';

let clientPromise: Promise<SupabaseClient> | null = null;

// Loaded on demand: the game starts (and works offline) without the library
function client(): Promise<SupabaseClient> {
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: 'dark_frontier_auth' },
      })
    );
  }
  return clientPromise;
}

/** Russian text for the errors a player can meet */
function message(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  if (/rate limit|too many|security purposes/i.test(text)) return 'Слишком часто. Подождите минуту и попробуйте снова.';
  if (/expired|invalid|otp|token/i.test(text)) return 'Код не подошёл или устарел. Запросите новый.';
  if (/email/i.test(text)) return 'Проверьте адрес почты.';
  if (/fetch|network|failed to/i.test(text)) return 'Нет связи с сервером. Проверьте интернет.';
  return 'Не получилось. Попробуйте ещё раз.';
}

export async function currentUser(): Promise<User | null> {
  if (!cloudEnabled) return null;
  try {
    const { data } = await (await client()).auth.getSession();
    return data.session?.user ?? null;
  } catch {
    return null;
  }
}

export function onUserChange(cb: (user: User | null) => void): () => void {
  if (!cloudEnabled) return () => {};
  let unsub = () => {};
  client().then((c) => {
    const { data } = c.auth.onAuthStateChange((_event, session) => cb(session?.user ?? null));
    unsub = () => data.subscription.unsubscribe();
  });
  return () => unsub();
}

/** Sends the sign-in code; returns an error text or null */
export async function sendCode(email: string): Promise<string | null> {
  try {
    const { error } = await (await client()).auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    return error ? message(error) : null;
  } catch (e) {
    return message(e);
  }
}

export async function verifyCode(email: string, code: string): Promise<string | null> {
  try {
    const { error } = await (await client()).auth.verifyOtp({ email, token: code, type: 'email' });
    return error ? message(error) : null;
  } catch (e) {
    return message(e);
  }
}

export async function signOut() {
  try {
    await (await client()).auth.signOut();
  } catch {
    // offline: the session is cleared locally anyway
  }
}

export async function loadCloudProgress(userId: string): Promise<Progress | null> {
  const { data, error } = await (await client()).from('progress').select('data').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data ? normalizeProgress(data.data) : null;
}

export async function saveCloudProgress(userId: string, p: Progress) {
  const { error } = await (await client())
    .from('progress')
    .upsert({ user_id: userId, data: p, updated_at: new Date().toISOString() });
  if (error) throw error;
}
