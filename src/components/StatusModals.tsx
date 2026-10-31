/**
 * Status Modals: Pause, Victory, Defeat, and How-To-Play Guide
 */

import { RunStats } from './RunStats';
import type { RunSummary } from '../game/engine';
import React, { useState } from 'react';
import { StarIcon } from './Icons';
import { sound } from '../game/audio';
import { CONFIG } from '../game/config';
import { useFullscreen, isStandalone, HOME_SCREEN_HINT } from '../fullscreen';

// -------------------------------------------------------------
// Pause Modal
// -------------------------------------------------------------
interface PauseModalProps {
  duel?: boolean; // a duel goes on behind this menu and cannot be restarted
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
  duel = false,
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
  const fullscreen = useFullscreen();
  const [showHint, setShowHint] = useState(false);
  return (
    <div className="fixed inset-0 bg-black/85 flex flex-col items-center overflow-y-auto p-4 z-50">
      <div className="my-auto bg-[#171520] border border-[#3b354a] rounded-xl p-5 max-w-sm w-full shadow-2xl text-[#f4f2e6]">
        <h2 className="text-xl font-black text-center text-amber-300 tracking-wider mb-4">
          {duel ? 'МЕНЮ' : 'ПАУЗА'}
        </h2>
        {duel && (
          <p className="text-xs text-stone-300 text-center -mt-2 mb-4">
            Дуэль не останавливается: волны идут у обоих по общим часам.
          </p>
        )}

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
          {!isStandalone() && (
            <button
              type="button"
              onClick={() => (fullscreen.supported ? fullscreen.toggle() : setShowHint(!showHint))}
              className="w-full min-h-[40px] py-2 px-4 rounded bg-[#221f2d] hover:bg-[#2c283a] text-stone-200 border border-[#383347] font-semibold text-xs transition-colors cursor-pointer"
            >
              {fullscreen.active ? 'Выйти из полноэкранного режима (F)' : 'Во весь экран (F)'}
            </button>
          )}
          {showHint && <p className="text-xs text-stone-300 leading-relaxed">{HOME_SCREEN_HINT}</p>}
          {!duel && (
          <button
            type="button"
            onClick={onRestart}
            className="w-full min-h-[40px] py-2 px-4 rounded bg-[#221f2d] hover:bg-[#2c283a] text-stone-200 border border-[#383347] font-semibold text-xs transition-colors cursor-pointer"
          >
            Повторить уровень
          </button>
          )}
          <button
            type="button"
            onClick={onToMenu}
            className="w-full min-h-[40px] py-2 px-4 rounded bg-[#181622] hover:bg-[#221f2d] text-stone-400 hover:text-stone-200 border border-[#2a2636] font-semibold text-xs transition-colors cursor-pointer"
          >
            {duel ? 'Сдаться и выйти в меню' : 'В главное меню'}
          </button>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Duel Result Modal
// -------------------------------------------------------------
export type DuelOutcome = 'won' | 'lost' | 'left' | 'gone';

const DUEL_OUTCOME_TEXT: Record<DuelOutcome, string> = {
  won: 'Замок соперника пал.',
  left: 'Соперник сдался и вышел из дуэли.',
  gone: 'Соперник пропал из сети.',
  lost: 'Враги прорвали оборону и захватили ваш замок.',
};

export function DuelResultModal({ outcome, wave, stats, onToMenu }: { outcome: DuelOutcome; wave: number; stats?: RunSummary | null; onToMenu: () => void }) {
  const won = outcome !== 'lost';
  return (
    <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50">
      <div
        className={`bg-[#171520] border-2 ${won ? 'border-amber-500/70' : 'border-red-800/70'} rounded-xl p-4 short:p-3 max-w-sm w-full max-h-[94vh] overflow-y-auto shadow-2xl text-center text-[#f4f2e6]`}
      >
        <h2 className={`text-2xl font-black tracking-wider mb-2 ${won ? 'text-amber-300' : 'text-red-400'}`}>
          {won ? 'ПОБЕДА В ДУЭЛИ' : 'ПОРАЖЕНИЕ'}
        </h2>
        <p className="text-xs text-stone-300 mb-2">{DUEL_OUTCOME_TEXT[outcome]}</p>
        <p className="text-sm font-bold text-amber-300 mb-5 bg-[#121118] py-2 px-3 rounded border border-[#2d2938]">
          Волна {wave}
        </p>
        <RunStats stats={stats ?? null} />
        <button
          type="button"
          onClick={onToMenu}
          className="w-full min-h-[44px] py-2 px-4 rounded bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold text-sm tracking-wide cursor-pointer"
        >
          В меню
        </button>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Victory Modal
// -------------------------------------------------------------
interface VictoryModalProps {
  stats?: RunSummary | null;
  level: number;
  stars: number;
  lives: number;
  onNext: () => void;
  onRestart: () => void;
  onToMenu: () => void;
}

export function VictoryModal({
  stats,
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
      <div className="bg-[#171520] border-2 border-amber-500/70 rounded-xl p-4 short:p-3 max-w-sm w-full max-h-[94vh] overflow-y-auto shadow-2xl text-center text-[#f4f2e6]">
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
        <RunStats stats={stats ?? null} />

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
  stats?: RunSummary | null;
  wave: number;
  endless: boolean;
  best: number; // best wave reached in endless mode on this level, this run included
  onRestart: () => void;
  onToMenu: () => void;
}

export function DefeatModal({ stats, wave, endless, best, onRestart, onToMenu }: DefeatModalProps) {
  // The record before this run: App saves the new one right after this modal appears
  const [prevBest] = useState(best);
  return (
    <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50">
      <div className="bg-[#171520] border-2 border-red-800/70 rounded-xl p-4 short:p-3 max-w-sm w-full max-h-[94vh] overflow-y-auto shadow-2xl text-center text-[#f4f2e6]">
        <h2 className="text-2xl font-black text-red-400 tracking-wider mb-2">
          РУБЕЖ ПАЛ
        </h2>
        <p className="text-xs text-stone-300 mb-2">
          Враги прорвали оборону и захватили замок.
        </p>
        <p className="text-sm font-bold text-amber-300 mb-3 bg-[#121118] py-2 px-3 rounded border border-[#2d2938]">
          {endless ? `Вы продержались до волны ${wave}` : `Вы дошли до волны ${Math.min(wave, 12)} из 12`}
          {endless && (
            <span className="block text-xs font-semibold text-stone-400 mt-0.5">
              {wave > prevBest ? 'Это новый рекорд рубежа!' : `Рекорд рубежа: волна ${prevBest}`}
            </span>
          )}
        </p>
        <RunStats stats={stats ?? null} />

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

          {/* Waves */}
          <section>
            <h3 className="font-bold text-amber-200 text-sm mb-1">Волны и таймер</h3>
            <p className="text-stone-300">
              Между волнами идёт таймер: 30 с до первой волны и 20 с после каждой зачищенной. Он идёт в реальном времени и не зависит от скорости игры. Когда он доходит до нуля, волна начинается сама. Запустите её раньше и получите 1 золото за каждую оставшуюся секунду. Скорость игры (кнопка ×1 на поле, клавиши + и −): ×0,5, ×1, ×1,5, ×2, ×2,5, ×3 и ×5.
            </p>
          </section>

          {/* Merging */}
          <section>
            <h3 className="font-bold text-amber-200 text-sm mb-1">Слияние и специализации</h3>
            <p className="text-stone-300">
              Три одинаковые башни одного уровня можно бесплатно слить в одну башню высшего уровня.
              При слиянии до Ур.2 открывается выбор одной из 3 необратимых специализаций (урон ×3.3, радиус ×1.1).
              Три башни Ур.2 одного типа объединяются в финальный Ур.3 (урон ещё ×3.3) даже с разными специализациями:
              башня Ур.3 получает все три. Одинаковые специализации складываются: три «Снайпера» дают его прибавку втрое.
            </p>
            <p className="text-stone-400 mt-1">
              Под башней на поле — значок свойств: двухбуквенный код и сила, например «Ог×2·Мр» — Огонь ×2 и Мороз.
              Стрелок: Сн Снайпер, Гр Град стрел, Ох Охотник. Жрец: Об Оберег, Пр Проклятие, Кр Кара.
              Маг: Ог Огонь, Мл Молния, Мр Мороз. Баллиста: Тр Таран, Ос Осада, Кз Казнь.
              У пары из связки у каждой башни свой значок.
            </p>
          </section>

          {/* Moving towers */}
          <section>
            <h3 className="font-bold text-amber-200 text-sm mb-1">Перестановка башен</h3>
            <p className="text-stone-300">
              Пока идёт таймер между волнами и на поле нет врагов, башню можно переставить бесплатно: выберите её и коснитесь свободной клетки или перетащите мышью.
            </p>
          </section>

          {/* Endless mode */}
          <section>
            <h3 className="font-bold text-amber-200 text-sm mb-1">Бесконечный режим</h3>
            <p className="text-stone-300">
              Выбирается в меню. Волны идут без конца, босс приходит каждую 12-ю волну, враги с каждой волной крепче, а после каждых 12 волн их больше. Между волнами {CONFIG.endless.between} с. Рекорд волны хранится для каждого рубежа.
              После 12-й волны враги крепнут заметно быстрее, боссы растут вместе с волной, а с каждым кругом у врагов прибавляется броня.
            </p>
            <p className="text-stone-300 mt-1">
              <span className="text-amber-200 font-semibold">Сила стола.</span> Башни на поле имеют вес: Ур.1 — 1, Ур.2 — 3, Ур.3 — 9, связка — 1, тройная — 3.
              Пока вес не больше {CONFIG.supply.free}, цены обычные. Дальше каждые {CONFIG.supply.step} силы покупка башен и связок в лавке дорожает
              ещё на {Math.round((CONFIG.supply.growth - 1) * 100)} % (цены множатся). Слияние бесплатно и вес не меняет, а продажа
              платит {Math.round(CONFIG.supply.sellRatio * 100)} % базовой цены, так что дорогую башню выгодно сливать и улучшать, а не заменять новыми. Вес и цены видны в верхней панели. То же правило действует в дуэли: у каждого игрока свой стол. После {CONFIG.supply.killDecayFrom}-й волны награда за каждого врага падает на {Math.round((1 - CONFIG.supply.killDecay) * 1000) / 10} % за волну (не ниже {Math.round(CONFIG.supply.killFloor * 100)} %).
            </p>
          </section>

          {/* Binder */}
          <section>
            <h3 className="font-bold text-sm mb-1" style={{ color: '#3ed6c4' }}>Связка</h3>
            <p className="text-stone-300">
              Редкая карта лавки: появляется с 3-го яруса, и чем выше ярус, тем чаще (80 золота). Поставьте связку на поле, выберите башню, нажмите «Связать» и коснитесь башни другого вида. Связать можно только башни Ур.2 и Ур.3 (в любом сочетании). Обе башни станут одной: она стреляет как каждая из них, с их уровнями и специализациями, а связка тратится. Связанную башню больше нельзя сливать; при продаже возвращается доля за обе башни и связку.
            </p>
            <p className="text-stone-300 mt-1">
              Три связки на поле сливаются в «Тройную связку» с 5-го яруса лавки: выберите связку и нажмите «Слить» (M). Тройная связка поднимает любую башню или пару на один уровень, кроме Ур.3: нажмите «Усилить» (B) и коснитесь башни. Башня, ставшая Ур.2, получает свойство; ставшая Ур.3 — своё свойство трижды.
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
              Пробел — начать волну • P — пауза • F — во весь экран • 1–5 — купить карту • R — обновить лавку • U — поднять ярус • M — слить • B — связать • S — продать • Tab — цель • Esc — отмена
            </p>
          </section>
          <p className="text-stone-500 text-[11px]">
            По вопросам сотрудничества:{' '}
            <a href="https://t.me/popataras" target="_blank" rel="noopener noreferrer" className="text-amber-300 hover:underline">
              Telegram @popataras
            </a>
          </p>
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
