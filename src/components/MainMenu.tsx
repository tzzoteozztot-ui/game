/**
 * Main Menu Screen for «Тёмный рубеж»
 * Dark fantasy styling, 5 level cards, difficulty picker, audio settings.
 */

import React, { useState } from 'react';
import { CONFIG, Difficulty } from '../game/config';
import { StarIcon, LockIcon, SoundIcon } from './Icons';
import { useFullscreen, isStandalone, HOME_SCREEN_HINT } from '../fullscreen';

interface MainMenuProps {
  unlockedLevel: number; // 1..5
  levelStars: Record<number, number>; // level -> stars
  selectedDifficulty: Difficulty;
  endless: boolean;
  endlessBest: Record<number, number>; // level -> best wave reached in endless mode
  musicVol: number;
  sfxVol: number;
  isMuted: boolean;
  selectedLevel: number;
  onSelectLevel: (lvl: number) => void; // highlights the card; the game starts with onPlay
  onPlay: () => void;
  onChangeDifficulty: (diff: Difficulty) => void;
  onChangeEndless: (endless: boolean) => void;
  onOpenHowToPlay: () => void;
  onMusicChange: (val: number) => void;
  onSfxChange: (val: number) => void;
  onToggleMute: () => void;
}

export function MainMenu({
  unlockedLevel,
  levelStars,
  selectedDifficulty,
  endless,
  endlessBest,
  musicVol,
  sfxVol,
  isMuted,
  selectedLevel,
  onSelectLevel,
  onPlay,
  onChangeDifficulty,
  onChangeEndless,
  onOpenHowToPlay,
  onMusicChange,
  onSfxChange,
  onToggleMute,
}: MainMenuProps) {
  const [showSoundSettings, setShowSoundSettings] = useState(false);
  const [showHomeScreenHint, setShowHomeScreenHint] = useState(false);
  const fullscreen = useFullscreen();
  const standalone = isStandalone();

  return (
    <div className="fixed inset-0 z-30 bg-[#121118] text-[#f4f2e6] flex flex-col items-center justify-center p-2 sm:p-3 overflow-y-auto select-none gap-1 sm:gap-2">
      {/* Title Header with inline SVG Lockup */}
      <div className="text-center">
        {/* Crest lockup */}
        <div className="w-10 h-7 sm:w-14 sm:h-10 mx-auto mb-0.5 flex items-center justify-center">
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

        <h1 className="text-xl sm:text-3xl font-black text-amber-300 tracking-widest uppercase drop-shadow leading-none">
          Тёмный рубеж
        </h1>
        <p className="text-[10px] sm:text-xs text-stone-400 tracking-wider font-semibold mt-0.5">
          Tower Defense в стиле тёмного фэнтези
        </p>
      </div>

      {/* Level Selection Cards */}
      <div className="w-full max-w-2xl my-1.5 sm:my-3">
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
                className={`p-2 sm:p-2.5 rounded-lg border text-left flex flex-col justify-between transition-all min-h-[75px] sm:min-h-[96px] cursor-pointer ${
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
                  <div className="font-bold text-stone-200 text-xs sm:text-[13px] leading-tight">
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

      {/* Difficulty & Quick Actions */}
      <div className="w-full max-w-md flex flex-col items-center gap-2">
        {/* Mode Selector: campaign of 12 waves or endless waves */}
        <div className="w-full flex items-center justify-between p-1 bg-[#171520] rounded-lg border border-[#2d2938]">
          <span className="text-xs font-semibold text-stone-400 pl-3">Режим:</span>
          <div className="flex items-center gap-1">
            {[false, true].map((v) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => onChangeEndless(v)}
                title={v ? 'Волны без конца, босс каждую 12-ю волну, враги всё сильнее' : '12 волн, в последней босс'}
                className={`px-3 py-1.5 min-h-[36px] rounded text-xs font-bold transition-colors cursor-pointer ${
                  endless === v
                    ? 'bg-amber-600 text-stone-950 font-black'
                    : 'text-stone-400 hover:text-stone-200 hover:bg-[#221f2d]'
                }`}
              >
                {v ? 'Бесконечный' : 'Кампания'}
              </button>
            ))}
          </div>
        </div>

        {/* Difficulty Selector */}
        <div className="w-full flex items-center justify-between p-1 bg-[#171520] rounded-lg border border-[#2d2938]">
          <span className="text-xs font-semibold text-stone-400 pl-3">Сложность:</span>
          <div className="flex items-center gap-1">
            {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onChangeDifficulty(d)}
                className={`px-3 py-1.5 min-h-[36px] rounded text-xs font-bold transition-colors cursor-pointer ${
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

        {/* Play: starts the selected level in the selected mode */}
        <button
          type="button"
          onClick={onPlay}
          className="w-full min-h-[46px] py-2 px-4 rounded bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-sm tracking-wider uppercase transition-all shadow-lg shadow-amber-950/50 cursor-pointer active:translate-y-0.5"
        >
          Играть: {CONFIG.factions[selectedLevel - 1].location} · {endless ? 'бесконечный' : 'кампания'}
        </button>

        {/* Buttons Row */}
        <div className="w-full grid grid-cols-2 gap-2">
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
          {!standalone && (
            <button
              type="button"
              onClick={() => (fullscreen.supported ? fullscreen.toggle() : setShowHomeScreenHint(!showHomeScreenHint))}
              className="col-span-2 min-h-[40px] px-3 py-2 rounded bg-[#221f2d] hover:bg-[#2c283a] border border-[#383347] text-xs font-bold text-stone-200 transition-colors cursor-pointer"
            >
              {fullscreen.active ? 'Выйти из полноэкранного режима' : 'Во весь экран'}
            </button>
          )}
        </div>

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

      {/* Flat bottom control hint */}
      <div className="text-stone-500 text-[11px] font-medium pt-2 text-center">
        Мышь или касание для управления • 1–5 лавка • Пробел волна • P пауза
      </div>
    </div>
  );
}
