// Canvas2D layer drawn on top of the map: route line, markers, signs and
// credits. The same code draws the editor preview and every exported frame,
// so what you see is what you export.
import { legMode, signPointIndex, type Scene } from '../core/model';
import type { FrameState, SceneRuntime } from '../core/runtime';
import { mapTheme } from '../map/themes';
import { SIGN_FONT, drawSignBody } from './signs';
import { drawModeBadge, drawMotorcycle, type Pose } from './transport';

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
  /** Editor-only: draw hidden legs as faint dashes. */
  showHidden?: boolean;
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

  /** Path over the visible runs only (hidden legs leave gaps), up to sample `upto` (+ the head). */
  const tracePath = (upto: number, withHead: boolean) => {
    ctx.beginPath();
    for (const [a, b] of route.runs) {
      if (a > upto) break;
      let started = false;
      for (let i = a; i <= Math.min(b, upto) && i < n; i++) {
        const x = pts[i * 2], y = pts[i * 2 + 1];
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      if (withHead && started && upto < b) ctx.lineTo(head.x, head.y);
    }
  };
  /** Editor only: hidden legs as faint dashes so they can still be found and edited. */
  const traceHidden = () => {
    ctx.beginPath();
    for (let i = 1; i < scene.points.length; i++) {
      if (!scene.points[i].hidden) continue;
      for (let j = route.idx[i - 1]; j <= route.idx[i]; j++) {
        if (j === route.idx[i - 1]) ctx.moveTo(pts[j * 2], pts[j * 2 + 1]); else ctx.lineTo(pts[j * 2], pts[j * 2 + 1]);
      }
    }
  };

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (n > 1) {
    if (o.showHidden && route.hiddenLegs) {
      traceHidden();
      ctx.strokeStyle = look.color; ctx.globalAlpha = 0.5; ctx.lineWidth = Math.max(1.5, w * 0.3);
      ctx.setLineDash([2, 6]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
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
  const placed = scene.signs.flatMap((g) => {
    const i = signPointIndex(scene.points, g);
    if (i < 0) return [];
    const v = Math.max(frame.signs.get(g.id) ?? 0, o.minSignAlpha ?? 0);
    const a = project(scene.points[i].lng, scene.points[i].lat);
    return [{ g, v, a, c: { x: a.x + g.dx * k, y: a.y + g.dy * k } }];
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

  // The tip disappears while crossing a hidden leg.
  if (n > 0 && !route.hiddenAt(p)) drawTip(ctx, scene, rt, frame, head, project, k, ring);

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

/**
 * Which way a side-view icon faces and how much it tilts with the climb. Deterministic in p,
 * and stable: when travel is near-vertical on screen the facing comes from the whole leg
 * (then the whole route) instead of local wobble, so the icon never flickers left/right.
 */
function sidePose(scene: Scene, route: SceneRuntime['route'], p: number, project: Project): Pose {
  const dir = (a: [number, number], b: [number, number]) => {
    const A = project(a[0], a[1]), B = project(b[0], b[1]);
    return { dx: B.x - A.x, dy: B.y - A.y };
  };
  const horizontal = (d: { dx: number; dy: number }) => Math.abs(d.dx) > 0.35 * Math.abs(d.dy) && Math.abs(d.dx) > 0.5;
  const local = dir(route.posLL(Math.max(0, p - 0.015)), route.posLL(Math.min(1, p + 0.015)));
  const climb = Math.atan2(-local.dy, Math.abs(local.dx) + 1e-9);
  const tilt = -Math.max(-0.2, Math.min(0.2, climb * 0.3));
  const wide = dir(route.posLL(Math.max(0, p - 0.05)), route.posLL(Math.min(1, p + 0.05)));
  for (const d of [local, wide]) if (horizontal(d)) return { facingLeft: d.dx < 0, tilt };
  const i = route.legAt(p), pts = scene.points;
  if (i > 0 && pts[i]) {
    const leg = dir([pts[i - 1].lng, pts[i - 1].lat], [pts[i].lng, pts[i].lat]);
    if (Math.abs(leg.dx) > 0.5) return { facingLeft: leg.dx < 0, tilt };
  }
  const all = dir(route.ll[0], route.ll[route.ll.length - 1]);
  return { facingLeft: all.dx < -0.5, tilt };
}

function drawTip(ctx: CanvasRenderingContext2D, scene: Scene, rt: SceneRuntime, frame: FrameState, at: { x: number; y: number }, project: Project, k: number, ring: string) {
  const look = scene.look, col = look.color, s = k * look.tipSize, t = frame.t, p = frame.p, route = rt.route;
  const heading = screenHeading(route, p, project);
  const mode = look.tip === 'mode' ? legMode(scene, route.legAt(p)) : null;
  const kind = look.tip === 'mode' ? (mode === 'moto' ? 'moto' : mode === 'plane' ? 'plane' : 'badge') : look.tip;
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.lineJoin = 'round';
  const fillStroke = (lw: number) => { ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = lw * s; ctx.strokeStyle = ring; ctx.stroke(); };
  const poly = (xy: number[]) => {
    ctx.beginPath();
    for (let i = 0; i < xy.length; i += 2) { const x = xy[i] * s, y = xy[i + 1] * s; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.closePath();
  };
  if (kind === 'moto') {
    // Wheels turn with distance drawn (so they stop during pauses); a tiny bob sells the ride.
    const wheel = p * rt.tm.travel * Math.PI * 5;
    drawMotorcycle(ctx, col, ring, s * 1.25, sidePose(scene, route, p, project), wheel, Math.sin(wheel * 1.3) * 0.35);
    ctx.restore();
    return;
  }
  if (kind === 'badge') {
    drawModeBadge(ctx, mode ?? 'other', col, ring, s, sidePose(scene, route, p, project));
    ctx.restore();
    return;
  }
  switch (kind) {
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

/** Editor handles for the route points (never exported). Numbers are optional to keep the map clean. */
export function drawHandles(
  ctx: CanvasRenderingContext2D, scene: Scene, rt: SceneRuntime, project: Project, sel: number,
  opts: { mids: boolean; numbers: boolean; colors: { fg: string; bg: string; accent: string }; marked?: Set<number> },
) {
  const pts = scene.points.map((q) => project(q.lng, q.lat));
  const ink = opts.colors;
  ctx.save();
  if (opts.mids && pts.length > 1) {
    for (let i = 0; i < pts.length - 1; i++) {
      const m = midpoint(scene, rt, i, project);
      ctx.beginPath(); ctx.arc(m.x, m.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = ink.bg; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
      ctx.lineWidth = 1.5; ctx.strokeStyle = ink.accent; ctx.stroke();
    }
  }
  const numbered = opts.numbers && pts.length <= 99;
  ctx.font = `600 10px ${SIGN_FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  pts.forEach((q, i) => {
    const on = i === sel, r = numbered ? 11 : on ? 7.5 : 6;
    ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 1.5;
    ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
    ctx.fillStyle = on ? ink.accent : ink.bg; ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.lineWidth = on ? 2.5 : 2; ctx.strokeStyle = on ? ink.fg : opts.marked?.has(i) ? ink.accent : ink.fg; ctx.stroke();
    if (numbered) { ctx.fillStyle = ink.fg; ctx.fillText(String(i + 1), q.x, q.y + 0.5); }
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

