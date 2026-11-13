/**
 * Редактор карты похода (просьба Артура 2026-11-12: «редактор карты для кампании»).
 * Правит целый регион: местность кистью, объекты (лагерь, отряды, промыслы, сундуки, святилища, события, крепость),
 * украшения и старт героя. Вид «Схема» — цветные гексы (быстро), «Как в игре» — запечённая карта и живой слой.
 * Проверка «пройдём ли» — src/campaign/regionCheck.ts. Правка хранится на устройстве (`setRegionEdit`) и скачивается файлом.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  RegionDef,
  WorldObj,
  WorldObjKind,
  WorldProp,
  MapNote,
  PropKind,
  REGIONS,
  ORIGINAL_REGIONS,
  HERO_ITEMS,
  TERRAIN_NAMES,
  Terrain,
  newWorld,
  hexDistance,
  setRegionEdit,
  clearRegionEdit,
  isRegionEdited,
  normalizeRegion,
  regionW,
  regionH,
} from '../campaign/world';
import { checkRegion } from '../campaign/regionCheck';
import { bakeTerrain, drawLive, loadExtras, hexAt, hexPath, wx, wy, worldW, worldH, HW, HH, P } from '../campaign/worldRender';
import { sprites } from '../game/sprites';
import { loadTileset, Tileset, TILESETS } from '../game/tiles';

interface Props {
  regionId: string;
  onClose: () => void;
  /** Правка сохранена (карта в `REGIONS` уже подменена) */
  onSaved: (r: RegionDef) => void;
  /** Начать поход с начала этой главы на правленой карте */
  onPlay: (r: RegionDef) => void;
}

type Tool = 'hand' | 'paint' | 'obj' | 'select' | 'prop' | 'start' | 'erase' | 'note';
interface Draft {
  terrain: string[][];
  objects: WorldObj[];
  props: WorldProp[];
  start: P;
  name: string;
  notes: MapNote[];
}

const TERRAINS: { ch: string; t: Terrain; color: string }[] = [
  { ch: '.', t: 'grass', color: '#5f8040' },
  { ch: '=', t: 'road', color: '#b39563' },
  { ch: 'f', t: 'forest', color: '#35603a' },
  { ch: 'h', t: 'hills', color: '#8f7f4f' },
  { ch: 'w', t: 'water', color: '#2e5f93' },
  { ch: 'r', t: 'rock', color: '#6b6b74' },
  { ch: 'd', t: 'wood', color: '#1f3a27' },
];
const COLOR = Object.fromEntries(TERRAINS.map((t) => [t.ch, t.color]));
const KINDS: { kind: WorldObjKind; icon: string; name: string }[] = [
  { kind: 'camp', icon: '⛺', name: 'Лагерь' },
  { kind: 'squad', icon: '⚔', name: 'Отряд' },
  { kind: 'mine', icon: '⛏', name: 'Промысел' },
  { kind: 'chest', icon: '🎁', name: 'Сундук' },
  { kind: 'shrine', icon: '✨', name: 'Святилище' },
  { kind: 'event', icon: '❓', name: 'Событие' },
  { kind: 'fortress', icon: '🏰', name: 'Крепость' },
];
const KIND_ICON = Object.fromEntries(KINDS.map((k) => [k.kind, k.icon]));
const PROPS: { kind: PropKind; name: string }[] = [
  { kind: 'windmill', name: 'Мельница' },
  { kind: 'ruins', name: 'Руины' },
  { kind: 'graves', name: 'Могилы' },
  { kind: 'orcCamp', name: 'Лагерь орков' },
  { kind: 'stones', name: 'Камни' },
  { kind: 'farm', name: 'Ферма' },
  { kind: 'wreck', name: 'Обломки' },
  { kind: 'castle', name: 'Замок (глушь)' },
  { kind: 'cliff', name: 'Скала (глушь)' },
  { kind: 'tower', name: 'Башня (глушь)' },
  { kind: 'crystals', name: 'Кристаллы (глушь)' },
  { kind: 'deadwood', name: 'Сухостой (глушь)' },
  { kind: 'statue', name: 'Статуя (глушь)' },
];

const fromRegion = (r: RegionDef): Draft => ({
  terrain: r.terrain.map((row) => [...row]),
  objects: JSON.parse(JSON.stringify(r.objects)),
  props: JSON.parse(JSON.stringify(r.props ?? [])),
  start: { ...r.start },
  name: r.name,
  notes: JSON.parse(JSON.stringify(r.notes ?? [])),
});

const numOrU = (s: string): number | undefined => {
  const n = Number(s);
  return s.trim() === '' || !isFinite(n) ? undefined : n;
};
const list = (s: string): string[] | undefined => {
  const a = s.split(',').map((x) => x.trim()).filter(Boolean);
  return a.length ? a : undefined;
};

export function WorldEditor({ regionId, onClose, onSaved, onPlay }: Props) {
  const [rid, setRid] = useState(regionId);
  const base = REGIONS[rid];
  const draft = useRef<Draft>(fromRegion(base));
  const [rev, setRev] = useState(0); // правка черновика
  const [settled, setSettled] = useState(0); // правка закончена (отпустили кисть) — можно запекать
  const [dirty, setDirty] = useState(false);
  const undo = useRef<string[]>([]);
  const [tool, setTool] = useState<Tool>('hand');
  const [ch, setCh] = useState('=');
  const [radius, setRadius] = useState(0);
  const [kind, setKind] = useState<WorldObjKind>('squad');
  const [propKind, setPropKind] = useState<PropKind>('ruins');
  const [sel, setSel] = useState<string | null>(null);
  const [selNote, setSelNote] = useState<string | null>(null);
  const [view, setView] = useState<'scheme' | 'game'>('scheme');
  const [report, setReport] = useState<{ errors: string[]; warnings: string[] } | null>(null);
  const [msg, setMsg] = useState('');
  const [tiles, setTiles] = useState<Tileset | null>(null);
  const [baseTiles, setBaseTiles] = useState<Tileset | null>(null);
  const [extras, setExtras] = useState<Map<string, HTMLImageElement> | null>(null);
  const [spritesReady, setSpritesReady] = useState(false);
  const [baked, setBaked] = useState<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const cam = useRef({ zoom: 0.5, x: 0, y: 0 });
  const camReady = useRef(false);
  const hover = useRef<P | null>(null);

  const stub = useMemo(() => ({ ...base, terrain: Array(regionH(base)).fill('.'.repeat(regionW(base))) }) as RegionDef, [base]);
  const toRegion = (): RegionDef => {
    const d = draft.current;
    return { ...ORIGINAL_REGIONS[rid], name: d.name, terrain: d.terrain.map((r) => r.join('')), start: { ...d.start }, objects: d.objects, props: d.props, notes: d.notes.length ? d.notes : undefined };
  };

  const bump = () => {
    setRev((n) => n + 1);
    setDirty(true);
    setReport(null);
  };
  const pushUndo = () => {
    undo.current.push(JSON.stringify(draft.current));
    if (undo.current.length > 60) undo.current.shift();
  };
  const doUndo = () => {
    const s = undo.current.pop();
    if (!s) return;
    draft.current = JSON.parse(s);
    if (!draft.current.objects.some((o) => o.id === sel)) setSel(null);
    bump();
    setSettled((n) => n + 1);
  };

  const loadRegion = (r: RegionDef, id = r.id) => {
    setRid(id);
    draft.current = fromRegion(r);
    undo.current = [];
    setSel(null);
    setSelNote(null);
    setReport(null);
    setDirty(false);
    setRev((n) => n + 1);
    setSettled((n) => n + 1);
    camReady.current = false;
  };
  const switchRegion = (id: string) => {
    if (id === rid) return;
    if (dirty && !window.confirm('Несохранённые правки этой карты пропадут. Перейти?')) return;
    loadRegion(REGIONS[id], id);
  };

  // ---------------------------------------------------------------- ресурсы
  useEffect(() => {
    let alive = true;
    sprites.load().then(() => alive && setSpritesReady(true));
    loadTileset(TILESETS[base.level] ?? 'frontier').then((t) => alive && setTiles(t));
    loadTileset('frontier').then((t) => alive && setBaseTiles(t));
    loadExtras().then((m) => alive && setExtras(m));
    return () => {
      alive = false;
    };
  }, [base.level]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // «Как в игре»: запекаем, когда правка закончена (не на каждом мазке кисти)
  useEffect(() => {
    if (view !== 'game') return;
    const t = setTimeout(() => setBaked(bakeTerrain(toRegion(), tiles, extras, baseTiles)), 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, settled, tiles, extras, baseTiles, rid]);

  // ---------------------------------------------------------------- камера
  const clamp = () => {
    const c = cam.current;
    const minZ = Math.min(size.w / worldW(base), size.h / worldH(base));
    c.zoom = Math.max(minZ * 0.9, Math.min(2.4, c.zoom));
    const mw = worldW(base) * c.zoom;
    const mh = worldH(base) * c.zoom;
    c.x = mw <= size.w ? (size.w - mw) / 2 : Math.min(40, Math.max(size.w - mw - 40, c.x));
    c.y = mh <= size.h ? (size.h - mh) / 2 : Math.min(40, Math.max(size.h - mh - 40, c.y));
  };
  const zoomAt = (k: number, sx: number, sy: number) => {
    const c = cam.current;
    const gx = (sx - c.x) / c.zoom;
    const gy = (sy - c.y) / c.zoom;
    c.zoom *= k;
    clamp();
    c.x = sx - gx * c.zoom;
    c.y = sy - gy * c.zoom;
    clamp();
    draw();
  };

  // ---------------------------------------------------------------- рисование
  const draw = () => {
    const el = cv.current;
    if (!el || !size.w || !size.h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (el.width !== Math.round(size.w * dpr)) el.width = Math.round(size.w * dpr);
    if (el.height !== Math.round(size.h * dpr)) el.height = Math.round(size.h * dpr);
    const ctx = el.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b0a10';
    ctx.fillRect(0, 0, size.w, size.h);
    const c = cam.current;
    ctx.setTransform(dpr * c.zoom, 0, 0, dpr * c.zoom, dpr * c.x, dpr * c.y);
    const d = draft.current;
    const W = d.terrain[0].length;
    const H = d.terrain.length;
    const game = view === 'game' && baked;
    if (game) ctx.drawImage(baked!, 0, 0, worldW(base), worldH(base));
    // Видимая часть мира — чтобы не рисовать лишнее
    const x0 = -c.x / c.zoom;
    const y0 = -c.y / c.zoom;
    const x1 = (size.w - c.x) / c.zoom;
    const y1 = (size.h - c.y) / c.zoom;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const px = wx({ x, y });
        const py = wy({ x, y });
        if (px < x0 - HW || px > x1 + HW || py < y0 - HH || py > y1 + HH) continue;
        if (!game) {
          hexPath(ctx, px, py, HW, HH);
          ctx.fillStyle = COLOR[d.terrain[y][x]] ?? '#f0f';
          ctx.fill();
        }
        hexPath(ctx, px, py, HW - 2, HH - 2);
        ctx.strokeStyle = game ? 'rgba(255,240,200,0.12)' : 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    if (game) {
      const st = newWorld(toRegion());
      st.seen = Array.from({ length: W * H }, (_, i) => i);
      st.hero = { ...d.start };
      drawLive(ctx, toRegion(), st, { selected: false, path: null, target: null, extras, time: performance.now() });
    } else {
      for (const p of d.props) {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = `${HH * 0.3}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('◆', wx(p), wy(p) + HH * 0.1);
      }
      for (const o of d.objects) {
        const px = wx(o);
        const py = wy(o);
        ctx.fillStyle = 'rgba(15,12,22,0.8)';
        ctx.beginPath();
        ctx.arc(px, py, HW * 0.36, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = o.kind === 'fortress' ? '#e0524a' : o.kind === 'camp' ? '#3ed6c4' : '#d8b04a';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.font = `${HH * 0.42}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.fillText(KIND_ICON[o.kind] ?? '?', px, py + HH * 0.14);
      }
    }
    // Названия и старт поверх обоих видов
    for (const o of d.objects) {
      if (c.zoom < 0.45) break;
      ctx.font = `bold ${Math.round(HH * 0.24)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(o.id, wx(o), wy(o) + HH * 0.62);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(o.id, wx(o), wy(o) + HH * 0.62);
    }
    for (const n of d.notes) {
      const label = n.text.trim() ? (n.text.length > 40 ? `${n.text.slice(0, 40)}…` : n.text) : '(пусто)';
      const fs = Math.round(HH * 0.26);
      ctx.font = `bold ${fs}px sans-serif`;
      const w = ctx.measureText(label).width + fs * 1.6;
      ctx.fillStyle = n.id === selNote ? '#fff08a' : '#f2cf4a';
      ctx.fillRect(n.x - w / 2, n.y - fs * 1.1, w, fs * 1.5);
      ctx.strokeStyle = n.id === selNote ? '#7dfcff' : '#6b5410';
      ctx.lineWidth = n.id === selNote ? 4 : 2;
      ctx.strokeRect(n.x - w / 2, n.y - fs * 1.1, w, fs * 1.5);
      ctx.fillStyle = '#2a2208';
      ctx.textAlign = 'center';
      ctx.fillText(`📝 ${label}`, n.x, n.y);
      ctx.beginPath();
      ctx.arc(n.x, n.y + fs * 0.4, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#c0392b';
      ctx.fill();
    }
    const s = d.start;
    ctx.font = `${HH * 0.5}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('🚩', wx(s), wy(s) - HH * 0.18);
    const o = sel ? d.objects.find((ob) => ob.id === sel) : null;
    if (o) {
      hexPath(ctx, wx(o), wy(o), HW, HH);
      ctx.strokeStyle = '#7dfcff';
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    if (hover.current && (tool === 'paint' || tool === 'obj' || tool === 'prop' || tool === 'start')) {
      for (const p of brushCells(hover.current)) {
        hexPath(ctx, wx(p), wy(p), HW - 4, HH - 4);
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }
  };
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useEffect(() => {
    drawRef.current();
  });
  useEffect(() => {
    if (!size.w || !size.h || camReady.current) return;
    const c = cam.current;
    c.zoom = Math.min(size.w / worldW(base), size.h / worldH(base));
    clamp();
    camReady.current = true;
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, rid]);

  // ---------------------------------------------------------------- правка
  const brushCells = (p: P): P[] => {
    if (tool !== 'paint' || radius === 0) return [p];
    const out: P[] = [];
    const W = draft.current.terrain[0].length;
    const H = draft.current.terrain.length;
    for (let y = Math.max(0, p.y - radius); y <= Math.min(H - 1, p.y + radius); y++)
      for (let x = Math.max(0, p.x - radius - 1); x <= Math.min(W - 1, p.x + radius + 1); x++) if (hexDistance(p, { x, y }) <= radius) out.push({ x, y });
    return out;
  };
  const uid = (k: string) => {
    const used = new Set(draft.current.objects.map((o) => o.id));
    for (let i = 1; ; i++) if (!used.has(`${k}${i}`)) return `${k}${i}`;
  };
  const newObject = (k: WorldObjKind, p: P): WorldObj => {
    const name = KINDS.find((x) => x.kind === k)!.name;
    const o: WorldObj = { id: uid(k), kind: k, x: p.x, y: p.y, name };
    if (k === 'squad') Object.assign(o, { waves: 3, reward: { gold: 20 } });
    if (k === 'mine') Object.assign(o, { waves: 3, income: { gold: 10 } });
    if (k === 'chest') o.reward = { gold: 20 };
    if (k === 'shrine') Object.assign(o, { reward: { crystal: 1 }, text: 'Старый камень тёплый на ощупь.' });
    if (k === 'event') o.choices = [{ label: 'Дальше', text: 'Вы идёте дальше.' }];
    if (k === 'fortress') Object.assign(o, { waves: 12, army: 'normal' });
    return o;
  };
  const objAt = (p: P) => draft.current.objects.find((o) => o.x === p.x && o.y === p.y);
  const apply = (p: P, first: boolean) => {
    const d = draft.current;
    if (tool === 'paint') {
      let changed = false;
      for (const c of brushCells(p)) if (d.terrain[c.y][c.x] !== ch) (d.terrain[c.y][c.x] = ch), (changed = true);
      if (changed) bump();
    } else if (!first) {
      if (tool === 'select' && sel) {
        const o = d.objects.find((ob) => ob.id === sel);
        if (o && !objAt(p) && (o.x !== p.x || o.y !== p.y)) (o.x = p.x), (o.y = p.y), bump();
      }
    } else if (tool === 'obj') {
      const ex = objAt(p);
      if (ex) setSel(ex.id);
      else {
        if (kind === 'camp' && d.objects.some((o) => o.kind === 'camp')) {
          setMsg('Лагерь уже есть: выберите его и перенесите.');
          return;
        }
        const o = newObject(kind, p);
        d.objects.push(o);
        setSel(o.id);
        bump();
      }
    } else if (tool === 'select') {
      setSel(objAt(p)?.id ?? null);
    } else if (tool === 'prop') {
      if (!d.props.some((q) => q.x === p.x && q.y === p.y)) (d.props.push({ kind: propKind, x: p.x, y: p.y }), bump());
    } else if (tool === 'start') {
      d.start = { ...p };
      bump();
    } else if (tool === 'erase') {
      const o = objAt(p);
      if (o) {
        d.objects = d.objects.filter((ob) => ob !== o);
        if (sel === o.id) setSel(null);
        bump();
      } else if (d.props.some((q) => q.x === p.x && q.y === p.y)) {
        d.props = d.props.filter((q) => !(q.x === p.x && q.y === p.y));
        bump();
      }
    }
  };

  // ---------------------------------------------------------------- касания
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ mode: 'pan' | 'pinch' | 'tool' | null; last?: P; dist?: number }>({ mode: null });
  const cellAt = (sx: number, sy: number) => {
    const c = cam.current;
    return hexAt(stub, (sx - c.x) / c.zoom, (sy - c.y) / c.zoom);
  };
  const local = (e: React.PointerEvent) => {
    const r = cv.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onDown = (e: React.PointerEvent) => {
    cv.current?.setPointerCapture(e.pointerId);
    const p = local(e);
    ptrs.current.set(e.pointerId, p);
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      gesture.current = { mode: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), last: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      return;
    }
    if (tool === 'hand' || e.button === 1 || e.button === 2) {
      gesture.current = { mode: 'pan', last: p };
      return;
    }
    gesture.current = { mode: 'tool', last: p };
    if (tool === 'note') {
      const c = cam.current;
      const gx = (p.x - c.x) / c.zoom;
      const gy = (p.y - c.y) / c.zoom;
      const hit = draft.current.notes.find((n) => Math.abs(n.x - gx) < HW * 1.3 && gy > n.y - HH * 0.5 && gy < n.y + HH * 0.35);
      pushUndo();
      if (hit) setSelNote(hit.id);
      else {
        const used = new Set(draft.current.notes.map((n) => n.id));
        let i = 1;
        while (used.has(`n${i}`)) i++;
        draft.current.notes.push({ id: `n${i}`, x: Math.round(gx), y: Math.round(gy), text: '' });
        setSelNote(`n${i}`);
        bump();
      }
      return;
    }
    const cell = cellAt(p.x, p.y);
    if (!cell) return;
    if (tool !== 'select') pushUndo();
    else if (objAt(cell)) pushUndo();
    apply(cell, true);
  };
  const onMove = (e: React.PointerEvent) => {
    const p = local(e);
    const g = gesture.current;
    const c = cam.current;
    if (ptrs.current.has(e.pointerId)) ptrs.current.set(e.pointerId, p);
    if (g.mode === 'pinch' && ptrs.current.size >= 2) {
      const [a, b] = [...ptrs.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      c.x += mid.x - g.last!.x;
      c.y += mid.y - g.last!.y;
      zoomAt(dist / (g.dist || dist), mid.x, mid.y);
      g.dist = dist;
      g.last = mid;
      return;
    }
    if (g.mode === 'pan') {
      c.x += p.x - g.last!.x;
      c.y += p.y - g.last!.y;
      g.last = p;
      clamp();
      draw();
      return;
    }
    if (g.mode === 'tool' && tool === 'note' && selNote) {
      const n = draft.current.notes.find((x) => x.id === selNote);
      if (n && (Math.abs(p.x - g.last!.x) > 3 || Math.abs(p.y - g.last!.y) > 3)) {
        n.x = Math.round((p.x - c.x) / c.zoom);
        n.y = Math.round((p.y - c.y) / c.zoom);
        g.last = p;
        bump();
      }
      return;
    }
    const cell = cellAt(p.x, p.y);
    hover.current = cell;
    if (g.mode === 'tool' && cell && (tool === 'paint' || tool === 'select')) apply(cell, false);
    else draw();
  };
  const onUp = (e: React.PointerEvent) => {
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size === 0) {
      if (gesture.current.mode === 'tool') setSettled((n) => n + 1);
      gesture.current = { mode: null };
    } else if (ptrs.current.size === 1) gesture.current = { mode: 'pan', last: [...ptrs.current.values()][0] };
  };
  const onWheel = (e: React.WheelEvent) => {
    const p = local(e as unknown as React.PointerEvent);
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') (e.preventDefault(), doUndo());
      else if (e.key === 'Escape') onClose();
      else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
        pushUndo();
        draft.current.objects = draft.current.objects.filter((o) => o.id !== sel);
        setSel(null);
        bump();
        setSettled((n) => n + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------------------------------------------------------------- действия
  const run = () => setReport(checkRegion(toRegion()));
  const save = () => {
    const r = toRegion();
    const res = checkRegion(r);
    setReport(res);
    if (res.errors.length && !window.confirm(`В карте ${res.errors.length} ошиб. (список справа). Сохранить всё равно?`)) return;
    const ok = setRegionEdit(r);
    setDirty(false);
    setMsg(ok ? 'Сохранено на этом устройстве.' : 'Карта применена, но хранилище не приняло запись: после перезапуска пропадёт. Скачайте файл.');
    onSaved(r);
  };
  const download = () => {
    const blob = new Blob([JSON.stringify(toRegion(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `temny-rubezh-karta-${rid}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const upload = (f: File | undefined) => {
    if (!f) return;
    void f.text().then((txt) => {
      try {
        const r = normalizeRegion(JSON.parse(txt));
        if (!r) return setMsg('Файл не подходит: другой размер карты или битые объекты.');
        loadRegion(r);
        setDirty(true);
        setMsg(`Загружена карта «${r.name}». Проверьте и сохраните.`);
      } catch {
        setMsg('Файл не читается.');
      }
    });
  };
  const reset = () => {
    if (!window.confirm('Вернуть встроенную карту? Ваши правки этой главы пропадут.')) return;
    clearRegionEdit(rid);
    loadRegion(REGIONS[rid]);
    onSaved(REGIONS[rid]);
    setMsg('Встроенная карта возвращена.');
  };

  // ---------------------------------------------------------------- панель объекта
  const o = sel ? draft.current.objects.find((ob) => ob.id === sel) : null;
  const patch = (p: Partial<WorldObj>) => {
    if (!o) return;
    Object.assign(o, p);
    for (const k of Object.keys(p) as (keyof WorldObj)[]) if (p[k] === undefined) delete o[k];
    bump();
    setSettled((n) => n + 1);
  };
  const renameId = (nid: string) => {
    if (!o) return;
    const old = o.id;
    const id = nid.trim();
    if (!id || draft.current.objects.some((x) => x.id === id)) return setMsg('Такой идентификатор уже есть.');
    for (const x of draft.current.objects) {
      if (x.needs) x.needs = x.needs.map((n) => (n === old ? id : n));
      if (x.needsAny) x.needsAny = x.needsAny.map((n) => (n === old ? id : n));
      if (x.weakenedBy === old) x.weakenedBy = id;
    }
    o.id = id;
    setSel(id);
    bump();
  };
  const [choicesText, setChoicesText] = useState('');
  useEffect(() => {
    setChoicesText(o?.choices ? JSON.stringify(o.choices, null, 1) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);
  const inp = 'w-full px-1.5 py-1 rounded bg-black/40 border border-[#3b354a] text-sm';
  const lab = 'block text-[11px] text-stone-400 mt-2 mb-0.5';
  const res3 = (key: 'reward' | 'income') => (
    <div className="grid grid-cols-3 gap-1">
      {(['gold', 'wood', 'crystal'] as const).map((k) => (
        <label key={k} className="text-[10px] text-stone-400">
          {k === 'gold' ? '🪙' : k === 'wood' ? '🪵' : '💎'}
          <input
            className={inp}
            inputMode="numeric"
            defaultValue={o?.[key]?.[k] ?? ''}
            key={`${o?.id}-${key}-${k}`}
            onFocus={pushUndo}
            onBlur={(e) => {
              const n = numOrU(e.target.value);
              const next = { ...(o?.[key] ?? {}), [k]: n };
              if (n === undefined) delete next[k];
              patch({ [key]: Object.keys(next).length ? next : undefined });
            }}
          />
        </label>
      ))}
    </div>
  );

  const toolBtn = (t: Tool, icon: string, title: string) => (
    <button key={t} title={title} className={`w-11 h-11 rounded-lg text-xl ${tool === t ? 'bg-amber-700' : 'bg-[#2a2635] hover:bg-[#3a3448]'}`} onClick={() => setTool(t)}>
      {icon}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[60] bg-[#0d0c13] text-[#f4f2e6] flex flex-col" style={{ paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}>
      {/* верхняя строка */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 bg-[#171520] border-b border-[#3b354a] flex-wrap">
        <button className="px-2.5 py-1.5 rounded bg-[#2a2635] hover:bg-[#3a3448] text-sm font-bold" onClick={() => (!dirty || window.confirm('Закрыть без сохранения?')) && onClose()}>
          ✕ Закрыть
        </button>
        <select className="px-2 py-1.5 rounded bg-[#2a2635] text-sm" value={rid} onChange={(e) => switchRegion(e.target.value)}>
          {Object.values(REGIONS).map((r) => (
            <option key={r.id} value={r.id}>
              Гл. {r.chapter ?? 1} · {r.name}
              {isRegionEdited(r.id) ? ' ✎' : ''}
            </option>
          ))}
        </select>
        <button className="px-2.5 py-1.5 rounded bg-[#2a2635] hover:bg-[#3a3448] text-sm disabled:opacity-40" disabled={!undo.current.length} onClick={doUndo} title="Ctrl+Z">
          ↶ Отмена
        </button>
        <button className="px-2.5 py-1.5 rounded bg-[#2a2635] hover:bg-[#3a3448] text-sm" onClick={() => setView(view === 'scheme' ? 'game' : 'scheme')}>
          {view === 'scheme' ? '🖼 Как в игре' : '▦ Схема'}
        </button>
        <button className="px-2.5 py-1.5 rounded bg-[#2a2635] hover:bg-[#3a3448] text-sm" onClick={run}>
          ✔ Проверить
        </button>
        <button className="px-3 py-1.5 rounded bg-amber-700 hover:bg-amber-600 text-sm font-bold" onClick={save}>
          💾 Сохранить{dirty ? ' •' : ''}
        </button>
        <button
          className="px-2.5 py-1.5 rounded bg-[#2a2635] hover:bg-[#3a3448] text-sm"
          onClick={() => {
            const r = toRegion();
            const res = checkRegion(r);
            if (res.errors.length) return (setReport(res), setMsg('Сначала исправьте ошибки: по такой карте не пройти.'));
            if (dirty && !window.confirm('Начать главу с начала на этой карте? Она сохранится на устройстве, поход этой главы начнётся заново.')) return;
            setRegionEdit(r);
            onSaved(r);
            onPlay(REGIONS[rid]);
          }}
          title="Сохранить и пройти главу с начала"
        >
          ▶ Играть
        </button>
        <span className="text-[11px] text-stone-400 ml-auto">{msg}</span>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* инструменты */}
        <div className="flex flex-col gap-1.5 p-1.5 bg-[#171520] border-r border-[#3b354a] overflow-y-auto">
          {toolBtn('hand', '✋', 'Рука: двигать карту (колесо и щипок — масштаб)')}
          {toolBtn('paint', '🖌', 'Кисть местности')}
          {toolBtn('obj', '📍', 'Поставить объект')}
          {toolBtn('select', '🎯', 'Выбрать и переносить объект')}
          {toolBtn('prop', '🌲', 'Украшение (только вид)')}
          {toolBtn('start', '🚩', 'Старт героя')}
          {toolBtn('erase', '🧽', 'Стереть объект или украшение')}
          {toolBtn('note', '📝', 'Пометка: текст в любом месте карты')}
        </div>

        {/* карта */}
        <div ref={wrap} className="flex-1 min-w-0 relative touch-none">
          <canvas
            ref={cv}
            className="absolute inset-0 w-full h-full"
            style={{ touchAction: 'none', cursor: tool === 'hand' ? 'grab' : 'crosshair' }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerLeave={() => ((hover.current = null), draw())}
            onWheel={onWheel}
            onContextMenu={(e) => e.preventDefault()}
          />
          <div className="absolute left-2 bottom-2 flex gap-1">
            <button className="w-9 h-9 rounded bg-black/60 text-lg" onClick={() => zoomAt(1.25, size.w / 2, size.h / 2)}>+</button>
            <button className="w-9 h-9 rounded bg-black/60 text-lg" onClick={() => zoomAt(0.8, size.w / 2, size.h / 2)}>−</button>
          </div>
          {!spritesReady && view === 'game' && <div className="absolute right-2 top-2 text-xs text-stone-400">Загружаю картинки…</div>}
        </div>

        {/* панель */}
        <div className="w-[250px] max-w-[42vw] shrink-0 bg-[#171520] border-l border-[#3b354a] overflow-y-auto p-2 text-sm">
          {tool === 'paint' && (
            <>
              <div className="font-bold text-amber-300 mb-1">Местность</div>
              <div className="grid grid-cols-2 gap-1">
                {TERRAINS.map((t) => (
                  <button key={t.ch} className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-xs ${ch === t.ch ? 'bg-amber-800/70' : 'bg-[#2a2635]'}`} onClick={() => setCh(t.ch)}>
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: t.color }} />
                    {TERRAIN_NAMES[t.t]}
                  </button>
                ))}
              </div>
              <div className={lab}>Кисть: {radius === 0 ? '1 гекс' : `радиус ${radius}`}</div>
              <input type="range" min={0} max={3} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="w-full" />
              <p className="text-[11px] text-stone-400 mt-1">Герой ходит по лугу, дороге, лесу и холмам. Вода, горы и чаща — стена. Забор из гор или чащи делает «змейку».</p>
            </>
          )}
          {tool === 'obj' && (
            <>
              <div className="font-bold text-amber-300 mb-1">Объект</div>
              <div className="grid grid-cols-2 gap-1">
                {KINDS.map((k) => (
                  <button key={k.kind} className={`px-1.5 py-1 rounded text-xs text-left ${kind === k.kind ? 'bg-amber-800/70' : 'bg-[#2a2635]'}`} onClick={() => setKind(k.kind)}>
                    {k.icon} {k.name}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-stone-400 mt-1">Касание свободного гекса ставит объект, касание объекта — выбирает. Параметры ниже.</p>
            </>
          )}
          {tool === 'prop' && (
            <>
              <div className="font-bold text-amber-300 mb-1">Украшение</div>
              <div className="grid grid-cols-2 gap-1">
                {PROPS.map((p) => (
                  <button key={p.kind} className={`px-1.5 py-1 rounded text-xs text-left ${propKind === p.kind ? 'bg-amber-800/70' : 'bg-[#2a2635]'}`} onClick={() => setPropKind(p.kind)}>
                    {p.name}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-stone-400 mt-1">Крупные «глушь» ставьте в непроходимой местности; на схеме они видны как ◆, в виде «Как в игре» — настоящие.</p>
            </>
          )}
          {tool === 'note' && (
            <>
              <div className="font-bold text-amber-300 mb-1">Пометки</div>
              <p className="text-[11px] text-stone-400 mb-1">Касание — новая пометка в этом месте, касание пометки — выбрать, потянуть — перенести. Попадают в файл карты и в лог похода при сохранении.</p>
              {(() => {
                const n = draft.current.notes.find((x) => x.id === selNote);
                return n ? (
                  <>
                    <textarea className={inp} rows={4} autoFocus placeholder="Что здесь исправить" value={n.text} onFocus={pushUndo} onChange={(e) => ((n.text = e.target.value), bump())} />
                    <button className="w-full mt-1 py-1.5 rounded bg-red-900/70 hover:bg-red-800 text-sm" onClick={() => { pushUndo(); draft.current.notes = draft.current.notes.filter((x) => x !== n); setSelNote(null); bump(); }}>
                      Удалить пометку
                    </button>
                  </>
                ) : null;
              })()}
            </>
          )}
          {draft.current.notes.length > 0 && (
            <div className="mt-2 text-[11px] text-stone-300">
              <div className="text-stone-400">Пометок: {draft.current.notes.length}</div>
              {draft.current.notes.map((n) => (
                <button key={n.id} className={`block w-full text-left truncate px-1 py-0.5 rounded ${n.id === selNote ? 'bg-amber-800/60' : 'hover:bg-white/5'}`} onClick={() => { setTool('note'); setSelNote(n.id); }}>
                  📝 {n.text || '(пусто)'}
                </button>
              ))}
            </div>
          )}
          {(tool === 'hand' || tool === 'select' || tool === 'start' || tool === 'erase') && !o && (
            <p className="text-[11px] text-stone-400">
              {tool === 'hand' ? 'Рука двигает карту. Колесо или щипок — масштаб. Правая кнопка мыши тоже двигает.' : tool === 'select' ? 'Коснитесь объекта, чтобы выбрать; потяните — перенесёте.' : tool === 'start' ? 'Коснитесь гекса: герой начнёт здесь.' : 'Касание стирает объект или украшение.'}
            </p>
          )}

          {o && (
            <div className="mt-3 pt-2 border-t border-[#3b354a]">
              <div className="font-bold text-amber-300">
                {KIND_ICON[o.kind]} {o.name}
              </div>
              <label className={lab}>Идентификатор (на него ссылаются замки)</label>
              <input className={inp} defaultValue={o.id} key={`id-${o.id}`} onBlur={(e) => e.target.value !== o.id && (pushUndo(), renameId(e.target.value))} />
              <label className={lab}>Название</label>
              <input className={inp} value={o.name} onFocus={pushUndo} onChange={(e) => patch({ name: e.target.value })} />
              {(o.kind === 'squad' || o.kind === 'mine' || o.kind === 'fortress') && (
                <>
                  <label className={lab}>Волн в бою</label>
                  <input className={inp} inputMode="numeric" defaultValue={o.waves ?? ''} key={`w-${o.id}`} onFocus={pushUndo} onBlur={(e) => patch({ waves: numOrU(e.target.value) })} />
                  <label className={lab}>Множитель числа врагов (обычно пусто)</label>
                  <input className={inp} inputMode="decimal" defaultValue={o.countMult ?? ''} key={`cm-${o.id}`} onFocus={pushUndo} onBlur={(e) => patch({ countMult: numOrU(e.target.value) })} />
                  <label className={lab}>Фракция врагов (номер 1–6, пусто — хозяева карты)</label>
                  <input className={inp} inputMode="numeric" defaultValue={o.faction ?? ''} key={`f-${o.id}`} onFocus={pushUndo} onBlur={(e) => patch({ faction: numOrU(e.target.value) })} />
                  <label className="flex items-center gap-1.5 mt-2 text-xs">
                    <input type="checkbox" checked={!!o.bossLast} onChange={(e) => (pushUndo(), patch({ bossLast: e.target.checked || undefined }))} /> Босс в последней волне
                  </label>
                </>
              )}
              {(o.kind === 'squad' || o.kind === 'fortress' || o.kind === 'mine') && (
                <>
                  <label className={lab}>Бой с армией (как в Потасовке)</label>
                  <select className={inp} value={o.army ?? ''} onChange={(e) => (pushUndo(), patch({ army: (e.target.value || undefined) as WorldObj['army'] }))}>
                    <option value="">Нет — обычные волны</option>
                    <option value="easy">Лёгкая армия</option>
                    <option value="normal">Обычная армия</option>
                    <option value="hard">Сильная армия</option>
                  </select>
                </>
              )}
              {o.kind !== 'camp' && o.kind !== 'event' && (
                <>
                  <label className={lab}>Награда</label>
                  {res3('reward')}
                </>
              )}
              {o.kind === 'mine' && (
                <>
                  <label className={lab}>Доход в день</label>
                  {res3('income')}
                </>
              )}
              {o.kind !== 'camp' && (
                <>
                  <label className={lab}>Предмет героя</label>
                  <select className={inp} value={o.item ?? ''} onChange={(e) => (pushUndo(), patch({ item: e.target.value || undefined }))}>
                    <option value="">Нет</option>
                    {HERO_ITEMS.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.icon} {i.name}
                      </option>
                    ))}
                  </select>
                  <label className={lab}>Закрыт, пока не пройдены (id через запятую)</label>
                  <input className={inp} defaultValue={(o.needs ?? []).join(', ')} key={`n-${o.id}`} onFocus={pushUndo} onBlur={(e) => patch({ needs: list(e.target.value) })} />
                  <label className={lab}>…и хотя бы один из (развилка)</label>
                  <input className={inp} defaultValue={(o.needsAny ?? []).join(', ')} key={`na-${o.id}`} onFocus={pushUndo} onBlur={(e) => patch({ needsAny: list(e.target.value) })} />
                  <label className={lab}>Появляется после выбора с отметкой</label>
                  <input className={inp} defaultValue={o.needsFlag ?? ''} key={`nf-${o.id}`} onFocus={pushUndo} onBlur={(e) => patch({ needsFlag: e.target.value.trim() || undefined })} />
                </>
              )}
              {(o.kind === 'squad' || o.kind === 'mine') && (
                <>
                  <label className={lab}>Учит башням (squad: archer, priest, mage, ballista)</label>
                  <input className={inp} defaultValue={(o.teach ?? []).join(', ')} key={`t-${o.id}`} onFocus={pushUndo} onBlur={(e) => patch({ teach: list(e.target.value) })} />
                </>
              )}
              {o.kind === 'fortress' && (
                <>
                  <label className={lab}>«Армия» открывается с волны</label>
                  <input className={inp} inputMode="numeric" defaultValue={o.armyAt ?? ''} key={`aa-${o.id}`} onFocus={pushUndo} onBlur={(e) => patch({ armyAt: numOrU(e.target.value) })} />
                </>
              )}
              {o.kind !== 'camp' && (
                <>
                  <label className={lab}>Слабеет, если захвачен промысел (id)</label>
                  <input className={inp} defaultValue={o.weakenedBy ?? ''} key={`wb-${o.id}`} onFocus={pushUndo} onBlur={(e) => patch({ weakenedBy: e.target.value.trim() || undefined })} />
                  <label className={lab}>Текст хрониста</label>
                  <textarea className={inp} rows={3} value={o.text ?? ''} onFocus={pushUndo} onChange={(e) => patch({ text: e.target.value || undefined })} />
                </>
              )}
              {o.kind === 'event' && (
                <>
                  <label className={lab}>Выборы (JSON: label, text, reward, flag, flags, item, scout)</label>
                  <textarea className={`${inp} font-mono text-[11px]`} rows={8} value={choicesText} onFocus={pushUndo} onChange={(e) => setChoicesText(e.target.value)}
                    onBlur={() => {
                      try {
                        const v = JSON.parse(choicesText);
                        if (!Array.isArray(v) || v.some((c) => typeof c?.label !== 'string' || typeof c?.text !== 'string')) throw new Error();
                        patch({ choices: v });
                      } catch {
                        setMsg('Выборы: нужен JSON-массив из объектов с полями label и text.');
                      }
                    }} />
                </>
              )}
              <button className="w-full mt-3 py-1.5 rounded bg-red-900/70 hover:bg-red-800 text-sm" onClick={() => { pushUndo(); draft.current.objects = draft.current.objects.filter((x) => x !== o); setSel(null); bump(); setSettled((n) => n + 1); }}>
                Удалить объект
              </button>
            </div>
          )}

          {report && (
            <div className="mt-3 pt-2 border-t border-[#3b354a] text-xs">
              <div className="font-bold mb-1">{report.errors.length ? `Ошибок: ${report.errors.length}` : '✔ Пройти можно'}</div>
              {report.errors.map((e, i) => (
                <div key={i} className="text-red-300 mb-1">• {e}</div>
              ))}
              {report.warnings.map((e, i) => (
                <div key={i} className="text-amber-200/90 mb-1">• {e}</div>
              ))}
            </div>
          )}

          <div className="mt-3 pt-2 border-t border-[#3b354a] grid grid-cols-2 gap-1">
            <button className="py-1.5 rounded bg-[#2a2635] hover:bg-[#3a3448] text-xs" onClick={download}>⬇ Скачать файл</button>
            <label className="py-1.5 rounded bg-[#2a2635] hover:bg-[#3a3448] text-xs text-center cursor-pointer">
              ⬆ Загрузить
              <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => (upload(e.target.files?.[0]), (e.target.value = ''))} />
            </label>
            <button className="col-span-2 py-1.5 rounded bg-[#2a2635] hover:bg-red-900/70 text-xs disabled:opacity-40" disabled={!isRegionEdited(rid)} onClick={reset}>
              Вернуть встроенную карту
            </button>
          </div>
          <p className="text-[10px] text-stone-500 mt-2">Правки хранятся только на этом устройстве. Размер карты менять нельзя.</p>
        </div>
      </div>
    </div>
  );
}
