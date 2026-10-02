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
}

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
  return {
    S, ll, C, L, M, idx, bounds, pos, heading, nearest, indexAt, metresAt,
    pointP: idx.map((i) => (L ? C[i] / L : 0)),
    posLL: (p) => { const q = pos(p); return fromMerc(q.x, q.y); },
  };
}
