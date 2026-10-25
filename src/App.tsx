/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CONFIG, Difficulty, TowerType } from './game/config';
import { validateAllMaps } from './game/maps';
import { sound, AudioSettings } from './game/audio';
import { GameEngine, GameStateSnapshot, Tower } from './game/engine';
import { calculateStars } from './game/rules';
import { sprites } from './game/sprites';

import { TopBar } from './components/TopBar';
import { FieldHud } from './components/FieldHud';
import { ShopPanel, ShopCard } from './components/ShopPanel';
import { TowerPanel } from './components/TowerPanel';
import { SpecModal } from './components/SpecModal';
import { MainMenu } from './components/MainMenu';
import { LevelBriefing } from './components/LevelBriefing';
import { PauseModal, VictoryModal, DefeatModal, HowToPlayModal } from './components/StatusModals';
import { OrientationWarning } from './components/OrientationWarning';
import { fullscreenSupported, toggleFullscreen } from './fullscreen';
import { AccountModal, SyncState } from './components/AccountModal';
import { Progress, readLocalProgress, writeLocalProgress, mergeProgress } from './progress';
import { cloudEnabled, onUserChange, loadCloudProgress, saveCloudProgress } from './cloud';
import type { User } from '@supabase/supabase-js';

type ScreenState = 'menu' | 'briefing' | 'playing';

// Side column sizes: phone-size minimums, growing with the column height (cqh) and width (cqw)
const SIDE_VARS = {
  '--fs-xs': 'clamp(9px, min(2.3cqh, 4.6cqw), 14px)',
  '--fs-sm': 'clamp(10px, min(2.6cqh, 5.2cqw), 15px)',
  '--fs-md': 'clamp(11px, min(2.9cqh, 5.8cqw), 17px)',
  '--fs-lg': 'clamp(12px, min(3.3cqh, 6.4cqw), 20px)',
  '--h-stat': 'max(24px, 5cqh)',
  '--h-line': 'max(16px, 3.6cqh)',
  '--fs-btn4': 'clamp(10px, min(2.6cqh, 4.8cqw), 15px)', // four buttons in a row
  '--h-btn': 'max(40px, 11cqh - 8px)',
  '--h-card': 'clamp(56px, min(19cqh, 34cqw), 160px)',
  '--h-head': 'max(28px, 6.5cqh)',
} as React.CSSProperties;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragTowerRef = useRef<string | null>(null); // tower pressed between waves, for drag-to-move
  const engineRef = useRef<GameEngine | null>(null);

  // App screen state
  const [screen, setScreen] = useState<ScreenState>('menu');
  const [selectedLevel, setSelectedLevel] = useState<number>(1);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [endless, setEndless] = useState<boolean>(false);
  const [showHowToPlay, setShowHowToPlay] = useState<boolean>(false);
  const [isPortrait, setIsPortrait] = useState<boolean>(false);

  // Persistent progression
  // Progress: localStorage, plus the account when signed in (see progress.ts, cloud.ts)
  const [progress, setProgress] = useState<Progress>(readLocalProgress);
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
    lives: 20,
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
    waveCountdown: null,
    earlyStartBonus: 0,
    speed: 1,
    selectedTower: null,
    eligibleMergeCount: 0,
    selectedBinder: false,
    binderCount: 0,
    selectedBinderTriple: false,
    canMergeBinders: false,
    upgradeTargetCount: 0,
    isUpgrading: false,
    bindPartnerCount: 0,
    isBinding: false,
    canMoveTowers: false,
    rerollCost: CONFIG.shop.rerollCost,
  });

  // Shop state (5 card slots)
  const [shopCards, setShopCards] = useState<(ShopCard | null)[]>([]);
  const [placingCardIndex, setPlacingCardIndex] = useState<number | null>(null);

  // Specialization modal state
  const [specModalTower, setSpecModalTower] = useState<{
    id: string;
    type: TowerType;
    part?: 'main' | 'second'; // which part of a bound pair reached Ур.2
    isPrePlacement?: boolean;
    cardIndex?: number;
  } | null>(null);

  // Generate 5 shop cards based on current tier
  const generateShopCards = useCallback((currentTier: number): (ShopCard | null)[] => {
    const towerTypes: TowerType[] = ['archer', 'priest', 'mage', 'ballista'];
    const tripletChance = CONFIG.shop.tripletChances[currentTier - 1] || 0;
    const binderChance = CONFIG.shop.binderChances[currentTier - 1] || 0;
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
      setPlacingCardIndex(null);
      engine.placingTowerType = null;
      engine.placingBinder = false;
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

  // When victory triggers, save unlocked level and stars
  useEffect(() => {
    if (gameState.isVictory) {
      const starsEarned = calculateStars(gameState.lives);
      const nextLvl = Math.min(5, gameState.level + 1);
      setProgress((prev) =>
        mergeProgress(prev, { unlocked: nextLvl, stars: { [gameState.level]: starsEarned }, endlessBest: {} })
      );
    }
  }, [gameState.isVictory, gameState.lives, gameState.level]);

  // Endless mode ends only in defeat: keep the best wave reached on this level
  useEffect(() => {
    if (gameState.isGameOver && gameState.endless) {
      setProgress((prev) =>
        (prev.endlessBest[gameState.level] || 0) >= gameState.wave
          ? prev
          : mergeProgress(prev, { unlocked: 1, stars: {}, endlessBest: { [gameState.level]: gameState.wave } })
      );
    }
  }, [gameState.isGameOver, gameState.endless, gameState.wave, gameState.level]);

  // Menu «Играть»: the selected level (never a locked one) goes to its briefing
  const handleOpenBriefing = () => {
    sound.init();
    setSelectedLevel((lvl) => Math.min(lvl, unlockedLevel));
    setScreen('briefing');
  };

  // Account: follow sign-in; on sign-in merge the account's progress with this device's
  const cloudLoadedFor = useRef<string | null>(null); // the account whose progress is already merged in
  const [cloudTick, setCloudTick] = useState(0); // forces a save right after the merge
  useEffect(() => onUserChange(setUser), []);
  useEffect(() => {
    if (!user) {
      cloudLoadedFor.current = null;
      setSyncState('idle');
      return;
    }
    let cancelled = false;
    setSyncState('syncing');
    loadCloudProgress(user.id)
      .then((cloud) => {
        if (cancelled) return;
        if (cloud) setProgress((prev) => mergeProgress(prev, cloud));
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

  // Save on every change: this device always, the account (after its progress was read) with a short delay
  useEffect(() => {
    writeLocalProgress(progress);
    if (!user || cloudLoadedFor.current !== user.id) return;
    const t = setTimeout(() => {
      setSyncState('syncing');
      saveCloudProgress(user.id, progress)
        .then(() => setSyncState('ok'))
        .catch(() => setSyncState('error'));
    }, 600);
    return () => clearTimeout(t);
  }, [progress, user, cloudTick]);

  // Handle Level Start from briefing
  const handleStartBattle = () => {
    sound.init();
    setScreen('playing');
    setTimeout(() => {
      if (canvasRef.current && engineRef.current) {
        engineRef.current.setCanvas(canvasRef.current);
        engineRef.current.startLevel(selectedLevel, difficulty, endless);
        setShopCards(generateShopCards(1));
        setPlacingCardIndex(null);
      }
    }, 50);
  };

  // Outcome screen action: Next level
  const handleNextLevel = () => {
    sound.init();
    setSpecModalTower(null);
    setPlacingCardIndex(null);
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
    setPlacingCardIndex(null);
    setShopCards(generateShopCards(1));
    const engine = engineRef.current;
    if (!engine) return;

    if (screen === 'playing' && canvasRef.current) {
      engine.setCanvas(canvasRef.current);
      engine.startLevel(selectedLevel, difficulty, endless);
    } else {
      setScreen('playing');
      setTimeout(() => {
        if (canvasRef.current && engineRef.current) {
          engineRef.current.setCanvas(canvasRef.current);
          engineRef.current.startLevel(selectedLevel, difficulty, endless);
        }
      }, 50);
    }
  };

  // Outcome screen action: Return to main menu
  const handleToMenu = () => {
    sound.init();
    setSpecModalTower(null);
    if (engineRef.current) {
      engineRef.current.stopLoop();
      engineRef.current.isVictory = false;
      engineRef.current.isGameOver = false;
      engineRef.current.isPaused = false;
      engineRef.current.notifyState();
    }
    setPlacingCardIndex(null);
    setScreen('menu');
  };

  // User selects a card from the shop
  const handleSelectShopCard = (cardIdx: number) => {
    sound.init();
    const card = shopCards[cardIdx];
    if (!card) return;

    const engine = engineRef.current;
    if (!engine) return;

    if (card.type === 'binder') {
      if (placingCardIndex === cardIdx) {
        setPlacingCardIndex(null);
        engine.placingBinder = false;
        engine.notifyState();
        return;
      }
      if (engine.gold < CONFIG.binder.cost) {
        sound.playError();
        engine.addFloatingText('Не хватает золота!', CONFIG.grid.totalWidth - 120, 100, '#e0452f');
        return;
      }
      engine.selectTower(null);
      engine.placingBinder = true;
      setPlacingCardIndex(cardIdx);
      engine.notifyState();
      return;
    }

    const baseDef = CONFIG.towers[card.type];
    const cost = card.isTriplet ? baseDef.cost * 3 : baseDef.cost;

    if (engine.gold < cost) {
      sound.playError();
      engine.addFloatingText('Не хватает золота!', CONFIG.grid.totalWidth - 120, 100, '#e0452f');
      return;
    }

    // Toggle off if clicking the already selected card
    if (placingCardIndex === cardIdx) {
      setPlacingCardIndex(null);
      engine.placingTowerType = null;
      engine.placingIsTriplet = false;
      engine.pendingTripletSpec = null;
      engine.notifyState();
      return;
    }

    // Tapping a shop card deselects any selected placed tower and enters placement mode
    engine.selectTower(null);
    setPlacingCardIndex(null);

    // If card is a triplet, first choose specialization
    if (card.isTriplet) {
      setSpecModalTower({
        id: 'triplet_pre',
        type: card.type,
        isPrePlacement: true,
        cardIndex: cardIdx,
      });
    } else {
      // Enter placement mode directly
      setPlacingCardIndex(cardIdx);
      engine.placingTowerType = card.type;
      engine.placingIsTriplet = false;
      engine.pendingTripletSpec = null;
      engine.notifyState();
    }
  };

  // Specialization picked in modal
  const handleSelectSpec = (specId: string) => {
    sound.init();
    const engine = engineRef.current;
    if (!engine || !specModalTower) return;

    if (specModalTower.isPrePlacement && specModalTower.cardIndex !== undefined) {
      // Triplet card specialization selected -> now enter placement mode
      setPlacingCardIndex(specModalTower.cardIndex);
      engine.selectTower(null);
      engine.placingTowerType = specModalTower.type;
      engine.placingIsTriplet = true;
      engine.pendingTripletSpec = specId;
      engine.notifyState();
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
    setPlacingCardIndex(null);
    engine.placingTowerType = null;
    engine.placingBinder = false;
    engine.notifyState();
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

  // Cycle Priority
  const handleCyclePriority = () => {
    sound.init();
    const engine = engineRef.current;
    if (!engine || !engine.selectedTowerId) return;
    engine.cycleTargetPriority(engine.selectedTowerId);
  };

  // Canvas pointer interaction (Placement & Selection)
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    sound.init();
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    if (!engine || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = CONFIG.grid.totalWidth / rect.width;
    const scaleY = CONFIG.grid.totalHeight / rect.height;

    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    const cellX = Math.floor(clickX / CONFIG.grid.cellSize);
    const cellY = Math.floor(clickY / CONFIG.grid.cellSize);

    // If in placement mode:
    if ((engine.placingTowerType || engine.placingBinder) && placingCardIndex !== null) {
      const placed = engine.placingBinder ? engine.placeBinder(cellX, cellY) : engine.placeTower(cellX, cellY);
      if (placed) {
        // Clear shop card slot
        setShopCards((prev) => {
          const next = [...prev];
          next[placingCardIndex] = null;
          return next;
        });
        setPlacingCardIndex(null);
      }
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
    if (clickedBinder) {
      engine.selectBinder(clickedBinder.id);
      sound.playBuy();
    } else if (clickedTower) {
      engine.selectTower(clickedTower.id);
      sound.playBuy();
      // Between waves a press on a tower can drag it to another cell
      if (engine.canMoveTowers()) dragTowerRef.current = clickedTower.id;
    } else if (engine.selectedTowerId && engine.moveSelectedTower(cellX, cellY)) {
      // Between waves: a tap on a free cell moves the selected tower there
    } else {
      // Tapped empty cell: deselect
      engine.selectTower(null);
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    if (!engine || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = CONFIG.grid.totalWidth / rect.width;
    const scaleY = CONFIG.grid.totalHeight / rect.height;

    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const cellX = Math.floor(mouseX / CONFIG.grid.cellSize);
    const cellY = Math.floor(mouseY / CONFIG.grid.cellSize);

    if (cellX >= 0 && cellX < CONFIG.grid.cols && cellY >= 0 && cellY < CONFIG.grid.rows) {
      engine.hoverCell = { x: cellX, y: cellY };
    } else {
      engine.hoverCell = null;
    }
  };

  // Drag a tower between waves: release over a free cell moves it
  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    const dragId = dragTowerRef.current;
    dragTowerRef.current = null;
    if (!engine || !canvas || !dragId || engine.selectedTowerId !== dragId) return;
    const rect = canvas.getBoundingClientRect();
    const cellX = Math.floor(((e.clientX - rect.left) * CONFIG.grid.totalWidth) / rect.width / CONFIG.grid.cellSize);
    const cellY = Math.floor(((e.clientY - rect.top) * CONFIG.grid.totalHeight) / rect.height / CONFIG.grid.cellSize);
    const tower = engine.towers.find((t) => t.id === dragId);
    if (tower && (tower.x !== cellX || tower.y !== cellY)) engine.moveSelectedTower(cellX, cellY);
  };

  const handleCanvasPointerLeave = () => {
    if (engineRef.current) engineRef.current.hoverCell = null;
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
        if (screen === 'menu' && !showHowToPlay) {
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
      } else if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') {
        if (fullscreenSupported()) {
          e.preventDefault();
          toggleFullscreen();
        }
      } else if (e.key === 'Escape') {
        if (specModalTower) {
          // Specialization choice is mandatory, don't close with Esc
          return;
        }
        if (engine.placingTowerType || engine.placingBinder) {
          setPlacingCardIndex(null);
          engine.placingTowerType = null;
          engine.placingBinder = false;
          engine.notifyState();
        } else if (engine.bindingFromId) {
          engine.toggleBinding();
        } else if (engine.upgradingFromBinderId) {
          engine.toggleUpgrading();
        } else if (engine.selectedTowerId || engine.selectedBinderId) {
          engine.selectTower(null);
        } else if (screen === 'playing') {
          engine.togglePause();
        }
      } else if (['1', '2', '3', '4', '5'].includes(e.key)) {
        if (screen === 'playing' && !engine.isPaused) {
          const idx = parseInt(e.key, 10) - 1;
          handleSelectShopCard(idx);
        }
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
      } else if (e.key === 'Tab') {
        if (screen === 'playing' && engine.selectedTowerId) {
          e.preventDefault();
          handleCyclePriority();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [screen, specModalTower, placingCardIndex, shopCards, unlockedLevel, showHowToPlay]);

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

  return (
    <div className="w-full h-full overflow-hidden bg-[#121118] text-[#f4f2e6] flex flex-col font-sans select-none">
      {/* 1. Portrait Warning */}
      {isPortrait && <OrientationWarning />}

      {/* 2. Main Menu Screen */}
      {screen === 'menu' && (
        <MainMenu
          unlockedLevel={unlockedLevel}
          levelStars={levelStars}
          selectedDifficulty={difficulty}
          endless={endless}
          endlessBest={endlessBest}
          musicVol={audioSettings.musicVolume}
          sfxVol={audioSettings.sfxVolume}
          isMuted={audioSettings.muted}
          selectedLevel={Math.min(selectedLevel, unlockedLevel)}
          onSelectLevel={(lvl) => {
            sound.init();
            setSelectedLevel(lvl);
          }}
          onPlay={handleOpenBriefing}
          onChangeDifficulty={(d) => {
            sound.init();
            setDifficulty(d);
          }}
          onChangeEndless={(v) => {
            sound.init();
            setEndless(v);
          }}
          onOpenHowToPlay={() => setShowHowToPlay(true)}
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
          difficulty={difficulty}
          endless={endless}
          onStartBattle={handleStartBattle}
          onBack={() => setScreen('menu')}
        />
      )}

      {/* 4. Active Gameplay Screen */}
      {screen === 'playing' && (
        <div className="w-full h-full flex flex-col">
          {/* Main Game Stage: Canvas (left/center) + Right Panel */}
          <div className="flex-1 flex overflow-hidden min-h-0 relative [container-type:size]">
            {/* Canvas Container keeps the field's aspect ratio */}
            <div
              ref={containerRef}
              className="h-full min-w-0 bg-[#121118] flex items-center justify-center p-1 sm:p-2 overflow-hidden"
              // As wide as the field at full height (it shrinks when the screen is narrower);
              // the side column takes whatever width is left
              style={{ flex: '0 1 auto', width: `calc((100cqh - 16px) * ${CONFIG.grid.cols} / ${CONFIG.grid.rows} + 16px)` }}
            >
              <div
                className="relative shadow-2xl rounded overflow-hidden"
                style={{
                  aspectRatio: `${CONFIG.grid.cols} / ${CONFIG.grid.rows}`,
                  // Explicit width: 'auto' would follow the canvas bitmap, which is smaller on dpr 1 screens
                  width: `min(100%, (100cqh - 16px) * ${CONFIG.grid.cols} / ${CONFIG.grid.rows})`,
                  maxHeight: '100%',
                  height: 'auto',
                }}
              >
                <canvas
                  ref={canvasRef}
                  onPointerDown={handleCanvasPointerDown}
                  onPointerMove={handleCanvasPointerMove}
                  onPointerUp={handleCanvasPointerUp}
                  onPointerLeave={handleCanvasPointerLeave}
                  className="w-full h-full block cursor-crosshair touch-none"
                  style={{ imageRendering: 'pixelated' }}
                />
                <FieldHud
                  speed={gameState.speed}
                  isPaused={gameState.isPaused}
                  isMuted={audioSettings.muted}
                  isSpawning={gameState.isSpawning}
                  isWaveActive={gameState.isWaveActive}
                  allWavesLaunched={gameState.allWavesLaunched}
                  waveCountdown={gameState.waveCountdown}
                  earlyStartBonus={gameState.earlyStartBonus}
                  onTogglePause={() => engineRef.current?.togglePause()}
                  onSetSpeed={(v) => engineRef.current?.setSpeed(v)}
                  onToggleMute={handleToggleMute}
                  onStartWave={handleStartWave}
                />
              </div>
            </div>

            {/* Right Column: HUD, shop, tower panel. Sizes follow the column's height (cqh) so the
                buttons grow on tall screens and the tower panel takes the rest: no empty space */}
            <div
              className="flex-1 min-w-[232px] h-full flex flex-col bg-[#171520] border-l border-[#2d2938] text-[#f4f2e6] overflow-hidden select-none z-10 [container-type:size]"
              style={SIDE_VARS}
            >
              <TopBar
                gold={gameState.gold}
                lives={gameState.lives}
                wave={gameState.wave}
                maxWaves={gameState.maxWaves}
                endless={gameState.endless}
              />
              <ShopPanel
                cards={shopCards}
                tier={gameState.tier}
                gold={gameState.gold}
                rerollCost={gameState.rerollCost}
                placingTowerType={engineRef.current?.placingTowerType || null}
                placingBinder={engineRef.current?.placingBinder || false}
                placingIndex={placingCardIndex}
                isBinding={gameState.isBinding}
                isMoving={gameState.canMoveTowers && gameState.selectedTower !== null && !gameState.isBinding}
                placingIsTriplet={engineRef.current?.placingIsTriplet || false}
                onSelectCard={handleSelectShopCard}
                onReroll={handleRerollShop}
                onUpgradeTier={handleUpgradeTier}
              />
              <TowerPanel
                tower={gameState.selectedTower}
                eligibleMergeCount={gameState.eligibleMergeCount}
                selectedBinder={gameState.selectedBinder}
                binderCount={gameState.binderCount}
                bindPartnerCount={gameState.bindPartnerCount}
                isBinding={gameState.isBinding}
                selectedBinderTriple={gameState.selectedBinderTriple}
                canMergeBinders={gameState.canMergeBinders}
                upgradeTargetCount={gameState.upgradeTargetCount}
                isUpgrading={gameState.isUpgrading}
                onMergeBinders={handleMergeBinders}
                onUpgradeWithBinder={handleUpgradeWithBinder}
                onCyclePriority={handleCyclePriority}
                onMerge={handleMerge}
                onBind={handleBind}
                onSell={handleSell}
              />
            </div>
          </div>
        </div>
      )}

      {/* 5. Specialization Modal */}
      {specModalTower && !gameState.isGameOver && !gameState.isVictory && (
        <SpecModal
          towerType={specModalTower.type}
          onSelectSpec={handleSelectSpec}
        />
      )}

      {/* 6. Pause Modal */}
      {screen === 'playing' && gameState.isPaused && !gameState.isGameOver && !gameState.isVictory && (
        <PauseModal
          onResume={() => engineRef.current?.togglePause()}
          onRestart={handleRestartLevel}
          onToMenu={handleToMenu}
          musicVol={audioSettings.musicVolume}
          sfxVol={audioSettings.sfxVolume}
          isMuted={audioSettings.muted}
          onMusicChange={handleMusicChange}
          onSfxChange={handleSfxChange}
          onToggleMute={handleToggleMute}
        />
      )}

      {/* 7. Victory Modal */}
      {screen === 'playing' && gameState.isVictory && (
        <VictoryModal
          level={gameState.level}
          stars={calculateStars(gameState.lives)}
          lives={gameState.lives}
          onNext={handleNextLevel}
          onRestart={handleRestartLevel}
          onToMenu={handleToMenu}
        />
      )}

      {/* 8. Defeat Modal */}
      {screen === 'playing' && gameState.isGameOver && (
        <DefeatModal
          wave={gameState.wave}
          endless={gameState.endless}
          best={endlessBest[gameState.level] || 0}
          onRestart={handleRestartLevel}
          onToMenu={handleToMenu}
        />
      )}

      {/* 9. How To Play Modal */}
      {showAccount && (
        <AccountModal user={user} syncState={syncState} onClose={() => setShowAccount(false)} />
      )}

      {showHowToPlay && (
        <HowToPlayModal onClose={() => setShowHowToPlay(false)} />
      )}
    </div>
  );
}
