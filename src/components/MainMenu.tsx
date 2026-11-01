/**
 * Main Menu Screen for «Тёмный рубеж».
 * Home: four big buttons — Кампания, Бесконечный режим, Дуэль, Настройки (просьба Артура 2026-11-01).
 * Кампания: map and difficulty; Бесконечный: map, enemies and difficulty; Дуэль opens its lobby
 * (player or bot); Настройки: account, sound, bestiary, how to play, full screen.
 */

import React, { useState } from 'react';
import { CONFIG, Difficulty, RaceId } from '../game/config';
import { RacePicker } from './RacePicker';
import { endlessRecordKey } from '../progress';
import { StarIcon, LockIcon, SoundIcon, FullscreenIcon } from './Icons';
import { useFullscreen, isStandalone, HOME_SCREEN_HINT } from '../fullscreen';

export type GameMode = 'campaign' | 'endless' | 'duel';
export type MenuPage = 'home' | 'campaign' | 'endless' | 'brawl' | 'settings';

interface MainMenuProps {
  page: MenuPage;
  onChangePage: (page: MenuPage) => void;
  unlockedLevel: number; // 1..5
  levelStars: Record<number, number>; // level -> stars
  selectedDifficulty: Difficulty;
  duelAvailable: boolean; // duel needs the server (or ?duel=local)
  endlessBest: Record<number, number>; // endlessRecordKey(level, faction) -> best wave reached in endless mode
  race: RaceId; // the player's faction
  onChangeRace: (race: RaceId) => void;
  endlessEnemies: number; // endless mode: whose enemies come, 0 — the map's own faction
  onChangeEnemies: (faction: number) => void;
  randomMap: boolean; // endless mode: a generated road instead of the map's own
  onChangeRandomMap: (on: boolean) => void;
  musicVol: number;
  sfxVol: number;
  isMuted: boolean;
  selectedLevel: number;
  onSelectLevel: (lvl: number) => void; // highlights the card; the game starts with onPlay
  onPlay: () => void;
  onOpenDuel: () => void;
  onStartBrawl: (level: number, bots: Difficulty) => void;
  onChangeDifficulty: (diff: Difficulty) => void;
  onOpenHowToPlay: () => void;
  onOpenBestiary: () => void;
  accountLabel: string | null; // null when accounts are not set up
  onOpenAccount: () => void;
  onMusicChange: (val: number) => void;
  onSfxChange: (val: number) => void;
  onToggleMute: () => void;
}

const PANEL = 'bg-[#171520] rounded-lg border border-[#2d2938]';
const BTN =
  'min-h-[42px] px-3 py-2 rounded bg-[#221f2d] hover:bg-[#2c283a] border border-[#383347] text-xs font-bold text-stone-200 transition-colors cursor-pointer';

function Crest({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 64 48" className={className} fill="none" aria-hidden>
      <path d="M32 4L48 18V36L32 46L16 36V18L32 4Z" fill="#1e1824" stroke="#d9b44a" strokeWidth="2" />
      <path d="M32 10L42 20V32L32 38L22 32V20L32 10Z" fill="#322238" />
      <polygon points="32,16 36,26 44,26 38,32 40,40 32,35 24,40 26,32 20,26 28,26" fill="#f4c06a" />
    </svg>
  );
}

/** Header of a sub-page: back to the home page and the page title */
function PageHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="w-full flex items-center gap-2 mb-2 short:mb-1.5">
      <button type="button" onClick={onBack} className={`${BTN} min-h-[38px] shrink-0`} title="Назад (Esc)">
        ← Назад
      </button>
      <h2 className="flex-1 text-center text-base sm:text-xl short:text-base font-black text-amber-300 tracking-widest uppercase leading-none pr-[68px]">
        {title}
      </h2>
    </div>
  );
}

export function MainMenu(props: MainMenuProps) {
  const { page, onChangePage } = props;
  const home = () => onChangePage('home');
  return (
    <div className="fixed inset-0 z-30 bg-[#121118] text-[#f4f2e6] flex flex-col items-center p-2 sm:p-3 overflow-y-auto select-none">
      {/* my-auto centres the page and lets a screen that is still too low scroll to its top */}
      <div className="my-auto w-full flex flex-col items-center">
        {page === 'home' && <HomePage {...props} />}
        {(page === 'campaign' || page === 'endless') && <LevelPage {...props} endless={page === 'endless'} onBack={home} />}
        {page === 'brawl' && <BrawlPage {...props} onBack={home} />}
        {page === 'settings' && <SettingsPage {...props} onBack={home} />}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Home: the four modes
// -------------------------------------------------------------
function HomePage({ onChangePage, onOpenDuel, duelAvailable, unlockedLevel, accountLabel }: MainMenuProps) {
  const fullscreen = useFullscreen();
  const [hint, setHint] = useState(false);
  const standalone = isStandalone();
  const items: { key: string; title: string; hint: string; onClick: () => void; main?: boolean }[] = [
    {
      key: 'campaign',
      title: 'Кампания',
      hint: `5 рубежей по 12 волн · открыто ${Math.min(5, unlockedLevel)} из 5`,
      onClick: () => onChangePage('campaign'),
      main: true,
    },
    { key: 'endless', title: 'Бесконечный режим', hint: 'Волны без конца, рекорд волны', onClick: () => onChangePage('endless') },
    { key: 'brawl', title: 'Потасовка', hint: 'Восемь рубежей, соперник меняется каждую волну', onClick: () => onChangePage('brawl') },
    ...(duelAvailable
      ? [{ key: 'duel', title: 'Дуэль', hint: 'С игроком по коду комнаты или с ботом', onClick: onOpenDuel }]
      : []),
    {
      key: 'settings',
      title: 'Настройки',
      hint: accountLabel ? 'Аккаунт, звук, бестиарий' : 'Звук, бестиарий',
      onClick: () => onChangePage('settings'),
    },
  ];

  return (
    <div className="relative w-full max-w-sm short:max-w-2xl flex flex-col items-center">
      {!standalone && (
        <button
          type="button"
          onClick={() => (fullscreen.supported ? fullscreen.toggle() : setHint(!hint))}
          title={fullscreen.active ? 'Обычный экран (F)' : 'Во весь экран (F)'}
          aria-label={fullscreen.active ? 'Обычный экран' : 'Во весь экран'}
          className="fixed top-2 right-2 sm:top-3 sm:right-3 w-10 h-10 flex items-center justify-center rounded bg-[#1a1724] hover:bg-[#252033] border border-[#383347] text-stone-300 text-lg cursor-pointer z-10"
        >
          <FullscreenIcon active={fullscreen.active} />
        </button>
      )}

      <div className="text-center mb-4 short:mb-2 short:flex short:items-center short:gap-2">
        <Crest className="w-14 h-10 mx-auto mb-2 short:mx-0 short:mb-0 short:w-10 short:h-8" />
        <div>
          <h1 className="text-3xl sm:text-4xl short:text-xl font-black text-amber-300 tracking-widest uppercase drop-shadow leading-none">
            Тёмный рубеж
          </h1>
          <p className="text-xs text-stone-400 tracking-wider font-semibold mt-1 short:mt-0.5 short:text-[10px]">
            Tower Defense в стиле тёмного фэнтези
          </p>
        </div>
      </div>

      {hint && <div className={`${PANEL} w-full p-3 mb-2 text-xs text-stone-300 leading-relaxed`}>{HOME_SCREEN_HINT}</div>}

      <nav className="w-full flex flex-col gap-2 short:grid short:grid-cols-2 short:gap-2">
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            onClick={it.onClick}
            className={`w-full min-h-[60px] short:min-h-[56px] px-4 py-2 rounded-lg border text-center transition-all cursor-pointer active:translate-y-0.5 shadow-md ${
              it.main
                ? 'bg-amber-500 hover:bg-amber-400 border-amber-300 text-stone-950 shadow-amber-950/50'
                : 'bg-[#1a1724] hover:bg-[#252033] border-[#3d384d] hover:border-amber-400 text-stone-100'
            }`}
          >
            <span className="block text-base short:text-sm font-black uppercase tracking-wider leading-tight">{it.title}</span>
            <span className={`block text-[11px] leading-snug mt-0.5 ${it.main ? 'text-stone-900/80 font-semibold' : 'text-stone-400'}`}>
              {it.hint}
            </span>
          </button>
        ))}
      </nav>

      <a
        href="https://t.me/popataras"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 short:mt-2 text-center text-[11px] text-stone-500 hover:text-amber-300 transition-colors"
      >
        По вопросам сотрудничества: Telegram @popataras
      </a>
    </div>
  );
}

// -------------------------------------------------------------
// Brawl: eight players (you and seven bots), the map, your race, the bots' strength
// -------------------------------------------------------------
const BRAWL_BOTS: { id: Difficulty; label: string }[] = [
  { id: 'easy', label: 'Слабые' },
  { id: 'normal', label: 'Средние' },
  { id: 'hard', label: 'Сильные' },
];

function BrawlPage({ onBack, unlockedLevel, selectedLevel, onSelectLevel, race, onChangeRace, onStartBrawl }: MainMenuProps & { onBack: () => void }) {
  const [bots, setBots] = useState<Difficulty>('normal');
  const level = Math.min(selectedLevel, Math.max(1, unlockedLevel));
  return (
    <div className="w-full max-w-md short:max-w-3xl flex flex-col items-center">
      <PageHeader title="Потасовка" onBack={onBack} />
      <div className="w-full flex flex-col gap-2 short:grid short:grid-cols-2 short:gap-1.5 short:items-start">
        <div className={`${PANEL} w-full p-2.5 short:p-2 text-xs text-stone-300 leading-relaxed`}>
          Восемь игроков, у каждого свой рубеж. Волны выходят у всех разом, каждые {CONFIG.brawl.roundLength} с, и с каждой
          волной соперник меняется: купленные во вкладке «Армия» враги уходят ему, его враги — вам. Кого покинул артефакт, тот
          выбыл; при нечётном числе оставшихся поле выбывшего остаётся «призраком», и с ним по очереди играют все, от слабого к
          сильному. Побеждает последний устоявший. Остальные семеро — боты.
        </div>
        <div className="w-full flex flex-col gap-2 short:gap-1.5">
          <label className={`${PANEL} w-full flex items-center justify-between gap-2 p-1`}>
            <span className="text-xs font-semibold text-stone-400 pl-3 short:pl-2">Карта:</span>
            <select
              value={level}
              onChange={(e) => onSelectLevel(Number(e.target.value))}
              className="min-h-[36px] short:min-h-[34px] flex-1 max-w-[220px] rounded bg-[#221f2d] border border-[#383347] px-2 text-xs font-bold text-stone-200 cursor-pointer"
            >
              {CONFIG.factions.slice(0, Math.min(CONFIG.levelCount, Math.max(1, unlockedLevel))).map((f, i) => (
                <option key={f.id} value={i + 1}>
                  {f.location}
                </option>
              ))}
            </select>
          </label>
          <div className={`${PANEL} w-full p-1.5`}>
            <RacePicker race={race} onChange={onChangeRace} compact />
          </div>
          <div className={`${PANEL} w-full flex items-center justify-between p-1`}>
            <span className="text-xs font-semibold text-stone-400 pl-3 short:pl-2 pr-1">Боты:</span>
            <div className="flex items-center gap-1 short:gap-0.5">
              {BRAWL_BOTS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBots(b.id)}
                  aria-pressed={bots === b.id}
                  className={`px-3 short:px-1.5 py-1.5 min-h-[36px] short:min-h-[34px] rounded text-xs font-bold transition-colors cursor-pointer ${
                    bots === b.id ? 'bg-amber-600 text-stone-950 font-black' : 'text-stone-400 hover:text-stone-200 hover:bg-[#221f2d]'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onStartBrawl(level, bots)}
            className="w-full min-h-[48px] short:min-h-[42px] py-2 px-4 rounded bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-sm short:text-xs tracking-wider uppercase transition-all shadow-lg shadow-amber-950/50 cursor-pointer active:translate-y-0.5"
          >
            В бой: {CONFIG.factions[level - 1].location}
          </button>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Campaign and endless: the map, (endless) the enemies, the difficulty
// -------------------------------------------------------------
function LevelPage({
  endless,
  onBack,
  unlockedLevel,
  levelStars,
  endlessBest,
  endlessEnemies,
  onChangeEnemies,
  randomMap,
  onChangeRandomMap,
  selectedLevel,
  onSelectLevel,
  onPlay,
  selectedDifficulty,
  onChangeDifficulty,
  race,
  onChangeRace,
}: MainMenuProps & { endless: boolean; onBack: () => void }) {
  return (
    <div className="w-full max-w-2xl short:max-w-3xl flex flex-col items-center">
      <PageHeader title={endless ? 'Бесконечный режим' : 'Кампания'} onBack={onBack} />
      <div className="w-full flex flex-col gap-2 short:gap-1.5">
        {/* Map cards */}
        <div className="w-full">
          <div className="flex items-center justify-between mb-1 px-1">
            <span className="text-[10px] sm:text-xs uppercase font-bold text-stone-400 tracking-wider">
              {endless ? 'Карта' : 'Рубеж обороны'}
            </span>
            <span className="text-[10px] sm:text-xs text-amber-400 font-semibold">Открыто {Math.min(5, unlockedLevel)} / 5</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-5 short:grid-cols-5 gap-1.5 sm:gap-2">
            {CONFIG.factions.slice(0, CONFIG.levelCount).map((f, idx) => {
              const lvl = idx + 1;
              const best = endlessBest[endlessRecordKey(lvl, endlessEnemies || lvl, randomMap)];
              const isUnlocked = lvl <= unlockedLevel;
              const stars = levelStars[lvl] || 0;
              const isSelected = isUnlocked && lvl === selectedLevel;
              return (
                <button
                  key={f.id}
                  type="button"
                  disabled={!isUnlocked}
                  onClick={() => onSelectLevel(lvl)}
                  onDoubleClick={() => isUnlocked && onPlay()}
                  aria-pressed={isSelected}
                  className={`p-2 sm:p-2.5 short:p-1.5 rounded-lg border text-left flex flex-col justify-between transition-all min-h-[64px] sm:min-h-[96px] short:min-h-[84px] cursor-pointer ${
                    isSelected
                      ? 'border-amber-400 bg-[#2a2236] ring-2 ring-amber-500/60 shadow-md'
                      : isUnlocked
                        ? 'border-[#3d384d] bg-[#1a1724] hover:bg-[#252033] hover:border-amber-400 shadow-md'
                        : 'border-[#201d29] bg-[#14121c] opacity-40 cursor-not-allowed'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-amber-500">Ур. {lvl}</span>
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
                        {best ? `Рекорд: волна ${best}` : 'Рекорда нет'}
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
                      style={{ backgroundColor: CONFIG.palettes[idx].enemies }}
                      title={`Фракция: ${f.name}`}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className={`${PANEL} w-full p-1.5`}>
          <RacePicker race={race} onChange={onChangeRace} />
        </div>

        {/* Enemies (endless), difficulty and the start */}
        {/* A phone on its side: a row of two under the cards */}
        <div className="w-full max-w-md mx-auto flex flex-col gap-2 short:max-w-none short:grid short:grid-cols-2 short:gap-1.5">
          {endless && (
            <label className={`${PANEL} w-full flex items-center justify-between gap-2 p-1`}>
              <span className="text-xs font-semibold text-stone-400 pl-3 short:pl-2">Враги:</span>
              <select
                value={endlessEnemies}
                onChange={(e) => onChangeEnemies(Number(e.target.value))}
                title={
                  endlessEnemies
                    ? `${CONFIG.factions[endlessEnemies - 1].traitName}: ${CONFIG.factions[endlessEnemies - 1].traitDesc}`
                    : 'Враги той фракции, чья это земля'
                }
                className="min-h-[36px] short:min-h-[34px] flex-1 max-w-[220px] rounded bg-[#221f2d] border border-[#383347] px-2 text-xs font-bold text-stone-200 cursor-pointer"
              >
                <option value={0}>Хозяева карты ({CONFIG.factions[selectedLevel - 1].name})</option>
                {CONFIG.factions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {endless && (
            <div
              className={`${PANEL} w-full flex items-center justify-between p-1`}
              title="Случайная дорога: каждый забег новая, по тем же правилам, что и у готовых карт; рекорд отдельный"
            >
              <span className="text-xs font-semibold text-stone-400 pl-3 short:pl-2 pr-1">Дорога:</span>
              <div className="flex items-center gap-1 short:gap-0.5">
                {[false, true].map((on) => (
                  <button
                    key={String(on)}
                    type="button"
                    onClick={() => onChangeRandomMap(on)}
                    aria-pressed={randomMap === on}
                    className={`px-3 short:px-1.5 py-1.5 min-h-[36px] short:min-h-[34px] rounded text-xs font-bold transition-colors cursor-pointer ${
                      randomMap === on
                        ? 'bg-amber-600 text-stone-950 font-black'
                        : 'text-stone-400 hover:text-stone-200 hover:bg-[#221f2d]'
                    }`}
                  >
                    {on ? 'Случайная' : 'Как на карте'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={`${PANEL} w-full flex items-center justify-between p-1`}>
            <span className="text-xs font-semibold text-stone-400 pl-3 short:pl-2 pr-1">Сложность:</span>
            <div className="flex items-center gap-1 short:gap-0.5">
              {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => onChangeDifficulty(d)}
                  className={`px-3 short:px-1.5 py-1.5 min-h-[36px] short:min-h-[34px] rounded text-xs font-bold transition-colors cursor-pointer ${
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

          <button
            type="button"
            onClick={onPlay}
            className={`w-full min-h-[48px] short:min-h-[42px] py-2 px-4 short:px-2 rounded bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-sm short:text-xs tracking-wider uppercase transition-all shadow-lg shadow-amber-950/50 cursor-pointer active:translate-y-0.5`}
          >
            В бой: {CONFIG.factions[selectedLevel - 1].location}
            {endless && endlessEnemies > 0 && endlessEnemies !== selectedLevel && ` · ${CONFIG.factions[endlessEnemies - 1].name}`}
          </button>
          <p className="text-center text-[11px] text-stone-500 short:hidden">Enter — в бой, Esc — назад</p>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Settings: account, sound, bestiary, how to play, full screen
// -------------------------------------------------------------
function SettingsPage({
  onBack,
  accountLabel,
  onOpenAccount,
  onOpenBestiary,
  onOpenHowToPlay,
  musicVol,
  sfxVol,
  isMuted,
  onMusicChange,
  onSfxChange,
  onToggleMute,
}: MainMenuProps & { onBack: () => void }) {
  const fullscreen = useFullscreen();
  const [hint, setHint] = useState(false);
  const standalone = isStandalone();
  const section = 'text-[10px] sm:text-xs uppercase font-bold text-stone-400 tracking-wider mb-1 px-1';

  return (
    <div className="w-full max-w-md short:max-w-3xl flex flex-col items-center">
      <PageHeader title="Настройки" onBack={onBack} />
      <div className="w-full flex flex-col gap-3 short:grid short:grid-cols-2 short:gap-3 short:items-start">
        <div className="flex flex-col gap-3">
          {accountLabel && (
            <section>
              <div className={section}>Аккаунт</div>
              <button type="button" onClick={onOpenAccount} className={`${BTN} w-full text-left`}>
                {accountLabel}
                <span className="block text-[11px] font-normal text-stone-400 mt-0.5">
                  Прогресс сохраняется на всех ваших устройствах
                </span>
              </button>
            </section>
          )}

          <section>
            <div className={section}>Звук</div>
            <div className={`${PANEL} p-3 space-y-2.5 text-xs`}>
              <div className="flex items-center justify-between">
                <span className="text-stone-300 font-semibold flex items-center gap-1.5">
                  <SoundIcon muted={isMuted} /> Общий звук
                </span>
                <button
                  type="button"
                  onClick={onToggleMute}
                  className="min-h-[34px] px-3 rounded bg-[#221f2d] border border-[#383347] text-xs font-bold cursor-pointer"
                >
                  {isMuted ? 'Включить' : 'Выключить'}
                </button>
              </div>
              <label className="flex items-center justify-between gap-3">
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
              </label>
              <label className="flex items-center justify-between gap-3">
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
              </label>
            </div>
          </section>
        </div>

        <section>
          <div className={section}>Справка и экран</div>
          <div className="flex flex-col gap-2">
            <button type="button" onClick={onOpenBestiary} className={`${BTN} w-full text-left`}>
              Бестиарий
              <span className="block text-[11px] font-normal text-stone-400 mt-0.5">Враги, боссы и башни</span>
            </button>
            <button type="button" onClick={onOpenHowToPlay} className={`${BTN} w-full text-left`}>
              Как играть
              <span className="block text-[11px] font-normal text-stone-400 mt-0.5">Правила, башни, клавиши</span>
            </button>
            {!standalone && (
              <button
                type="button"
                onClick={() => (fullscreen.supported ? fullscreen.toggle() : setHint(!hint))}
                className={`${BTN} w-full text-left`}
              >
                {fullscreen.active ? 'Обычный экран' : 'Во весь экран'} (F)
              </button>
            )}
            {hint && <div className={`${PANEL} p-3 text-xs text-stone-300 leading-relaxed`}>{HOME_SCREEN_HINT}</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
