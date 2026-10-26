/**
 * Main Menu Screen for «Тёмный рубеж»
 * Dark fantasy styling, 5 level cards, difficulty picker, audio settings.
 */

import React, { useState } from 'react';
import { CONFIG, Difficulty } from '../game/config';

export type GameMode = 'campaign' | 'endless' | 'duel';

const MODE_LABELS: Record<GameMode, string> = { campaign: 'Кампания', endless: 'Бесконечный', duel: 'Дуэль' };
const MODE_TITLES: Record<GameMode, string> = {
  campaign: '12 волн, в последней босс',
  endless: 'Волны без конца, босс каждую 12-ю волну, враги всё сильнее',
  duel: 'Двое игроков, у каждого своё поле, волны выходят разом',
};
import { StarIcon, LockIcon, SoundIcon } from './Icons';
import { useFullscreen, isStandalone, HOME_SCREEN_HINT } from '../fullscreen';

interface MainMenuProps {
  unlockedLevel: number; // 1..5
  levelStars: Record<number, number>; // level -> stars
  selectedDifficulty: Difficulty;
  mode: GameMode;
  duelAvailable: boolean; // duel needs the server (or ?duel=local)
  endlessBest: Record<number, number>; // level -> best wave reached in endless mode
  musicVol: number;
  sfxVol: number;
  isMuted: boolean;
  selectedLevel: number;
  onSelectLevel: (lvl: number) => void; // highlights the card; the game starts with onPlay
  onPlay: () => void;
  onChangeDifficulty: (diff: Difficulty) => void;
  onChangeMode: (mode: GameMode) => void;
  onOpenHowToPlay: () => void;
  accountLabel: string | null; // null when accounts are not set up
  onOpenAccount: () => void;
  onMusicChange: (val: number) => void;
  onSfxChange: (val: number) => void;
  onToggleMute: () => void;
}

export function MainMenu({
  unlockedLevel,
  levelStars,
  selectedDifficulty,
  mode,
  duelAvailable,
  endlessBest,
  musicVol,
  sfxVol,
  isMuted,
  selectedLevel,
  onSelectLevel,
  onPlay,
  onChangeDifficulty,
  onChangeMode,
  onOpenHowToPlay,
  accountLabel,
  onOpenAccount,
  onMusicChange,
  onSfxChange,
  onToggleMute,
}: MainMenuProps) {
  const [showSoundSettings, setShowSoundSettings] = useState(false);
  const [showHomeScreenHint, setShowHomeScreenHint] = useState(false);
  const fullscreen = useFullscreen();
  const standalone = isStandalone();
  const endless = mode === 'endless';
  const modes: GameMode[] = duelAvailable ? ['campaign', 'endless', 'duel'] : ['campaign', 'endless'];

  return (
    <div className="fixed inset-0 z-30 bg-[#121118] text-[#f4f2e6] flex flex-col items-center p-2 sm:p-3 overflow-y-auto select-none gap-1 sm:gap-2">
      {/* my-auto centres the menu and lets a screen that is still too low scroll to its top.
          On a phone on its side (short) levels go left and the controls right, all on one screen. */}
      <div className="my-auto w-full max-w-2xl flex flex-col items-center gap-1 sm:gap-2 short:max-w-4xl short:flex-row short:items-center short:gap-3">
      <div className="w-full short:flex-1 short:min-w-0 flex flex-col items-center">
      {/* Title Header with inline SVG Lockup */}
      <div className="text-center short:flex short:items-center short:gap-2 short:text-left">
        {/* Crest lockup */}
        <div className="w-10 h-7 sm:w-14 sm:h-10 mx-auto mb-1.5 sm:mb-2.5 flex items-center justify-center short:mx-0 short:mb-0 short:w-10 short:h-8 shrink-0">
          <svg viewBox="0 0 64 48" className="w-full h-full" fill="none">
            <path
              d="M32 4L48 18V36L32 46L16 36V18L32 4Z"
              fill="#1e1824"
              stroke="#d9b44a"
              strokeWidth="2"
            />
            <path d="M32 10L42 20V32L32 38L22 32V20L32 10Z" fill="#322238" />
            <polygon points="32,16 36,26 44,26 38,32 40,40 32,35 24,40 26,32 20,26 28,26" fill="#f4c06a" />
          </svg>
        </div>

        <div>
        <h1 className="text-xl sm:text-3xl short:text-xl font-black text-amber-300 tracking-widest uppercase drop-shadow leading-none">
          Тёмный рубеж
        </h1>
        <p className="text-[10px] sm:text-xs text-stone-400 tracking-wider font-semibold mt-0.5">
          Tower Defense в стиле тёмного фэнтези
        </p>
        </div>
      </div>

      {/* Level Selection Cards */}
      <div className="w-full max-w-2xl my-1.5 sm:my-3 short:mb-0 short:mt-2">
        <div className="flex items-center justify-between mb-1 px-1">
          <span className="text-[10px] sm:text-xs uppercase font-bold text-stone-400 tracking-wider">
            Выберите рубеж обороны
          </span>
          <span className="text-[10px] sm:text-xs text-amber-400 font-semibold">
            Открыто {Math.min(5, unlockedLevel)} / 5
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-1.5 sm:gap-2">
          {CONFIG.factions.map((f, idx) => {
            const lvl = idx + 1;
            const isUnlocked = lvl <= unlockedLevel;
            const stars = levelStars[lvl] || 0;
            const palette = CONFIG.palettes[idx];
            const isSelected = isUnlocked && lvl === selectedLevel;

            return (
              <button
                key={f.id}
                type="button"
                disabled={!isUnlocked}
                onClick={() => onSelectLevel(lvl)}
                onDoubleClick={() => isUnlocked && onPlay()}
                aria-pressed={isSelected}
                className={`p-2 sm:p-2.5 rounded-lg border text-left flex flex-col justify-between transition-all min-h-[75px] sm:min-h-[96px] short:min-h-[96px] short:p-1.5 cursor-pointer ${
                  isSelected
                    ? 'border-amber-400 bg-[#2a2236] ring-2 ring-amber-500/60 shadow-md'
                    : isUnlocked
                      ? 'border-[#3d384d] bg-[#1a1724] hover:bg-[#252033] hover:border-amber-400 hover:scale-[1.02] shadow-md'
                      : 'border-[#201d29] bg-[#14121c] opacity-40 cursor-not-allowed'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-amber-500">
                      Ур. {lvl}
                    </span>
                    {!isUnlocked && <LockIcon size={12} />}
                  </div>
                  <div className="font-bold text-stone-200 text-xs sm:text-[13px] short:text-xs leading-tight hyphens-auto [overflow-wrap:anywhere]">
                    {f.location}
                  </div>
                  <div className="text-[9px] sm:text-[10px] text-stone-400 mt-0.5">{f.name}</div>
                </div>

                <div className="mt-1.5 pt-1 border-t border-[#262233] flex items-center justify-between">
                  {endless ? (
                    <span className="text-[9px] sm:text-[10px] font-semibold text-amber-300">
                      {endlessBest[lvl] ? `Рекорд: волна ${endlessBest[lvl]}` : 'Рекорда нет'}
                    </span>
                  ) : (
                    <div className="flex items-center gap-0.5">
                      <StarIcon filled={stars >= 1} size={12} />
                      <StarIcon filled={stars >= 2} size={12} />
                      <StarIcon filled={stars >= 3} size={12} />
                    </div>
                  )}
                  <div
                    className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full border border-black/40"
                    style={{ backgroundColor: palette.enemies }}
                    title={`Фракция: ${f.name}`}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      </div>

      {/* Difficulty & Quick Actions */}
      <div className="w-full max-w-md flex flex-col items-center gap-2 short:w-[296px] short:max-w-none short:shrink-0 short:gap-1.5">
        {/* Mode Selector: campaign of 12 waves, endless waves, or a duel of two players */}
        <div className="w-full flex items-center justify-between p-1 bg-[#171520] rounded-lg border border-[#2d2938]">
          <span className="text-xs font-semibold text-stone-400 pl-3 short:pl-2">Режим:</span>
          <div className="flex items-center gap-1">
            {modes.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onChangeMode(m)}
                title={MODE_TITLES[m]}
                className={`${modes.length > 2 ? 'px-2' : 'px-3'} short:px-1.5 py-1.5 min-h-[36px] short:min-h-[34px] rounded text-xs font-bold transition-colors cursor-pointer ${
                  mode === m
                    ? 'bg-amber-600 text-stone-950 font-black'
                    : 'text-stone-400 hover:text-stone-200 hover:bg-[#221f2d]'
                }`}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>
        </div>

        {/* Difficulty Selector (a duel is always on the normal difficulty) */}
        {mode !== 'duel' && (
        <div className="w-full flex items-center justify-between p-1 bg-[#171520] rounded-lg border border-[#2d2938]">
          <span className="text-xs font-semibold text-stone-400 pl-3 short:pl-2">Сложность:</span>
          <div className="flex items-center gap-1">
            {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onChangeDifficulty(d)}
                className={`px-3 short:px-2 py-1.5 min-h-[36px] short:min-h-[34px] rounded text-xs font-bold transition-colors cursor-pointer ${
                  selectedDifficulty === d
                    ? 'bg-amber-600 text-stone-950 font-black'
                    : 'text-stone-400 hover:text-stone-200 hover:bg-[#221f2d]'
                }`}
              >
                {CONFIG.difficulty[d].label}
              </button>
            ))}
          </div>
        </div>
        )}

        {/* Play: starts the selected level in the selected mode */}
        <button
          type="button"
          onClick={onPlay}
          className="w-full min-h-[46px] short:min-h-[42px] py-2 px-4 short:px-2 short:text-xs rounded bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-sm tracking-wider uppercase transition-all shadow-lg shadow-amber-950/50 cursor-pointer active:translate-y-0.5"
        >
          {mode === 'duel' ? 'Дуэль' : 'Играть'}: {CONFIG.factions[selectedLevel - 1].location}
          {mode !== 'duel' && ` · ${endless ? 'бесконечный' : 'кампания'}`}
        </button>

        {/* Buttons Row */}
        <div className={`w-full grid grid-cols-2 gap-2 short:gap-1.5 ${accountLabel ? '' : 'short:grid-cols-3'}`}>
          <button
            type="button"
            onClick={onOpenHowToPlay}
            className="min-h-[40px] px-3 py-2 rounded bg-[#221f2d] hover:bg-[#2c283a] border border-[#383347] text-xs font-bold text-stone-200 transition-colors cursor-pointer"
          >
            Как играть
          </button>
          <button
            type="button"
            onClick={() => setShowSoundSettings(!showSoundSettings)}
            className="min-h-[40px] px-3 py-2 rounded bg-[#221f2d] hover:bg-[#2c283a] border border-[#383347] text-xs font-bold text-stone-200 transition-colors cursor-pointer flex items-center justify-center gap-1"
          >
            <SoundIcon muted={isMuted} />
            <span>Звук</span>
          </button>
          {accountLabel && (
            <button
              type="button"
              onClick={onOpenAccount}
              className={`${standalone ? 'col-span-2' : ''} min-h-[40px] px-3 py-2 rounded bg-[#221f2d] hover:bg-[#2c283a] border border-[#383347] text-xs font-bold text-stone-200 transition-colors cursor-pointer`}
            >
              {accountLabel}
            </button>
          )}
          {!standalone && (
            <button
              type="button"
              onClick={() => (fullscreen.supported ? fullscreen.toggle() : setShowHomeScreenHint(!showHomeScreenHint))}
              className={`${accountLabel ? '' : 'col-span-2 short:col-span-1'} min-h-[40px] px-3 short:px-1.5 py-2 rounded bg-[#221f2d] hover:bg-[#2c283a] border border-[#383347] text-xs font-bold text-stone-200 transition-colors cursor-pointer`}
            >
              {fullscreen.active ? 'Обычный экран' : 'Во весь экран'}
            </button>
          )}
        </div>

        <a
          href="https://t.me/popataras"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full text-center text-[11px] text-stone-500 hover:text-amber-300 transition-colors"
        >
          По вопросам сотрудничества: Telegram @popataras
        </a>

        {showHomeScreenHint && (
          <div className="w-full bg-[#171520] p-3 rounded-lg border border-[#2d2938] text-xs text-stone-300 leading-relaxed animate-fade-in">
            {HOME_SCREEN_HINT}
          </div>
        )}

        {/* Sound Settings Accordion */}
        {showSoundSettings && (
          <div className="w-full bg-[#171520] p-3 rounded-lg border border-[#2d2938] space-y-2.5 animate-fade-in text-xs">
            <div className="flex items-center justify-between">
              <span className="text-stone-300 font-semibold">Общий звук</span>
              <button
                type="button"
                onClick={onToggleMute}
                className="px-2 py-0.5 rounded bg-[#221f2d] border border-[#383347] text-xs cursor-pointer"
              >
                {isMuted ? 'Включить' : 'Выключить'}
              </button>
            </div>
            <div className="flex items-center justify-between gap-3">
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
            <div className="flex items-center justify-between gap-3">
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
        )}
      </div>
      </div>

      {/* Flat bottom control hint (keyboard; a phone on its side has no room and no keys) */}
      <div className="text-stone-500 text-[11px] font-medium pt-2 text-center short:hidden">
        Мышь или касание для управления • 1–5 лавка • Пробел волна • P пауза
      </div>
    </div>
  );
}
