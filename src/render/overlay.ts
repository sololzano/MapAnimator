// Canvas2D layer drawn on top of the map: route line, markers, signs and
// credits. The same code draws the editor preview and every exported frame,
// so what you see is what you export.
import type { Scene } from '../core/model';
import type { FrameState, SceneRuntime } from '../core/runtime';
import { mapTheme } from '../map/themes';
import { SIGN_FONT, drawSignBody } from './signs';

export type Project = (lng: number, lat: number) => { x: number; y: number };

export interface Rect { x: number; y: number; w: number; h: number }

export interface OverlayInput {
  ctx: CanvasRenderingContext2D;
  project: Project;
  scene: Scene;
  rt: SceneRuntime;
  frame: FrameState;
  /** UI scale (1 = 720p logical frame). */
  scale: number;
  /** Video frame rectangle, for the credits line. */
  frameRect: Rect;
  attribution?: string;
  /** Editor-only: keep signs at least this visible so they can be edited. */
  minSignAlpha?: number;
  selectedSign?: string | null;
}

export interface SignHit { id: string; rect: Rect; anchor: { x: number; y: number } }

export function drawOverlay(o: OverlayInput): SignHit[] {
  const { ctx, project, scene, rt, frame, scale: k } = o;
  const look = scene.look, route = rt.route, dark = mapTheme(look.theme).dark;
  const n = route.ll.length;
  const pts = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    const q = project(route.ll[i][0], route.ll[i][1]);
    pts[i * 2] = q.x; pts[i * 2 + 1] = q.y;
  }
  const p = frame.p;
  const headIdx = route.indexAt(p);
  const head = (() => { const ll = route.posLL(p); return project(ll[0], ll[1]); })();
  const w = look.width * k;

  const tracePath = (upto: number, withHead: boolean) => {
    ctx.beginPath();
    for (let i = 0; i <= upto && i < n; i++) {
      const x = pts[i * 2], y = pts[i * 2 + 1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    if (withHead) ctx.lineTo(head.x, head.y);
  };

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (n > 1) {
    if (look.ghost && p < 1) {
      tracePath(n - 1, false);
      ctx.strokeStyle = look.color; ctx.globalAlpha = 0.38; ctx.lineWidth = w * 0.55;
      ctx.setLineDash([5 * k, 7 * k]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    if (p > 0) {
      if (look.casing && look.style === 'solid') {
        tracePath(headIdx, true);
        ctx.strokeStyle = dark ? 'rgba(35,38,52,0.9)' : 'rgba(255,255,255,0.92)';
        ctx.lineWidth = w + 5 * k; ctx.stroke();
      }
      tracePath(headIdx, true);
      ctx.strokeStyle = look.color; ctx.lineWidth = w;
      if (look.style === 'dashed') ctx.setLineDash([w * 2.4, w * 2]);
      if (look.style === 'dotted') ctx.setLineDash([0.01, w * 2.2]);
      if (look.glow) { ctx.shadowColor = look.color; ctx.shadowBlur = 14 * k; }
      ctx.stroke();
      ctx.setLineDash([]); ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    }
  }

  const ring = dark ? '#232634' : '#ffffff';
  const dotR = 8 * k * look.tipSize;
  if (look.startDot && n > 0) {
    ctx.beginPath(); ctx.arc(pts[0], pts[1], dotR, 0, Math.PI * 2);
    ctx.fillStyle = look.color; ctx.fill(); ctx.lineWidth = 3 * k; ctx.strokeStyle = ring; ctx.stroke();
  }
  if (look.endDot && n > 1) {
    ctx.beginPath(); ctx.arc(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1], dotR, 0, Math.PI * 2);
    ctx.fillStyle = ring; ctx.fill(); ctx.lineWidth = 4 * k; ctx.strokeStyle = look.color; ctx.stroke();
  }

  // Signs (leaders first, then cards, in list order).
  const hits: SignHit[] = [];
  const accent = look.color;
  const ink = mapTheme(look.theme).ink;
  const placed = scene.signs.map((g) => {
    const v = Math.max(frame.signs.get(g.id) ?? 0, o.minSignAlpha ?? 0);
    const a = project(g.lng, g.lat);
    return { g, v, a, c: { x: a.x + g.dx * k, y: a.y + g.dy * k } };
  });
  for (const s of placed) {
    if (s.v <= 0) continue;
    const far = Math.hypot(s.g.dx, s.g.dy) > 24;
    ctx.globalAlpha = s.v;
    if (far) {
      ctx.beginPath(); ctx.moveTo(s.a.x, s.a.y); ctx.lineTo(s.c.x, s.c.y);
      ctx.strokeStyle = ink; ctx.lineWidth = 1.6 * k; ctx.setLineDash([5 * k, 4 * k]);
      ctx.globalAlpha = s.v * 0.8; ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = s.v;
    }
    ctx.beginPath(); ctx.arc(s.a.x, s.a.y, 4.5 * k, 0, Math.PI * 2);
    ctx.fillStyle = ring; ctx.fill(); ctx.lineWidth = 2.5 * k; ctx.strokeStyle = ink; ctx.stroke();
  }
  for (const s of placed) {
    if (s.v <= 0) { hits.push({ id: s.g.id, rect: { x: s.c.x, y: s.c.y, w: 0, h: 0 }, anchor: s.a }); continue; }
    const sc = s.g.size * k * (0.85 + 0.15 * s.v);
    ctx.save();
    ctx.globalAlpha = s.v;
    ctx.translate(s.c.x, s.c.y);
    ctx.scale(sc, sc);
    const size = drawSignBody(ctx, s.g, accent);
    ctx.restore();
    const rect = { x: s.c.x - (size.w * sc) / 2, y: s.c.y - (size.h * sc) / 2, w: size.w * sc, h: size.h * sc };
    if (o.selectedSign === s.g.id) {
      ctx.save();
      ctx.strokeStyle = '#1e66f5'; ctx.lineWidth = 2; ctx.setLineDash([]);
      ctx.beginPath(); ctx.roundRect(rect.x - 6, rect.y - 6, rect.w + 12, rect.h + 12, 6); ctx.stroke();
      ctx.restore();
    }
    hits.push({ id: s.g.id, rect, anchor: s.a });
  }
  ctx.globalAlpha = 1;

  if (n > 0) drawTip(ctx, scene, o.frame.t, head, screenHeading(route, p, project), k, ring);

  if (o.attribution) {
    const fr = o.frameRect, fs = Math.max(8, 9.5 * k);
    ctx.font = `500 ${fs}px ${SIGN_FONT}`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    const tw = ctx.measureText(o.attribution).width, pad = 4 * k;
    ctx.fillStyle = dark ? 'rgba(20,20,19,0.55)' : 'rgba(255,255,255,0.65)';
    ctx.fillRect(fr.x + fr.w - tw - pad * 3, fr.y + fr.h - fs - pad * 2.4, tw + pad * 3, fs + pad * 2.4);
    ctx.fillStyle = dark ? 'rgba(244,242,232,0.85)' : 'rgba(20,20,19,0.75)';
    ctx.fillText(o.attribution, fr.x + fr.w - pad * 1.5, fr.y + fr.h - pad);
  }
  ctx.restore();
  return hits;
}

/** Travel direction in screen space (degrees clockwise from up), so it follows map rotation and tilt. */
function screenHeading(route: SceneRuntime['route'], p: number, project: Project): number {
  if (route.ll.length < 2) return 0;
  const a = route.posLL(Math.max(0, p - 0.004)), b = route.posLL(Math.min(1, p + 0.004));
  const A = project(a[0], a[1]), B = project(b[0], b[1]);
  if (Math.hypot(B.x - A.x, B.y - A.y) < 1e-6) return 0;
  return (Math.atan2(B.x - A.x, -(B.y - A.y)) * 180) / Math.PI;
}

function drawTip(ctx: CanvasRenderingContext2D, scene: Scene, t: number, at: { x: number; y: number }, heading: number, k: number, ring: string) {
  const look = scene.look, col = look.color, s = k * look.tipSize;
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.lineJoin = 'round';
  const fillStroke = (lw: number) => { ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = lw * s; ctx.strokeStyle = ring; ctx.stroke(); };
  const poly = (xy: number[]) => {
    ctx.beginPath();
    for (let i = 0; i < xy.length; i += 2) { const x = xy[i] * s, y = xy[i + 1] * s; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.closePath();
  };
  switch (look.tip) {
    case 'pulse': {
      const ph = (t * 1.1) % 1;
      ctx.beginPath(); ctx.arc(0, 0, (11 + 12 * ph) * s, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.globalAlpha = 0.35 * (1 - ph); ctx.fill(); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(0, 0, 9 * s, 0, Math.PI * 2); fillStroke(3);
      break;
    }
    case 'dot': ctx.beginPath(); ctx.arc(0, 0, 8 * s, 0, Math.PI * 2); fillStroke(3); break;
    case 'pin':
      ctx.beginPath(); ctx.arc(0, 0, 11 * s, 0, Math.PI * 2); fillStroke(3);
      ctx.beginPath(); ctx.arc(0, 0, 4 * s, 0, Math.PI * 2); ctx.fillStyle = ring; ctx.fill();
      break;
    case 'arrow': ctx.rotate((heading * Math.PI) / 180); poly([0, -15, 11, 11, 0, 5, -11, 11]); fillStroke(2.5); break;
    case 'diamond': poly([0, -13, 11, 0, 0, 13, -11, 0]); fillStroke(2.5); break;
    case 'plane':
      ctx.rotate((heading * Math.PI) / 180);
      poly([0, -17, 3, -5, 17, 4, 17, 8, 3, 5, 2, 13, 7, 16, 7, 18, 0, 16, -7, 18, -7, 16, -2, 13, -3, 5, -17, 8, -17, 4, -3, -5]);
      fillStroke(2);
      break;
  }
  ctx.restore();
}

/** Editor handles for step 1 (never exported). */
export function drawHandles(ctx: CanvasRenderingContext2D, scene: Scene, rt: SceneRuntime, project: Project, sel: number, showMids: boolean, ink: { fg: string; bg: string; accent: string }) {
  const pts = scene.points.map((q) => project(q.lng, q.lat));
  ctx.save();
  if (showMids && pts.length > 1) {
    for (let i = 0; i < pts.length - 1; i++) {
      const m = midpoint(scene, rt, i, project);
      ctx.beginPath(); ctx.arc(m.x, m.y, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = ink.bg; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = ink.accent; ctx.stroke();
    }
  }
  const big = pts.length <= 99;
  ctx.font = `600 10px ${SIGN_FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  pts.forEach((q, i) => {
    const r = big ? 11 : 6;
    ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
    ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
    ctx.fillStyle = i === sel ? ink.accent : ink.bg; ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.lineWidth = 2; ctx.strokeStyle = ink.fg; ctx.stroke();
    if (big) { ctx.fillStyle = ink.fg; ctx.fillText(String(i + 1), q.x, q.y + 0.5); }
  });
  ctx.restore();
  return pts;
}

/** Screen position of the "insert point" handle between point i and i+1. */
export function midpoint(scene: Scene, rt: SceneRuntime, i: number, project: Project): { x: number; y: number; lng: number; lat: number } {
  const r = rt.route;
  const a = r.idx[i], b = r.idx[i + 1];
  let ll: [number, number];
  if (scene.smooth && b - a > 1) ll = r.ll[Math.round((a + b) / 2)];
  else {
    const p = scene.points[i], q = scene.points[i + 1];
    ll = [(p.lng + q.lng) / 2, (p.lat + q.lat) / 2];
  }
  const s = project(ll[0], ll[1]);
  return { x: s.x, y: s.y, lng: ll[0], lat: ll[1] };
}

