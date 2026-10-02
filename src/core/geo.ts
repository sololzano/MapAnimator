// Small geo toolkit. Mercator coordinates are normalised to 0..1 (same as
// MapLibre's MercatorCoordinate), so a world at zoom z is 512 * 2^z px wide.

export interface XY { x: number; y: number }

export const TILE = 512;
const MAX_LAT = 85.051129;

export function toMerc(lng: number, lat: number): XY {
  const la = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const s = Math.sin((la * Math.PI) / 180);
  return { x: (lng + 180) / 360, y: 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI) };
}

export function fromMerc(x: number, y: number): [number, number] {
  const lng = x * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
  return [lng, lat];
}

export function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371008.8, r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r, dLng = (b[0] - a[0]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Centripetal Catmull–Rom through `pts` (alpha 0.5: no cusps or overshoot on
 * unevenly spaced points). Returns the sampled curve and, for each input
 * point, its index in the output.
 */
export function catmullRom(pts: XY[], samplesPerSeg: number): { out: XY[]; idx: number[] } {
  const out: XY[] = [], idx: number[] = [];
  const n = pts.length;
  if (n < 3) {
    pts.forEach((p) => { idx.push(out.length); out.push({ ...p }); });
    return { out, idx };
  }
  const tj = (ti: number, a: XY, b: XY) => ti + Math.max(1e-12, Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)));
  for (let i = 0; i < n - 1; i++) {
    const p1 = pts[i], p2 = pts[i + 1];
    const p0 = i > 0 ? pts[i - 1] : { x: 2 * p1.x - p2.x, y: 2 * p1.y - p2.y };
    const p3 = i + 2 < n ? pts[i + 2] : { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y };
    const t0 = 0, t1 = tj(t0, p0, p1), t2 = tj(t1, p1, p2), t3 = tj(t2, p2, p3);
    idx.push(out.length);
    for (let k = 0; k < samplesPerSeg; k++) {
      const t = t1 + ((t2 - t1) * k) / samplesPerSeg;
      const L = (a: XY, b: XY, ta: number, tb: number): XY => {
        const u = (t - ta) / (tb - ta || 1e-12);
        return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
      };
      const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
      const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
      out.push(L(B1, B2, t1, t2));
    }
  }
  idx.push(out.length);
  out.push({ ...pts[n - 1] });
  return { out, idx };
}

/**
 * Ramer–Douglas–Peucker that keeps at most `maxCount` points. Indices in
 * `keep` are always retained (e.g. named stops), plus both endpoints.
 * Returns the sorted indices of the kept points.
 */
export function simplifyToCount(pts: XY[], maxCount: number, keep: Set<number> = new Set()): number[] {
  const n = pts.length;
  if (n <= Math.max(2, maxCount)) return pts.map((_, i) => i);
  // importance[i] = distance at which point i first becomes necessary.
  const importance = new Float64Array(n);
  importance[0] = importance[n - 1] = Infinity;
  const stack: [number, number, number][] = [[0, n - 1, Infinity]];
  while (stack.length) {
    const [a, b, parent] = stack.pop()!;
    if (b - a < 2) continue;
    const A = pts[a], B = pts[b], dx = B.x - A.x, dy = B.y - A.y, len2 = dx * dx + dy * dy;
    let best = -1, bestD = -1;
    for (let i = a + 1; i < b; i++) {
      const P = pts[i];
      let d: number;
      if (len2 === 0) d = Math.hypot(P.x - A.x, P.y - A.y);
      else {
        const t = Math.max(0, Math.min(1, ((P.x - A.x) * dx + (P.y - A.y) * dy) / len2));
        d = Math.hypot(P.x - (A.x + t * dx), P.y - (A.y + t * dy));
      }
      if (d > bestD) { bestD = d; best = i; }
    }
    const imp = Math.min(parent, bestD);
    importance[best] = imp;
    stack.push([a, best, imp], [best, b, imp]);
  }
  keep.forEach((i) => { if (i >= 0 && i < n) importance[i] = Infinity; });
  const order = Array.from({ length: n }, (_, i) => i).sort((p, q) => importance[q] - importance[p]);
  const forced = order.filter((i) => importance[i] === Infinity).length;
  const chosen = order.slice(0, Math.max(forced, maxCount));
  return chosen.sort((p, q) => p - q);
}

export function smoothstep(x: number): number {
  return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
}

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

/** Ray-casting point in polygon for GeoJSON rings ([lng,lat][]). */
export function pointInRings(lng: number, lat: number, rings: number[][][]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}
