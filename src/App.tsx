/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CONFIG, Difficulty, TowerType, RaceId } from './game/config';
import { validateAllMaps } from './game/maps';
import { sound, AudioSettings } from './game/audio';
import { GameEngine, GameStateSnapshot, Tower } from './game/engine';
import { calculateStars } from './game/rules';
import { sprites } from './game/sprites';

import { FieldStats } from './components/FieldStats';
import { FieldHud } from './components/FieldHud';
import { GameControls } from './components/GameControls';
import { WaveInfo } from './components/WaveInfo';
import { Backpack } from './components/Backpack';
import { ShopPanel, ShopCard } from './components/ShopPanel';
import { TowerPanel, WaitingHint } from './components/TowerPanel';
import { SpecModal } from './components/SpecModal';
import { MainMenu, GameMode, MenuPage } from './components/MainMenu';
import { Bestiary } from './components/Bestiary';
import { DuelLobby } from './components/DuelLobby';
import { ArmyPanel } from './components/ArmyPanel';
import { SEND_TYPES } from './game/rules';
import { DuelLink, duelAvailable } from './duel';
import { BrawlRoom, BrawlSnapshot, brawlBots } from './brawl';
import { BrawlBoard } from './components/BrawlBoard';
import { LevelBriefing } from './components/LevelBriefing';
import { PauseModal, VictoryModal, DefeatModal, HowToPlayModal, DuelResultModal, BrawlResultModal, DuelOutcome } from './components/StatusModals';
import { OrientationWarning } from './components/OrientationWarning';
import { fullscreenSupported, toggleFullscreen } from './fullscreen';
import { AccountModal, SyncState } from './components/AccountModal';
import { Progress, EMPTY_PROGRESS, readLocalProgress, writeLocalProgress, mergeProgress, isEmptyProgress, endlessRecordKey } from './progress';
import { cloudEnabled, onUserChange, loadCloudProgress, saveCloudProgress } from './cloud';
import type { User } from '@supabase/supabase-js';

type ScreenState = 'menu' | 'briefing' | 'duelLobby' | 'playing';

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
/** «Потасовка»: who you face now, for the opponent's line under your gold */
function brawlOpponentLabel(b: BrawlSnapshot): string {
  const o = b.seats.find((s) => s.id === b.opponentId);
  if (!o) return '—';
  return o.id === b.ghostId ? `👻 ${o.name}` : o.name;
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
  const [mode, setMode] = useState<GameMode>('campaign');
  const [menuPage, setMenuPage] = useState<MenuPage>('home'); // which page of the main menu is open
  const endless = mode === 'endless';
  // Endless mode: enemies are picked apart from the map (Артур, 2026-10-31); 0 — the map's own faction
  const [endlessEnemies, setEndlessEnemies] = useState<number>(0);
  const enemyFaction = endless && endlessEnemies ? endlessEnemies : selectedLevel;
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
  const { unlocked: unlockedLevel, stars: levelStars, endlessBest } = progress;
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
    wave: 1,
    maxWaves: 12,
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
    runSummary: null,
    waveSummary: null,
    nextWave: null,
    placingSlot: null,
    supplyNext: CONFIG.supply.free,
    isUpgrading: false,
    bindPartnerCount: 0,
    isBinding: false,
    canMoveTowers: false,
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

  // Specialization modal state
  const [specModalTower, setSpecModalTower] = useState<{
    id: string;
    type: TowerType;
    part?: 'main' | 'second'; // which part of a bound pair reached Ур.2
    isPrePlacement?: boolean;
    cardIndex?: number;
    cardId?: string; // the shop card being bought: the purchase survives a new wave and a reroll
  } | null>(null);

  // Generate 5 shop cards based on current tier
  const generateShopCards = useCallback((currentTier: number): (ShopCard | null)[] => {
    // The player's faction: its own towers (some only from a higher tier), binders and ★ cards where it has them
    const raceDef = CONFIG.races[engineRef.current?.race ?? 'humans'];
    const towerTypes: TowerType[] = raceDef.towers.filter((t) => (CONFIG.towers[t].minTier ?? 1) <= currentTier);
    const tripletChance = raceDef.triplets ? CONFIG.shop.tripletChances[currentTier - 1] || 0 : 0;
    const binderChance = raceDef.binders ? CONFIG.shop.binderChances[currentTier - 1] || 0 : 0;
    const cards: ShopCard[] = [];

    for (let i = 0; i < CONFIG.shop.slotsCount; i++) {
      if (Math.random() < binderChance) {
        cards.push({ id: Math.random().toString(36).substring(2, 9), type: 'binder', isTriplet: false });
        continue;
      }
      const type = towerTypes[Math.floor(Math.random() * towerTypes.length)];
      const isTriplet = Math.random() < tripletChance;
      cards.push({
        id: Math.random().toString(36).substring(2, 9),
        type,
        isTriplet,
      });
    }
    return cards;
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

  // When victory triggers, save unlocked level and stars (a duel win gives neither)
  useEffect(() => {
    if (gameState.isVictory && !gameState.duel) {
      const starsEarned = calculateStars(gameState.lives);
      const nextLvl = Math.min(5, gameState.level + 1);
      const diff = engineRef.current?.difficulty ?? 'normal';
      setProgress((prev) =>
        mergeProgress(prev, {
          unlocked: nextLvl,
          stars: { ...EMPTY_PROGRESS.stars, [diff]: { [gameState.level]: starsEarned } },
          endlessBest: EMPTY_PROGRESS.endlessBest,
        })
      );
    }
  }, [gameState.isVictory, gameState.duel, gameState.lives, gameState.level]);

  // Endless mode: the best wave reached is kept the moment a wave starts, so leaving to the menu
  // (or closing the page) in the middle of a run loses nothing; defeat counts the wave that broke through
  useEffect(() => {
    if (gameState.endless && !gameState.duel && (gameState.isWaveActive || gameState.isGameOver)) {
      const diff = engineRef.current?.difficulty ?? 'normal';
      const key = endlessRecordKey(gameState.level, gameState.faction);
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
    if (engineRef.current) engineRef.current.onDuelSend = undefined;
    // Let the last message go out before the channel closes
    setTimeout(() => link.close(), 500);
  }, []);

  const [opponentArmy, setOpponentArmy] = useState(1);
  const handleDuelStart = (link: DuelLink, level: number, startAt: number, army: number, myArmy: number) => {
    duelLinkRef.current = link;
    duelSeenRef.current = performance.now();
    duelOutcomeRef.current = null;
    setDuelOutcome(null);
    setOpponent(null);
    setSideTab('towers');
    setOpponentArmy(army);
    setSelectedLevel(level);
    link.onMessage((msg) => {
      duelSeenRef.current = performance.now();
      if (msg.t === 'hello' && link.role === 'host') link.send({ t: 'start', level, army: myArmy, inMs: 0 }); // the first answer was lost
      else if (msg.t === 'state') setOpponent({ lives: msg.lives, wave: msg.wave, income: msg.income ?? 0 });
      else if (msg.t === 'send') engineRef.current?.receiveSend(msg.enemies ?? {});
      else if (msg.t === 'lost') finishDuel('won');
      else if (msg.t === 'leave') finishDuel('left');
    });
    setScreen('playing');
    setTimeout(() => {
      if (canvasRef.current && engineRef.current) {
        engineRef.current.setCanvas(canvasRef.current);
        engineRef.current.startDuel(level, startAt, army, race);
        engineRef.current.onDuelSend = (enemies) => link.send({ t: 'send', enemies });
        setShopCards(generateShopCards(1));
      }
    }, 50);
  };

  // «Потасовка»: a room of eight run here, driven like a duel (src/brawl.ts); its board for the overlay
  const [brawl, setBrawl] = useState<BrawlSnapshot | null>(null);
  const handleBrawlStart = (level: number, bots: Difficulty) => {
    sound.init();
    const startAt = performance.now();
    const room = new BrawlRoom(level, race, brawlBots(bots), startAt, () => engineRef.current?.lives ?? 0);
    room.onChange(setBrawl);
    setMode('duel');
    handleDuelStart(room, level, startAt, level, level);
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
        engineRef.current.startLevel(selectedLevel, difficulty, endless, enemyFaction, race);
        setShopCards(generateShopCards(1));
      }
    }, 50);
  };

  // Outcome screen action: Next level
  const handleNextLevel = () => {
    sound.init();
    setSpecModalTower(null);
    if (engineRef.current) {
      engineRef.current.stopLoop();
      engineRef.current.isVictory = false;
      engineRef.current.isGameOver = false;
      engineRef.current.isPaused = false;
      engineRef.current.notifyState();
    }
    const nextLvl = gameState.level + 1;
    if (nextLvl <= 5) {
      setSelectedLevel(nextLvl);
      setScreen('briefing');
    } else {
      setScreen('menu');
    }
  };

  // Outcome screen action: Restart level with clean state
  const handleRestartLevel = () => {
    sound.init();
    setSpecModalTower(null);
    setShopCards(generateShopCards(1));
    const engine = engineRef.current;
    if (!engine) return;

    if (screen === 'playing' && canvasRef.current) {
      engine.setCanvas(canvasRef.current);
      engine.startLevel(selectedLevel, difficulty, endless, enemyFaction, race);
    } else {
      setScreen('playing');
      setTimeout(() => {
        if (canvasRef.current && engineRef.current) {
          engineRef.current.setCanvas(canvasRef.current);
          engineRef.current.startLevel(selectedLevel, difficulty, endless, enemyFaction, race);
        }
      }, 50);
    }
  };

  // Outcome screen action: Return to main menu
  const handleToMenu = () => {
    sound.init();
    closeDuel();
    setBrawl(null);
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

    // A triplet first asks for its specialization; nothing is paid until it is chosen (towers without them go straight in)
    if (card.isTriplet && CONFIG.towers[card.type].specs.length > 0) {
      if (engine.gold < engine.towerPrice(card.type, true) || engine.overflowPending()) {
        engine.buyToBackpack('tower', card.type, true, null); // only reports why it cannot
        return;
      }
      engine.selectTower(null);
      setSpecModalTower({
        id: 'triplet_pre',
        type: card.type,
        isPrePlacement: true,
        cardIndex: cardIdx,
        cardId: card.id,
      });
      return;
    }

    if (engine.buyToBackpack('tower', card.type, card.isTriplet, null)) takeCard();
  };

  // Specialization picked in modal
  const handleSelectSpec = (specId: string) => {
    sound.init();
    const engine = engineRef.current;
    if (!engine || !specModalTower) return;

    if (specModalTower.isPrePlacement && specModalTower.cardIndex !== undefined) {
      // Triplet card specialization selected -> pay and put it in the backpack
      const cardId = specModalTower.cardId;
      if (engine.buyToBackpack('tower', specModalTower.type, true, specId)) {
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
    engine.startNextWave();
  };

  // Merge selected tower
  const handleMerge = () => {
    sound.init();
    const engine = engineRef.current;
    if (!engine) return;
    engine.mergeSelectedTower();
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
    const p = engineRef.current!.screenToField(c.x, c.y);
    return { x: Math.floor(p.x / CONFIG.grid.cellSize), y: Math.floor(p.y / CONFIG.grid.cellSize) };
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

    // Normal click: check if a tower is clicked
    const clickedTower = engine.towers.find((t) => t.x === cellX && t.y === cellY);
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
  const gestureRef = useRef<{ x: number; y: number; mode: 'tap' | 'pan' | 'tower' | 'pinch'; towerId: string | null } | null>(null);
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

    if (pointersRef.current.size === 1) {
      const cell = toCell(e.clientX, e.clientY);
      const tower = engine.towers.find((t) => t.x === cell.x && t.y === cell.y);
      // Between waves a press on a tower can drag it to another cell
      const towerId = tower && engine.placingSlot === null && !engine.bindingFromId && !engine.upgradingFromBinderId && engine.canMoveTowers() ? tower.id : null;
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
      if (tower && (tower.x !== cell.x || tower.y !== cell.y)) engine.moveSelectedTower(cell.x, cell.y);
    }
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
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandlerRef.current = (e: KeyboardEvent) => {
    const engine = engineRef.current;
    if (!engine) return;

    if (e.key === ' ' || e.code === 'Space') {
      if (screen === 'briefing') {
        e.preventDefault();
        handleStartBattle();
      } else if (screen === 'playing' && !engine.isPaused) {
        e.preventDefault();
        handleStartWave();
      }
    } else if (e.key === 'Enter') {
      if (screen === 'menu' && (menuPage === 'campaign' || menuPage === 'endless') && !showHowToPlay && !showBestiary && !showAccount) {
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
    } else if (e.key === 'u' || e.key === 'U' || e.key === 'г' || e.key === 'Г') {
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
      onBind={handleBind}
      onSell={handleSell}
      onClose={() => engineRef.current?.selectTower(null)}
      damage={gameState.selectedDamage}
      details={towerDetails}
      onToggleDetails={() => setTowerDetails((d) => !d)}
      castle={gameState.castle}
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
          levelStars={levelStars[difficulty] || {}}
          selectedDifficulty={difficulty}
          page={menuPage}
          onChangePage={(p) => {
            sound.init();
            setMenuPage(p);
            if (p === 'campaign' || p === 'endless') setMode(p);
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
          onStartBrawl={handleBrawlStart}
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
                <FieldHud
                  isSpawning={gameState.isSpawning}
                  isWaveActive={gameState.isWaveActive}
                  allWavesLaunched={gameState.allWavesLaunched}
                  duel={gameState.duel}
                  waveCountdown={gameState.waveCountdown}
                  earlyStartBonus={gameState.earlyStartBonus}
                  onStartWave={handleStartWave}
                  autoStart={gameState.autoStart}
                  onToggleAutoStart={() => engineRef.current?.setAutoStart(!engineRef.current.autoStart)}
                />
                {brawl && <BrawlBoard snap={brawl} />}
                <WaveInfo
                  nextWave={gameState.nextWave}
                  summary={gameState.waveSummary}
                  faction={gameState.faction}
                  isWaveActive={gameState.isWaveActive}
                />
                {/* Bottom corners: gold and lives on the left; the selected tower's card on the half away from it,
                    «Всё поле» on the right. Only the plates' own buttons take taps */}
                <div className="absolute inset-0 pointer-events-none [container-type:inline-size]">
                  <div className="absolute left-1.5 bottom-1.5 flex flex-col items-start gap-1.5">
                    {panelSide === 'left' && towerPanel}
                    <FieldStats
                      gold={gameState.gold}
                      lives={gameState.lives}
                      wave={gameState.wave}
                      maxWaves={gameState.maxWaves}
                      endless={gameState.endless}
                      supply={gameState.supplyActive ? { power: gameState.supplyPower, mult: gameState.supplyMult, next: gameState.supplyNext } : null}
                      opponent={gameState.duel ? opponent : undefined}
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
                duel={gameState.duel}
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
                      onClick={() => setSideTab(tab)}
                      className={`h-[var(--h-line)] min-h-[24px] rounded text-[length:var(--fs-sm)] font-bold transition-colors cursor-pointer ${
                        sideTab === tab
                          ? 'bg-amber-600 text-stone-950'
                          : 'bg-[#221f2d] hover:bg-[#2c283a] text-stone-300 border border-[#383347]'
                      }`}
                    >
                      {tab === 'towers' ? 'Башни' : `Армия${gameState.duelOutgoingCost > 0 ? ' •' : ''}`}
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
                  faction={gameState.faction}
                  onBuy={(t) => {
                    sound.init();
                    engineRef.current?.buySend(t);
                  }}
                  onClear={() => engineRef.current?.clearSends()}
                />
              ) : (
              <ShopPanel
                cards={shopCards}
                tier={gameState.tier}
                gold={gameState.gold}
                rerollCost={gameState.rerollCost}
                priceMult={gameState.supplyMult}
                placingTowerType={engineRef.current?.placingTowerType || null}
                placingBinder={engineRef.current?.placingBinder || false}
                isBinding={gameState.isBinding}
                isMoving={gameState.canMoveTowers && gameState.selectedTower !== null && !gameState.isBinding}
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
                />
                </div>
              )}
              </div>
            </div>
          </div>
        </div>
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
      {screen === 'playing' && !brawl && gameState.duel && duelOutcome && (gameState.isVictory || gameState.isGameOver) && (
        <DuelResultModal outcome={duelOutcome} wave={gameState.wave} stats={gameState.runSummary} onToMenu={handleToMenu} />
      )}

      {screen === 'playing' && gameState.isVictory && !gameState.duel && (
        <VictoryModal
          stats={gameState.runSummary}
          level={gameState.level}
          stars={calculateStars(gameState.lives)}
          lives={gameState.lives}
          onNext={handleNextLevel}
          onRestart={handleRestartLevel}
          onToMenu={handleToMenu}
        />
      )}

      {/* 8. Defeat Modal */}
      {screen === 'playing' && gameState.isGameOver && !gameState.duel && (
        <DefeatModal
          stats={gameState.runSummary}
          wave={gameState.wave}
          endless={gameState.endless}
          best={endlessBest[engineRef.current?.difficulty ?? difficulty]?.[endlessRecordKey(gameState.level, gameState.faction)] || 0}
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
    </div>
  );
}
