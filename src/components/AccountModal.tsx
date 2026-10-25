/**
 * Account window for «Тёмный рубеж»: sign-in by a code from e-mail, sync status, sign-out.
 */

import React, { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { sendCode, verifyCode, signOut } from '../cloud';

export type SyncState = 'idle' | 'syncing' | 'ok' | 'error';

interface AccountModalProps {
  user: User | null;
  syncState: SyncState;
  onClose: () => void;
}

const SYNC_TEXT: Record<SyncState, string> = {
  idle: '',
  syncing: 'Синхронизация…',
  ok: 'Прогресс сохранён в аккаунте',
  error: 'Не удалось связаться с сервером. Прогресс сохранён на этом устройстве и уйдёт в аккаунт позже.',
};

export function AccountModal({ user, syncState, onClose }: AccountModalProps) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input =
    'w-full min-h-[44px] px-3 rounded bg-[#121118] border border-[#383347] text-sm text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-amber-500';
  const primary =
    'w-full min-h-[44px] py-2 px-4 rounded bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-black text-sm cursor-pointer';
  const secondary =
    'w-full min-h-[40px] py-2 px-4 rounded bg-[#181622] hover:bg-[#221f2d] text-stone-400 hover:text-stone-200 border border-[#2a2636] font-semibold text-xs cursor-pointer';

  const run = async (action: () => Promise<string | null>, onOk: () => void) => {
    setBusy(true);
    setError(null);
    const err = await action();
    setBusy(false);
    if (err) setError(err);
    else onOk();
  };

  const submitEmail = (e: React.FormEvent) => {
    e.preventDefault();
    const addr = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
      setError('Проверьте адрес почты.');
      return;
    }
    run(() => sendCode(addr), () => setStep('code'));
  };

  const submitCode = (e: React.FormEvent) => {
    e.preventDefault();
    const digits = code.replace(/\D/g, '');
    if (digits.length < 6) {
      setError('Введите код из письма.');
      return;
    }
    run(() => verifyCode(email.trim(), digits), onClose);
  };

  return (
    <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 overflow-y-auto">
      {/* Keys typed here must not reach the game's shortcuts */}
      <div
        className="my-auto bg-[#171520] border-2 border-[#3b354a] rounded-xl p-5 max-w-sm w-full shadow-2xl text-[#f4f2e6]"
        onKeyDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-black text-amber-300 tracking-wide mb-1 text-center">Аккаунт</h2>

        {user ? (
          <div className="flex flex-col gap-3 text-center">
            <p className="text-xs text-stone-300">
              Вы вошли как <strong className="text-stone-100">{user.email}</strong>. Открытые уровни, звёзды и
              рекорды общие на всех устройствах, где вы вошли.
            </p>
            {syncState !== 'idle' && (
              <p className={`text-xs ${syncState === 'error' ? 'text-red-300' : 'text-emerald-300'}`}>
                {SYNC_TEXT[syncState]}
              </p>
            )}
            <button type="button" className={primary} onClick={onClose}>
              Готово
            </button>
            <button
              type="button"
              className={secondary}
              onClick={async () => {
                await signOut();
                onClose();
              }}
            >
              Выйти из аккаунта
            </button>
          </div>
        ) : step === 'email' ? (
          <form className="flex flex-col gap-3" onSubmit={submitEmail}>
            <p className="text-xs text-stone-300 text-center">
              Войдите, чтобы прогресс был общим на телефоне и компьютере. Пароль не нужен: на почту
              придёт код. Без входа игра работает как раньше.
            </p>
            <input
              className={input}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="Адрес почты"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
            {error && <p className="text-xs text-red-300">{error}</p>}
            <button type="submit" className={primary} disabled={busy}>
              {busy ? 'Отправляем…' : 'Получить код'}
            </button>
            <button type="button" className={secondary} onClick={onClose}>
              Закрыть
            </button>
          </form>
        ) : (
          <form className="flex flex-col gap-3" onSubmit={submitCode}>
            <p className="text-xs text-stone-300 text-center">
              Код отправлен на <strong className="text-stone-100">{email.trim()}</strong>. Если письма нет,
              проверьте папку «Спам».
            </p>
            <input
              className={`${input} text-center tracking-[0.4em] text-lg`}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Код"
              maxLength={10}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
            />
            {error && <p className="text-xs text-red-300">{error}</p>}
            <button type="submit" className={primary} disabled={busy}>
              {busy ? 'Проверяем…' : 'Войти'}
            </button>
            <button
              type="button"
              className={secondary}
              onClick={() => {
                setStep('email');
                setCode('');
                setError(null);
              }}
            >
              Другой адрес или новый код
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
