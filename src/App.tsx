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
import { ShopPanel, ShopCard } from './components/ShopPanel';
import { TowerPanel } from './components/TowerPanel';
import { SpecModal } from './components/SpecModal';
import { MainMenu } from './components/MainMenu';
import { LevelBriefing } from './components/LevelBriefing';
import { PauseModal, VictoryModal, DefeatModal, HowToPlayModal } from './components/StatusModals';
import { OrientationWarning } from './components/OrientationWarning';

type ScreenState = 'menu' | 'briefing' | 'playing';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  // App screen state
  const [screen, setScreen] = useState<ScreenState>('menu');
  const [selectedLevel, setSelectedLevel] = useState<number>(1);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [showHowToPlay, setShowHowToPlay] = useState<boolean>(false);
  const [isPortrait, setIsPortrait] = useState<boolean>(false);

  // Persistent progression
  const [unlockedLevel, setUnlockedLevel] = useState<number>(1);
  const [levelStars, setLevelStars] = useState<Record<number, number>>({});

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
    waveCountdown: null,
    earlyStartBonus: 0,
    speed: 1,
    selectedTower: null,
    eligibleMergeCount: 0,
  });

  // Shop state (5 card slots)
  const [shopCards, setShopCards] = useState<(ShopCard | null)[]>([]);
  const [placingCardIndex, setPlacingCardIndex] = useState<number | null>(null);

  // Specialization modal state
  const [specModalTower, setSpecModalTower] = useState<{
    id: string;
    type: TowerType;
    isPrePlacement?: boolean;
    cardIndex?: number;
  } | null>(null);

  // Generate 5 shop cards based on current tier
  const generateShopCards = useCallback((currentTier: number): (ShopCard | null)[] => {
    const towerTypes: TowerType[] = ['archer', 'priest', 'mage', 'ballista'];
    const tripletChance = CONFIG.shop.tripletChances[currentTier - 1] || 0;
    const cards: ShopCard[] = [];

    for (let i = 0; i < CONFIG.shop.slotsCount; i++) {
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

    // Load saved progression
    try {
      const savedLvl = localStorage.getItem('dark_frontier_unlocked');
      if (savedLvl) setUnlockedLevel(parseInt(savedLvl, 10) || 1);
      const savedStars = localStorage.getItem('dark_frontier_stars');
      if (savedStars) setLevelStars(JSON.parse(savedStars));
    } catch {
      // ignore localStorage error
    }

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
    };

    engine.onNeedSpecChoice = (tower: Tower) => {
      setSpecModalTower({ id: tower.id, type: tower.type });
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
      setUnlockedLevel((prev) => {
        const updated = Math.max(prev, nextLvl);
        try {
          localStorage.setItem('dark_frontier_unlocked', updated.toString());
        } catch {}
        return updated;
      });

      setLevelStars((prev) => {
        const curBest = prev[gameState.level] || 0;
        const updated = { ...prev, [gameState.level]: Math.max(curBest, starsEarned) };
        try {
          localStorage.setItem('dark_frontier_stars', JSON.stringify(updated));
        } catch {}
        return updated;
      });
    }
  }, [gameState.isVictory, gameState.lives, gameState.level]);

  // Handle Level Start from briefing
  const handleStartBattle = () => {
    sound.init();
    setScreen('playing');
    setTimeout(() => {
      if (canvasRef.current && engineRef.current) {
        engineRef.current.setCanvas(canvasRef.current);
        engineRef.current.startLevel(selectedLevel, difficulty);
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
      engine.startLevel(selectedLevel, difficulty);
    } else {
      setScreen('playing');
      setTimeout(() => {
        if (canvasRef.current && engineRef.current) {
          engineRef.current.setCanvas(canvasRef.current);
          engineRef.current.startLevel(selectedLevel, difficulty);
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
      engine.setTowerSpecialization(specModalTower.id, specId);
      sound.playBuy();
    }
    setSpecModalTower(null);
  };

  // Shop Reroll
  const handleRerollShop = () => {
    sound.init();
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.gold < CONFIG.shop.rerollCost) {
      sound.playError();
      return;
    }
    engine.gold -= CONFIG.shop.rerollCost;
    sound.playBuy();
    setShopCards(generateShopCards(engine.tier));
    setPlacingCardIndex(null);
    engine.placingTowerType = null;
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

  // Sell selected tower
  const handleSell = () => {
    sound.init();
    const engine = engineRef.current;
    if (!engine || !engine.selectedTowerId) return;
    engine.sellTower(engine.selectedTowerId);
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
    if (engine.placingTowerType && placingCardIndex !== null) {
      const placed = engine.placeTower(cellX, cellY);
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
    if (clickedTower) {
      engine.selectTower(clickedTower.id);
      sound.playBuy();
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
        if (screen === 'briefing') {
          e.preventDefault();
          handleStartBattle();
        }
      } else if (e.key === 'p' || e.key === 'P' || e.key === 'з' || e.key === 'З') {
        if (screen === 'playing') {
          e.preventDefault();
          engine.togglePause();
        }
      } else if (e.key === 'Escape') {
        if (specModalTower) {
          // Specialization choice is mandatory, don't close with Esc
          return;
        }
        if (engine.placingTowerType) {
          setPlacingCardIndex(null);
          engine.placingTowerType = null;
          engine.notifyState();
        } else if (engine.selectedTowerId) {
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
        }
      } else if (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы') {
        if (screen === 'playing' && engine.selectedTowerId) {
          handleSell();
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
  }, [screen, specModalTower, placingCardIndex, shopCards]);

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
    <div className="w-screen h-screen overflow-hidden bg-[#121118] text-[#f4f2e6] flex flex-col font-sans select-none">
      {/* 1. Portrait Warning */}
      {isPortrait && <OrientationWarning />}

      {/* 2. Main Menu Screen */}
      {screen === 'menu' && (
        <MainMenu
          unlockedLevel={unlockedLevel}
          levelStars={levelStars}
          selectedDifficulty={difficulty}
          musicVol={audioSettings.musicVolume}
          sfxVol={audioSettings.sfxVolume}
          isMuted={audioSettings.muted}
          onSelectLevel={(lvl) => {
            sound.init();
            setSelectedLevel(lvl);
            setScreen('briefing');
          }}
          onChangeDifficulty={(d) => {
            sound.init();
            setDifficulty(d);
          }}
          onOpenHowToPlay={() => setShowHowToPlay(true)}
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
          onStartBattle={handleStartBattle}
          onBack={() => setScreen('menu')}
        />
      )}

      {/* 4. Active Gameplay Screen */}
      {screen === 'playing' && (
        <div className="w-full h-full flex flex-col">
          {/* Top Bar HUD */}
          <TopBar
            gold={gameState.gold}
            lives={gameState.lives}
            wave={gameState.wave}
            maxWaves={gameState.maxWaves}
            speed={gameState.speed}
            isPaused={gameState.isPaused}
            isMuted={audioSettings.muted}
            onTogglePause={() => engineRef.current?.togglePause()}
            onToggleSpeed={() => engineRef.current?.toggleSpeed()}
            onToggleMute={handleToggleMute}
          />

          {/* Main Game Stage: Canvas (left/center) + Right Panel */}
          <div className="flex-1 flex overflow-hidden min-h-0 relative">
            {/* Canvas Container with strict 3:2 aspect ratio preservation */}
            <div
              ref={containerRef}
              className="flex-1 h-full bg-[#121118] flex items-center justify-center p-1 sm:p-2 overflow-hidden"
            >
              <div
                className="relative shadow-2xl rounded overflow-hidden"
                style={{
                  aspectRatio: '3 / 2',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  width: 'auto',
                  height: 'auto',
                }}
              >
                <canvas
                  ref={canvasRef}
                  onPointerDown={handleCanvasPointerDown}
                  onPointerMove={handleCanvasPointerMove}
                  onPointerLeave={handleCanvasPointerLeave}
                  className="w-full h-full block cursor-crosshair touch-none"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
            </div>

            {/* Right Column: Compact Shop (Top) + Fixed-height Tower Panel (Bottom) */}
            <div
              className="w-[248px] h-full shrink-0 flex flex-col justify-between bg-[#171520] border-l border-[#2d2938] text-[#f4f2e6] overflow-hidden select-none z-10"
            >
              <ShopPanel
                cards={shopCards}
                tier={gameState.tier}
                gold={gameState.gold}
                placingTowerType={engineRef.current?.placingTowerType || null}
                placingIsTriplet={engineRef.current?.placingIsTriplet || false}
                isSpawning={gameState.isSpawning}
                isWaveActive={gameState.isWaveActive}
                allWavesLaunched={gameState.allWavesLaunched}
                waveCountdown={gameState.waveCountdown}
                earlyStartBonus={gameState.earlyStartBonus}
                onSelectCard={handleSelectShopCard}
                onReroll={handleRerollShop}
                onUpgradeTier={handleUpgradeTier}
                onStartWave={handleStartWave}
              />
              <TowerPanel
                tower={gameState.selectedTower}
                eligibleMergeCount={gameState.eligibleMergeCount}
                onCyclePriority={handleCyclePriority}
                onMerge={handleMerge}
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
          onRestart={handleRestartLevel}
          onToMenu={handleToMenu}
        />
      )}

      {/* 9. How To Play Modal */}
      {showHowToPlay && (
        <HowToPlayModal onClose={() => setShowHowToPlay(false)} />
      )}
    </div>
  );
}
