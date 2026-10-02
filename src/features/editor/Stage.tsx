import { Map as MlMap, type JumpToOptions, type MapMouseEvent } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fromMerc } from '../../core/geo';
import { logicalSize, outputSize, removePoint, rid, signPointIndex, type Ratio, type Sign } from '../../core/model';
import { evaluate, runtime } from '../../core/runtime';
import { loadCountries, visitedCountries } from '../../map/countries';
import { attributionText, buildStyle } from '../../map/style';
import { drawHandles, drawOverlay, midpoint, type Rect, type SignHit } from '../../render/overlay';
import { currentScene, useApp } from '../../state/store';
import { cx } from '../../ui/controls';
import { Icon } from '../../ui/icons';
import { stageBus } from './bus';

interface Size { w: number; h: number }

export function frameRectFor(size: Size, ratio: Ratio): Rect {
  const [lw, lh] = logicalSize(ratio);
  const asp = lw / lh;
  let cw = Math.max(120, size.w - 96), ch = cw / asp;
  if (ch > size.h - 96) { ch = Math.max(120, size.h - 96); cw = ch * asp; }
  return { x: (size.w - cw) / 2, y: (size.h - ch) / 2, w: cw, h: ch };
}

type Drag =
  | { type: 'pan'; x: number; y: number }
  | { type: 'pt'; i: number; key: string }
  | { type: 'sign'; id: string; ox: number; oy: number; key: string };

const HANDLE_R = 12, MID_R = 8;

export function Stage() {
  const scene = useApp((s) => currentScene(s)!);
  const step = useApp((s) => s.step);
  const tool = useApp((s) => s.tool);
  const sel = useApp((s) => s.sel);
  const selSign = useApp((s) => s.selSign);
  const toast = useApp((s) => s.toast);
  const uiTheme = useApp((s) => s.uiTheme);
  const showNumbers = useApp((s) => s.showNumbers);
  const hasHistory = useApp((s) => s.history.past.length > 0);
  const set = useApp((s) => s.set);

  const stageRef = useRef<HTMLDivElement>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [size, setSize] = useState<Size>({ w: 1000, h: 560 });
  const [countries, setCountries] = useState<Awaited<ReturnType<typeof loadCountries>> | null>(null);
  const [styleReady, setStyleReady] = useState(false);

  const rt = useMemo(() => runtime(scene), [scene]);
  const [lw] = logicalSize(scene.ratio);
  const frame = useMemo(() => frameRectFor(size, scene.ratio), [size, scene.ratio]);
  const scale = frame.w / lw;
  const camMode = step >= 4;
  const attribution = attributionText(scene.look);

  // Latest values for imperative handlers (map events, rAF, window listeners).
  const L = useRef({ scene, rt, step, tool, sel, selSign, frame, scale, camMode, size, attribution, showNumbers, colors: { fg: '#4c4f69', bg: '#eff1f5', accent: '#179299' } });
  L.current = { ...L.current, scene, rt, step, tool, sel, selSign, frame, scale, camMode, size, attribution, showNumbers };
  const hits = useRef<{ signs: SignHit[]; handles: { x: number; y: number }[] }>({ signs: [], handles: [] });
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const savedView = useRef<JumpToOptions | null>(null);
  /** Until the user moves the map, keep the route fitted to the frame (e.g. while the window resizes). */
  const userMoved = useRef(false);

  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    L.current.colors = { fg: cs.getPropertyValue('--text').trim(), bg: cs.getPropertyValue('--bg').trim(), accent: cs.getPropertyValue('--accent').trim() };
  }, [uiTheme]);

  const draw = useCallback(() => {
    const map = mapRef.current, cv = canvasRef.current;
    if (!map || !cv) return;
    const st = L.current, dpr = window.devicePixelRatio || 1;
    const W = st.size.w, H = st.size.h;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const tm = useApp.getState().tm, T = st.rt.tm.T;
    const t = tm < 0 ? T : Math.min(tm, T);
    const project = (lng: number, lat: number) => map.project([lng, lat]);
    hits.current.signs = drawOverlay({
      ctx, project, scene: st.scene, rt: st.rt, frame: evaluate(st.scene, st.rt, t), scale: st.scale, frameRect: st.frame,
      attribution: st.attribution, minSignAlpha: st.step === 3 ? 0.55 : 0, selectedSign: st.step === 3 ? st.selSign : null,
    });
    if (st.step === 1) {
      hits.current.handles = drawHandles(ctx, st.scene, st.rt, project, st.sel, { mids: st.tool !== 'pan', numbers: st.showNumbers, colors: st.colors });
    } else if (st.step === 3) {
      // Points are where signs attach: show them (ringed in accent when they already carry a sign).
      const marked = new Set(st.scene.signs.map((g) => signPointIndex(st.scene.points, g)));
      const selected = st.selSign ? signPointIndex(st.scene.points, st.scene.signs.find((g) => g.id === st.selSign) ?? { pointId: '' } as Sign) : st.sel;
      hits.current.handles = drawHandles(ctx, st.scene, st.rt, project, selected, { mids: false, numbers: st.showNumbers, colors: st.colors, marked });
    } else hits.current.handles = [];
  }, []);

  const raf = useRef(0);
  const schedule = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(draw);
  }, [draw]);

  const applyCamera = useCallback(() => {
    const map = mapRef.current, st = L.current;
    if (!map || !st.camMode) return;
    const tm = useApp.getState().tm;
    const c = st.rt.camera.at(tm < 0 ? 0 : tm);
    map.jumpTo({ center: c.center, zoom: c.zoom + Math.log2(st.frame.w / logicalSize(st.scene.ratio)[0]), bearing: c.bearing, pitch: c.pitch });
  }, []);

  const fit = useCallback((animate: boolean) => {
    const map = mapRef.current, st = L.current;
    if (!map || st.camMode) return;
    const b = st.rt.route.bounds, fr = st.frame;
    if (!b) { map.jumpTo({ center: [0, 25], zoom: Math.log2(fr.w / 512) + 0.3, bearing: 0, pitch: 0 }); return; }
    const sw = fromMerc(b.x0, b.y1), ne = fromMerc(b.x1, b.y0);
    const padX = fr.w * 0.12, padY = fr.h * 0.14;
    map.fitBounds([sw, ne], {
      padding: { left: fr.x + padX, right: st.size.w - fr.x - fr.w + padX, top: fr.y + padY, bottom: st.size.h - fr.y - fr.h + padY },
      maxZoom: 13, duration: animate ? 450 : 0, bearing: 0, pitch: 0,
    });
  }, []);

  // Create the map once.
  useEffect(() => {
    const st = L.current;
    const map = new MlMap({
      container: mapDivRef.current!,
      style: buildStyle(st.scene.look, { scale: Math.max(0.6, st.scale) }),
      attributionControl: false,
      center: [0, 25], zoom: 1.4, maxPitch: 70,
      doubleClickZoom: false,
      canvasContextAttributes: { antialias: true },
    });
    mapRef.current = map;
    if (import.meta.env.DEV) (window as unknown as { __map: MlMap }).__map = map;
    map.on('render', draw);
    map.on('load', () => { setStyleReady(true); fit(false); });
    const touched = (e: { originalEvent?: unknown }) => { if (e.originalEvent) userMoved.current = true; };
    map.on('dragstart', touched);
    map.on('zoomstart', touched);
    map.on('rotatestart', touched);
    map.on('click', (e: MapMouseEvent) => {
      if (suppressClick.current) { suppressClick.current = false; return; }
      const s = L.current;
      if (s.camMode) return;
      if (s.step === 1 && s.tool === 'draw') {
        useApp.getState().updateScene((sc) => { sc.points.push({ id: rid('r'), lng: e.lngLat.lng, lat: e.lngLat.lat }); });
        set({ sel: L.current.scene.points.length, tm: -1 });
      } else if (s.step === 1) set({ sel: -1 });
      else if (s.step === 3) set({ selSign: null });
    });
    const offFit = stageBus.on('fit', () => { userMoved.current = false; fit(true); });
    const offZoom = stageBus.on('zoom', (d) => map.easeTo({ zoom: map.getZoom() + (d as number), duration: 250 }));
    return () => { offFit(); offZoom(); map.remove(); mapRef.current = null; };
  }, [draw, fit, set]);

  // Track stage size.
  useEffect(() => {
    const el = stageRef.current!;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize((s) => (Math.abs(s.w - r.width) > 0.5 || Math.abs(s.h - r.height) > 0.5 ? { w: r.width, h: r.height } : s));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    mapRef.current?.resize();
    if (!userMoved.current && !L.current.camMode) fit(false);
    applyCamera();
    schedule();
  }, [size, scene.ratio, applyCamera, schedule, fit]);

  // Countries for region shading (bundled, loaded on demand).
  useEffect(() => { if (scene.look.regions !== 'off' && !countries) void loadCountries().then(setCountries); }, [scene.look.regions, countries]);
  const visited = useMemo(() => (countries && scene.look.regions !== 'off' ? visitedCountries(countries.countries, rt.route.ll) : []), [countries, rt.route, scene.look.regions]);

  // Restyle the map whenever the look (or preview scale) changes — diffed, so only changed layers update.
  const styleScale = Math.round(Math.max(0.6, scale) * 20) / 20;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    map.setStyle(buildStyle(scene.look, { scale: styleScale, countriesUrl: countries?.url, visited }), { diff: true });
  }, [scene.look, styleScale, countries, visited, styleReady]);

  // Camera-driven steps: follow the playhead, lock interactions. Editing steps: free view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const hs = [map.dragPan, map.scrollZoom, map.keyboard, map.dragRotate, map.touchZoomRotate];
    if (camMode) {
      if (!savedView.current) savedView.current = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
      hs.forEach((h) => h.disable());
      applyCamera();
    } else {
      hs.forEach((h) => h.enable());
      if (savedView.current) { map.jumpTo(savedView.current); savedView.current = null; }
    }
    schedule();
  }, [camMode, applyCamera, schedule]);

  useEffect(() => { applyCamera(); schedule(); }, [scene, step, tool, sel, selSign, showNumbers, applyCamera, schedule]);
  useEffect(() => useApp.subscribe((s, prev) => { if (s.tm !== prev.tm) { applyCamera(); schedule(); } }), [applyCamera, schedule]);

  // Refit when switching scenes.
  const sceneId = scene.id;
  useEffect(() => { userMoved.current = false; if (styleReady) fit(false); }, [sceneId, styleReady, fit]);

  // Pointer interactions layered over MapLibre's own handlers (capture phase).
  useEffect(() => {
    const el = stageRef.current!;
    const rel = (e: MouseEvent) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const hitHandle = (p: { x: number; y: number }) => {
      const hs = hits.current.handles;
      for (let i = hs.length - 1; i >= 0; i--) if (Math.hypot(hs[i].x - p.x, hs[i].y - p.y) <= HANDLE_R) return i;
      return -1;
    };
    const hitMid = (p: { x: number; y: number }) => {
      const st = L.current, map = mapRef.current!;
      for (let i = 0; i < st.scene.points.length - 1; i++) {
        const m = midpoint(st.scene, st.rt, i, (lng, lat) => map.project([lng, lat]));
        if (Math.hypot(m.x - p.x, m.y - p.y) <= MID_R) return { i, m };
      }
      return null;
    };
    const hitSign = (p: { x: number; y: number }) => {
      const hs = hits.current.signs;
      for (let i = hs.length - 1; i >= 0; i--) {
        const h = hs[i], r = h.rect;
        if (r.w > 0 && p.x >= r.x - 4 && p.x <= r.x + r.w + 4 && p.y >= r.y - 4 && p.y <= r.y + r.h + 4) return h;
      }
      return null;
    };
    const app = () => useApp.getState();

    const onDown = (e: MouseEvent) => {
      const st = L.current, map = mapRef.current;
      if (!map || st.camMode) return;
      const p = rel(e);
      if (e.button === 1) {
        e.preventDefault(); e.stopPropagation();
        drag.current = { type: 'pan', x: e.clientX, y: e.clientY };
        return;
      }
      if (st.step === 1) {
        const i = hitHandle(p);
        if (i >= 0) {
          e.stopPropagation();
          if (e.button === 0) { app().set({ sel: i }); drag.current = { type: 'pt', i, key: 'drag-' + rid() }; suppressClick.current = true; }
          return;
        }
        if (e.button === 0 && st.tool !== 'pan') {
          const m = hitMid(p);
          if (m) {
            e.stopPropagation();
            app().updateScene((s) => { s.points.splice(m.i + 1, 0, { id: rid('r'), lng: m.m.lng, lat: m.m.lat }); });
            app().set({ sel: m.i + 1, tm: -1 });
            drag.current = { type: 'pt', i: m.i + 1, key: 'drag-' + rid() };
            suppressClick.current = true;
          }
        }
      }
      if (st.step === 3 && e.button === 0) {
        const h = hitSign(p);
        if (h) {
          e.stopPropagation();
          suppressClick.current = true;
          app().set({ selSign: h.id });
          drag.current = { type: 'sign', id: h.id, ox: p.x - (h.rect.x + h.rect.w / 2), oy: p.y - (h.rect.y + h.rect.h / 2), key: 'drag-' + rid() };
          return;
        }
        // Clicking a route point picks it: selects its sign, or marks it as the place for the next new sign.
        const i = hitHandle(p);
        if (i >= 0) {
          e.stopPropagation();
          suppressClick.current = true;
          const g = st.scene.signs.find((x) => signPointIndex(st.scene.points, x) === i);
          app().set(g ? { selSign: g.id, sel: i } : { selSign: null, sel: i });
        }
      }
    };
    const onMove = (e: MouseEvent) => {
      const map = mapRef.current, st = L.current;
      if (!map) return;
      const d = drag.current;
      if (!d) {
        if (st.camMode) return;
        const p = rel(e);
        let cur = st.step === 1 ? (st.tool === 'draw' ? 'crosshair' : st.tool === 'pan' ? 'grab' : 'default') : 'grab';
        if (st.step === 1 && hitHandle(p) >= 0) cur = 'grab';
        else if (st.step === 1 && st.tool !== 'pan' && hitMid(p)) cur = 'copy';
        else if (st.step === 3 && hitSign(p)) cur = 'move';
        else if (st.step === 3 && hitHandle(p) >= 0) cur = 'pointer';
        map.getCanvas().style.cursor = cur;
        return;
      }
      if (d.type === 'pan') {
        map.panBy([d.x - e.clientX, d.y - e.clientY], { animate: false });
        drag.current = { ...d, x: e.clientX, y: e.clientY };
        return;
      }
      const p = rel(e);
      if (d.type === 'pt') {
        const ll = map.unproject([p.x, p.y]);
        app().updateScene((s) => { const q = s.points[d.i]; if (q) { q.lng = ll.lng; q.lat = ll.lat; } }, d.key);
      } else if (d.type === 'sign') {
        const g = st.scene.signs.find((x) => x.id === d.id);
        const q = g && st.scene.points[signPointIndex(st.scene.points, g)];
        if (!g || !q) return;
        const a = map.project([q.lng, q.lat]);
        const dx = (p.x - d.ox - a.x) / st.scale, dy = (p.y - d.oy - a.y) / st.scale;
        app().updateScene((s) => { const x = s.signs.find((q) => q.id === d.id); if (x) { x.dx = Math.round(dx); x.dy = Math.round(dy); } }, d.key);
      }
    };
    const onUp = () => { drag.current = null; };
    const onCtx = (e: MouseEvent) => {
      const st = L.current;
      if (st.camMode || st.step !== 1) return;
      const i = hitHandle(rel(e));
      if (i < 0) return;
      e.preventDefault(); e.stopPropagation();
      app().updateScene((s) => removePoint(s, i));
      app().set({ sel: -1, tm: -1 });
    };
    el.addEventListener('mousedown', onDown, true);
    el.addEventListener('contextmenu', onCtx, true);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      el.removeEventListener('mousedown', onDown, true);
      el.removeEventListener('contextmenu', onCtx, true);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const updateScene = useApp((s) => s.updateScene);
  const undo = useApp((s) => s.undo);
  const toolBtn = (title: string, icon: string, act: () => void, on = false, disabled = false) => (
    <button key={title} title={title} onClick={act} disabled={disabled}
      className={cx('grid h-[38px] w-[38px] place-items-center rounded-lg border-0 p-0 disabled:pointer-events-none disabled:opacity-35', on ? 'bg-inverse text-on-inverse' : 'bg-transparent text-text hover:bg-panel-2')}>
      <Icon name={icon} size={20} />
    </button>
  );
  const sep = (k: string) => <div key={k} className="mx-[5px] mt-[3px] mb-[5px] h-px bg-line" />;
  const [ow, oh] = outputSize(scene.ratio, scene.exp.res);

  return (
    <div ref={stageRef} className="relative min-h-0 flex-1 overflow-hidden select-none" style={{ background: 'var(--panel-2)' }}>
      {/* Inline position: MapLibre's stylesheet sets .maplibregl-map { position: relative }. */}
      <div ref={mapDivRef} style={{ position: 'absolute', inset: 0 }} />
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />

      {/* Export frame: everything outside is cropped. */}
      <div className="pointer-events-none absolute rounded-[3px] border-2 border-[#eff1f5]" style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h, boxShadow: '0 0 0 4000px rgba(35,38,52,.5)' }}>
        <div className="num absolute bottom-full left-[-2px] mb-2 flex items-center gap-2 rounded-md bg-[rgba(35,38,52,.8)] px-[9px] py-1 text-[11px] font-medium whitespace-nowrap text-[#eff1f5]">
          {scene.ratio} · {ow}×{oh} · {scene.exp.fps} fps · {camMode ? 'camera view' : 'outside is cropped'}
        </div>
      </div>

      {!camMode && (
        <div className="absolute top-3.5 left-3.5 flex flex-col gap-0.5 rounded-xl border border-line bg-bg p-1 shadow-(--shadow)">
          {step === 1 && [
            toolBtn('Draw points (click the map)', 'draw', () => set({ tool: 'draw' }), tool === 'draw'),
            toolBtn('Move / insert points', 'move', () => set({ tool: 'edit' }), tool === 'edit'),
            toolBtn('Pan — or hold the mouse wheel button', 'pan', () => set({ tool: 'pan' }), tool === 'pan'),
            sep('s1'),
            toolBtn('Undo (Ctrl+Z)', 'undo', undo, false, !hasHistory),
            toolBtn('Delete selected point', 'trash', () => { updateScene((s) => removePoint(s, sel)); set({ sel: -1 }); }, false, sel < 0),
          ]}
          {step !== 1 && toolBtn('Pan — drag the map, or hold the mouse wheel button', 'pan', () => {}, true)}
          {sep('s2')}
          {toolBtn('Zoom in', 'zoomIn', () => stageBus.emit('zoom', 1))}
          {toolBtn('Zoom out', 'zoomOut', () => stageBus.emit('zoom', -1))}
          {toolBtn('Fit to route', 'fit', () => fit(true))}
        </div>
      )}

      <div className="pointer-events-none absolute bottom-3 left-3.5 rounded bg-[rgba(35,38,52,.55)] px-1.5 py-0.5 text-[10.5px] text-[#eff1f5]">
        {camMode
          ? `Camera preview · ${{ follow: 'following the line', pan: 'panning start → end', overview: 'fixed overview' }[scene.cam.mode]}`
          : 'Scroll to zoom · hold the wheel button to pan · right-drag to rotate'}
      </div>
      {toast && <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-inverse px-4 py-[9px] text-[13px] text-on-inverse shadow-[0_8px_24px_rgba(0,0,0,.3)]">{toast}</div>}
    </div>
  );
}
