/**
 * Глобальная карта кампании (прототип, просьба Артура 2026-11-06, вариант В): регион из гексов, туман,
 * герой ходит по дням. Касание гекса — путь и сведения, второе касание того же гекса — идти.
 * Логика — src/campaign/world.ts; бой отряда запускает App через `onBattle`.
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
  regionW,
  regionH,
  resText,
  RES_ICONS,
  RES_NAMES,
  ResKey,
  MOVES_PER_DAY,
  dailyIncome,
} from '../campaign/world';
import { sprites, drawSprite } from '../game/sprites';
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

type P = { x: number; y: number };
type Notice = { title: string; text: string; battle?: WorldObj };

const SQ3 = Math.sqrt(3);

/** Геометрия гексов под размер холста: ширина гекса w, высота h, ряды через 0,75 h */
function layoutFor(region: RegionDef, cw: number, ch: number) {
  const cols = regionW(region);
  const rows = regionH(region);
  const wByW = cw / (cols + 0.5);
  const wByH = ch / (((rows - 1) * 0.75 + 1) * (2 / SQ3));
  const w = Math.max(10, Math.min(wByW, wByH));
  const h = (w * 2) / SQ3;
  const totalW = (cols + 0.5) * w;
  const totalH = ((rows - 1) * 0.75 + 1) * h;
  const ox = (cw - totalW) / 2;
  const oy = (ch - totalH) / 2;
  const cx = (p: P) => ox + (p.x + 0.5 + 0.5 * (p.y & 1)) * w;
  const cy = (p: P) => oy + h / 2 + p.y * 0.75 * h;
  return { w, h, cx, cy, ox, oy };
}

function hexPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - h / 2);
  ctx.lineTo(x + w / 2, y - h / 4);
  ctx.lineTo(x + w / 2, y + h / 4);
  ctx.lineTo(x, y + h / 2);
  ctx.lineTo(x - w / 2, y + h / 4);
  ctx.lineTo(x - w / 2, y - h / 4);
  ctx.closePath();
}

/** Детерминированный «случай» для декора клетки */
function rnd(x: number, y: number, k: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function squadSprite(o: WorldObj, level: number): string {
  const n = o.waves ?? 3;
  return `enemy_${n <= 3 ? 'scout' : n <= 5 ? 'infantry' : 'heavy'}_${level}`;
}

export function WorldMap({ world, region, onChange, onBattle, onExit, onReset }: WorldMapProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tiles, setTiles] = useState<Tileset | null>(null);
  const [spritesReady, setSpritesReady] = useState(false);
  const [target, setTarget] = useState<P | null>(null);
  const [walking, setWalking] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [tick, setTick] = useState(0); // перерисовка во время хода
  const stRef = useRef(world);
  stRef.current = world;

  useEffect(() => {
    let alive = true;
    sprites.load().then(() => alive && setSpritesReady(true));
    loadTileset(TILESETS[region.level] ?? 'frontier').then((t) => alive && setTiles(t));
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

  const path = useMemo(() => (target ? findPath(world, region, target) : null), [target, world, region, tick]);

  // ---------------------------------------------------------------- рисование
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !size.w || !size.h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(size.w * dpr);
    cv.height = Math.round(size.h * dpr);
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    const L = layoutFor(region, size.w, size.h);
    const st = world;
    const grass = tiles?.get('grass');
    const dirt = tiles?.get('dirt');
    const dec = (n: string) => tiles?.get(`decor/${n}`) ?? null;

    // Земля
    for (let y = 0; y < regionH(region); y++) {
      for (let x = 0; x < regionW(region); x++) {
        const t = terrainAt(region, x, y)!;
        const px = L.cx({ x, y });
        const py = L.cy({ x, y });
        ctx.save();
        hexPath(ctx, px, py, L.w + 0.6, L.h + 0.6);
        ctx.clip();
        if (t === 'water') {
          const g = ctx.createLinearGradient(px, py - L.h / 2, px, py + L.h / 2);
          g.addColorStop(0, '#1f3f4f');
          g.addColorStop(1, '#152c38');
          ctx.fillStyle = g;
          ctx.fillRect(px - L.w, py - L.h, L.w * 2, L.h * 2);
          ctx.strokeStyle = 'rgba(160,210,220,0.18)';
          ctx.lineWidth = 1;
          for (let i = 0; i < 3; i++) {
            const wy = py - L.h * 0.25 + i * L.h * 0.22;
            ctx.beginPath();
            ctx.moveTo(px - L.w * 0.3, wy);
            ctx.quadraticCurveTo(px, wy - 3, px + L.w * 0.3, wy);
            ctx.stroke();
          }
        } else if (t === 'rock') {
          ctx.fillStyle = '#26232c';
          ctx.fillRect(px - L.w, py - L.h, L.w * 2, L.h * 2);
        } else {
          const img = t === 'hills' ? dirt : grass;
          if (img) {
            // Кусок тайла со сдвигом по клетке, чтобы трава не повторялась узором
            const sx = rnd(x, y, 1) * img.width * 0.5;
            const sy = rnd(x, y, 2) * img.height * 0.5;
            ctx.drawImage(img, sx, sy, img.width * 0.5, img.height * 0.5, px - L.w / 2, py - L.h / 2, L.w, L.h);
          } else {
            ctx.fillStyle = t === 'hills' ? '#5a4a36' : '#3e5530';
            ctx.fillRect(px - L.w, py - L.h, L.w * 2, L.h * 2);
          }
          if (t === 'forest') {
            ctx.fillStyle = 'rgba(10,30,10,0.35)';
            ctx.fillRect(px - L.w, py - L.h, L.w * 2, L.h * 2);
          }
        }
        ctx.restore();

        // Декор местности
        const put = (name: string, fx: number, fy: number, scale: number) => {
          const im = dec(name);
          if (!im) return;
          const dw = L.w * scale;
          const dh = (im.height / im.width) * dw;
          ctx.drawImage(im, px + fx * L.w - dw / 2, py + fy * L.h - dh, dw, dh);
        };
        if (t === 'forest') {
          put(['bush1', 'bush2', 'bush3'][Math.floor(rnd(x, y, 3) * 3)], -0.18, 0.05, 0.55);
          put(['bush2', 'bush3', 'fern'][Math.floor(rnd(x, y, 4) * 3)], 0.16, 0.22, 0.5);
          if (rnd(x, y, 5) > 0.5) put('stump', 0.05, -0.12, 0.3);
        } else if (t === 'hills') {
          put('rock2', -0.12, 0.15, 0.45);
          put('rock3', 0.18, 0.05, 0.35);
        } else if (t === 'rock') {
          put(['rock1', 'rock4'][Math.floor(rnd(x, y, 6) * 2)], 0, 0.25, 0.75);
        }

        ctx.save();
        hexPath(ctx, px, py, L.w, L.h);
        ctx.strokeStyle = 'rgba(0,0,0,0.28)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }
    }

    // Объекты
    const lvl = region.level;
    for (const o of region.objects) {
      if (!isSeen(st, region, o.x, o.y)) continue;
      const live = objectAt(st, region, o.x, o.y);
      if (!live) continue;
      const px = L.cx(o);
      const py = L.cy(o);
      const foot = py + L.h * 0.3;
      const spr = (name: string, hgt: number, dir = -1) => {
        const s = spritesReady ? sprites.get(name) : null;
        if (s) drawSprite(ctx, s, px, foot, dir, hgt);
        return !!s;
      };
      if (o.kind === 'camp') {
        if (!spr('castle', L.h * 1.0)) {
          ctx.fillStyle = '#3ed6c4';
          ctx.beginPath();
          ctx.arc(px, py, L.w * 0.2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (o.kind === 'squad' || o.kind === 'fortress') {
        if (o.kind === 'fortress') {
          ctx.fillStyle = 'rgba(120,20,20,0.35)';
          hexPath(ctx, px, py, L.w * 0.9, L.h * 0.9);
          ctx.fill();
        }
        const name = o.kind === 'fortress' ? `boss_${lvl}` : squadSprite(o, lvl);
        if (!spr(name, o.kind === 'fortress' ? L.h * 1.15 : L.h * 0.75)) {
          ctx.fillStyle = '#b33';
          ctx.beginPath();
          ctx.arc(px, py, L.w * 0.18, 0, Math.PI * 2);
          ctx.fill();
        }
        // Сила отряда — число волн на табличке
        ctx.font = `bold ${Math.max(10, L.w * 0.2)}px sans-serif`;
        ctx.textAlign = 'center';
        const label = `${o.waves}`;
        const bw = ctx.measureText(label).width + 8;
        ctx.fillStyle = 'rgba(40,10,10,0.85)';
        ctx.fillRect(px + L.w * 0.18, py + L.h * 0.12, bw, L.w * 0.26);
        ctx.fillStyle = '#ffb4a0';
        ctx.fillText(label, px + L.w * 0.18 + bw / 2, py + L.h * 0.12 + L.w * 0.2);
      } else if (o.kind === 'chest') {
        const bw = L.w * 0.34;
        const bh = L.w * 0.22;
        ctx.fillStyle = '#5b3a1e';
        ctx.fillRect(px - bw / 2, py - bh / 2 + L.h * 0.08, bw, bh);
        ctx.fillStyle = '#d9a441';
        ctx.fillRect(px - bw / 2, py - bh / 2 + L.h * 0.08, bw, bh * 0.25);
        ctx.fillRect(px - 2, py + L.h * 0.08 - 2, 4, bh * 0.5);
      } else if (o.kind === 'shrine') {
        const done = st.done.includes(o.id);
        ctx.fillStyle = '#4a4752';
        ctx.beginPath();
        ctx.moveTo(px - L.w * 0.14, foot - L.h * 0.05);
        ctx.lineTo(px - L.w * 0.08, foot - L.h * 0.55);
        ctx.lineTo(px + L.w * 0.1, foot - L.h * 0.5);
        ctx.lineTo(px + L.w * 0.15, foot - L.h * 0.05);
        ctx.closePath();
        ctx.fill();
        if (!done) {
          ctx.fillStyle = 'rgba(62,214,196,0.8)';
          ctx.beginPath();
          ctx.arc(px, foot - L.h * 0.32, L.w * 0.06, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (o.kind === 'mine') {
        const ours = st.owned.includes(o.id);
        ctx.fillStyle = '#4b3a2a';
        ctx.fillRect(px - L.w * 0.22, foot - L.h * 0.35, L.w * 0.44, L.h * 0.3);
        ctx.fillStyle = '#2d241c';
        ctx.beginPath();
        ctx.moveTo(px - L.w * 0.27, foot - L.h * 0.35);
        ctx.lineTo(px, foot - L.h * 0.58);
        ctx.lineTo(px + L.w * 0.27, foot - L.h * 0.35);
        ctx.closePath();
        ctx.fill();
        // Флаг: бирюзовый — наш, красный — охрана врага
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px + L.w * 0.22, foot - L.h * 0.35);
        ctx.lineTo(px + L.w * 0.22, foot - L.h * 0.75);
        ctx.stroke();
        ctx.fillStyle = ours ? '#3ed6c4' : '#b33';
        ctx.fillRect(px + L.w * 0.22, foot - L.h * 0.75, L.w * 0.16, L.h * 0.12);
        if (!ours && o.waves) {
          ctx.font = `bold ${Math.max(10, L.w * 0.2)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillStyle = '#ffb4a0';
          ctx.fillText(`${o.waves}`, px - L.w * 0.3, py + L.h * 0.3);
        }
        const icon = o.income ? RES_ICONS[Object.keys(o.income)[0] as ResKey] : '';
        ctx.font = `${Math.max(10, L.w * 0.22)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(icon, px, foot - L.h * 0.08);
      }
    }

    // Путь
    if (path) {
      let left = st.moves;
      for (const p of path) {
        left -= stepCost(region, p);
        const ok = left >= 0;
        ctx.fillStyle = ok ? 'rgba(120,230,140,0.9)' : 'rgba(200,200,200,0.55)';
        ctx.beginPath();
        ctx.arc(L.cx(p), L.cy(p), Math.max(3, L.w * 0.07), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (target) {
      ctx.save();
      hexPath(ctx, L.cx(target), L.cy(target), L.w * 0.92, L.h * 0.92);
      ctx.strokeStyle = path ? '#f4c06a' : '#b33';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // Герой
    {
      const px = L.cx(st.hero);
      const py = L.cy(st.hero);
      ctx.fillStyle = 'rgba(62,214,196,0.25)';
      ctx.beginPath();
      ctx.ellipse(px, py + L.h * 0.28, L.w * 0.3, L.h * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      const s = spritesReady ? sprites.get('enemy_heavy_6') : null;
      if (s) drawSprite(ctx, s, px, py + L.h * 0.3, 1, L.h * 0.85);
      else {
        ctx.fillStyle = '#3ed6c4';
        ctx.beginPath();
        ctx.arc(px, py, L.w * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Туман
    for (let y = 0; y < regionH(region); y++) {
      for (let x = 0; x < regionW(region); x++) {
        if (isSeen(st, region, x, y)) continue;
        hexPath(ctx, L.cx({ x, y }), L.cy({ x, y }), L.w + 1, L.h + 1);
        ctx.fillStyle = '#0d0c12';
        ctx.fill();
        ctx.fillStyle = `rgba(60,55,80,${0.08 + rnd(x, y, 9) * 0.1})`;
        ctx.fill();
      }
    }
  }, [size, tiles, spritesReady, world, region, path, target, tick]);

  // ---------------------------------------------------------------- ход
  const walk = useCallback(
    (steps: P[]) => {
      setWalking(true);
      let i = 0;
      const next = () => {
        const st = { ...stRef.current, hero: { ...stRef.current.hero }, res: { ...stRef.current.res }, done: [...stRef.current.done], owned: [...stRef.current.owned], seen: [...stRef.current.seen] };
        const p = steps[i++];
        if (!p) {
          setWalking(false);
          setTarget(null);
          return;
        }
        // Перед боем — вопрос, ход не тратится, пока игрок не согласится
        const o = objectAt(st, region, p.x, p.y);
        if (o && isHostile(st, o)) {
          setWalking(false);
          setTarget(null);
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
          setWalking(false);
          if (i === 1) setNotice({ title: 'Ходы кончились', text: 'Герой устал. Завершите день, чтобы идти дальше.' });
          return;
        }
        onChange(st);
        setTick((t) => t + 1);
        if (res.kind === 'loot') {
          sound.playBuy();
          setNotice({ title: res.obj.name, text: `${res.obj.text ? res.obj.text + '\n\n' : ''}Найдено: ${resText(res.got)}` });
          setWalking(false);
          setTarget(null);
          return;
        }
        if (res.kind === 'captured') {
          sound.playBuy();
          setNotice({ title: res.obj.name, text: `Промысел наш. Каждый день: ${resText(res.obj.income)}` });
          setWalking(false);
          setTarget(null);
          return;
        }
        if (res.kind === 'visit' && res.obj.kind === 'camp' && i === steps.length) {
          setNotice({ title: res.obj.name, text: res.obj.text ?? '' });
        }
        setTimeout(next, 170);
      };
      next();
    },
    [onChange, region]
  );

  const tapAt = (clientX: number, clientY: number) => {
    if (walking || notice) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    const mx = clientX - r.left;
    const my = clientY - r.top;
    const L = layoutFor(region, size.w, size.h);
    let best: P | null = null;
    let bd = Infinity;
    for (let y = 0; y < regionH(region); y++)
      for (let x = 0; x < regionW(region); x++) {
        const d = (L.cx({ x, y }) - mx) ** 2 + (L.cy({ x, y }) - my) ** 2;
        if (d < bd) {
          bd = d;
          best = { x, y };
        }
      }
    if (!best || bd > (L.w * 0.6) ** 2) return;
    sound.init();
    if (best.x === world.hero.x && best.y === world.hero.y) {
      const o = objectAt(world, region, best.x, best.y);
      if (o?.kind === 'camp') setNotice({ title: o.name, text: o.text ?? '' });
      return;
    }
    if (target && target.x === best.x && target.y === best.y && path) {
      walk(path);
      return;
    }
    setTarget(best);
  };

  const targetObj = target && isSeen(world, region, target.x, target.y) ? objectAt(world, region, target.x, target.y) : null;
  const income = dailyIncome(world, region);

  const fight = (o: WorldObj) => {
    const st = { ...world, res: { ...world.res } };
    const p = { x: o.x, y: o.y };
    st.moves = Math.max(0, st.moves - stepCost(region, p));
    onChange(st);
    setNotice(null);
    onBattle(o);
  };

  return (
    <div className="fixed inset-0 bg-[#0f0e14] text-[#f4f2e6] flex flex-col select-none">
      {/* Верхняя полоса: регион, день, ход, ресурсы, кнопки */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#171520] border-b border-[#2d2938] text-xs sm:text-sm flex-wrap">
        <span className="font-black text-amber-300 tracking-wide">{region.name}</span>
        <span className="text-stone-300">День {world.day}</span>
        <span className="text-stone-300" title="Очки хода">
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
            const st = { ...world, res: { ...world.res } };
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

      <div ref={wrapRef} className="relative flex-1 min-h-0">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full touch-none"
          onPointerUp={(e) => tapAt(e.clientX, e.clientY)}
        />

        {/* Сведения о выбранном гексе */}
        {target && !notice && (
          <div className="absolute left-2 bottom-2 max-w-[60%] bg-black/70 border border-[#3b354a] rounded-lg px-3 py-2 text-xs sm:text-sm pointer-events-none">
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
            ) : (
              <div className="text-stone-300">{{ grass: 'Луг', forest: 'Лес: 2 хода', hills: 'Холмы: 2 хода', water: 'Река', rock: 'Скалы' }[terrainAt(region, target.x, target.y)!]}</div>
            )}
            <div className="text-stone-400 mt-0.5">{path ? 'Коснитесь ещё раз — идти' : 'Туда не пройти'}</div>
          </div>
        )}

        {world.won && !notice && (
          <div className="absolute right-2 bottom-2 bg-black/70 border border-amber-600/60 rounded-lg px-3 py-2 text-xs sm:text-sm text-amber-200 pointer-events-none">
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
