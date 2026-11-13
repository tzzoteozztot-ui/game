/**
 * Глобальная карта кампании (прототип, просьба Артура 2026-11-06, вариант В): большой регион из гексов,
 * туман, герой ходит по дням. Карту двигают перетаскиванием, приближают кнопками «+»/«−», колесом и щипком.
 * Сетка гексов видна, только когда герой выбран: касание героя — выбрать, касание гекса — путь, ещё раз — идти.
 * Логика — src/campaign/world.ts, рисование — src/campaign/worldRender.ts; бой отряда запускает App через `onBattle`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  WorldState,
  RegionDef,
  WorldObj,
  Arrival,
  findPath,
  stepHero,
  stepCost,
  restHero,
  REST_PARTS,
  restMoves,
  objectAt,
  isHostile,
  isSeen,
  terrainAt,
  resText,
  RES_ICONS,
  RES_NAMES,
  ResKey,
  MOVES_PER_DAY,
  TERRAIN_NAMES,
  TERRAIN_COST,
  dailyIncome,
  WorldSlot,
  loadSlots,
  saveSlot,
  SLOT_COUNT,
  upgradeCamp,
  toggleEquip,
  heroLevel,
  HERO_ITEMS,
  battleXp,
  isLocked,
  isCleared,
  lockText,
  chooseEvent,
  enterRegion,
  REGIONS,
} from '../campaign/world';
import { isDevMode } from '../devNotes';
import { Scene, sceneFor, startTrigger, CAMP_SCENES } from '../campaign/dialogs';
import { DialogBox } from './DialogBox';
import { JournalPanel } from './JournalPanel';
import { buildJournal } from '../campaign/journal';
import { bakeTerrain, drawLive, loadExtras, hexAt, wx, wy, worldW, worldH, HW, P } from '../campaign/worldRender';
import { sprites } from '../game/sprites';
import { loadTileset, Tileset, TILESETS } from '../game/tiles';
import { sound } from '../game/audio';
import { logReason, logWorldNote, hasCampaignLog, onCampaignLogReady, downloadCampaignLog } from '../campaign/worldLog';
import { CampPanel } from './CampPanel';
import { HeroPanel } from './HeroPanel';
import { WorldEditor } from './WorldEditor';

interface WorldMapProps {
  world: WorldState;
  region: RegionDef;
  onChange: (st: WorldState) => void;
  onBattle: (obj: WorldObj) => void;
  onExit: () => void;
  onReset: () => void;
  /** Карту правили редактором: родитель перечитывает `REGIONS` */
  onRegionEdited?: () => void;
  /** Начать главу с начала на правленой карте */
  onRestartRegion?: (r: RegionDef) => void;
}

type Notice = { title: string; text: string; battle?: WorldObj; event?: WorldObj };
type Cam = { zoom: number; x: number; y: number }; // экран = мир × zoom + (x, y)

const MAX_ZOOM = 2.2;
const CAM_KEY = 'dark_frontier_world_zoom';

// Кнопка «Скачать лог похода»: лог читается из хранилища не сразу
function CampaignLogButton({ world }: { world: WorldState }) {
  const [, tick] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => onCampaignLogReady(() => tick((n) => n + 1)), []);
  return (
    <button
      className="w-full mt-3 py-2 rounded bg-[#2a2635] hover:bg-[#3a3448] text-sm font-bold disabled:opacity-40"
      disabled={busy || !hasCampaignLog()}
      onClick={() => {
        setBusy(true);
        void downloadCampaignLog(world).finally(() => setBusy(false));
      }}
    >
      Скачать лог похода (JSON)
      <span className="block text-[11px] font-normal text-stone-400">Все действия на карте и все бои — для разбора баланса</span>
    </button>
  );
}

const copyWorld = (w: WorldState): WorldState => ({ ...w, hero: { ...w.hero }, res: { ...w.res }, done: [...w.done], owned: [...w.owned], seen: [...w.seen], camp: { ...w.camp }, items: [...w.items], equip: { ...w.equip }, scenes: [...w.scenes], flags: [...w.flags] });

export function WorldMap({ world, region, onChange, onBattle, onExit, onReset, onRegionEdited, onRestartRegion }: WorldMapProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tiles, setTiles] = useState<Tileset | null>(null);
  const [baseTiles, setBaseTiles] = useState<Tileset | null>(null); // природа континента у лагеря главы
  const [extras, setExtras] = useState<Map<string, HTMLImageElement> | null>(null);
  const [spritesReady, setSpritesReady] = useState(false);
  const [selected, setSelected] = useState(false);
  const [target, setTarget] = useState<P | null>(null);
  const [walking, setWalking] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [restOpen, setRestOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [savesOpen, setSavesOpen] = useState(false);
  const [campOpen, setCampOpen] = useState(false);
  const [heroOpen, setHeroOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [dialog, setDialog] = useState<{ scene: Scene; then?: () => void } | null>(null);
  const [slots, setSlots] = useState<(WorldSlot | null)[]>(() => loadSlots());
  const stRef = useRef(world);
  stRef.current = world;
  const cam = useRef<Cam>({ zoom: 1, x: 0, y: 0 });
  const camReady = useRef(false);

  useEffect(() => {
    let alive = true;
    sprites.load().then(() => alive && setSpritesReady(true));
    loadTileset(TILESETS[region.level] ?? 'frontier').then((t) => alive && setTiles(t));
    loadTileset('frontier').then((t) => alive && setBaseTiles(t));
    loadExtras().then((m) => alive && setExtras(m));
    return () => {
      alive = false;
    };
  }, [region.level]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Запечённая местность: заново, когда догрузились тайлы и картинки
  const baked = useMemo(() => (typeof document === 'undefined' ? null : bakeTerrain(region, tiles, extras, baseTiles)), [region, tiles, extras, baseTiles]);
  const path = useMemo(() => (target ? findPath(world, region, target) : null), [target, world, region]);

  // ---------------------------------------------------------------- камера
  const minZoom = () => Math.min(size.w / worldW(region), size.h / worldH(region));
  const clampCam = () => {
    const c = cam.current;
    c.zoom = Math.max(minZoom(), Math.min(MAX_ZOOM, c.zoom));
    const mw = worldW(region) * c.zoom;
    const mh = worldH(region) * c.zoom;
    c.x = mw <= size.w ? (size.w - mw) / 2 : Math.min(0, Math.max(size.w - mw, c.x));
    c.y = mh <= size.h ? (size.h - mh) / 2 : Math.min(0, Math.max(size.h - mh, c.y));
  };
  const centerOn = (p: P) => {
    const c = cam.current;
    c.x = size.w / 2 - wx(p) * c.zoom;
    c.y = size.h / 2 - wy(p) * c.zoom;
    clampCam();
  };
  const zoomAt = (k: number, sx: number, sy: number) => {
    const c = cam.current;
    const gx = (sx - c.x) / c.zoom;
    const gy = (sy - c.y) / c.zoom;
    c.zoom *= k;
    clampCam();
    c.x = sx - gx * c.zoom;
    c.y = sy - gy * c.zoom;
    clampCam();
    try {
      localStorage.setItem(CAM_KEY, String(c.zoom));
    } catch {
      /* без хранилища — без памяти о приближении */
    }
    requestDraw();
  };

  // ---------------------------------------------------------------- рисование
  const drawRef = useRef<() => void>(() => {});
  const raf = useRef(0);
  const requestDraw = () => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      drawRef.current();
    });
  };
  drawRef.current = () => {
    const cv = canvasRef.current;
    if (!cv || !size.w || !size.h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(size.w * dpr)) cv.width = Math.round(size.w * dpr);
    if (cv.height !== Math.round(size.h * dpr)) cv.height = Math.round(size.h * dpr);
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b0a10';
    ctx.fillRect(0, 0, size.w, size.h);
    const c = cam.current;
    ctx.setTransform(dpr * c.zoom, 0, 0, dpr * c.zoom, dpr * c.x, dpr * c.y);
    if (baked) ctx.drawImage(baked, 0, 0, worldW(region), worldH(region));
    drawLive(ctx, region, stRef.current, { selected, path, target, extras, time: performance.now() });
  };

  // Первый показ: приближение по памяти, герой в центре
  useEffect(() => {
    if (!size.w || !size.h) return;
    if (!camReady.current) {
      let z = Math.max(minZoom(), size.w / (16 * HW));
      try {
        const saved = Number(localStorage.getItem(CAM_KEY));
        if (saved > 0) z = saved;
      } catch {
        /* нет хранилища */
      }
      cam.current.zoom = z;
      clampCam();
      centerOn(world.hero);
      camReady.current = true;
    } else clampCam();
    requestDraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  useEffect(() => {
    requestDraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baked, spritesReady, world, selected, path, target]);

  // Новая глава — камера к герою у нового лагеря
  const shownRegion = useRef(region.id);
  useEffect(() => {
    if (shownRegion.current === region.id || !camReady.current) return;
    shownRegion.current = region.id;
    clampCam();
    centerOn(stRef.current.hero);
    requestDraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region.id]);

  // Мерцание сундуков и узлов — редкая перерисовка
  useEffect(() => {
    const t = setInterval(requestDraw, 120);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Герой ушёл к краю экрана — камера следует
  const follow = (p: P) => {
    const c = cam.current;
    const sx = wx(p) * c.zoom + c.x;
    const sy = wy(p) * c.zoom + c.y;
    const m = Math.min(size.w, size.h) * 0.2;
    if (sx < m || sy < m || sx > size.w - m || sy > size.h - m) centerOn(p);
  };

  // ---------------------------------------------------------------- диалоги (глава 1 — обучение)
  /** Сцена повода, если её ещё не было, потом `then` */
  const play = (trigger: string, then?: () => void) => {
    const sc = sceneFor(trigger, stRef.current.scenes, stRef.current.flags);
    if (sc) setDialog({ scene: sc, then });
    else then?.();
  };
  const closeDialog = () => {
    const d = dialog;
    if (!d) return;
    const st = copyWorld(stRef.current);
    if (!st.scenes.includes(d.scene.id)) st.scenes.push(d.scene.id);
    stRef.current = st;
    onChange(st);
    setDialog(null);
    d.then?.();
  };
  // Пролог и сцены после побед (бой идёт в App, сюда возвращаемся уже с наградой)
  useEffect(() => {
    if (dialog || notice || walking || campOpen || heroOpen || journalOpen || savesOpen) return;
    const triggers = [startTrigger(region.id), ...region.objects.filter((o) => isCleared(world, o.id)).map((o) => `after:${o.id}`)];
    for (const t of triggers) {
      const sc = sceneFor(t, world.scenes, world.flags);
      if (sc) {
        setDialog({ scene: sc });
        return;
      }
    }
  }, [world, region, dialog, notice, walking, campOpen, heroOpen, journalOpen, savesOpen]);

  // ---------------------------------------------------------------- ход
  const walk = useCallback(
    (route: P[]) => {
      let steps = route;
      setWalking(true);
      let i = 0;
      const stop = () => {
        setWalking(false);
        setTarget(null);
      };
      const next = () => {
        const st = copyWorld(stRef.current);
        let p = steps[i++];
        if (!p) return stop();
        // Туман рассеялся, а впереди непроходимо — путь заново до той же цели
        const tp = terrainAt(region, p.x, p.y);
        if (!tp || TERRAIN_COST[tp] === null) {
          const goal = steps[steps.length - 1];
          const again = findPath(st, region, goal);
          if (!again) {
            stop();
            setNotice({ title: 'Туда не пройти', text: 'Разведка показала: дальше пути нет.' });
            return;
          }
          steps = again;
          i = 0;
          p = steps[i++];
        }
        // Тропа обучения: объект ещё закрыт
        const o = objectAt(st, region, p.x, p.y);
        if (o && isLocked(st, o)) {
          stop();
          logWorldNote(st, 'locked', { obj: o.id, name: o.name, needs: o.needs, needsAny: o.needsAny });
          setNotice({ title: o.name, text: `Эхо: «Рано, капитан. Сначала — ${lockText(st, region, o)}».` });
          return;
        }
        // Перед боем — сцена и вопрос; ход тратится, только если игрок согласится
        const engage = (o: WorldObj, cost: number) => {
          stop();
          if (st.moves < cost) {
            setRestOpen(true);
            return;
          }
          play(`before:${o.id}`, () =>
            setNotice({
              title: o.name,
              text: `${o.text ? o.text + '\n\n' : ''}${battleText(o, st)}${o.reward ? `\nНаграда: ${resText(o.reward)}` : ''}${itemLine(o.item)}${o.income ? `\nДоход промысла: ${resText(o.income)} в день` : ''}`,
              battle: o,
            })
          );
        };
        if (o && isHostile(st, o)) {
          engage(o, stepCost(region, p));
          return;
        }
        const res: Arrival | null = stepHero(st, region, p);
        if (!res) {
          stop();
          logWorldNote(st, 'no-moves', { at: p, need: stepCost(region, p) });
          setRestOpen(true);
          return;
        }
        stRef.current = st;
        onChange(st);
        follow(p);
        if (res.kind === 'loot') {
          sound.playBuy();
          const n = { title: res.obj.name, text: `${res.obj.text ? res.obj.text + '\n\n' : ''}Найдено: ${resText(res.got)}${itemLine(res.obj.item)}` };
          play(`loot:${res.obj.id}`, () => setNotice(n));
          return stop();
        }
        if (res.kind === 'event') {
          logWorldNote(st, 'event-open', { obj: res.obj.id, name: res.obj.name, choices: res.obj.choices?.map((x) => x.label) });
          const n: Notice = { title: res.obj.name, text: res.obj.text ?? '', event: res.obj };
          play(`event:${res.obj.id}`, () => setNotice(n));
          return stop();
        }
        if (res.kind === 'captured') {
          sound.playBuy();
          setNotice({ title: res.obj.name, text: `Промысел наш. Каждый день: ${resText(res.obj.income)}` });
          return stop();
        }
        if (res.kind === 'visit' && i === steps.length) logWorldNote(st, 'visit', { obj: res.obj.id, name: res.obj.name });
        if (res.kind === 'visit' && res.obj.kind === 'camp' && i === steps.length) {
          const cs = CAMP_SCENES[region.id];
          if (cs && isCleared(st, cs.after)) play(cs.trigger, () => setCampOpen(true));
          else setCampOpen(true);
          return stop();
        }
        setTimeout(next, 140);
      };
      next();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onChange, region, size]
  );

  const tapAt = (sx: number, sy: number) => {
    if (walking || notice || dialog) return;
    const c = cam.current;
    const h = hexAt(region, (sx - c.x) / c.zoom, (sy - c.y) / c.zoom);
    if (!h) return;
    sound.init();
    if (h.x === world.hero.x && h.y === world.hero.y) {
      setSelected((s) => !s);
      setTarget(null);
      return;
    }
    // Закрытый тропой обучения объект: сразу сказать, что раньше, а не вести к нему героя
    const lo = isSeen(world, region, h.x, h.y) ? objectAt(world, region, h.x, h.y) : null;
    if (lo && isLocked(world, lo)) {
      setTarget(null);
      setNotice({ title: lo.name, text: `Эхо: «Рано, капитан. Сначала — ${lockText(world, region, lo)}».` });
      return;
    }
    if (target && target.x === h.x && target.y === h.y && path) {
      walk(path);
      return;
    }
    setTarget(h);
  };

  // ---------------------------------------------------------------- касания: перетаскивание, щипок, касание
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; startX: number; startY: number; pinch: number | null }>({ moved: false, startX: 0, startY: 0, pinch: null });
  const local = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onDown = (e: React.PointerEvent) => {
    canvasRef.current?.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 1) gesture.current = { moved: false, startX: p.x, startY: p.y, pinch: null };
    else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      gesture.current.moved = true;
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (pointers.current.size >= 2 && g.pinch) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 0) zoomAt(d / g.pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
      g.pinch = d;
      return;
    }
    if (!g.moved && Math.hypot(p.x - g.startX, p.y - g.startY) > 7) g.moved = true;
    if (g.moved) {
      cam.current.x += p.x - prev.x;
      cam.current.y += p.y - prev.y;
      clampCam();
      requestDraw();
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const had = pointers.current.delete(e.pointerId);
    if (!had) return;
    if (pointers.current.size === 0 && !gesture.current.moved) {
      const p = local(e);
      tapAt(p.x, p.y);
    }
    if (pointers.current.size < 2) gesture.current.pinch = null;
  };
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    };
    cv.addEventListener('wheel', onWheel, { passive: false });
    return () => cv.removeEventListener('wheel', onWheel);
  });

  const targetObj = target && isSeen(world, region, target.x, target.y) ? objectAt(world, region, target.x, target.y) : null;
  const targetTerrain = target ? terrainAt(region, target.x, target.y) : null;
  const income = dailyIncome(world, region);

  const choose = (o: WorldObj, i: number) => {
    const st = copyWorld(world);
    const c = chooseEvent(st, region, o.id, i);
    if (!c) return setNotice(null);
    logReason('event-choice', { obj: o.id, name: o.name, choice: i + 1, label: c.label, of: o.choices?.map((x) => x.label) });
    sound.playBuy();
    stRef.current = st;
    onChange(st);
    const got = c.reward ? resText(c.reward) : '';
    const n = { title: o.name, text: `${c.text}${got ? `\n\nПолучено: ${got}` : ''}${itemLine(c.item)}` };
    // Реплики этого выбора (`choice:<объект>:<номер>`), потом итог
    setNotice(null);
    play(`choice:${o.id}:${i + 1}`, () => setNotice(n));
  };
  const nextRegion = region.next ? REGIONS[region.next] : null;
  const goNext = (to: RegionDef) => {
    const st = copyWorld(world);
    logReason('region', { chapter: to.chapter ?? 1, jump: region.next !== to.id || !world.won });
    enterRegion(st, to);
    setTarget(null);
    setSelected(false);
    onChange(st);
  };

  const fight = (o: WorldObj) => {
    const st = copyWorld(world);
    st.moves = Math.max(0, st.moves - stepCost(region, { x: o.x, y: o.y }));
    onChange(st);
    setNotice(null);
    onBattle(o);
  };

  const btn = 'w-11 h-11 rounded-lg bg-black/65 border border-[#3b354a] text-xl font-bold text-amber-100 hover:bg-black/80 active:scale-95 flex items-center justify-center';

  return (
    <div className="fixed inset-0 bg-[#0b0a10] text-[#f4f2e6] flex flex-col select-none">
      {/* Верхняя полоса: регион, день, ход, ресурсы, кнопки */}
      <div className="absolute top-0 inset-x-0 z-[5] flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 bg-[#171520]/55 border-b border-[#2d2938]/60 text-xs sm:text-sm flex-wrap">
        <button className="px-2 py-1 rounded bg-[#2a2635]/80 hover:bg-[#3a3448]" title="В главное меню" onClick={onExit}>
          ← <span className="hidden lg:inline">В меню</span>
        </button>
        <span className="font-black text-amber-300 tracking-wide">{region.name}</span>
        <span className="text-stone-300">День {world.day}</span>
        <span className="text-stone-300" title="Очки хода: дорога 2, луг 3, лес и холмы 4">
          Ход{' '}
          <span className="text-emerald-300 font-bold">
            {world.moves}/{MOVES_PER_DAY}
          </span>
        </span>
        <span className="flex gap-2 ml-1">
          {(Object.keys(RES_NAMES) as ResKey[]).map((k) => (
            <span key={k} title={RES_NAMES[k]} className="whitespace-nowrap">
              {RES_ICONS[k]} {world.res[k]}
              {income[k] ? <span className="text-emerald-400 text-[0.85em]"> +{income[k]}</span> : null}
            </span>
          ))}
        </span>
        <span className="flex-1" />
        <button
          className="px-3 py-1 rounded bg-amber-700/80 hover:bg-amber-600 font-bold disabled:opacity-50"
          disabled={walking || !!notice}
          onClick={() => {
            sound.init();
            setRestOpen(true);
          }}
        >
          Отдых
        </button>
        <button className="px-2 py-1 rounded bg-[#2a2635] hover:bg-[#3a3448] disabled:opacity-50" disabled={walking} title="Дневник: задачи главы" onClick={() => setJournalOpen(true)}>
          📖<span className="hidden lg:inline"> Дневник</span>
        </button>
        <button className="px-2 py-1 rounded bg-[#2a2635] hover:bg-[#3a3448] disabled:opacity-50" disabled={walking} title="Герой" onClick={() => setHeroOpen(true)}>
          🛡<span className="hidden lg:inline"> Рен · ур. {heroLevel(world)}</span>
        </button>
        <button className="px-2 py-1 rounded bg-[#2a2635] hover:bg-[#3a3448] disabled:opacity-50" disabled={walking} title="Лагерь" onClick={() => setCampOpen(true)}>
          ⛺<span className="hidden lg:inline"> Лагерь</span>
        </button>
        <button
          className="px-2 py-1 rounded bg-[#2a2635] hover:bg-[#3a3448] disabled:opacity-50"
          disabled={walking}
          title="Сохранения"
          onClick={() => {
            setSlots(loadSlots());
            setSavesOpen(true);
          }}
        >
          💾<span className="hidden lg:inline"> Сохранения</span>
        </button>
      </div>

      <div ref={wrapRef} className="absolute inset-0 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full touch-none"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />

        {/* Приближение и «к герою» */}
        <div className="absolute right-2 bottom-2 flex flex-col gap-1.5">
          <button className={btn} title="Приблизить" onClick={() => zoomAt(1.25, size.w / 2, size.h / 2)}>
            +
          </button>
          <button className={btn} title="Отдалить" onClick={() => zoomAt(0.8, size.w / 2, size.h / 2)}>
            −
          </button>
          <button
            className={`${btn} text-base`}
            title="К герою"
            onClick={() => {
              centerOn(world.hero);
              requestDraw();
            }}
          >
            ⌖
          </button>
        </div>

        {/* Подсказка и сведения о выбранном гексе */}
        {!notice && (
          <div className="absolute left-2 bottom-2 max-w-[60%] bg-black/70 border border-[#3b354a] rounded-lg px-3 py-2 text-xs sm:text-sm pointer-events-none">
            {target ? (
              <>
                {targetObj ? (
                  <>
                    <div className="font-bold text-amber-300">{targetObj.name}</div>
                    {isHostile(world, targetObj) && (
                      <div className="text-red-300">
                        {targetObj.army ? 'Бой с армией, как в Потасовке' : `Бой: ${targetObj.waves} волн${targetObj.kind === 'fortress' ? ', босс' : ''}`}
                      </div>
                    )}
                    {targetObj.reward && !world.done.includes(targetObj.id) && <div>Награда: {resText(targetObj.reward)}</div>}
                    {targetObj.income && <div>Доход: {resText(targetObj.income)} в день{world.owned.includes(targetObj.id) ? ' (наш)' : ''}</div>}
                  </>
                ) : !isSeen(world, region, target.x, target.y) ? (
                  <div className="text-stone-300">Неразведанные земли</div>
                ) : targetTerrain ? (
                  <div className="text-stone-300">
                    {TERRAIN_NAMES[targetTerrain]}
                    {TERRAIN_COST[targetTerrain] ? `: ${TERRAIN_COST[targetTerrain]} хода` : ''}
                  </div>
                ) : null}
                <div className="text-stone-400 mt-0.5">
                  {path ? 'Коснитесь ещё раз — идти' : 'Туда не пройти'}
                </div>
              </>
            ) : (
              <div className="text-stone-300">Коснитесь точки на карте — проложится путь. Карту можно двигать</div>
            )}
          </div>
        )}

        {world.won && !notice && !dialog && (
          <div className="absolute right-16 top-12 bg-black/75 border border-amber-600/60 rounded-lg px-3 py-2 text-xs sm:text-sm text-amber-200 max-w-[60%]">
            {nextRegion ? (
              <div className="flex items-center gap-3 flex-wrap">
                <span>{region.name}: артефакт наш.</span>
                <button className="px-3 py-1.5 rounded bg-amber-700/90 hover:bg-amber-600 text-white font-bold" onClick={() => goNext(nextRegion)}>
                  Дальше: {nextRegion.name} ▸
                </button>
              </div>
            ) : (
              <span>Пять артефактов горят. Поход пройден.</span>
            )}
          </div>
        )}

        {/* Время суток: чем дальше день, тем темнее */}
        {(world.dayPart ?? 0) > 0 && (
          <div
            className="absolute inset-0 pointer-events-none z-[5] transition-colors duration-700"
            style={{ background: (world.dayPart ?? 0) === 1 ? 'rgba(40,20,60,0.18)' : 'rgba(10,10,40,0.38)' }}
          />
        )}

        {/* Отдых: сколько спать — столько ходов вернётся */}
        {restOpen && !notice && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center p-4 z-10">
            <div className="bg-[#171520] border border-[#3b354a] rounded-xl p-4 max-w-sm w-full shadow-2xl">
              <h3 className="text-lg font-black text-amber-300 mb-1">Отдых</h3>
              <p className="text-sm text-stone-300 mb-3">
                День {world.day}, прошло {world.dayPart ?? 0} из {REST_PARTS} частей. Чем дольше отдых, тем больше ходов вернётся.
              </p>
              <div className="flex flex-col gap-2">
                {[1, 2, REST_PARTS].map((parts) => {
                  const left = REST_PARTS - (world.dayPart ?? 0);
                  const night = parts >= left;
                  return (
                    <button
                      key={parts}
                      className="py-2 px-3 rounded bg-[#2f2a40] hover:bg-[#3e3654] border border-[#4a4260] font-bold text-left"
                      onClick={() => {
                        const st = copyWorld(world);
                        const got = restHero(st, region, parts);
                        onChange(st);
                        setRestOpen(false);
                        if (got) {
                          const t = resText(got);
                          setNotice({ title: `День ${st.day}`, text: `${NIGHT_LINES[st.day % NIGHT_LINES.length]}\n\n${t ? `Промыслы принесли: ${t}` : 'Герой отдохнул, очки хода восстановлены.'}` });
                        }
                      }}
                    >
                      {night ? 'Спать до утра' : parts === 1 ? 'Привал (треть дня)' : 'Долгий привал (две трети дня)'}
                      <span className="block text-xs font-normal text-stone-400">
                        {night ? `Новый день: ходы полные, промыслы приносят доход` : `+${parts * restMoves(world, region)} ходов${restMoves(world, region) > 10 ? ' (в лагере больше)' : ''}, день продолжается`}
                      </span>
                    </button>
                  );
                })}
                <button className="py-2 rounded bg-[#2a2635] hover:bg-[#3a3448]" onClick={() => setRestOpen(false)}>
                  Не отдыхать
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Окно события */}
        {notice && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center p-4 z-10">
            <div className="bg-[#171520] border border-[#3b354a] rounded-xl p-4 max-w-sm w-full max-h-full overflow-y-auto shadow-2xl">
              <h3 className="text-lg font-black text-amber-300 mb-2">{notice.title}</h3>
              <p className="text-sm text-stone-200 whitespace-pre-line mb-4">{notice.text}</p>
              {notice.event?.choices ? (
                <div className="flex flex-col gap-2">
                  {notice.event.choices.map((c, i) => (
                    <button key={i} className="py-2 px-3 rounded bg-[#2f2a40] hover:bg-[#3e3654] border border-[#4a4260] font-bold text-left" onClick={() => choose(notice.event!, i)}>
                      {notice.event!.choices!.length === 1 ? 'Дальше' : c.label}
                    </button>
                  ))}
                </div>
              ) : notice.battle ? (
                <div className="grid grid-cols-2 gap-2">
                  <button className="py-2 rounded bg-red-800 hover:bg-red-700 font-bold" onClick={() => fight(notice.battle!)}>
                    В бой
                  </button>
                  <button className="py-2 rounded bg-[#2a2635] hover:bg-[#3a3448]" onClick={() => setNotice(null)}>
                    Отступить
                  </button>
                </div>
              ) : (
                <button className="w-full py-2 rounded bg-[#2a2635] hover:bg-[#3a3448] font-bold" onClick={() => setNotice(null)}>
                  Дальше
                </button>
              )}
            </div>
          </div>
        )}

        {heroOpen && (
          <HeroPanel
            world={world}
            onClose={() => setHeroOpen(false)}
            onToggle={(id) => {
              const st = copyWorld(world);
              toggleEquip(st, id);
              onChange(st);
            }}
          />
        )}

        {journalOpen && (
          <JournalPanel
            journal={buildJournal(world, region)}
            region={region}
            onClose={() => setJournalOpen(false)}
            onShow={(o) => {
              setJournalOpen(false);
              centerOn(o);
              setSelected(true);
              setTarget({ x: o.x, y: o.y });
              requestDraw();
            }}
          />
        )}

        {campOpen && (
          <CampPanel
            world={world}
            onClose={() => setCampOpen(false)}
            onUpgrade={(perk) => {
              const st = copyWorld(world);
              if (upgradeCamp(st, perk) !== null) {
                sound.playBuy();
                onChange(st);
              }
            }}
          />
        )}

        {savesOpen && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center p-4 z-10" onClick={() => setSavesOpen(false)}>
            <div className="bg-[#171520] border border-[#3b354a] rounded-xl p-4 max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-black text-amber-300 mb-1">Сохранения</h3>
              <p className="text-xs text-stone-400 mb-3">Поход и так сохраняется сам после каждого шага. Ячейки — чтобы вернуться к нужному дню.</p>
              <button className="w-full mb-3 py-1.5 rounded bg-[#2a2635] hover:bg-red-900/70 text-sm" onClick={() => { setSavesOpen(false); setConfirmReset(true); }}>
                Начать поход заново…
              </button>
              <div className="flex flex-col gap-2">
                {Array.from({ length: SLOT_COUNT }, (_, i) => {
                  const sl = slots[i];
                  return (
                    <div key={i} className="flex items-center gap-2 bg-black/30 border border-[#2d2938] rounded-lg px-3 py-2">
                      <div className="flex-1 min-w-0 text-sm">
                        <div className="font-bold">Ячейка {i + 1}</div>
                        <div className="text-xs text-stone-400 truncate">
                          {sl ? `День ${sl.day} · ${new Date(sl.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'пусто'}
                        </div>
                      </div>
                      <button
                        className="px-3 py-1.5 rounded bg-amber-700/80 hover:bg-amber-600 text-sm font-bold"
                        onClick={() => {
                          saveSlot(i, world);
                          logWorldNote(world, 'slot-save', { slot: i + 1 });
                          setSlots(loadSlots());
                          sound.playBuy();
                        }}
                      >
                        Сохранить
                      </button>
                      <button
                        className="px-3 py-1.5 rounded bg-[#2a2635] hover:bg-[#3a3448] text-sm font-bold disabled:opacity-40"
                        disabled={!sl}
                        onClick={() => {
                          if (!sl) return;
                          setSavesOpen(false);
                          setTarget(null);
                          setSelected(false);
                          logReason('slot-load', { slot: i + 1, savedDay: sl.day });
                          onChange(sl.state);
                          centerOn(sl.state.hero);
                          requestDraw();
                        }}
                      >
                        Загрузить
                      </button>
                    </div>
                  );
                })}
              </div>
              {isDevMode() && (
                <>
                <div className="mt-3 text-xs text-stone-400">Перейти к главе (для проверки: лагерь, герой и ресурсы остаются)</div>
                <div className="mt-1 grid grid-cols-5 gap-1.5">
                  {Object.values(REGIONS).map((r) => (
                    <button
                      key={r.id}
                      title={r.name}
                      className={`py-1.5 rounded text-sm font-bold ${r.id === region.id ? 'bg-amber-800/70' : 'bg-[#2a2635] hover:bg-[#3a3448]'}`}
                      onClick={() => {
                        setSavesOpen(false);
                        if (r.id === region.id && !window.confirm("Начать эту главу заново? Прогресс главы пропадёт.")) return;
                        goNext(r);
                      }}
                    >
                      {r.chapter ?? 1}
                    </button>
                  ))}
                </div>
                </>
              )}
              <button className="w-full mt-3 py-2 rounded bg-[#2a2635] hover:bg-[#3a3448] text-sm font-bold" onClick={() => { setSavesOpen(false); setEditorOpen(true); }}>
                ✎ Редактор карты
                <span className="block text-[11px] font-normal text-stone-400">Местность, объекты, замки, старт — и проверка «пройдём ли»</span>
              </button>
              <CampaignLogButton world={world} />
              <button className="w-full mt-2 py-2 rounded bg-[#2a2635] hover:bg-[#3a3448] font-bold" onClick={() => setSavesOpen(false)}>
                Закрыть
              </button>
            </div>
          </div>
        )}

        {editorOpen && (
          <WorldEditor
            regionId={region.id}
            onClose={() => setEditorOpen(false)}
            onSaved={() => onRegionEdited?.()}
            onPlay={(r) => {
              setEditorOpen(false);
              setTarget(null);
              setSelected(false);
              onRestartRegion?.(r);
            }}
          />
        )}

        {dialog && <DialogBox scene={dialog.scene} onDone={closeDialog} />}

        {confirmReset && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center p-4 z-10">
            <div className="bg-[#171520] border border-[#3b354a] rounded-xl p-4 max-w-sm w-full shadow-2xl">
              <h3 className="text-lg font-black text-amber-300 mb-2">Начать поход заново?</h3>
              <p className="text-sm text-stone-200 mb-4">Ресурсы, промыслы и разбитые отряды пропадут. Лог похода тоже начнётся заново — если он нужен, сначала скачайте его в «Сохранениях».</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="py-2 rounded bg-red-800 hover:bg-red-700 font-bold"
                  onClick={() => {
                    setConfirmReset(false);
                    setTarget(null);
                    setSelected(false);
                    onReset();
                  }}
                >
                  Заново
                </button>
                <button className="py-2 rounded bg-[#2a2635] hover:bg-[#3a3448]" onClick={() => setConfirmReset(false)}>
                  Отмена
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Строка о найденном предмете героя */
function itemLine(id: string | undefined): string {
  const def = HERO_ITEMS.find((d) => d.id === id);
  return def ? `\nПредмет для Рена: ${def.icon} ${def.name}` : '';
}

/** Что за бой ждёт у объекта — для окна перед боем */
function battleText(o: WorldObj, st?: WorldState): string {
  const weak = st && o.weakenedBy && st.owned.includes(o.weakenedBy) ? '\nМалый артефакт наш: защита лагеря ослаблена.' : '';
  if (o.army && o.armyAt)
    return `Волны идут без конца, пока стоит лагерь врага. Армию на него выставить пока некому: держите линию.${weak}`;
  if (o.army)
    return 'Бой с армией, как в Потасовке: во вкладке «Армия» покупайте врагов и отправляйте их на поле противника — он шлёт своих в ответ. Победа — когда падёт его артефакт.';
  const n = o.waves ?? 3;
  return `Бой: ${n} ${n === 1 ? 'волна' : n < 5 ? 'волны' : 'волн'}${o.kind === 'fortress' ? ', в последней — босс' : ''}.`;
}

/** Итог боя похода поверх поля: победа — награда и «На карту», поражение — «Ещё раз» или «На карту» */
const NIGHT_LINES = [
  'Ночь прошла тихо. Только ветер ходил вокруг костра.',
  'Где-то далеко выли волки. К утру стихло.',
  'Дозорный видел огни на холмах и не разбудил никого: огни погасли.',
  'Кристалл на груди Рена до рассвета тихо гудел.',
  'Мельхиор до утра писал при свече и записал всё, кроме снов.',
]

export function WorldBattleResult({ obj, won, onMap, onRetry }: { obj: WorldObj; won: boolean; onMap: () => void; onRetry: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <div className={`bg-[#171520] border-2 ${won ? 'border-amber-500/70' : 'border-red-800/70'} rounded-xl p-4 max-w-sm w-full text-center text-[#f4f2e6]`}>
        <h2 className={`text-2xl font-black tracking-wider mb-2 ${won ? 'text-amber-300' : 'text-red-400'}`}>
          {won ? (obj.kind === 'fortress' ? 'КРЕПОСТЬ ПАЛА!' : obj.army ? 'ЛАГЕРЬ РАЗБИТ' : 'ОТРЯД РАЗБИТ') : 'ОТСТУПЛЕНИЕ'}
        </h2>
        <p className="text-sm text-stone-300 mb-3 whitespace-pre-line">
          {won
            ? `${obj.name}: ${obj.kind === 'mine' ? `промысел наш, каждый день ${resText(obj.income)}` : `награда ${resText(obj.reward) || 'нет'}`}. Опыт героя +${battleXp(obj)}.${itemLine(obj.item)}`
            : `Враги дошли до лагеря. ${obj.name} устоял. Герой отошёл на прежнее место; отряд ждёт на месте.`}
        </p>
        <div className={`grid ${won ? 'grid-cols-1' : 'grid-cols-2'} gap-2`}>
          {!won && (
            <button className="py-2 rounded bg-red-800 hover:bg-red-700 font-bold" onClick={onRetry}>
              Ещё раз
            </button>
          )}
          <button className="py-2 rounded bg-amber-700 hover:bg-amber-600 font-bold" onClick={onMap}>
            На карту
          </button>
        </div>
      </div>
    </div>
  );
}
