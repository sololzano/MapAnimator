import { catmullRom, fromMerc, haversine, toMerc, type XY } from './geo';
import type { RoutePoint } from './model';

/** Densified route geometry plus fast lookups by progress (0..1 of Mercator length). */
export interface RouteModel {
  /** Samples in Mercator space. */
  S: XY[];
  /** Same samples as [lng, lat]. */
  ll: [number, number][];
  /** Cumulative Mercator length per sample. */
  C: Float64Array;
  /** Total Mercator length. */
  L: number;
  /** Cumulative metres per sample. */
  M: Float64Array;
  /** Index in S of each input point. */
  idx: number[];
  /** Progress of each input point. */
  pointP: number[];
  bounds: { x0: number; y0: number; x1: number; y1: number } | null;
  pos(p: number): XY;
  posLL(p: number): [number, number];
  /** Map bearing (degrees clockwise from north) of travel at p, averaged over ±d. */
  heading(p: number, d?: number): number;
  /** Nearest sample to a Mercator point. */
  nearest(q: XY): { p: number; d: number; x: number; y: number };
  /** Index of the last sample at or before progress p. */
  indexAt(p: number): number;
  metresAt(p: number): number;
  /** Sample index ranges [from, to] of visible (not hidden) stretches. */
  runs: [number, number][];
  /** Index of the leg containing progress p (leg i arrives at point i; 1-based). */
  legAt(p: number): number;
  /** Whether progress p lies on a hidden leg. */
  hiddenAt(p: number): boolean;
  /** Metres on visible legs only. */
  visibleMetres: number;
  hiddenLegs: number;
  /**
   * Time warp: hidden legs are crossed quickly, so time does not run in proportion to
   * length. `w` is the fraction of drawing time, `p` the fraction of route length.
   */
  wFromP(p: number): number;
  pFromW(w: number): number;
}

/** Share of the visible length a hidden leg costs in time (≈ a quick hop). */
const HIDDEN_WEIGHT = 0.04;

const cache = new WeakMap<RoutePoint[], Map<string, RouteModel>>();

export function buildRoute(points: RoutePoint[], smooth: boolean): RouteModel {
  let byKey = cache.get(points);
  const key = smooth ? 's' : 'l';
  const hit = byKey?.get(key);
  if (hit) return hit;
  const m = compute(points, smooth);
  if (!byKey) { byKey = new Map(); cache.set(points, byKey); }
  byKey.set(key, m);
  return m;
}

function compute(points: RoutePoint[], smooth: boolean): RouteModel {
  const P = points.map((p) => toMerc(p.lng, p.lat));
  // Keep the total sample count bounded for long imported routes.
  const per = Math.max(2, Math.min(24, Math.floor(4000 / Math.max(1, P.length))));
  const { out: S, idx } = smooth && P.length >= 3 ? catmullRom(P, per) : { out: P.map((p) => ({ ...p })), idx: P.map((_, i) => i) };
  const n = S.length;
  const ll = S.map((s) => fromMerc(s.x, s.y));
  const C = new Float64Array(Math.max(1, n));
  const M = new Float64Array(Math.max(1, n));
  for (let i = 1; i < n; i++) {
    C[i] = C[i - 1] + Math.hypot(S[i].x - S[i - 1].x, S[i].y - S[i - 1].y);
    M[i] = M[i - 1] + haversine(ll[i - 1], ll[i]);
  }
  const L = n > 1 ? C[n - 1] : 0;
  let bounds: RouteModel['bounds'] = null;
  for (const s of S) {
    if (!bounds) bounds = { x0: s.x, y0: s.y, x1: s.x, y1: s.y };
    else { bounds.x0 = Math.min(bounds.x0, s.x); bounds.y0 = Math.min(bounds.y0, s.y); bounds.x1 = Math.max(bounds.x1, s.x); bounds.y1 = Math.max(bounds.y1, s.y); }
  }

  const indexAt = (p: number) => {
    if (n < 2 || L === 0) return 0;
    const t = Math.max(0, Math.min(1, p)) * L;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (C[mid] <= t) lo = mid; else hi = mid; }
    return lo;
  };
  const pos = (p: number): XY => {
    if (!n) return { x: 0.5, y: 0.5 };
    if (n === 1 || L === 0) return S[0];
    const lo = indexAt(p), hi = Math.min(n - 1, lo + 1), t = Math.max(0, Math.min(1, p)) * L;
    const f = (t - C[lo]) / (C[hi] - C[lo] || 1);
    return { x: S[lo].x + (S[hi].x - S[lo].x) * f, y: S[lo].y + (S[hi].y - S[lo].y) * f };
  };
  const heading = (p: number, d = 0.02) => {
    const a = pos(Math.max(0, p - d)), b = pos(Math.min(1, p + d));
    if (a.x === b.x && a.y === b.y) return 0;
    return (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI;
  };
  const nearest = (q: XY) => {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < n; i++) { const d = (S[i].x - q.x) ** 2 + (S[i].y - q.y) ** 2; if (d < bd) { bd = d; bi = i; } }
    return n ? { p: L ? C[bi] / L : 0, d: Math.sqrt(bd), x: S[bi].x, y: S[bi].y } : { p: 0, d: 0, x: q.x, y: q.y };
  };
  const metresAt = (p: number) => {
    if (n < 2) return 0;
    const lo = indexAt(p), hi = Math.min(n - 1, lo + 1), t = Math.max(0, Math.min(1, p)) * L;
    const f = (t - C[lo]) / (C[hi] - C[lo] || 1);
    return M[lo] + (M[hi] - M[lo]) * f;
  };
  // Legs: leg i (1..n-1) spans samples idx[i-1]..idx[i] and belongs to point i.
  const nLegs = points.length;
  const hidden = points.map((q, i) => i > 0 && !!q.hidden);
  const runs: [number, number][] = [];
  for (let i = 1; i < nLegs; i++) {
    if (hidden[i]) continue;
    const a = idx[i - 1], b = idx[i], last = runs[runs.length - 1];
    if (last && last[1] === a) last[1] = b; else runs.push([a, b]);
  }
  if (nLegs === 1) runs.push([0, 0]);
  const legP = idx.map((i) => (L ? C[i] / L : 0));
  let visL = 0, visM = 0, hiddenLegs = 0;
  for (let i = 1; i < nLegs; i++) {
    if (hidden[i]) { hiddenLegs++; continue; }
    visL += C[idx[i]] - C[idx[i - 1]];
    visM += M[idx[i]] - M[idx[i - 1]];
  }
  // Cumulative time weight at each point.
  const legW = [0];
  for (let i = 1; i < nLegs; i++) {
    const len = C[idx[i]] - C[idx[i - 1]];
    legW.push(legW[i - 1] + (hidden[i] ? HIDDEN_WEIGHT * (visL || L) : len));
  }
  const Wtot = legW[legW.length - 1] || 1;
  const legAt = (p: number) => {
    if (nLegs < 2) return 0;
    let lo = 1;
    while (lo < nLegs - 1 && legP[lo] < p) lo++;
    return lo;
  };
  const interp = (x: number, xs: number[], ys: number[]) => {
    if (xs.length < 2) return x;
    let i = 1;
    while (i < xs.length - 1 && xs[i] < x) i++;
    const f = (x - xs[i - 1]) / (xs[i] - xs[i - 1] || 1);
    return ys[i - 1] + (ys[i] - ys[i - 1]) * Math.max(0, Math.min(1, f));
  };
  const legWn = legW.map((w) => w / Wtot);
  const warp = hiddenLegs > 0 && L > 0;

  return {
    S, ll, C, L, M, idx, bounds, pos, heading, nearest, indexAt, metresAt,
    runs, legAt, visibleMetres: visM, hiddenLegs,
    hiddenAt: (p) => hidden[legAt(p)] ?? false,
    wFromP: (p) => (warp ? interp(p, legP, legWn) : p),
    pFromW: (w) => (warp ? interp(w, legWn, legP) : w),
    pointP: idx.map((i) => (L ? C[i] / L : 0)),
    posLL: (p) => { const q = pos(p); return fromMerc(q.x, q.y); },
  };
}
