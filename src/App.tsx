/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CONFIG, Difficulty, TowerType, RaceId, RACE_IDS } from './game/config';
import { createBotLink, BotSave } from './duelBot';
import { loadBattleSave, saveBattleSave, clearBattleSave } from './campaign/battleSave';
import { HeroBar } from './components/HeroBar';
import { validateAllMaps } from './game/maps';
import { newMapSeed } from './game/mapgen';
import { sound, AudioSettings } from './game/audio';
import { GameEngine, GameStateSnapshot, Tower } from './game/engine';
import { sprites } from './game/sprites';

import { FieldStats } from './components/FieldStats';
import { FieldHud } from './components/FieldHud';
import { GameControls } from './components/GameControls';
import { WaveInfo } from './components/WaveInfo';
import { Backpack } from './components/Backpack';
import { ShopPanel, ShopCard } from './components/ShopPanel';
import { SandboxSummaryModal } from './components/SandboxSummaryModal';
import { SandboxPanel } from './components/SandboxPanel';
import { SandboxMapPanel } from './components/SandboxMapPanel';
import { SavedMap, loadCustomMaps, saveCustomMap, deleteCustomMap } from './customMaps';
import { MAPS } from './game/maps';
import { SandboxWaveModal, SandboxWave } from './components/SandboxWaveModal';
import { rollShop, ShopPity } from './game/shop';
import { TowerPanel, WaitingHint } from './components/TowerPanel';
import { SpecModal } from './components/SpecModal';
import { MainMenu, GameMode, MenuPage } from './components/MainMenu';
import { Bestiary } from './components/Bestiary';
import { DuelLobby } from './components/DuelLobby';
import { ArmyPanel } from './components/ArmyPanel';
import { SEND_TYPES } from './game/rules';
import { DuelLink, duelAvailable } from './duel';
import { BrawlNetSetup, BrawlRoom, BrawlSnapshot, brawlBots } from './brawl';
import { BrawlLobby } from './components/BrawlLobby';
import { BrawlBoard } from './components/BrawlBoard';
import { BrawlSpectator } from './components/BrawlSpectator';
import { cleanView, type FieldView } from './fieldView';
import { BoonPicker } from './components/BoonPicker';
import { LevelBriefing } from './components/LevelBriefing';
import { PauseModal, DefeatModal, HowToPlayModal, DuelResultModal, BrawlResultModal, DuelOutcome } from './components/StatusModals';
import { OrientationWarning } from './components/OrientationWarning';
import { WorldMap, WorldBattleResult } from './components/WorldMap';
import { WorldState, WorldObj, REGIONS, FRONTIER, newWorld, loadWorld, saveWorld, normalizeWorld, readWorldMeta, writeWorldMeta, winBattle, battleSeed, battlePerks, heroLevel, allowedTowers, armyLevel, invasion, battleStages } from './campaign/world';
import { Scene, sceneFor } from './campaign/dialogs';
import { DialogBox } from './components/DialogBox';
import { TutorialHint } from './components/TutorialHint';
import { tutorialFor, TutStep } from './campaign/tutorial';
import { DevNotes } from './components/DevNotes';
import { DevNote } from './devNotes';
import { HERO_ABILITIES } from './game/config';
import { fullscreenSupported, toggleFullscreen } from './fullscreen';
import { AccountModal, SyncState } from './components/AccountModal';
import { downloadRunLog } from './game/runLog';
import { logWorldChange, logReason, logWorldNote, logBattleStart, logBattleEnd, type CampaignBattle } from './campaign/worldLog';
import { Progress, EMPTY_PROGRESS, readLocalProgress, writeLocalProgress, mergeProgress, isEmptyProgress, endlessRecordKey } from './progress';
import { cloudEnabled, onUserChange, loadCloudProgress, saveCloudProgress, loadCloudWorld, saveCloudWorld } from './cloud';
import type { User } from '@supabase/supabase-js';

type ScreenState = 'menu' | 'briefing' | 'duelLobby' | 'brawlLobby' | 'playing' | 'world';

// The side column is never narrower than this (a phone minimum, an eighth of a wide screen): the field gives way to it
const SIDE_MIN_W = 'max(132px, 12cqw)';

// Side column sizes (game controls, shop and backpack): phone-size minimums, growing with the column height (cqh) and width (cqw)
const SIDE_VARS = {
  '--fs-xs': 'clamp(10px, min(2.6cqh, 5cqw), 16px)',
  '--fs-sm': 'clamp(11px, min(2.9cqh, 5.7cqw), 17px)',
  '--fs-md': 'clamp(12px, min(3.2cqh, 6.3cqw), 19px)',
  '--fs-lg': 'clamp(13px, min(3.7cqh, 7cqw), 22px)',
  '--h-stat': 'max(22px, 4.6cqh)',
  '--h-line': 'max(14px, 3.3cqh)',
  '--fs-btn4': 'clamp(10px, min(2.6cqh, 4.8cqw), 15px)', // four buttons in a row
  '--h-btn': 'max(32px, 9.5cqh - 4px)',
  '--h-card': 'clamp(40px, min(19cqh, 30cqw), 170px)',
  '--h-tier': 'clamp(28px, 8cqh, 56px)',
  '--h-pack': 'clamp(28px, min(12cqh, 22cqw), 90px)',
} as React.CSSProperties;

// A duel adds the opponent's line and the tabs to the column: the cards give them the room
const SIDE_VARS_DUEL = {
  ...SIDE_VARS,
  '--h-card': 'clamp(40px, min(16cqh, 30cqw), 150px)',
  '--h-tier': 'clamp(28px, 7cqh, 56px)',
  '--h-pack': 'clamp(26px, min(10cqh, 22cqw), 80px)',
} as React.CSSProperties;

// Bottom strip (a screen close to square: tablets, 4:3, 16:10): controls, shop in one row and the backpack side by side.
// Sizes follow the strip's height (cqh) and width (cqw)
const BOTTOM_MIN_H = 150;
const BOTTOM_MIN_H_DUEL = 176; // the duel tabs need a line more
const BOTTOM_VARS = {
  '--fs-xs': 'clamp(10px, min(8cqh, 1.1cqw), 15px)',
  '--fs-sm': 'clamp(11px, min(9cqh, 1.25cqw), 16px)',
  '--fs-md': 'clamp(12px, min(10cqh, 1.4cqw), 18px)',
  '--fs-lg': 'clamp(13px, min(12cqh, 1.6cqw), 21px)',
  '--h-line': 'clamp(14px, 13cqh, 26px)',
  '--h-card': 'clamp(38px, min(42cqh, 9cqw), 120px)',
  '--h-tier': 'clamp(24px, 22cqh, 46px)',
  '--h-pack': 'clamp(26px, min(32cqh, 7cqw), 84px)',
  '--shop-cols': '6',
  '--ctl-cols': '2',
  '--ctl-w': 'clamp(84px, 11cqw, 150px)',
} as React.CSSProperties;

type StageLayout = 'side' | 'bottom';

// Which arrangement gives the bigger field on a stage of this size: the column at the side or the strip below
/** «Потасовка»: the current opponent and the next one (просьба Артура 2026-11-01: видеть обоих) */
function brawlOpponentName(b: BrawlSnapshot, id: string | null): string | null {
  const o = b.seats.find((s) => s.id === id);
  if (!o) return null;
  return o.id === b.ghostId ? `👻 ${o.name}` : o.name;
}
function brawlOpponentLabel(b: BrawlSnapshot): string {
  const cur = brawlOpponentName(b, b.currentId);
  const next = brawlOpponentName(b, b.opponentId);
  if (!cur) return next ?? '—';
  return next && b.opponentId !== b.currentId ? `${cur} · след. ${next}` : cur;
}

function pickLayout(w: number, h: number, bottomMinH: number): StageLayout {
  const ratio = CONFIG.grid.cols / CONFIG.grid.rows;
  const side = Math.min(w - Math.max(132, 0.12 * w), h * ratio);
  const bottom = Math.min(w, (h - bottomMinH) * ratio);
  return bottom > side ? 'bottom' : 'side';
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<StageLayout>('side');
  const engineRef = useRef<GameEngine | null>(null);

  // App screen state
  const [screen, setScreen] = useState<ScreenState>('menu');
  const [selectedLevel, setSelectedLevel] = useState<number>(1);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [mode, setMode] = useState<GameMode>('endless');
  const [menuPage, setMenuPage] = useState<MenuPage>('home'); // which page of the main menu is open
  // Поход по глобальной карте (прототип, вариант В): состояние на устройстве и бой, который сейчас идёт
  const [world, setWorldState] = useState<WorldState | null>(() => loadWorld());
  const [worldBattle, setWorldBattle] = useState<WorldObj | null>(null);
  useEffect(() => {
    sound.setScene(screen === 'world' ? 'world' : screen === 'playing' ? 'battle' : 'menu'); // музыка из public/sounds
  }, [screen]);
  const [, setRegionRev] = useState(0); // карту правили редактором: перерисовать с новым `REGIONS`
  const worldPrevRef = useRef<WorldState | null>(world); // прошлое состояние для лога: колбэки карты держат старый `world`
  const setWorld = (st: WorldState | null) => {
    logWorldChange(worldPrevRef.current, st); // лог похода: что изменилось
    worldPrevRef.current = st;
    setWorldState(st);
    saveWorld(st);
  };
  // Поход, глава 1 — обучение: башни, открытые тропой (`allowedTowers`), и сцена диалога посреди боя (Каллен в крепости)
  const worldTowersRef = useRef<string[] | null>(null);
  const [battleScene, setBattleScene] = useState<Scene | null>(null);
  const endless = mode === 'endless';
  // Endless mode: enemies are picked apart from the map (Артур, 2026-10-31); 0 — the map's own faction
  const [endlessEnemies, setEndlessEnemies] = useState<number>(0);
  const enemyFaction = endless && endlessEnemies ? endlessEnemies : selectedLevel;
  // Endless mode: a generated road for the chosen map's biome (roadmap п. 2); a new one every run from the menu
  const [randomMap, setRandomMapState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('dark_frontier_random_map') === '1';
    } catch {
      return false;
    }
  });
  const setRandomMap = (on: boolean) => {
    setRandomMapState(on);
    try {
      localStorage.setItem('dark_frontier_random_map', on ? '1' : '0');
    } catch {
      // no storage: the choice lasts until the page closes
    }
  };
  // The player's faction: whose towers the shop sells (выбор Артура 2026-11-01); remembered on this device
  const [race, setRaceState] = useState<RaceId>(() => {
    try {
      const r = localStorage.getItem('dark_frontier_race') as RaceId | null;
      return r && CONFIG.races[r] ? r : 'humans';
    } catch {
      return 'humans';
    }
  });
  const setRace = (r: RaceId) => {
    setRaceState(r);
    try {
      localStorage.setItem('dark_frontier_race', r);
    } catch {
      // private mode: the choice lives until the page is closed
    }
  };
  const [showHowToPlay, setShowHowToPlay] = useState<boolean>(false);
  const [showBestiary, setShowBestiary] = useState<boolean>(false);
  const [isPortrait, setIsPortrait] = useState<boolean>(false);

  // Persistent progression
  // Progress: localStorage, plus the account when signed in (see progress.ts, cloud.ts)
  const [progress, setProgress] = useState<Progress>(() => readLocalProgress(null));
  const [progressOwner, setProgressOwner] = useState<string | null>(null); // whose progress is in `progress`: guest (null) or an account
  const { endlessBest } = progress;
  // Старой кампании нет (Артур 2026-11-07), все карты открыты во всех режимах (его выбор «Все карты открыты»)
  const unlockedLevel = CONFIG.levelCount;
  const [user, setUser] = useState<User | null>(null);
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [showAccount, setShowAccount] = useState<boolean>(false);

  // Audio settings
  const [audioSettings, setAudioSettings] = useState<AudioSettings>({
    musicVolume: 0.5,
    sfxVolume: 0.7,
    muted: false,
  });

  // Live game state from engine
  const [gameState, setGameState] = useState<GameStateSnapshot>({
    lives: CONFIG.lives.start,
    gold: 200,
    level: 1,
    randomMap: false,
    sandbox: false,
    bossName: null,
    hexField: false,
    mapName: '',
    mapEdit: null,
    wave: 1,
    maxWaves: 12,
    waveLimit: null,
    tier: 1,
    isWaveActive: false,
    isSpawning: false,
    isGameOver: false,
    isVictory: false,
    isPaused: false,
    allWavesLaunched: false,
    endless: false,
    duel: false,
    duelSendPrices: null,
    duelOutgoing: {},
    duelOutgoingCost: 0,
    duelIncome: 0,
    waveCountdown: null,
    autoStart: false,
    earlyStartBonus: 0,
    speed: 1,
    selectedTower: null,
    towerList: [],
    heroToken: false,
    hyperPlanLeft: 0,
    eligibleMergeCount: 0,
    mergeUsesBinder: false,
    selectedBinder: false,
    binderCount: 0,
    selectedBinderTriple: false,
    canMergeBinders: false,
    upgradeTargetCount: 0,
    canUpgradeSelected: false,
    supplyPower: 0,
    supplyMult: 1,
    sellRatio: CONFIG.upgrade.sellRatio,
    supplyActive: false,
    backpack: [],
    backpackSlots: CONFIG.backpack.slots,
    faction: 1,
    nextWaveFaction: 1,
    runSummary: null,
    waveSummary: null,
    nextWave: null,
    placingSlot: null,
    supplyNext: CONFIG.supply.free,
    isUpgrading: false,
    bindPartnerCount: 0,
    isBinding: false,
    canMoveTowers: false,
    boons: [],
    heroSkills: [],
    boonOffer: null,
    stageBreak: null,
    moveCost: null,
    rerollCost: CONFIG.shop.rerollCost,
    zoomed: false,
    selectedDamage: null,
    selectedSide: null,
    castle: null,
    race: 'humans',
    mergeNeed: 3,
    maxLevel: 3,
    autoAbilities: false,
    selectedInfo: null,
  });

  // Shop state (5 card slots)
  const [shopCards, setShopCards] = useState<(ShopCard | null)[]>([]);
  const shopCardsRef = useRef<(ShopCard | null)[]>([]);
  shopCardsRef.current = shopCards;

  // Specialization modal state
  const [specModalTower, setSpecModalTower] = useState<{
    id: string;
    type: TowerType;
    part?: 'main' | 'second'; // which part of a bound pair reached Ур.2
    isPrePlacement?: boolean;
    cardIndex?: number;
    startLevel?: number; // a shop card of this level (2 — ★, 3 — ready Ур.3)
    cardId?: string; // the shop card being bought: the purchase survives a new wave and a reroll
  } | null>(null);

  // Refreshes since the last ready card (the guarantee, CONFIG.shop.pity)
  const shopPityRef = useRef<ShopPity>({ since: 0 });
  // Generate 5 shop cards based on current tier
  const generateShopCards = useCallback((currentTier: number): (ShopCard | null)[] => {
    // The player's faction: its own towers (some only from a higher tier), binders and ★ cards where it has them
    const raceDef = CONFIG.races[engineRef.current?.race ?? 'humans'];
    const allowed = worldTowersRef.current;
    const towerTypes: TowerType[] = raceDef.towers.filter((t) => (CONFIG.towers[t].minTier ?? 1) <= currentTier && (!allowed || allowed.includes(t)));
    return rollShop(currentTier, towerTypes, { triplets: !!raceDef.triplets, binders: !!raceDef.binders }, shopPityRef.current).map((c) => ({
      id: Math.random().toString(36).substring(2, 9),
      ...c,
    }));
  }, []);

  // 1. Initial startup logic
  useEffect(() => {
    // Validate all maps programmatically at startup
    validateAllMaps();

    // Sprites load in the background; until then the engine draws fallback shapes
    sprites.load();


    // Initialize audio settings
    setAudioSettings(sound.getSettings());

    // Check portrait orientation
    const checkOrientation = () => {
      setIsPortrait(window.innerWidth < window.innerHeight);
    };
    checkOrientation();
    window.addEventListener('resize', checkOrientation);

    // Initialize engine
    const engine = new GameEngine();
    engineRef.current = engine;
    (window as unknown as { gameEngine: GameEngine }).gameEngine = engine;

    engine.onStateChange = (snap) => {
      setGameState(snap);
    };

    // Free shop refresh at the start of every wave, by button or by timer
    engine.onWaveStarted = () => {
      setShopCards(generateShopCards(engine.tier));
    };

    engine.onNeedSpecChoice = (tower: Tower, part) => {
      const type = part === 'second' && tower.second ? tower.second.type : tower.type;
      setSpecModalTower({ id: tower.id, type, part });
    };

    // Auto-start check for ?autostart=1
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      sound.init();
      setSelectedLevel(1);
      setScreen('playing');
      setTimeout(() => {
        if (canvasRef.current) {
          engine.setCanvas(canvasRef.current);
          engine.startLevel(1, 'normal');
          setShopCards(generateShopCards(1));
        }
      }, 50);
    }

    return () => {
      window.removeEventListener('resize', checkOrientation);
      engine.stopLoop();
    };
  }, [generateShopCards]);

  // Mirror game state machine to document.body.dataset.state
  useEffect(() => {
    if (screen === 'menu') {
      document.body.dataset.state = 'title';
    } else if (screen === 'briefing') {
      document.body.dataset.state = 'title';
    } else if (gameState.isGameOver || gameState.isVictory) {
      document.body.dataset.state = 'gameover';
    } else if (gameState.isPaused) {
      document.body.dataset.state = 'paused';
    } else {
      document.body.dataset.state = 'playing';
    }
  }, [screen, gameState.isGameOver, gameState.isVictory, gameState.isPaused]);

  // Endless mode: the best wave reached is kept the moment a wave starts, so leaving to the menu
  // (or closing the page) in the middle of a run loses nothing; defeat counts the wave that broke through
  useEffect(() => {
    if (gameState.endless && !gameState.sandbox && !gameState.duel && (gameState.isWaveActive || gameState.isGameOver)) {
      const diff = engineRef.current?.difficulty ?? 'normal';
      const key = endlessRecordKey(gameState.level, gameState.faction, gameState.randomMap);
      setProgress((prev) =>
        (prev.endlessBest[diff][key] || 0) >= gameState.wave
          ? prev
          : mergeProgress(prev, {
              unlocked: 1,
              stars: EMPTY_PROGRESS.stars,
              endlessBest: { ...EMPTY_PROGRESS.endlessBest, [diff]: { [key]: gameState.wave } },
            })
      );
    }
  }, [gameState.isWaveActive, gameState.isGameOver, gameState.endless, gameState.duel, gameState.wave, gameState.level, gameState.faction]);

  // Duel: the room's link, the opponent's last state, how the duel ended
  const duelLinkRef = useRef<DuelLink | null>(null);
  const duelSeenRef = useRef(0); // performance.now() of the opponent's last message
  const [opponent, setOpponent] = useState<{ lives: number; wave: number; income: number } | null>(null);
  const [towerDetails, setTowerDetails] = useState<boolean>(false); // the tower card shows its specializations and damage
  const [sideTab, setSideTab] = useState<'towers' | 'army'>('towers'); // duel: tower shop or enemies for the opponent

  // The stage picks the column at the side or the strip below by its own size
  useEffect(() => {
    const el = stageRef.current;
    if (!el || screen !== 'playing') return;
    const minH = gameState.duel ? BOTTOM_MIN_H_DUEL : BOTTOM_MIN_H;
    const ro = new ResizeObserver(() => setLayout(pickLayout(el.clientWidth, el.clientHeight, minH)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [screen, gameState.duel]);
  const [duelOutcome, setDuelOutcome] = useState<DuelOutcome | null>(null);
  const duelOutcomeRef = useRef<DuelOutcome | null>(null);

  const finishDuel = useCallback((outcome: DuelOutcome) => {
    if (duelOutcomeRef.current) return;
    duelOutcomeRef.current = outcome;
    setDuelOutcome(outcome);
    if (outcome !== 'lost') engineRef.current?.winDuel();
  }, []);

  // Leaving a duel that is not over tells the opponent (they win)
  const closeDuel = useCallback(() => {
    const link = duelLinkRef.current;
    if (!link) return;
    if (!duelOutcomeRef.current) link.send({ t: 'leave' });
    duelLinkRef.current = null;
    botWatchRef.current = false;
    setBotWatchState(false);
    if (engineRef.current) engineRef.current.onDuelSend = undefined;
    // Let the last message go out before the channel closes
    setTimeout(() => link.close(), 500);
  }, []);

  const [opponentArmy, setOpponentArmy] = useState(1);
  const [myArmy, setMyArmy] = useState(1); // the army I send: its enemies' names in «Армия»
  const handleDuelStart = (link: DuelLink, level: number, startAt: number, army: number, myArmy: number, roundLength = CONFIG.duel.roundLength, mapSeed: number | null = null, asRace: RaceId = race, afterStart?: (eng: GameEngine) => void) => {
    duelLinkRef.current = link;
    duelSeenRef.current = performance.now();
    duelOutcomeRef.current = null;
    setDuelOutcome(null);
    setOpponent(null);
    setSideTab('towers');
    setOpponentArmy(army);
    setMyArmy(myArmy);
    setSelectedLevel(level);
    link.onMessage((msg) => {
      duelSeenRef.current = performance.now();
      if (msg.t === 'hello' && link.role === 'host') link.send({ t: 'start', level, army: myArmy, inMs: 0 }); // the first answer was lost
      else if (msg.t === 'state') setOpponent({ lives: msg.lives, wave: msg.wave, income: msg.income ?? 0 });
      else if (msg.t === 'watch') duelWatchedAtRef.current = msg.on ? performance.now() : 0;
      else if (msg.t === 'view') setDuelView(cleanView(msg.v));
      else if (msg.t === 'send') engineRef.current?.receiveSend(msg.enemies ?? {}, msg.army);
      else if (msg.t === 'lost') finishDuel('won');
      else if (msg.t === 'leave') finishDuel('left');
    });
    setScreen('playing');
    setTimeout(() => {
      if (canvasRef.current && engineRef.current) {
        engineRef.current.setCanvas(canvasRef.current);
        engineRef.current.startDuel(level, startAt, army, asRace, roundLength, mapSeed);
        const eng = engineRef.current;
        afterStart?.(eng);
        eng.onDuelSend = (enemies) => link.send({ t: 'send', enemies, wave: eng.wavesLaunched + 1 });
        if (link instanceof BrawlRoom) {
          engineRef.current.waveFactionFor = (w) => link.factionForWave(w);
          engineRef.current.boonsOn = true;
          if (eng.runLog) eng.runLog.data.mode = 'brawl';
          eng.logExtra = () => {
            const b = link.snapshot();
            return { currentId: b.currentId, opponentId: b.opponentId, ghostId: b.ghostId, ghostFoeId: b.ghostFoeId, alive: b.alive, seats: b.seats.map((s) => ({ id: s.id, name: s.name, race: s.race, kind: s.kind, lives: Math.round(s.lives), out: s.out, place: s.place })) };
          };
        }
        setShopCards(generateShopCards(1));
      }
    }, 50);
  };

  // «Потасовка»: a room of eight run here, driven like a duel (src/brawl.ts); its board for the overlay
  const [brawl, setBrawl] = useState<BrawlSnapshot | null>(null);
  const brawlRoomRef = useRef<BrawlRoom | null>(null);
  const [watchId, setWatchId] = useState<string | null>(null); // чьё поле смотрим (просьба Артура 2026-11-08)
  const [watchView, setWatchView] = useState<FieldView | null>(null);
  // Дуэль и бой с армией против бота: поле соперника, нарисованное по его числам
  const [botWatch, setBotWatchState] = useState(false);
  const botWatchRef = useRef(false);
  const duelAskedAtRef = useRef(0);
  const duelWatchedAtRef = useRef(0); // дуэль людей: когда соперник последний раз просил моё поле (0 — не смотрит)
  const [duelView, setDuelView] = useState<FieldView | null>(null);
  const setBotWatch = (v: boolean) => {
    if (!v && botWatchRef.current) duelLinkRef.current?.send({ t: 'watch', on: false });
    if (v) duelAskedAtRef.current = 0;
    setDuelView(null);
    botWatchRef.current = v;
    setBotWatchState(v);
  };
  const watchIdRef = useRef<string | null>(null);
  const watchField = (id: string | null) => {
    watchIdRef.current = id;
    brawlRoomRef.current?.watch(id, setWatchView);
    setWatchId(id);
    setWatchView(null);
  };
  // Свободный режим (песочница, просьба Артура 2026-11-02); раса, враги и карта меняются внутри режима (2026-11-05)
  const [sandboxWaveOpen, setSandboxWaveOpen] = useState(false);
  const [sandboxSummaryOpen, setSandboxSummaryOpen] = useState(false);
  const [sandboxWave, setSandboxWave] = useState<SandboxWave>({ faction: 1, wave: 1, counts: {} });
  const [customMaps, setCustomMaps] = useState<SavedMap[]>(() => loadCustomMaps());
  const handleSandboxStart = (level: number, enemies: number, randomRoad: boolean, seed: number | null = randomRoad ? newMapSeed() : null) => {
    sound.init();
    setSandboxWaveOpen(false);
    setSandboxWave({ faction: enemies || level, wave: 1, counts: {} });
    setSpecModalTower(null);
    setShopCards([]);
    const begin = () => {
      if (!canvasRef.current || !engineRef.current) return;
      engineRef.current.setCanvas(canvasRef.current);
      engineRef.current.startSandbox(level, difficulty, enemies || level, race, seed);
    };
    if (screen === 'playing') begin();
    else {
      setScreen('playing');
      setTimeout(begin, 50);
    }
  };
  const launchSandboxWave = () => {
    sound.init();
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.sandboxLaunch(sandboxWave.counts, sandboxWave.wave, sandboxWave.faction)) setSandboxWaveOpen(false);
  };
  const saveSandboxLog = () => {
    engineRef.current?.saveLog();
    downloadRunLog();
  };

  const handleBrawlStart = (level: number, bots: Difficulty, randomRoad = false) => {
    sound.init();
    const startAt = performance.now();
    const room = new BrawlRoom(level, race, brawlBots(bots), startAt, () => engineRef.current?.lives ?? 0);
    room.onChange(setBrawl);
    brawlRoomRef.current = room;
    setMode('duel');
    // Every wave brings the opponent's own army: its race's enemies (просьба Артура 2026-11-01)
    const own = CONFIG.races[race].faction;
    handleDuelStart(room, level, startAt, room.factionForWave(1), own, CONFIG.brawl.roundLength, randomRoad ? newMapSeed() : null);
  };
  // Network brawl from its lobby (BrawlLobby.tsx): the same room, its seats are the lobby's players
  const [brawlLobby, setBrawlLobby] = useState<{ mode: 'host' | 'join'; level: number; bots: Difficulty; randomRoad: boolean } | null>(null);
  const handleBrawlNetStart = (setup: BrawlNetSetup, level: number, bots: Difficulty, startAt: number) => {
    sound.init();
    const room = new BrawlRoom(level, race, brawlBots(bots), startAt, () => engineRef.current?.lives ?? 0, setup);
    room.onChange(setBrawl);
    room.setViewSource(() => engineRef.current?.fieldView() ?? null);
    brawlRoomRef.current = room;
    setMode('duel');
    handleDuelStart(room, level, startAt, room.factionForWave(1), CONFIG.races[race].faction, CONFIG.brawl.roundLength, setup.seed || null);
  };

  // Duel: my state to the opponent every few seconds; silence for too long means they are gone
  useEffect(() => {
    if (screen !== 'playing' || !gameState.duel) return;
    const t = window.setInterval(() => {
      const link = duelLinkRef.current;
      const engine = engineRef.current;
      if (!link || !engine || duelOutcomeRef.current) return;
      link.send({ t: 'state', lives: engine.lives, wave: engine.shownWave(), income: engine.duelIncome });
      if (performance.now() - duelSeenRef.current > CONFIG.duel.peerTimeout * 1000) finishDuel('gone');
    }, CONFIG.duel.stateInterval * 1000);
    return () => window.clearInterval(t);
  }, [screen, gameState.duel, finishDuel]);

  // Дуэль людей: моё поле соперику, пока он смотрит (раз в 0,5 с), и мой запрос его поля (раз в 2 с)
  useEffect(() => {
    if (screen !== 'playing' || !gameState.duel || brawl) return;
    const t = window.setInterval(() => {
      const link = duelLinkRef.current;
      const engine = engineRef.current;
      if (!link || !engine || duelOutcomeRef.current || link.botInfo) return;
      const now = performance.now();
      if (duelWatchedAtRef.current && now - duelWatchedAtRef.current < 6000) link.send({ t: 'view', v: engine.fieldView() });
      if (botWatchRef.current && (!duelAskedAtRef.current || now - duelAskedAtRef.current >= 2000)) {
        duelAskedAtRef.current = now;
        link.send({ t: 'watch', on: true });
      }
    }, 500);
    return () => window.clearInterval(t);
  }, [screen, gameState.duel, brawl]);

  // Duel: my castle fell
  useEffect(() => {
    if (!gameState.isGameOver || !gameState.duel || duelOutcomeRef.current) return;
    duelLinkRef.current?.send({ t: 'lost', wave: gameState.wave });
    finishDuel('lost');
  }, [gameState.isGameOver, gameState.duel, gameState.wave, finishDuel]);

  // Closing the page in a duel counts as leaving it
  useEffect(() => {
    window.addEventListener('pagehide', closeDuel);
    return () => window.removeEventListener('pagehide', closeDuel);
  }, [closeDuel]);

  // Menu «Играть»: the selected level (never a locked one) goes to its briefing
  const handleOpenBriefing = () => {
    sound.init();
    setSelectedLevel((lvl) => Math.min(lvl, unlockedLevel));
    setScreen(mode === 'duel' ? 'duelLobby' : 'briefing');
  };

  // Account: progress belongs to its owner (guest or account). Signing in switches to the account's copy
  // (device + cloud, max); the guest progress moves in only if the account has none yet. Sign-out returns to the guest copy.
  const cloudLoadedFor = useRef<string | null>(null); // the account whose progress is already merged in
  const ownerRef = useRef<string | null>(null);
  const [cloudTick, setCloudTick] = useState(0); // forces a save right after the merge
  const switchOwner = (owner: string | null) => {
    ownerRef.current = owner;
    setProgressOwner(owner);
    setProgress(readLocalProgress(owner));
  };
  useEffect(() => onUserChange(setUser), []);
  useEffect(() => {
    if (!user) {
      cloudLoadedFor.current = null;
      if (ownerRef.current !== null) switchOwner(null);
      setSyncState('idle');
      return;
    }
    let cancelled = false;
    if (ownerRef.current !== user.id) switchOwner(user.id);
    setSyncState('syncing');
    loadCloudProgress(user.id)
      .then((cloud) => {
        if (cancelled) return;
        if (cloud) setProgress((prev) => mergeProgress(prev, cloud));
        // A brand-new account takes the guest progress once; the guest copy is emptied so the next account starts clean
        const own = cloud ? mergeProgress(readLocalProgress(user.id), cloud) : readLocalProgress(user.id);
        const guest = readLocalProgress(null);
        if (isEmptyProgress(own) && !isEmptyProgress(guest)) {
          setProgress(guest);
          writeLocalProgress(EMPTY_PROGRESS, null);
        }
        cloudLoadedFor.current = user.id;
        // Saving below runs with the merged progress and writes it back to the account
        setSyncState('ok');
        setCloudTick((n) => n + 1);
      })
      .catch(() => !cancelled && setSyncState('error'));
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Поход в облаке (просьба Артура 2026-11-12): при входе берётся более свежая копия — с устройства или из аккаунта,
  // потом каждое изменение уходит в аккаунт с задержкой. Поход гостя переходит в аккаунт, чужой поход на устройстве не трогаем
  const worldSyncedFor = useRef<string | null>(null);
  const worldBattleRef = useRef<WorldObj | null>(null);
  worldBattleRef.current = worldBattle;
  useEffect(() => {
    if (!user) {
      worldSyncedFor.current = null;
      return;
    }
    let cancelled = false;
    loadCloudWorld(user.id)
      .then((cloud) => {
        if (cancelled) return;
        const meta = readWorldMeta();
        const local = loadWorld();
        const cw = cloud ? normalizeWorld(cloud.state) : null;
        const foreign = meta.owner !== null && meta.owner !== user.id; // на устройстве поход другого аккаунта
        // Поход без отметки времени (играли до облака): побеждает тот, что дальше продвинулся
        const score = (w: WorldState) => (REGIONS[w.region]?.chapter ?? 1) * 100000 + (w.done.length + w.owned.length) * 100 + w.xp;
        const cloudNewer = !!cw && !!local && (meta.at === 0 ? score(cw) > score(local) : cloud!.at > meta.at);
        if (cloud && cw && (!local || foreign || cloudNewer)) {
          if (worldBattleRef.current) return; // бой идёт: подхватим при следующем входе
          worldPrevRef.current = cw;
          setWorldState(cw);
          saveWorld(cw, false);
          writeWorldMeta({ at: cloud.at, owner: user.id });
          worldSyncedFor.current = user.id;
        } else if (local && !foreign) {
          writeWorldMeta({ at: meta.at || Date.now(), owner: user.id });
          worldSyncedFor.current = user.id;
          saveCloudWorld(user.id, { state: local, at: readWorldMeta().at }).catch(() => {});
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);
  useEffect(() => {
    if (!user || !world || worldSyncedFor.current !== user.id) return;
    const t = setTimeout(() => {
      const meta = readWorldMeta();
      if (meta.owner === user.id) saveCloudWorld(user.id, { state: world, at: meta.at }).catch(() => {});
    }, 2000);
    return () => clearTimeout(t);
  }, [world, user]);

  // Save on every change: this device under its owner, the account (after its progress was read) with a short delay
  useEffect(() => {
    writeLocalProgress(progress, progressOwner);
    if (!user || progressOwner !== user.id || cloudLoadedFor.current !== user.id) return;
    const t = setTimeout(() => {
      setSyncState('syncing');
      saveCloudProgress(user.id, progress)
        .then(() => setSyncState('ok'))
        .catch(() => setSyncState('error'));
    }, 600);
    return () => clearTimeout(t);
  }, [progress, progressOwner, user, cloudTick]);

  // Handle Level Start from briefing
  const handleStartBattle = () => {
    sound.init();
    setScreen('playing');
    setTimeout(() => {
      if (canvasRef.current && engineRef.current) {
        engineRef.current.setCanvas(canvasRef.current);
        engineRef.current.startLevel(selectedLevel, difficulty, endless, enemyFaction, race, endless && randomMap ? newMapSeed() : null);
        setShopCards(generateShopCards(1));
      }
    }, 50);
  };

  // Поход: пассивки лагеря и предметы героя, умения по его уровню
  const heroIntoBattle = (eng: GameEngine, obj: WorldObj) => {
    if (!world) return;
    const region = REGIONS[world.region] ?? FRONTIER;
    eng.setInvasion(invasion(region)(obj.x, obj.y)); // у лагеря главы — природа континента, к крепости — биом захватчика
    eng.setCampBoons(battlePerks(world));
    eng.setHeroSkills(HERO_ABILITIES.filter((d) => d.unlock <= heroLevel(world)).map((d) => d.id));
    eng.mergeLocked = !world.scenes.includes('levels'); // слияние открывает урок на переправе
    eng.heroToken = true; // на своём поле стоит Рен
  };

  // Отладка: начать бой похода по id объекта (`window.startWorldBattleById('sq1')`) — для проверки обучения без хождения по карте
  useEffect(() => {
    (window as unknown as { startWorldBattleById?: (id: string) => void }).startWorldBattleById = (id: string) => {
      const o = (REGIONS[world?.region ?? 'frontier'] ?? FRONTIER).objects.find((x) => x.id === id);
      if (o) startWorldBattle(o, true);
    };
  });
  // Поход: бой с армией, где вкладка «Армия» открывается по сюжету (крепость: на волне `armyAt` врывается Каллен)
  const armyLocked = !!worldBattle?.armyAt && gameState.wave < worldBattle.armyAt;
  useEffect(() => {
    if (armyLocked && sideTab === 'army') setSideTab('towers');
  }, [armyLocked, sideTab]);
  // Сцены посреди боя похода: `wave:<объект>:<N>`; пока плашка открыта, бой на паузе
  useEffect(() => {
    if (!worldBattle || !world || screen !== 'playing') return;
    const sc = sceneFor(`wave:${worldBattle.id}:${gameState.wave}`, world.scenes, world.flags);
    if (sc && battleScene?.id !== sc.id) setBattleScene(sc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldBattle, gameState.wave, screen]);
  // Пока идёт реплика посреди боя, бой стоит (в бою с армией часы раундов тоже)
  const scenePausedRef = useRef(false);
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    if (battleScene && !eng.isPaused) {
      eng.togglePause();
      scenePausedRef.current = true;
    } else if (!battleScene && scenePausedRef.current) {
      scenePausedRef.current = false;
      if (eng.isPaused) eng.togglePause();
    }
  }, [battleScene]);
  // Обучение в бою (просьба Артура 2026-11-12): шаг, подсветка, таймер стоит, пока шаг не сделан
  const tutDone = useRef(new Set<string>());
  const tutUsed = useRef(new Set<string>());
  const tutGranted = useRef(new Set<string>());
  const [tutSkipped, setTutSkipped] = useState(false);
  const [tutStep, setTutStep] = useState<TutStep | null>(null);
  useEffect(() => {
    tutDone.current = new Set();
    tutUsed.current = new Set();
    tutGranted.current = new Set();
    setTutSkipped(false);
    setTutStep(null);
  }, [worldBattle?.id]);
  useEffect(() => {
    const eng = engineRef.current;
    const steps = worldBattle && world && screen === 'playing' && !tutSkipped && !world.scenes.includes(`tut:${worldBattle.id}`) ? tutorialFor(worldBattle.id) : null;
    if (!steps || !world || !eng || !eng.worldBattleStarted || gameState.isVictory || gameState.isGameOver) {
      if (eng) eng.tutorialFreeze = false;
      setTutStep((s) => (s ? null : s));
      return;
    }
    if (gameState.speed !== 1 || gameState.isPaused) tutUsed.current.add('speed');
    const ctx = { gs: gameState, inShop: shopCards.map((c) => (c && c.type !== 'binder' ? String(c.type) : '')), scenes: world.scenes, used: tutUsed.current };
    let active: TutStep | null = null;
    for (const st of steps) {
      if (tutDone.current.has(st.id)) continue;
      if (st.done(ctx)) {
        tutDone.current.add(st.id);
        continue;
      }
      if (st.when && !st.when(ctx)) continue;
      active = st;
      break;
    }
    if (!active) {
      // всё пройдено: в бою больше не напоминать
      eng.tutorialFreeze = false;
      setTutStep(null);
      setWorld({ ...world, scenes: [...world.scenes, `tut:${worldBattle!.id}`] });
      return;
    }
    if (active.grant && !tutGranted.current.has(active.id)) {
      tutGranted.current.add(active.id);
      eng.tutorialGrant(active.grant);
    }
    if (active.lines) {
      const id = `tut:${active.id}`;
      if (!battleScene && !world.scenes.includes(id)) setBattleScene({ id, lines: active.lines });
      eng.tutorialFreeze = true;
      setTutStep((s) => (s ? null : s));
      return;
    }
    eng.tutorialFreeze = !!active.freeze && !gameState.isWaveActive;
    setTutStep((s) => (s?.id === active!.id ? s : active));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, shopCards, world, worldBattle, screen, tutSkipped, battleScene]);
  const skipTutorial = () => {
    setTutSkipped(true);
    setTutStep(null);
    if (engineRef.current) engineRef.current.tutorialFreeze = false;
    if (world && worldBattle) setWorld({ ...world, scenes: [...world.scenes, `tut:${worldBattle.id}`] });
  };
  const closeBattleScene = () => {
    if (battleScene && world && !world.scenes.includes(battleScene.id)) setWorld({ ...world, scenes: [...world.scenes, battleScene.id] });
    setBattleScene(null);
  };

  // Лог похода: с чем герой входит в бой и чем бой кончился (полный лог боя — из движка)
  const logWorldBattleStart = (obj: WorldObj) => {
    if (!world) return;
    const region = REGIONS[world.region] ?? FRONTIER;
    logBattleStart(world, obj, {
      level: region.level,
      waves: obj.army ? null : (obj.waves ?? 3),
      army: obj.army ? (armyLevel(world, obj) ?? obj.army) : null,
      armyAt: obj.armyAt ?? null,
      faction: obj.faction ?? null,
      bossLast: !!obj.bossLast,
      mapSeed: battleSeed(obj),
      invasion: Math.round(invasion(region)(obj.x, obj.y) * 100) / 100,
      towers: allowedTowers(world, region, obj),
      skills: HERO_ABILITIES.filter((d) => d.unlock <= heroLevel(world)).map((d) => d.id),
    });
  };
  const logWorldBattleEnd = (outcome?: CampaignBattle['outcome']) => {
    const eng = engineRef.current;
    if (!worldBattle || !eng) return;
    const how = outcome ?? (eng.isVictory ? 'victory' : eng.isGameOver ? 'defeat' : 'left');
    if (eng.runLog?.data.result === 'running') eng.saveLog('left'); // бой брошен: срез башен и золота на момент выхода
    logBattleEnd(world, worldBattle, how, eng.runLog?.data ?? null);
  };

  // Поход: бой отряда или крепости на обычном поле — первые N волн уровня биома
  const startWorldBattle = (obj: WorldObj, fresh = false) => {
    sound.init();
    // Бой с армией: есть сохранение с передышки — предложить продолжить (просьба Артура 2026-11-12)
    let saved = obj.army && !fresh ? loadBattleSave() : null;
    if (saved && (saved.obj !== obj.id || saved.region !== (world?.region ?? 'frontier'))) saved = null;
    if (saved && !window.confirm(`Есть сохранённый бой: пройдено этапов — ${saved.stage} из ${saved.total}. Продолжить с него? (Отмена — начать бой заново)`)) saved = null;
    if (obj.army && !saved) clearBattleSave();
    if (engineRef.current) engineRef.current.worldBattleStarted = false; // снимок состояния пока от прошлого боя
    setWorldBattle(obj);
    setBattleScene(null);
    setSideTab('towers');
    if (world) worldTowersRef.current = allowedTowers(world, REGIONS[world.region] ?? FRONTIER, obj);
    logWorldBattleStart(obj);
    setSpecModalTower(null);
    if (obj.army) {
      // Бой с армией (просьба Артура 2026-11-06): как дуэль с ботом — волны идут без конца, пока не падёт артефакт вражеского лагеря
      closeDuel();
      const region = REGIONS[world?.region ?? 'frontier'] ?? FRONTIER;
      handleDuelStart(createBotLink(region.level, (world && armyLevel(world, obj)) || obj.army, () => engineRef.current?.duelNow() ?? performance.now(), saved ? (saved.bot as BotSave) : undefined), region.level, performance.now(), region.level, CONFIG.races.humans.faction, CONFIG.duel.roundLength, battleSeed(obj), 'humans', (eng) => {
        eng.stageEnds = battleStages(obj);
        eng.duelSpeedable = true; // бой с армией ни с кем не синхронизирован: скорость можно менять, часы раундов идут с ней
        eng.onCheckpoint = (cp) => saveBattleSave({ obj: obj.id, region: world?.region ?? 'frontier', at: Date.now(), stage: cp.stageDone.length + 1, total: battleStages(obj).length + 1, engine: cp, bot: duelLinkRef.current?.saveState?.() ?? null, shop: shopCardsRef.current });
        heroIntoBattle(eng, obj);
        if (saved) {
          eng.restoreCheckpoint(saved.engine);
          const shop = saved.shop as (ShopCard | null)[];
          window.setTimeout(() => setShopCards(shop), 0); // handleDuelStart после этого кладёт свежую лавку
        }
      });
      return;
    }
    setScreen('playing');
    setTimeout(() => {
      if (canvasRef.current && engineRef.current) {
        engineRef.current.setCanvas(canvasRef.current);
        const region = REGIONS[world?.region ?? 'frontier'] ?? FRONTIER;
        engineRef.current.startWorldBattle(region.level, obj.waves ?? 3, battleSeed(obj), 'normal', { faction: obj.faction, bossLast: obj.bossLast, bossName: obj.bossName, bossTint: obj.bossTint, countMult: obj.countMult });
        heroIntoBattle(engineRef.current, obj);
        setShopCards(generateShopCards(1));
      }
    }, 50);
  };

  // Конец боя похода: победа отдаёт награду и пускает героя в гекс, иначе герой остаётся рядом
  const leaveWorldBattle = (won: boolean) => {
    const obj = worldBattle;
    const engine = engineRef.current;
    logWorldBattleEnd(won ? 'victory' : undefined);
    if (engine) {
      engine.stopLoop();
      engine.isVictory = false;
      engine.isGameOver = false;
      engine.isPaused = false;
      engine.notifyState();
    }
    setSpecModalTower(null);
    setWorldBattle(null);
    setBattleScene(null);
    worldTowersRef.current = null;
    if (obj?.army) {
      closeDuel();
      setDuelOutcome(null);
      setOpponent(null);
    }
    if (won && obj?.army) clearBattleSave();
    if (won && obj && world) {
      const st = { ...world, res: { ...world.res }, done: [...world.done], owned: [...world.owned], seen: [...world.seen], scenes: [...world.scenes], flags: [...world.flags] };
      winBattle(st, REGIONS[st.region] ?? FRONTIER, obj.id);
      logReason('battle-won', { obj: obj.id });
      setWorld(st);
    }
    setScreen('world');
  };

  // Outcome screen action: Restart level with clean state
  const handleRestartLevel = () => {
    sound.init();
    setSpecModalTower(null);
    setShopCards(generateShopCards(1));
    const engine = engineRef.current;
    if (!engine) return;

    const seed = engine.mapSeed; // «Повторить» — та же случайная дорога
    if (worldBattle) logWorldBattleEnd(engine.isVictory ? 'victory' : engine.isGameOver ? 'defeat' : 'restart');
    if (worldBattle?.army) {
      startWorldBattle(worldBattle, true);
      return;
    }
    if (worldBattle) {
      logWorldBattleStart(worldBattle);
      if (canvasRef.current) engine.setCanvas(canvasRef.current);
      engine.startWorldBattle((REGIONS[world?.region ?? 'frontier'] ?? FRONTIER).level, worldBattle.waves ?? 3, battleSeed(worldBattle), 'normal', { faction: worldBattle.faction, bossLast: worldBattle.bossLast, bossName: worldBattle.bossName, bossTint: worldBattle.bossTint, countMult: worldBattle.countMult });
      heroIntoBattle(engine, worldBattle);
      return;
    }
    if (engine.sandbox) {
      // «Заново» в свободном режиме — та же карта (и своя), та же раса
      engine.sandboxRestart();
      return;
    }
    if (screen === 'playing' && canvasRef.current) {
      engine.setCanvas(canvasRef.current);
      engine.startLevel(selectedLevel, difficulty, endless, enemyFaction, race, seed);
    } else {
      setScreen('playing');
      setTimeout(() => {
        if (canvasRef.current && engineRef.current) {
          engineRef.current.setCanvas(canvasRef.current);
          engineRef.current.startLevel(selectedLevel, difficulty, endless, enemyFaction, race, seed);
        }
      }, 50);
    }
  };

  // Outcome screen action: Return to main menu
  const handleToMenu = () => {
    sound.init();
    if (worldBattle) {
      leaveWorldBattle(false);
      return;
    }
    closeDuel();
    setBrawl(null);
    brawlRoomRef.current = null;
    setBotWatch(false);
    setWatchId(null);
    setWatchView(null);
    setSpecModalTower(null);
    if (engineRef.current) {
      engineRef.current.stopLoop();
      engineRef.current.isVictory = false;
      engineRef.current.isGameOver = false;
      engineRef.current.isPaused = false;
      engineRef.current.notifyState();
    }
    setScreen('menu');
  };

  // User taps a shop card: it is paid at once and goes to the backpack, ready to be placed
  const handleSelectShopCard = (cardIdx: number) => {
    sound.init();
    const card = shopCards[cardIdx];
    if (!card) return;

    const engine = engineRef.current;
    if (!engine) return;

    const takeCard = () => {
      setShopCards((prev) => {
        const next = [...prev];
        next[cardIdx] = null;
        return next;
      });
    };

    if (card.type === 'binder') {
      if (engine.buyToBackpack('binder', null, false, null)) takeCard();
      return;
    }

    // A ready tower (★ or Ур.3) first asks for its specialization; nothing is paid until it is chosen (towers without them go straight in)
    const startLevel = card.level3 ? 3 : card.isTriplet ? 2 : 1;
    if (startLevel > 1 && CONFIG.towers[card.type].specs.length > 0) {
      if (engine.gold < engine.towerPrice(card.type, startLevel) || engine.overflowPending()) {
        engine.buyToBackpack('tower', card.type, true, null, startLevel); // only reports why it cannot
        return;
      }
      engine.selectTower(null);
      setSpecModalTower({
        id: 'triplet_pre',
        type: card.type,
        isPrePlacement: true,
        cardIndex: cardIdx,
        cardId: card.id,
        startLevel,
      });
      return;
    }

    if (engine.buyToBackpack('tower', card.type, startLevel > 1, null, startLevel)) takeCard();
  };

  // Specialization picked in modal
  const handleSelectSpec = (specId: string) => {
    sound.init();
    const engine = engineRef.current;
    if (!engine || !specModalTower) return;

    if (specModalTower.isPrePlacement && specModalTower.cardIndex !== undefined) {
      // Triplet card specialization selected -> pay and put it in the backpack
      const cardId = specModalTower.cardId;
      if (engine.buyToBackpack('tower', specModalTower.type, true, specId, specModalTower.startLevel ?? 2)) {
        // The shop may have been refreshed while choosing: take the card away only if it is still there
        setShopCards((prev) => prev.map((c) => (c && c.id === cardId ? null : c)));
      }
    } else {
      // Tower upgraded to lvl 2 via merge
      // Closed first: for a pair the engine may ask again right away for the second part
      setSpecModalTower(null);
      engine.setTowerSpecialization(specModalTower.id, specId, specModalTower.part);
      sound.playBuy();
      return;
    }
    setSpecModalTower(null);
  };

  // Shop Reroll
  const handleRerollShop = () => {
    sound.init();
    const engine = engineRef.current;
    if (!engine) return;
    if (!engine.payReroll()) {
      sound.playError();
      return;
    }
    sound.playBuy();
    setShopCards(generateShopCards(engine.tier));
  };

  // Upgrade Shop Tier
  const handleUpgradeTier = () => {
    sound.init();
    const engine = engineRef.current;
    if (!engine) return;
    engine.upgradeTier();
  };

  // Start Next Wave
  const handleStartWave = () => {
    sound.init();
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.sandbox) {
      // Пробел в свободном режиме: повторить собранную волну, а если она пуста — открыть окно состава
      if (!engine.sandboxLaunch(sandboxWave.counts, sandboxWave.wave, sandboxWave.faction)) setSandboxWaveOpen(true);
      return;
    }
    engine.startNextWave();
  };

  // Merge selected tower
  const handleMerge = () => {
    sound.init();
    const engine = engineRef.current;
    if (!engine) return;
    engine.mergeSelectedTower();
  };

  // Cultists: build the figure the tower stands in into one tower (shape — when it stands in several)
  const handleFuse = (shape?: 'T' | 'P') => {
    sound.init();
    engineRef.current?.fuseSelected(shape);
  };

  // Sell selected tower or binder
  const handleSell = () => {
    sound.init();
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.selectedBinderId) engine.sellBinder(engine.selectedBinderId);
    else if (engine.selectedTowerId) engine.sellTower(engine.selectedTowerId);
  };

  // Start or cancel binding the selected tower with another one
  const handleBind = () => {
    sound.init();
    engineRef.current?.toggleBinding();
  };

  // Selected binder: merge three into a triple one, or (triple) start raising a tower
  const handleMergeBinders = () => {
    sound.init();
    engineRef.current?.mergeBinders();
  };
  const handleUpgradeWithBinder = () => {
    sound.init();
    engineRef.current?.toggleUpgrading();
  };

  const handleUpgradeTower = () => {
    sound.init();
    engineRef.current?.upgradeSelectedTower();
  };

  // Cycle Priority
  const handleCyclePriority = () => {
    sound.init();
    const engine = engineRef.current;
    if (!engine || !engine.selectedTowerId) return;
    engine.cycleTargetPriority(engine.selectedTowerId);
  };

  // Canvas pointer interaction (Placement & Selection). A tap acts on release, so the first
  // finger of a pinch does nothing; one finger dragged pans a zoomed field, or between waves
  // moves the tower it started on; two fingers zoom and pan
  const toCanvas = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) * CONFIG.grid.totalWidth) / rect.width,
      y: ((clientY - rect.top) * CONFIG.grid.totalHeight) / rect.height,
    };
  };
  const toCell = (clientX: number, clientY: number) => {
    const c = toCanvas(clientX, clientY);
    return engineRef.current!.cellAtScreen(c.x, c.y);
  };

  const handleCanvasTap = (cellX: number, cellY: number) => {
    const engine = engineRef.current;
    if (!engine) return;

    // If in placement mode:
    if (engine.placingSlot !== null) {
      if (engine.placingBinder) engine.placeBinder(cellX, cellY);
      else engine.placeTower(cellX, cellY);
      return;
    }

    // A hypertower is being placed: the tap picks one of its three cells
    if (engine.hyperPlan) {
      engine.pickHyperCell(cellX, cellY);
      return;
    }

    // Normal click: check if a tower is clicked
    const clickedTower = engine.towerAtCell(cellX, cellY);
    if (engine.bindingFromId) {
      // Binding: a tap on a partner binds, any other tap cancels
      if (clickedTower && clickedTower.id !== engine.bindingFromId) engine.bindWith(clickedTower);
      else engine.toggleBinding();
      return;
    }
    if (engine.upgradingFromBinderId) {
      // Triple binder: a tap on a tower raises it, any other tap cancels
      if (clickedTower) engine.upgradeWithBinder(clickedTower);
      else engine.toggleUpgrading();
      return;
    }
    const clickedBinder = engine.binders.find((b) => b.x === cellX && b.y === cellY);
    if (CONFIG.grid.castleCells.some((c) => c.x === cellX && c.y === cellY)) {
      engine.selectCastle();
      sound.playBuy();
    } else if (clickedBinder) {
      engine.selectBinder(clickedBinder.id);
      sound.playBuy();
    } else if (clickedTower) {
      engine.selectTower(clickedTower.id);
      sound.playBuy();
    } else if (engine.selectedTowerId && engine.moveSelectedTower(cellX, cellY)) {
      // Between waves: a tap on a free cell moves the selected tower there
    } else {
      // Tapped empty cell: deselect
      engine.selectTower(null);
    }
  };

  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  // The current press: where it started, whether it became a drag or a pinch
  const gestureRef = useRef<{ x: number; y: number; mode: 'tap' | 'pan' | 'tower' | 'pinch' | 'paint'; towerId: string | null } | null>(null);
  const pinchRef = useRef<{ dist: number; midX: number; midY: number } | null>(null);
  const DRAG_START_PX = 8;

  const pinchState = () => {
    const [a, b] = [...pointersRef.current.values()];
    const ca = toCanvas(a.x, a.y);
    const cb = toCanvas(b.x, b.y);
    return { dist: Math.hypot(ca.x - cb.x, ca.y - cb.y), midX: (ca.x + cb.x) / 2, midY: (ca.y + cb.y) / 2 };
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    sound.init();
    const engine = engineRef.current;
    if (!engine || !canvasRef.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 1 && engine.isMapEditing()) {
      // Редактор карты: кисть рисует сразу и дальше по клеткам, через которые ведут палец или мышь
      const cell = toCell(e.clientX, e.clientY);
      engine.mapEditPaint(cell.x, cell.y, true);
      gestureRef.current = { x: e.clientX, y: e.clientY, mode: 'paint', towerId: null };
    } else if (pointersRef.current.size === 1) {
      const cell = toCell(e.clientX, e.clientY);
      const tower = engine.towerAtCell(cell.x, cell.y);
      // A press on a tower can drag it to another cell: free between waves, for gold in a duel during a wave
      const towerId = tower && engine.placingSlot === null && !engine.hyperPlan && !engine.bindingFromId && !engine.upgradingFromBinderId && engine.moveCost() !== null ? tower.id : null;
      engine.moveGrab = towerId ? cell : null;
      gestureRef.current = { x: e.clientX, y: e.clientY, mode: 'tap', towerId };
    } else if (pointersRef.current.size === 2) {
      if (gestureRef.current) gestureRef.current.mode = 'pinch';
      pinchRef.current = pinchState();
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current;
    if (!engine || !canvasRef.current) return;

    const cell = toCell(e.clientX, e.clientY);
    if (cell.x >= 0 && cell.x < CONFIG.grid.cols && cell.y >= 0 && cell.y < CONFIG.grid.rows) {
      engine.hoverCell = cell;
    } else {
      engine.hoverCell = null;
    }

    const prev = pointersRef.current.get(e.pointerId);
    if (!prev) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gestureRef.current;
    if (!g) return;

    if (g.mode === 'pinch') {
      if (pointersRef.current.size < 2 || !pinchRef.current) return;
      const now = pinchState();
      const before = pinchRef.current;
      if (before.dist > 0) engine.zoomAt(now.midX, now.midY, now.dist / before.dist);
      engine.panBy(now.midX - before.midX, now.midY - before.midY);
      pinchRef.current = now;
      return;
    }
    if (g.mode === 'paint') {
      if (cell.x >= 0 && cell.x < CONFIG.grid.cols && cell.y >= 0 && cell.y < CONFIG.grid.rows) engine.mapEditPaint(cell.x, cell.y, false);
      return;
    }
    if (g.mode === 'tap' && Math.hypot(e.clientX - g.x, e.clientY - g.y) > DRAG_START_PX) {
      if (g.towerId) {
        g.mode = 'tower';
        engine.selectTower(g.towerId);
        sound.playBuy();
      } else if (engine.viewZoom > 1) {
        g.mode = 'pan';
      }
    }
    if (g.mode === 'pan') {
      const a = toCanvas(prev.x, prev.y);
      const b = toCanvas(e.clientX, e.clientY);
      engine.panBy(b.x - a.x, b.y - a.y);
    }
  };

  // Release: a tap acts, a tower drag moves the tower over a free cell
  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current;
    if (!pointersRef.current.delete(e.pointerId)) return;
    const g = gestureRef.current;
    if (g?.mode === 'pinch') {
      if (pointersRef.current.size === 2) pinchRef.current = pinchState();
      if (pointersRef.current.size === 0) gestureRef.current = null;
      return;
    }
    gestureRef.current = null;
    if (!engine || !canvasRef.current || !g || e.type === 'pointercancel') return;
    const cell = toCell(e.clientX, e.clientY);
    if (g.mode === 'tap') {
      handleCanvasTap(cell.x, cell.y);
    } else if (g.mode === 'tower' && engine.selectedTowerId === g.towerId) {
      const tower = engine.towers.find((t) => t.id === g.towerId);
      const grab = engine.moveGrab;
      if (tower && (!grab || grab.x !== cell.x || grab.y !== cell.y)) engine.moveSelectedTower(cell.x, cell.y, true, grab);
    }
    engine.moveGrab = null;
  };

  const handleCanvasPointerLeave = () => {
    if (engineRef.current) engineRef.current.hoverCell = null;
  };

  // Wheel: a trackpad pinch or Ctrl + wheel (ctrlKey) zooms at the cursor, a plain wheel or a
  // two-finger trackpad scroll pans. A native listener, since React's wheel listener cannot preventDefault
  useEffect(() => {
    const canvas = canvasRef.current;
    if (screen !== 'playing' || !canvas) return;
    const onWheel = (e: WheelEvent) => {
      const engine = engineRef.current;
      if (!engine) return;
      e.preventDefault();
      const c = toCanvas(e.clientX, e.clientY);
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      if (e.ctrlKey) {
        engine.zoomAt(c.x, c.y, Math.exp(-Math.max(-100, Math.min(100, dy)) * 0.01));
      } else {
        const rect = canvas.getBoundingClientRect();
        engine.panBy((-dx * CONFIG.grid.totalWidth) / rect.width, (-dy * CONFIG.grid.totalHeight) / rect.height);
      }
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [screen]);

  // Keyboard controls: the handler is rebuilt every render, so it always sees the current
  // mode, level and difficulty; the listener is added once and calls the latest one

  // Режим разработчика: снимок игры для заметки и запись заметки в логи
  const devPausedRef = useRef(false);
  const devContext = (): Record<string, unknown> => {
    const eng = engineRef.current;
    const g = gameState;
    const ctx: Record<string, unknown> = {
      screen,
      mode: screen === 'world' ? 'world' : worldBattle ? 'world-battle' : brawl ? 'brawl' : g.duel ? 'duel' : g.sandbox ? 'sandbox' : g.endless ? 'endless' : mode,
      menuPage: screen === 'menu' ? menuPage : undefined,
      difficulty,
      race,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      layout,
    };
    if (screen === 'playing' && eng) {
      ctx.field = {
        map: g.level,
        mapName: g.mapName,
        mapSeed: eng.mapSeed,
        faction: g.faction,
        wave: g.wave,
        maxWaves: g.maxWaves,
        waveActive: g.isWaveActive,
        countdown: g.waveCountdown,
        gold: Math.round(g.gold),
        lives: Math.round(g.lives),
        supplyPower: g.supplyPower,
        supplyMult: g.supplyMult,
        shopTier: g.tier,
        towers: eng.towers.length,
        speed: g.speed,
        paused: g.isPaused,
        over: g.isGameOver ? 'defeat' : g.isVictory ? 'victory' : null,
        brawl: brawl ? { wave: brawl.wave, alive: brawl.alive, place: brawl.yourPlace } : undefined,
      };
      const rl = eng.runLog;
      if (rl) ctx.run = { startedAt: rl.data.startedAt, mode: rl.data.mode, t: eng.gameSeconds(), wave: eng.wavesLaunched };
    }
    if (world && (screen === 'world' || worldBattle)) {
      ctx.campaign = {
        region: world.region,
        day: world.day,
        moves: world.moves,
        res: { ...world.res },
        xp: world.xp,
        done: world.done.length,
        flags: [...world.flags],
        battle: worldBattle ? worldBattle.id : null,
      };
    }
    return ctx;
  };
  const devSaved = (note: DevNote) => {
    const eng = engineRef.current;
    const info = { id: note.id, category: note.category, text: note.text };
    if (screen === 'playing' && eng?.runLog) eng.logDevNote(info);
    if (world && (screen === 'world' || worldBattle)) logWorldNote(world, 'dev-note', info);
  };
  const devOpenChange = (open: boolean) => {
    const eng = engineRef.current;
    if (!eng || screen !== 'playing' || (gameState.duel && !eng.duelSpeedable) || brawl) return; // у дуэли и потасовки пауза не останавливает бой (бой с армией в походе — останавливает)
    if (open && !eng.isPaused) {
      eng.togglePause();
      devPausedRef.current = true;
    } else if (!open && devPausedRef.current) {
      devPausedRef.current = false;
      if (eng.isPaused) eng.togglePause();
    }
  };

  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandlerRef.current = (e: KeyboardEvent) => {
    const engine = engineRef.current;
    if (!engine) return;
    const tg = e.target as HTMLElement | null;
    if (tg && (tg.tagName === 'TEXTAREA' || tg.tagName === 'INPUT')) return; // набор текста (заметка разработчика)
    // Сочетания браузера и системы (Cmd+R, Cmd+S, Ctrl+C) — не команды игры; зажатая клавиша срабатывает один раз
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;

    if (e.key === ' ' || e.code === 'Space') {
      if (screen === 'briefing') {
        e.preventDefault();
        handleStartBattle();
      } else if (screen === 'playing' && !engine.isPaused) {
        e.preventDefault();
        // Пробел не должен заодно «нажать» кнопку, на которой остался фокус после клика (Safari, Firefox)
        if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
        handleStartWave();
      }
    } else if (e.key === 'Enter') {
      if (screen === 'menu' && menuPage === 'endless' && !showHowToPlay && !showBestiary && !showAccount) {
        e.preventDefault();
        handleOpenBriefing();
      } else if (screen === 'briefing') {
        e.preventDefault();
        handleStartBattle();
      }
    } else if (e.key === 'p' || e.key === 'P' || e.key === 'з' || e.key === 'З') {
      if (screen === 'playing') {
        e.preventDefault();
        engine.togglePause();
      }
    } else if (screen === 'playing' && e.key === '0') {
      e.preventDefault();
      engine.resetView();
    } else if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') {
      if (fullscreenSupported()) {
        e.preventDefault();
        toggleFullscreen();
      }
    } else if (e.key === 'Escape') {
      // The bestiary, the account and «Как играть» close themselves; nothing under them reacts
      if (showBestiary) return;
      if (botWatchRef.current) {
        e.preventDefault();
        setBotWatch(false);
        return;
      }
      if (watchIdRef.current) {
        e.preventDefault();
        watchField(null);
        return;
      }
      if (showAccount || showHowToPlay) {
        e.preventDefault();
        setShowAccount(false);
        setShowHowToPlay(false);
        return;
      }
      if (screen === 'menu') {
        if (menuPage !== 'home') {
          e.preventDefault();
          setMenuPage('home');
        }
        return;
      }
      if (engine.hyperPlan) {
        e.preventDefault();
        engine.cancelHyper();
        return;
      }
      if (engine.isMapEditing()) {
        e.preventDefault();
        engine.mapEditClose();
        return;
      }
      if (specModalTower) {
        // Specialization choice is mandatory, don't close with Esc
        return;
      }
      if (engine.placingSlot !== null) {
        engine.cancelPlacing();
      } else if (engine.bindingFromId) {
        engine.toggleBinding();
      } else if (engine.upgradingFromBinderId) {
        engine.toggleUpgrading();
      } else if (engine.selectedTowerId || engine.selectedBinderId || engine.castleSelected) {
        engine.selectTower(null);
      } else if (screen === 'playing') {
        engine.togglePause();
      }
    } else if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
      if (screen === 'playing' && engine.duelStart !== null && sideTab === 'army') {
        engine.buySend(SEND_TYPES[parseInt(e.key, 10) - 1]);
      } else if (screen === 'playing' && !engine.isPaused && e.key !== '6') {
        const idx = parseInt(e.key, 10) - 1;
        handleSelectShopCard(idx);
      }
    } else if (e.key === 'i' || e.key === 'I' || e.key === 'ш' || e.key === 'Ш') {
      if (screen === 'playing' && engine.selectedTowerId) setTowerDetails((d) => !d);
    } else if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') {
      if (screen === 'playing' && !engine.isPaused) {
        handleRerollShop();
      }
    } else if (e.key === 't' || e.key === 'T' || e.key === 'е' || e.key === 'Е') {
      if (screen === 'playing' && !engine.isPaused) {
        handleUpgradeTier();
      }
    } else if (e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь') {
      if (screen === 'playing' && engine.selectedTowerId) {
        handleMerge();
      } else if (screen === 'playing' && engine.selectedBinderId) {
        handleMergeBinders();
      }
    } else if (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_') {
      if (screen === 'playing') engine.stepSpeed(e.key === '+' || e.key === '=' ? 1 : -1);
    } else if (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы') {
      if (screen === 'playing' && (engine.selectedTowerId || engine.selectedBinderId)) {
        handleSell();
      }
    } else if (e.key === 'b' || e.key === 'B' || e.key === 'и' || e.key === 'И') {
      if (screen === 'playing' && engine.selectedTowerId) {
        handleBind();
      } else if (screen === 'playing' && engine.selectedBinderId) {
        handleUpgradeWithBinder();
      }
    } else if (e.key === 'u' || e.key === 'U' || e.key === 'г' || e.key === 'Г') {
      if (screen === 'playing' && engine.canUpgradeSelectedTower()) handleUpgradeTower();
    } else if (e.key === 'a' || e.key === 'A' || e.key === 'ф' || e.key === 'Ф') {
      if (screen === 'playing' && engine.selectedTowerId) engine.castAbility(engine.selectedTowerId);
    } else if (screen === 'playing' && ['KeyZ', 'KeyX', 'KeyC'].includes(e.code) && engine.heroSkills.length) {
      const h = engine.heroSkills[['KeyZ', 'KeyX', 'KeyC'].indexOf(e.code)];
      if (h) engine.castHero(h.id);
    } else if (e.key === 'Tab') {
      if (screen === 'playing' && engine.selectedTowerId) {
        e.preventDefault();
        handleCyclePriority();
      }
    }
  };
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => keyHandlerRef.current(e);
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Audio Handlers
  const handleMusicChange = (val: number) => {
    sound.setMusicVolume(val);
    setAudioSettings(sound.getSettings());
  };

  const handleSfxChange = (val: number) => {
    sound.setSfxVolume(val);
    setAudioSettings(sound.getSettings());
  };

  const handleToggleMute = () => {
    sound.toggleMute();
    setAudioSettings(sound.getSettings());
  };

  // The selected tower's card sits in the bottom corner away from it (on screen, with the zoom)
  const panelSide: 'left' | 'right' | null =
    gameState.selectedSide === null ? null : gameState.selectedSide === 'left' ? 'right' : 'left';
  const towerPanel = (
    <TowerPanel
      tower={gameState.selectedTower}
      eligibleMergeCount={gameState.eligibleMergeCount}
      mergeUsesBinder={gameState.mergeUsesBinder}
      selectedBinder={gameState.selectedBinder}
      binderCount={gameState.binderCount}
      bindPartnerCount={gameState.bindPartnerCount}
      isBinding={gameState.isBinding}
      selectedBinderTriple={gameState.selectedBinderTriple}
      canMergeBinders={gameState.canMergeBinders}
      shopTier={gameState.tier}
      upgradeTargetCount={gameState.upgradeTargetCount}
      isUpgrading={gameState.isUpgrading}
      canUpgrade={gameState.canUpgradeSelected}
      sellRatio={gameState.sellRatio}
      onUpgradeTower={handleUpgradeTower}
      onMergeBinders={handleMergeBinders}
      onUpgradeWithBinder={handleUpgradeWithBinder}
      onCyclePriority={handleCyclePriority}
      onMerge={handleMerge}
      onFuse={handleFuse}
      hyperLeft={gameState.hyperPlanLeft}
      onBind={handleBind}
      onSell={handleSell}
      onClose={() => engineRef.current?.selectTower(null)}
      damage={gameState.selectedDamage}
      details={towerDetails}
      onToggleDetails={() => setTowerDetails((d) => !d)}
      castle={gameState.castle}
      heroToken={gameState.heroToken}
      boons={gameState.boons}
      gold={gameState.gold}
      onUpgradeCastle={() => engineRef.current?.upgradeGuard()}
      mergeNeed={gameState.mergeNeed}
      maxLevel={gameState.maxLevel}
      race={gameState.race}
      info={gameState.selectedInfo}
      onCastAbility={() => {
        sound.init();
        const engine = engineRef.current;
        if (engine?.selectedTowerId) engine.castAbility(engine.selectedTowerId);
      }}
      onToggleAuto={() => {
        const engine = engineRef.current;
        if (engine?.selectedTowerId) engine.toggleTowerAuto(engine.selectedTowerId);
      }}
      onSacrifice={() => {
        sound.init();
        const engine = engineRef.current;
        if (engine?.selectedTowerId) engine.sacrifice(engine.selectedTowerId);
      }}
    />
  );

  return (
    <div className="w-full h-full overflow-hidden bg-[#121118] text-[#f4f2e6] flex flex-col font-sans select-none">
      {/* 1. Portrait Warning */}
      {isPortrait && <OrientationWarning />}

      {/* 2. Main Menu Screen */}
      {screen === 'menu' && (
        <MainMenu
          unlockedLevel={unlockedLevel}
          selectedDifficulty={difficulty}
          page={menuPage}
          onChangePage={(p) => {
            sound.init();
            setMenuPage(p);
            if (p === 'endless') setMode(p);
          }}
          duelAvailable={duelAvailable}
          endlessBest={endlessBest[difficulty] || {}}
          musicVol={audioSettings.musicVolume}
          sfxVol={audioSettings.sfxVolume}
          isMuted={audioSettings.muted}
          selectedLevel={Math.min(selectedLevel, unlockedLevel)}
          race={race}
          onChangeRace={(r) => {
            sound.init();
            setRace(r);
          }}
          endlessEnemies={endlessEnemies}
          randomMap={randomMap}
          onChangeRandomMap={(on) => {
            sound.init();
            setRandomMap(on);
          }}
          onChangeEnemies={(f) => {
            sound.init();
            setEndlessEnemies(f);
          }}
          onSelectLevel={(lvl) => {
            sound.init();
            setSelectedLevel(lvl);
          }}
          onPlay={handleOpenBriefing}
          onChangeDifficulty={(d) => {
            sound.init();
            setDifficulty(d);
          }}
          onOpenDuel={() => {
            sound.init();
            setMode('duel');
            setScreen('duelLobby');
          }}
          worldSummary={world ? (() => { const r = REGIONS[world.region] ?? FRONTIER; return `Глава ${r.chapter ?? 1} · ${r.name} · день ${world.day}${world.won && !r.next ? ' · поход пройден' : ''}`; })() : null}
          onOpenWorld={() => {
            sound.init();
            if (!world) setWorld(newWorld());
            else logWorldNote(world, 'open');
            setScreen('world');
          }}
          onResetWorld={() => {
            sound.init();
            logReason('new');
            clearBattleSave();
            setWorld(newWorld());
            setScreen('world');
          }}
          onStartSandbox={(level, enemies, randomRoad) => handleSandboxStart(level, enemies, randomRoad)}
          onStartBrawl={handleBrawlStart}
          onOpenBrawlLobby={(m, level, bots, randomRoad) => {
            sound.init();
            setBrawlLobby({ mode: m, level, bots, randomRoad });
            setScreen('brawlLobby');
          }}
          onOpenHowToPlay={() => setShowHowToPlay(true)}
          onOpenBestiary={() => setShowBestiary(true)}
          accountLabel={cloudEnabled ? (user ? 'Аккаунт ✓' : 'Войти') : null}
          onOpenAccount={() => setShowAccount(true)}
          onMusicChange={handleMusicChange}
          onSfxChange={handleSfxChange}
          onToggleMute={handleToggleMute}
        />
      )}

      {/* 3. Level Briefing Screen */}
      {screen === 'briefing' && (
        <LevelBriefing
          level={selectedLevel}
          faction={enemyFaction}
          race={race}
          difficulty={difficulty}
          endless={endless}
          onStartBattle={handleStartBattle}
          onBack={() => setScreen('menu')}
        />
      )}

      {/* 3a. Brawl lobby: one of the eight creates it, the others join by its code */}
      {screen === 'brawlLobby' && brawlLobby && (
        <BrawlLobby
          mode={brawlLobby.mode}
          level={brawlLobby.level}
          bots={brawlLobby.bots}
          randomRoad={brawlLobby.randomRoad}
          unlockedLevel={unlockedLevel}
          race={race}
          onChangeRace={setRace}
          onStart={handleBrawlNetStart}
          onBack={() => {
            setMenuPage('brawl');
            setScreen('menu');
          }}
        />
      )}

      {/* 3b. Duel room: create or join by code */}
      {screen === 'duelLobby' && (
        <DuelLobby
          level={Math.min(selectedLevel, unlockedLevel)}
          unlockedLevel={unlockedLevel}
          race={race}
          onChangeRace={setRace}
          onStart={handleDuelStart}
          onBack={() => {
            setMenuPage('home');
            setScreen('menu');
          }}
        />
      )}

      {/* 4. Active Gameplay Screen */}
      {screen === 'playing' && (
        <div className="w-full h-full flex flex-col">
          {/* Main Game Stage: the field takes the full height, the side column takes the width that is left
              (Артур, 2026-10-31: no bars around the field). On a screen too narrow for that the field is limited by
              the width; past the column's maximum both stand in the middle */}
          <div
            ref={stageRef}
            className={`game-stage flex-1 flex ${layout === 'bottom' ? 'flex-col' : ''} justify-center overflow-hidden min-h-0 relative bg-[#121118] [container-type:size]`}
          >
            <div
              ref={containerRef}
              className={`shrink-0 flex items-center justify-center overflow-hidden ${layout === 'bottom' ? 'w-full' : 'h-full'}`}
            >
              <div
                className="relative overflow-hidden"
                style={{
                  aspectRatio: `${CONFIG.grid.cols} / ${CONFIG.grid.rows}`,
                  width:
                    layout === 'bottom'
                      ? `min(100cqw, (100cqh - ${gameState.duel ? BOTTOM_MIN_H_DUEL : BOTTOM_MIN_H}px) * ${CONFIG.grid.cols} / ${CONFIG.grid.rows})`
                      : `min(100cqw - ${SIDE_MIN_W}, 100cqh * ${CONFIG.grid.cols} / ${CONFIG.grid.rows})`,
                }}
              >
                <canvas
                  ref={canvasRef}
                  onPointerDown={handleCanvasPointerDown}
                  onPointerMove={handleCanvasPointerMove}
                  onPointerUp={handleCanvasPointerUp}
                  onPointerLeave={handleCanvasPointerLeave}
                  onPointerCancel={handleCanvasPointerUp}
                  className="w-full h-full block cursor-crosshair touch-none"
                  style={{ imageRendering: 'pixelated' }}
                />
                {!gameState.sandbox && <FieldHud
                  isSpawning={gameState.isSpawning}
                  isWaveActive={gameState.isWaveActive}
                  allWavesLaunched={gameState.allWavesLaunched}
                  duel={gameState.duel && !worldBattle}
                  waveCountdown={gameState.waveCountdown}
                  earlyStartBonus={gameState.earlyStartBonus}
                  onStartWave={handleStartWave}
                  autoStart={gameState.autoStart}
                  onToggleAutoStart={() => engineRef.current?.setAutoStart(!engineRef.current.autoStart)}
                  sandbox={gameState.sandbox}
                  onOpenSandboxWave={() => setSandboxWaveOpen(true)}
                />}
                {!brawl && gameState.duel && duelLinkRef.current && !botWatch && (
                  <button
                    type="button"
                    onClick={() => setBotWatch(true)}
                    title="Посмотреть поле соперника"
                    className="absolute right-1 top-1 px-2 py-1 rounded-md bg-black/45 border border-white/10 text-white/90 text-[clamp(10px,1.6vh,14px)] cursor-pointer hover:bg-black/60"
                  >
                    👁 Соперник
                  </button>
                )}
                {!brawl && gameState.duel && botWatch && duelLinkRef.current && (
                  <BrawlSpectator
                    seat={{ id: 'bot-duel', name: 'Соперник', race: duelLinkRef.current?.botInfo?.()?.race ?? RACE_IDS.find((r) => CONFIG.races[r].faction === opponentArmy) ?? 'humans', kind: duelLinkRef.current?.botInfo ? 'bot' : 'net', lives: Math.round(opponent?.lives ?? 0), out: false, place: null }}
                    view={duelView}
                    botInfo={() => {
                      const i = duelLinkRef.current?.botInfo?.();
                      return i ? { ...i, faction: CONFIG.races[race].faction } : null;
                    }}
                    level={gameState.level}
                    seed={engineRef.current?.mapSeed ?? undefined}
                    onClose={() => setBotWatch(false)}
                  />
                )}
                {brawl && watchId && brawl.seats.find((s) => s.id === watchId) && (
                  <BrawlSpectator seat={brawl.seats.find((s) => s.id === watchId)!} view={watchView} botInfo={() => brawlRoomRef.current?.botInfo(watchId) ?? null} level={gameState.level} seed={engineRef.current?.mapSeed ?? undefined} onClose={() => watchField(null)} />
                )}
                {brawl && <BrawlBoard snap={brawl} canWatch={(id) => !!brawlRoomRef.current?.canSee(id)} watchId={watchId} onWatch={watchField} />}
                {worldBattle && <HeroBar skills={gameState.heroSkills} onCast={(id) => engineRef.current?.castHero(id)} />}
                {worldBattle && gameState.stageBreak && !gameState.isGameOver && (
                  <div className="absolute left-1/2 top-[18%] -translate-x-1/2 z-20 w-[min(80%,380px)] rounded-lg border border-[#e2b86a]/60 bg-[#17120a]/92 p-3 text-center shadow-lg shadow-black/60">
                    <div className="text-[#f4d58a] font-bold">Передышка</div>
                    <div className="text-stone-200 text-sm mt-1">Этап {gameState.stageBreak.done} из {gameState.stageBreak.total} пройден. Перестройте оборону и купите башни — время стоит.</div>
                    <button type="button" onClick={() => engineRef.current?.resumeFromBreak()} className="mt-2 rounded border border-[#e2b86a]/70 bg-[#3a2a10] hover:bg-[#4d3814] px-4 py-2 text-sm font-bold text-[#f4d58a] cursor-pointer">Продолжить бой</button>
                  </div>
                )}
                {gameState.boonOffer && !gameState.isGameOver && (
                  <BoonPicker offer={gameState.boonOffer} onChoose={(id) => engineRef.current?.chooseBoon(id)} />
                )}
                {!gameState.sandbox && <WaveInfo
                  nextWave={gameState.nextWave}
                  summary={gameState.waveSummary}
                  faction={gameState.nextWaveFaction}
                  isWaveActive={gameState.isWaveActive}
                  bossName={gameState.bossName}
                  camp={gameState.heroToken}
                />}
                {/* Bottom corners: gold and lives on the left; the selected tower's card on the half away from it,
                    «Всё поле» on the right. Only the plates' own buttons take taps */}
                <div className="absolute inset-0 pointer-events-none [container-type:inline-size]">
                  <div className="absolute left-1.5 bottom-1.5 flex flex-col items-start gap-1.5">
                    {panelSide === 'left' && towerPanel}
                    <FieldStats
                      heroToken={gameState.heroToken}
                      gold={gameState.gold}
                      lives={gameState.lives}
                      wave={gameState.wave}
                      maxWaves={gameState.maxWaves}
                      endless={gameState.endless}
                      sandbox={gameState.sandbox}
                      supply={gameState.supplyActive ? { power: gameState.supplyPower, mult: gameState.supplyMult, next: gameState.supplyNext } : null}
                      opponent={gameState.duel ? opponent : undefined}
                      opponentTitle={brawl ? (brawl.currentId ? 'Сейчас' : 'След. соперник') : undefined}
                      opponentArmy={gameState.duel ? (brawl ? brawlOpponentLabel(brawl) : CONFIG.factions[opponentArmy - 1]?.name) : undefined}
                    />
                  </div>
                  <div className="absolute right-1.5 bottom-1.5 flex flex-col items-end gap-1.5">
                    {panelSide === 'right' && towerPanel}
                    {gameState.zoomed && (
                      <button
                        type="button"
                        onClick={() => engineRef.current?.resetView()}
                        title="Показать всё поле (0)"
                        className="pointer-events-auto px-3 py-1.5 rounded-md border border-white/15 bg-black/45 hover:bg-black/65 backdrop-blur-[2px] text-white/90 text-xs sm:text-sm font-bold select-none"
                      >
                        Всё поле
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: game controls on top, then the shop and the backpack (gold, lives and the selected tower
                are over the field). It takes the width the field leaves. Sizes follow the column's height (cqh) and width (cqw) */}
            <div
              className={`flex-1 flex bg-[#171520] text-[#f4f2e6] select-none z-10 [container-type:size] ${
                layout === 'bottom'
                  ? 'w-full flex-row items-center gap-1 px-1 border-t border-[#2d2938]'
                  : 'min-w-[max(132px,12cqw)] max-w-[340px] h-full flex-col overflow-hidden overflow-y-auto border-l border-[#2d2938]'
              }`}
              style={
                layout === 'bottom'
                  ? { ...BOTTOM_VARS, paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }
                  : { ...(gameState.duel ? SIDE_VARS_DUEL : SIDE_VARS), paddingRight: 'env(safe-area-inset-right)' }
              }
            >
              <GameControls
                speed={gameState.speed}
                isPaused={gameState.isPaused}
                isMuted={audioSettings.muted}
                duel={gameState.duel && !worldBattle}
                onTogglePause={() => engineRef.current?.togglePause()}
                onSetSpeed={(v) => engineRef.current?.setSpeed(v)}
                onToggleMute={handleToggleMute}
                dropUp={layout === 'bottom'}
              />
              {gameState.race === 'demons' && (
                <button
                  type="button"
                  onClick={() => engineRef.current?.setAutoAbilities(!engineRef.current.autoAbilities)}
                  aria-pressed={gameState.autoAbilities}
                  title="Способности демонов срабатывают сами: при трёх врагах, тяжёлом или боссе в радиусе, если золота больше запаса 100"
                  className={`shrink-0 mx-1.5 mt-1 h-[var(--h-line)] min-h-[24px] px-1 rounded border text-[length:var(--fs-sm)] font-bold cursor-pointer whitespace-nowrap overflow-hidden ${
                    gameState.autoAbilities ? 'bg-orange-700/70 border-orange-300/60 text-white' : 'bg-[#221f2d] border-[#383347] text-stone-300 hover:bg-[#2c283a]'
                  }`}
                >
                  Авто-способности: {gameState.autoAbilities ? 'вкл' : 'выкл'}
                </button>
              )}
              {gameState.isUpgrading && <WaitingHint text="Коснитесь башни: поднимется на уровень" onCancel={handleUpgradeWithBinder} />}
              {gameState.isBinding && <WaitingHint text="Коснитесь башни другого вида" onCancel={handleBind} />}
              <div className={layout === 'bottom' ? 'flex-1 min-w-0 h-full flex flex-row items-center gap-1' : 'flex-1 flex flex-col justify-center-safe'}>
              {/* In the strip the shop (with the duel tabs) and the backpack stand side by side */}
              <div className={layout === 'bottom' ? 'flex-[3] min-w-0 flex flex-col justify-center' : 'contents'}>
              {gameState.duel && (
                <div className="px-1.5 pt-1 grid grid-cols-2 gap-1 shrink-0" role="tablist">
                  {(['towers', 'army'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={sideTab === tab}
                      disabled={tab === 'army' && armyLocked}
                      title={tab === 'army' && armyLocked ? 'Армия откроется по ходу боя' : undefined}
                      onClick={() => setSideTab(tab)}
                      className={`h-[var(--h-line)] min-h-[24px] rounded text-[length:var(--fs-sm)] font-bold transition-colors cursor-pointer ${
                        sideTab === tab
                          ? 'bg-amber-600 text-stone-950'
                          : 'bg-[#221f2d] hover:bg-[#2c283a] text-stone-300 border border-[#383347]'
                      }`}
                    >
                      {tab === 'towers' ? 'Башни' : armyLocked ? '🔒 Армия' : `Армия${gameState.duelOutgoingCost > 0 ? ' •' : ''}`}
                    </button>
                  ))}
                </div>
              )}
              {gameState.duel && sideTab === 'army' && gameState.duelSendPrices ? (
                <ArmyPanel
                  gold={gameState.gold}
                  prices={gameState.duelSendPrices}
                  outgoing={gameState.duelOutgoing}
                  outgoingCost={gameState.duelOutgoingCost}
                  income={gameState.duelIncome}
                  faction={myArmy}
                  onBuy={(t) => {
                    sound.init();
                    engineRef.current?.buySend(t);
                  }}
                  onClear={() => engineRef.current?.clearSends()}
                />
              ) : gameState.sandbox && gameState.mapEdit ? (
                <SandboxMapPanel
                  edit={gameState.mapEdit}
                  saved={customMaps}
                  onTool={(t) => engineRef.current?.mapEditTool(t)}
                  onLevel={(l) => engineRef.current?.mapEditLevel(l)}
                  onLoadFixed={(l) => engineRef.current?.mapEditLoad(MAPS[l - 1])}
                  onLoadRandom={() => engineRef.current?.mapEditRandom(newMapSeed())}
                  onLoadSaved={(m) => engineRef.current?.mapEditLoad(m)}
                  onClear={() => engineRef.current?.mapEditClear()}
                  onApply={() => {
                    sound.init();
                    engineRef.current?.mapEditApply();
                  }}
                  onClose={() => engineRef.current?.mapEditClose()}
                  onSave={() => {
                    const engine = engineRef.current;
                    const draft = engine?.mapEditDraft();
                    if (!engine || !draft) return;
                    const base = draft.name && !MAPS.some((m) => m.name === draft.name) && draft.name !== 'Случайная' ? draft.name : `Моя карта ${customMaps.length + 1}`;
                    const name = window.prompt('Название карты (то же название перезапишет её)', base);
                    if (name === null) return;
                    setCustomMaps(saveCustomMap({ ...draft, name: name.trim() || base }));
                    engine.mapEditLoad({ ...draft, name: name.trim() || base });
                  }}
                  onDelete={(id) => {
                    const m = customMaps.find((x) => x.id === id);
                    if (m && window.confirm(`Удалить карту «${m.name}»?`)) setCustomMaps(deleteCustomMap(id));
                  }}
                  compact={layout === 'bottom'}
                />
              ) : gameState.sandbox ? (
                <SandboxPanel
                  onRace={(r) => {
                    setRace(r);
                    setSpecModalTower(null);
                    engineRef.current?.sandboxRestart(r);
                  }}
                  enemyFaction={sandboxWave.faction}
                  onEnemyFaction={(f) => setSandboxWave((v) => ({ ...v, faction: f }))}
                  mapName={gameState.mapName}
                  onEditMap={() => engineRef.current?.mapEditOpen()}
                  hexField={gameState.hexField}
                  onHexField={(on) => engineRef.current?.setHexField(on)}
                  race={gameState.race}
                  maxLevel={gameState.maxLevel}
                  selectedTower={gameState.selectedTower ? { type: gameState.selectedTower.type, level: gameState.selectedTower.level } : null}
                  inHand={engineRef.current?.placingBinder ? 'binder' : engineRef.current?.placingTowerType || null}
                  onTake={(type, level, spec) => {
                    sound.init();
                    engineRef.current?.buyToBackpack('tower', type, level > 1, spec, level);
                  }}
                  onTakeBinder={() => {
                    sound.init();
                    engineRef.current?.buyToBackpack('binder', null, false, null);
                  }}
                  onApplySelected={(level, spec) => engineRef.current?.sandboxSetTower(level, spec)}
                  onOpenWave={() => setSandboxWaveOpen(true)}
                  onDownloadLog={saveSandboxLog}
                  summaryWave={gameState.waveSummary?.wave ?? null}
                  onOpenSummary={() => setSandboxSummaryOpen(true)}
                  compact={layout === 'bottom'}
                />
              ) : (
              <ShopPanel
                cards={shopCards}
                tier={gameState.tier}
                gold={gameState.gold}
                rerollCost={gameState.rerollCost}
                priceMult={gameState.supplyMult}
                mergeNeed={gameState.mergeNeed}
                placingTowerType={engineRef.current?.placingTowerType || null}
                placingBinder={engineRef.current?.placingBinder || false}
                isBinding={gameState.isBinding}
                isMoving={gameState.moveCost !== null && gameState.selectedTower !== null && !gameState.isBinding}
                moveCost={gameState.moveCost ?? 0}
                placingIsTriplet={engineRef.current?.placingIsTriplet || false}
                onSelectCard={handleSelectShopCard}
                onReroll={handleRerollShop}
                onUpgradeTier={handleUpgradeTier}
              />
              )}
              </div>
              {!(gameState.duel && sideTab === 'army') && (
                <div className={layout === 'bottom' ? 'flex-[1.5] min-w-0 flex flex-col justify-center' : 'contents'}>
                <Backpack
                  items={gameState.backpack}
                  slots={gameState.backpackSlots}
                  placingSlot={gameState.placingSlot}
                  onSelect={(i) => {
                    sound.init();
                    engineRef.current?.selectBackpack(i);
                  }}
                  onSell={(i) => engineRef.current?.sellBackpack(i)}
                  onMerge={(i) => engineRef.current?.mergeBackpack(i)}
                />
                </div>
              )}
              </div>
            </div>
          </div>
        </div>
      )}

      {screen === 'playing' && gameState.sandbox && sandboxSummaryOpen && gameState.waveSummary && (
        <SandboxSummaryModal summary={gameState.waveSummary} onClose={() => setSandboxSummaryOpen(false)} />
      )}
      {screen === 'playing' && gameState.sandbox && sandboxWaveOpen && (
        <SandboxWaveModal
          value={sandboxWave}
          isSpawning={gameState.isSpawning}
          onChange={setSandboxWave}
          onPreset={(w) => setSandboxWave((v) => ({ ...v, counts: engineRef.current?.sandboxPreset(w) ?? {} }))}
          onLaunch={launchSandboxWave}
          onClose={() => setSandboxWaveOpen(false)}
          onDownloadLog={saveSandboxLog}
        />
      )}

      {/* 5. Specialization Modal */}
      {specModalTower && !gameState.isGameOver && !gameState.isVictory && (
        <SpecModal
          towerType={specModalTower.type}
          level={engineRef.current?.towers.find((t) => t.id === specModalTower.id)?.level ?? 2}
          onSelectSpec={handleSelectSpec}
        />
      )}

      {/* 6. Pause Modal */}
      {screen === 'playing' && gameState.isPaused && !gameState.isGameOver && !gameState.isVictory && (
        <PauseModal
          duel={gameState.duel}
          onResume={() => engineRef.current?.togglePause()}
          onRestart={handleRestartLevel}
          onToMenu={handleToMenu}
          onOpenBestiary={() => setShowBestiary(true)}
          musicVol={audioSettings.musicVolume}
          sfxVol={audioSettings.sfxVolume}
          isMuted={audioSettings.muted}
          onMusicChange={handleMusicChange}
          onSfxChange={handleSfxChange}
          onToggleMute={handleToggleMute}
        />
      )}

      {/* 7. Victory Modal */}
      {screen === 'playing' && brawl && duelOutcome && (gameState.isVictory || gameState.isGameOver) && (
        <BrawlResultModal snap={brawl} wave={gameState.wave} stats={gameState.runSummary} onToMenu={handleToMenu} />
      )}
      {screen === 'playing' && !brawl && !worldBattle && gameState.duel && duelOutcome && (gameState.isVictory || gameState.isGameOver) && (
        <DuelResultModal outcome={duelOutcome} wave={gameState.wave} stats={gameState.runSummary} onToMenu={handleToMenu} />
      )}

      {screen === 'world' && world && (
        <WorldMap
          world={world}
          region={REGIONS[world.region] ?? FRONTIER}
          onChange={setWorld}
          onBattle={startWorldBattle}
          onExit={() => setScreen('menu')}
          onReset={() => {
            logReason('new');
            setWorld(newWorld());
          }}
          onRegionEdited={() => setRegionRev((n) => n + 1)}
          onRestartRegion={(r) => {
            logReason('new');
            setWorld(newWorld(r));
          }}
        />
      )}
      {screen === 'playing' && worldBattle && tutStep && !battleScene && tutStep.text && <TutorialHint text={tutStep.text} mark={tutStep.mark ?? null} onSkip={skipTutorial} />}
      {screen === 'playing' && worldBattle && battleScene && !(gameState.isVictory || gameState.isGameOver) && <DialogBox scene={battleScene} onDone={closeBattleScene} />}
      {screen === 'playing' && worldBattle && (gameState.isVictory || gameState.isGameOver) && (
        <WorldBattleResult
          obj={worldBattle}
          won={gameState.isVictory}
          onMap={() => leaveWorldBattle(gameState.isVictory)}
          onRetry={handleRestartLevel}
        />
      )}


      {/* 8. Defeat Modal */}
      {screen === 'playing' && gameState.isGameOver && !gameState.duel && !worldBattle && (
        <DefeatModal
          stats={gameState.runSummary}
          wave={gameState.wave}
          endless={gameState.endless}
          best={endlessBest[engineRef.current?.difficulty ?? difficulty]?.[endlessRecordKey(gameState.level, gameState.faction, gameState.randomMap)] || 0}
          onRestart={handleRestartLevel}
          onToMenu={handleToMenu}
        />
      )}

      {/* 9. How To Play Modal */}
      {showAccount && (
        <AccountModal user={user} syncState={syncState} onClose={() => setShowAccount(false)} />
      )}

      {showBestiary && <Bestiary onClose={() => setShowBestiary(false)} initialFaction={screen === 'playing' ? gameState.faction : selectedLevel} />}

      {showHowToPlay && (
        <HowToPlayModal onClose={() => setShowHowToPlay(false)} />
      )}

      <DevNotes getContext={devContext} onSaved={devSaved} onOpenChange={devOpenChange} getWorld={() => world} />
    </div>
  );
}
