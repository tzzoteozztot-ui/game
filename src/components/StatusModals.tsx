/**
 * Status Modals: Pause, Victory, Defeat, and How-To-Play Guide
 */

import React from 'react';
import { StarIcon } from './Icons';
import { sound } from '../game/audio';

// -------------------------------------------------------------
// Pause Modal
// -------------------------------------------------------------
interface PauseModalProps {
  onResume: () => void;
  onRestart: () => void;
  onToMenu: () => void;
  musicVol: number;
  sfxVol: number;
  isMuted: boolean;
  onMusicChange: (val: number) => void;
  onSfxChange: (val: number) => void;
  onToggleMute: () => void;
}

export function PauseModal({
  onResume,
  onRestart,
  onToMenu,
  musicVol,
  sfxVol,
  isMuted,
  onMusicChange,
  onSfxChange,
  onToggleMute,
}: PauseModalProps) {
  return (
    <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50">
      <div className="bg-[#171520] border border-[#3b354a] rounded-xl p-5 max-w-sm w-full shadow-2xl text-[#f4f2e6]">
        <h2 className="text-xl font-black text-center text-amber-300 tracking-wider mb-4">
          ПАУЗА
        </h2>

        {/* Sound Controls */}
        <div className="bg-[#121118] p-3 rounded-lg border border-[#2d2938] mb-4 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-stone-300">
            <span>Звук</span>
            <button
              type="button"
              onClick={onToggleMute}
              className="px-2 py-0.5 rounded bg-[#221f2d] border border-[#383347] text-xs cursor-pointer"
            >
              {isMuted ? 'Включить' : 'Выключить'}
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-stone-400 w-16">Музыка</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={musicVol}
              onChange={(e) => onMusicChange(parseFloat(e.target.value))}
              className="flex-1 accent-amber-500 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-stone-400 w-16">Эффекты</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={sfxVol}
              onChange={(e) => onSfxChange(parseFloat(e.target.value))}
              className="flex-1 accent-amber-500 cursor-pointer"
            />
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onResume}
            className="w-full min-h-[42px] py-2 px-4 rounded bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold text-sm tracking-wide transition-colors cursor-pointer"
          >
            Продолжить (P / Esc)
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="w-full min-h-[40px] py-2 px-4 rounded bg-[#221f2d] hover:bg-[#2c283a] text-stone-200 border border-[#383347] font-semibold text-xs transition-colors cursor-pointer"
          >
            Повторить уровень
          </button>
          <button
            type="button"
            onClick={onToMenu}
            className="w-full min-h-[40px] py-2 px-4 rounded bg-[#181622] hover:bg-[#221f2d] text-stone-400 hover:text-stone-200 border border-[#2a2636] font-semibold text-xs transition-colors cursor-pointer"
          >
            В главное меню
          </button>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Victory Modal
// -------------------------------------------------------------
interface VictoryModalProps {
  level: number;
  stars: number;
  lives: number;
  onNext: () => void;
  onRestart: () => void;
  onToMenu: () => void;
}

export function VictoryModal({
  level,
  stars,
  lives,
  onNext,
  onRestart,
  onToMenu,
}: VictoryModalProps) {
  const isFinal = level >= 5;

  return (
    <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50">
      <div className="bg-[#171520] border-2 border-amber-500/70 rounded-xl p-6 max-w-sm w-full shadow-2xl text-center text-[#f4f2e6]">
        <h2 className="text-2xl font-black text-amber-300 tracking-wider mb-1">
          {isFinal ? 'ВЕЛИКАЯ ПОБЕДА!' : 'РУБЕЖ УДЕРЖАН!'}
        </h2>
        <p className="text-xs text-stone-400 mb-4">
          {isFinal
            ? 'Все 5 рубежей защищены, Цитадель сумерек пала!'
            : `Уровень ${level} успешно пройден. Все 12 волн отбиты.`}
        </p>

        {/* Star Rating */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <StarIcon filled={stars >= 1} size={32} />
          <StarIcon filled={stars >= 2} size={38} />
          <StarIcon filled={stars >= 3} size={32} />
        </div>

        <div className="text-xs text-stone-300 mb-5 bg-[#121118] py-2 px-3 rounded border border-[#2d2938]">
          Сохранено жизней замка: <span className="font-bold text-red-400">{lives} / 20</span>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          {!isFinal && (
            <button
              type="button"
              onClick={onNext}
              className="w-full min-h-[44px] py-2 px-4 rounded bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-sm tracking-wide transition-colors cursor-pointer"
            >
              Далее →
            </button>
          )}
          <button
            type="button"
            onClick={onRestart}
            className="w-full min-h-[40px] py-2 px-4 rounded bg-[#221f2d] hover:bg-[#2c283a] text-stone-200 border border-[#383347] font-semibold text-xs cursor-pointer"
          >
            Повторить
          </button>
          <button
            type="button"
            onClick={onToMenu}
            className="w-full min-h-[40px] py-2 px-4 rounded bg-[#181622] hover:bg-[#221f2d] text-stone-400 hover:text-stone-200 border border-[#2a2636] font-semibold text-xs cursor-pointer"
          >
            В меню
          </button>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Defeat Modal
// -------------------------------------------------------------
interface DefeatModalProps {
  wave: number;
  onRestart: () => void;
  onToMenu: () => void;
}

export function DefeatModal({ wave, onRestart, onToMenu }: DefeatModalProps) {
  return (
    <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50">
      <div className="bg-[#171520] border-2 border-red-800/70 rounded-xl p-6 max-w-sm w-full shadow-2xl text-center text-[#f4f2e6]">
        <h2 className="text-2xl font-black text-red-400 tracking-wider mb-2">
          РУБЕЖ ПАЛ
        </h2>
        <p className="text-xs text-stone-300 mb-2">
          Враги прорвали оборону и захватили замок.
        </p>
        <p className="text-sm font-bold text-amber-300 mb-5 bg-[#121118] py-2 px-3 rounded border border-[#2d2938]">
          Вы дошли до волны {Math.min(wave, 12)} из 12
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onRestart}
            className="w-full min-h-[44px] py-2 px-4 rounded bg-red-800 hover:bg-red-700 text-stone-100 font-bold text-sm tracking-wide transition-colors cursor-pointer"
          >
            Повторить
          </button>
          <button
            type="button"
            onClick={onToMenu}
            className="w-full min-h-[40px] py-2 px-4 rounded bg-[#181622] hover:bg-[#221f2d] text-stone-400 hover:text-stone-200 border border-[#2a2636] font-semibold text-xs cursor-pointer"
          >
            В меню
          </button>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// How-To-Play Guide Modal
// -------------------------------------------------------------
export function HowToPlayModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50">
      <div className="bg-[#171520] border border-[#3b354a] rounded-xl p-5 sm:p-6 max-w-lg w-full max-h-[88vh] overflow-y-auto shadow-2xl text-[#f4f2e6] text-xs leading-relaxed">
        <div className="flex items-center justify-between pb-3 border-b border-[#2d2938] mb-4">
          <h2 className="text-lg font-black text-amber-300 tracking-wide">
            Как играть в «Тёмный рубеж»
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded text-stone-400 hover:text-stone-100 hover:bg-[#282434] transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          {/* Goal */}
          <section>
            <h3 className="font-bold text-amber-200 text-sm mb-1">Цель игры</h3>
            <p className="text-stone-300">
              Защитить замок от 12 волн чудовищ и победить босса каждой фракции. У замка 20 жизней. Обычный враг отнимает 1 жизнь, босс — 5.
            </p>
          </section>

          {/* Shop & Placement */}
          <section>
            <h3 className="font-bold text-amber-200 text-sm mb-1">Лавка и размещение</h3>
            <p className="text-stone-300">
              В лавке доступно 5 карточек башен. Тапните карточку и выберите любую свободную клетку земли вне дороги. Повторный тап или Esc отменяют выбор. Повышайте ярус лавки за золото, чтобы открывать готовые триплеты (★ Ур.2).
            </p>
          </section>

          {/* Merging */}
          <section>
            <h3 className="font-bold text-amber-200 text-sm mb-1">Слияние и специализации</h3>
            <p className="text-stone-300">
              Три одинаковые башни одного уровня можно бесплатно слить в одну башню высшего уровня.
              При слиянии до Ур.2 открывается выбор одной из 3 необратимых специализаций (урон ×3.3, радиус ×1.1).
              Три башни Ур.2 с одной специализацией объединяются в финальный Ур.3 (урон ещё ×3.3).
            </p>
          </section>

          {/* Priorities */}
          <section>
            <h3 className="font-bold text-amber-200 text-sm mb-1">Приоритет цели</h3>
            <p className="text-stone-300">
              Каждой башне можно назначить приоритет огня: «Первый» (меньше всего осталось до замка), «Сильнейший» (больше текущего HP) или «Ближайший».
            </p>
          </section>

          {/* Factions */}
          <section>
            <h3 className="font-bold text-amber-200 text-sm mb-1">Особенности фракций</h3>
            <ul className="list-disc pl-4 space-y-1 text-stone-300">
              <li><strong className="text-stone-100">Орки:</strong> при HP &lt; 50% бегут на 30% быстрее.</li>
              <li><strong className="text-stone-100">Нежить:</strong> пехотинцы и разведчики воскресают один раз через 1 с.</li>
              <li><strong className="text-stone-100">Культисты льда:</strong> все замедления ослаблены в 2 раза.</li>
              <li><strong className="text-stone-100">Демоны:</strong> огнеупорная кожа (урон огня снижен на 50%).</li>
              <li><strong className="text-stone-100">Тёмные эльфы:</strong> 25% физических выстрелов летят мимо.</li>
            </ul>
          </section>

          {/* Hotkeys */}
          <section>
            <h3 className="font-bold text-amber-200 text-sm mb-1">Горячие клавиши</h3>
            <p className="text-stone-400 text-[11px]">
              Пробел — начать волну • P — пауза • 1–5 — купить карту • R — обновить лавку • U — поднять ярус • M — слить • S — продать • Tab — цель • Esc — отмена
            </p>
          </section>
        </div>

        <div className="mt-5 pt-3 border-t border-[#2d2938]">
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[40px] py-2 px-4 rounded bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold text-xs uppercase tracking-wider cursor-pointer"
          >
            Понятно, в бой
          </button>
        </div>
      </div>
    </div>
  );
}
