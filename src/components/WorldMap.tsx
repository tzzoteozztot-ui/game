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
  endDay,
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
} from '../campaign/world';
import { bakeTerrain, drawLive, loadExtras, hexAt, wx, wy, worldW, worldH, HW, P } from '../campaign/worldRender';
import { sprites } from '../game/sprites';
import { loadTileset, Tileset, TILESETS } from '../game/tiles';
import { sound } from '../game/audio';

interface WorldMapProps {
  world: WorldState;
  region: RegionDef;
  onChange: (st: WorldState) => void;
  onBattle: (obj: WorldObj) => void;
  onExit: () => void;
  onReset: () => void;
}

type Notice = { title: string; text: string; battle?: WorldObj };
type Cam = { zoom: number; x: number; y: number }; // экран = мир × zoom + (x, y)

const MAX_ZOOM = 2.2;
const CAM_KEY = 'dark_frontier_world_zoom';

const copyWorld = (w: WorldState): WorldState => ({ ...w, hero: { ...w.hero }, res: { ...w.res }, done: [...w.done], owned: [...w.owned], seen: [...w.seen] });

export function WorldMap({ world, region, onChange, onBattle, onExit, onReset }: WorldMapProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tiles, setTiles] = useState<Tileset | null>(null);
  const [extras, setExtras] = useState<Map<string, HTMLImageElement> | null>(null);
  const [spritesReady, setSpritesReady] = useState(false);
  const [selected, setSelected] = useState(false);
  const [target, setTarget] = useState<P | null>(null);
  const [walking, setWalking] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const stRef = useRef(world);
  stRef.current = world;
  const cam = useRef<Cam>({ zoom: 1, x: 0, y: 0 });
  const camReady = useRef(false);

  useEffect(() => {
    let alive = true;
    sprites.load().then(() => alive && setSpritesReady(true));
    loadTileset(TILESETS[region.level] ?? 'frontier').then((t) => alive && setTiles(t));
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
  const baked = useMemo(() => (typeof document === 'undefined' ? null : bakeTerrain(region, tiles, extras)), [region, tiles, extras]);
  const path = useMemo(() => (selected && target ? findPath(world, region, target) : null), [selected, target, world, region]);

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

  // ---------------------------------------------------------------- ход
  const walk = useCallback(
    (steps: P[]) => {
      setWalking(true);
      let i = 0;
      const stop = () => {
        setWalking(false);
        setTarget(null);
      };
      const next = () => {
        const st = copyWorld(stRef.current);
        const p = steps[i++];
        if (!p) return stop();
        // Перед боем — вопрос; ход тратится, только если игрок согласится
        const o = objectAt(st, region, p.x, p.y);
        if (o && isHostile(st, o)) {
          stop();
          if (st.moves < stepCost(region, p)) {
            setNotice({ title: 'Ходы кончились', text: 'До врага не хватает очков хода. Завершите день.' });
            return;
          }
          setNotice({
            title: o.name,
            text: `${o.text ? o.text + '\n\n' : ''}Бой: ${o.waves} ${o.waves === 1 ? 'волна' : o.waves! < 5 ? 'волны' : 'волн'}${o.kind === 'fortress' ? ', в последней — босс' : ''}.${o.reward ? `\nНаграда: ${resText(o.reward)}` : ''}${o.income ? `\nДоход промысла: ${resText(o.income)} в день` : ''}`,
            battle: o,
          });
          return;
        }
        const res: Arrival | null = stepHero(st, region, p);
        if (!res) {
          stop();
          setNotice({ title: 'Ходы кончились', text: 'Герой устал. Завершите день, чтобы идти дальше.' });
          return;
        }
        stRef.current = st;
        onChange(st);
        follow(p);
        if (res.kind === 'loot') {
          sound.playBuy();
          setNotice({ title: res.obj.name, text: `${res.obj.text ? res.obj.text + '\n\n' : ''}Найдено: ${resText(res.got)}` });
          return stop();
        }
        if (res.kind === 'captured') {
          sound.playBuy();
          setNotice({ title: res.obj.name, text: `Промысел наш. Каждый день: ${resText(res.obj.income)}` });
          return stop();
        }
        if (res.kind === 'visit' && res.obj.kind === 'camp' && i === steps.length) setNotice({ title: res.obj.name, text: res.obj.text ?? '' });
        setTimeout(next, 140);
      };
      next();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onChange, region, size]
  );

  const tapAt = (sx: number, sy: number) => {
    if (walking || notice) return;
    const c = cam.current;
    const h = hexAt(region, (sx - c.x) / c.zoom, (sy - c.y) / c.zoom);
    if (!h) return;
    sound.init();
    if (h.x === world.hero.x && h.y === world.hero.y) {
      setSelected((s) => !s);
      setTarget(null);
      return;
    }
    if (selected && target && target.x === h.x && target.y === h.y && path) {
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
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#171520] border-b border-[#2d2938] text-xs sm:text-sm flex-wrap">
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
            const st = copyWorld(world);
            const got = endDay(st, region);
            onChange(st);
            setTarget(null);
            const t = resText(got);
            setNotice({ title: `День ${st.day}`, text: t ? `Промыслы принесли: ${t}` : 'Герой отдохнул, очки хода восстановлены.' });
          }}
        >
          Конец дня
        </button>
        <button className="px-2 py-1 rounded bg-[#2a2635] hover:bg-[#3a3448]" onClick={() => setConfirmReset(true)}>
          Заново
        </button>
        <button className="px-2 py-1 rounded bg-[#2a2635] hover:bg-[#3a3448]" onClick={onExit}>
          В меню
        </button>
      </div>

      <div ref={wrapRef} className="relative flex-1 min-h-0 overflow-hidden">
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
                        Бой: {targetObj.waves} волн{targetObj.kind === 'fortress' ? ', босс' : ''}
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
                  {!selected ? 'Коснитесь героя, чтобы идти' : path ? 'Коснитесь ещё раз — идти' : 'Туда не пройти'}
                </div>
              </>
            ) : (
              <div className="text-stone-300">{selected ? 'Выберите, куда идти' : 'Коснитесь героя, чтобы идти. Карту можно двигать'}</div>
            )}
          </div>
        )}

        {world.won && !notice && (
          <div className="absolute right-16 top-2 bg-black/70 border border-amber-600/60 rounded-lg px-3 py-2 text-xs sm:text-sm text-amber-200 pointer-events-none">
            Пограничье взято. Следующие регионы — в работе.
          </div>
        )}

        {/* Окно события */}
        {notice && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center p-4 z-10">
            <div className="bg-[#171520] border border-[#3b354a] rounded-xl p-4 max-w-sm w-full shadow-2xl">
              <h3 className="text-lg font-black text-amber-300 mb-2">{notice.title}</h3>
              <p className="text-sm text-stone-200 whitespace-pre-line mb-4">{notice.text}</p>
              {notice.battle ? (
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

        {confirmReset && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center p-4 z-10">
            <div className="bg-[#171520] border border-[#3b354a] rounded-xl p-4 max-w-sm w-full shadow-2xl">
              <h3 className="text-lg font-black text-amber-300 mb-2">Начать поход заново?</h3>
              <p className="text-sm text-stone-200 mb-4">Ресурсы, промыслы и разбитые отряды пропадут.</p>
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

/** Итог боя похода поверх поля: победа — награда и «На карту», поражение — «Ещё раз» или «На карту» */
export function WorldBattleResult({ obj, won, onMap, onRetry }: { obj: WorldObj; won: boolean; onMap: () => void; onRetry: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <div className={`bg-[#171520] border-2 ${won ? 'border-amber-500/70' : 'border-red-800/70'} rounded-xl p-4 max-w-sm w-full text-center text-[#f4f2e6]`}>
        <h2 className={`text-2xl font-black tracking-wider mb-2 ${won ? 'text-amber-300' : 'text-red-400'}`}>
          {won ? (obj.kind === 'fortress' ? 'КРЕПОСТЬ ПАЛА!' : 'ОТРЯД РАЗБИТ') : 'ОТСТУПЛЕНИЕ'}
        </h2>
        <p className="text-sm text-stone-300 mb-3">
          {won
            ? `${obj.name}: ${obj.kind === 'mine' ? `промысел наш, каждый день ${resText(obj.income)}` : `награда ${resText(obj.reward) || 'нет'}`}`
            : `${obj.name} устоял. Герой отошёл на прежнее место; отряд ждёт на месте.`}
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
