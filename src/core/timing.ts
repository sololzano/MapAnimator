import { clamp } from './geo';
import { paceSpeed, signPointIndex, type Scene } from './model';
import type { RouteModel } from './route';

/**
 * Seconds to draw the whole line at speed ×1, from the route itself:
 *  - distance, on a gentle power curve (5 km ≈ 8 s, 300 km ≈ 19 s, 5000 km ≈ 33 s),
 *  - how winding it is (path length vs. its bounding box),
 *  - how many points it has (each one is a place worth seeing).
 */
export function autoTravel(route: RouteModel, nPoints: number): number {
  if (route.S.length < 2 || !route.bounds) return 2;
  const km = Math.max(0.05, route.M[route.M.length - 1] / 1000);
  const b = route.bounds;
  const diag = Math.hypot(b.x1 - b.x0, b.y1 - b.y0) || route.L;
  const winding = clamp(Math.sqrt(route.L / diag), 1, 1.8);
  const perPoint = 0.2 * Math.min(Math.max(0, nPoints - 2), 75);
  return clamp(6 * km ** 0.2 * winding + perPoint, 3, 120);
}
/** Seconds a sign takes to fade/pop in. */
export const SIGN_IN = 0.5;

export interface Pause { id: string; p: number; dur: number }

export interface TimeMap {
  /** Total scene duration, seconds. */
  T: number;
  pre: number;
  post: number;
  travel: number;
  pauses: Pause[];
  /** Route progress 0..1 at scene time t. */
  progressAt(t: number): number;
  /** Scene time at which the line reaches progress p. */
  timeAtP(p: number): number;
  /** Draw time at speed ×1 (the automatic, distance-based duration). */
  auto: number;
  /** Progress at which each sign triggers, by sign id. */
  signP: Map<string, number>;
}

const cache = new WeakMap<Scene, TimeMap>();

export function buildTimeMap(scene: Scene, route: RouteModel): TimeMap {
  const hit = cache.get(scene);
  if (hit) return hit;
  const e = scene.exp, k = e.ease / 100;
  const ease = (u: number) => (1 - k) * u + k * u * u * (3 - 2 * u);
  const inv = (p: number) => {
    let a = 0, b = 1;
    for (let i = 0; i < 30; i++) { const m = (a + b) / 2; if (ease(m) < p) a = m; else b = m; }
    return (a + b) / 2;
  };
  const auto = autoTravel(route, scene.points.length);
  const travel = route.S.length > 1 ? Math.max(1, auto / Math.max(0.05, paceSpeed(e))) : 2;
  const signP = new Map<string, number>();
  for (const g of scene.signs) {
    const i = signPointIndex(scene.points, g);
    signP.set(g.id, i >= 0 ? route.pointP[i] ?? 0 : 0);
  }
  const pauses = scene.signs
    .filter((g) => g.trigger === 'pause')
    .map((g) => ({ id: g.id, p: signP.get(g.id)!, dur: Math.max(0, g.pause) }))
    .sort((a, b) => a.p - b.p);
  const held = pauses.reduce((a, q) => a + q.dur, 0);
  const T = e.pre + travel + held + e.post;

  const progressAt = (t: number) => {
    const tau = t - e.pre;
    if (tau <= 0) return 0;
    let acc = 0;
    for (const q of pauses) {
      const st = inv(q.p) * travel + acc;
      if (tau < st) break;
      if (tau < st + q.dur) return q.p;
      acc += q.dur;
    }
    return Math.min(1, ease(Math.min(1, (tau - acc) / travel)));
  };
  const timeAtP = (p: number) => {
    let acc = 0;
    for (const q of pauses) if (q.p < p - 1e-9) acc += q.dur;
    return e.pre + inv(p) * travel + acc;
  };
  const tm: TimeMap = { T, pre: e.pre, post: e.post, travel, auto, pauses, progressAt, timeAtP, signP };
  cache.set(scene, tm);
  return tm;
}

/** Sign visibility 0..1 at time t (signs never leave once shown). */
export function signVisibility(trigger: Scene['signs'][number]['trigger'], tReach: number, t: number): number {
  if (trigger === 'always') return 1;
  const x = (t - tReach + 0.001) / SIGN_IN;
  return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
}

export function formatTime(t: number): string {
  const m = Math.floor(t / 60), s = t - m * 60;
  return String(m).padStart(2, '0') + ':' + s.toFixed(1).padStart(4, '0');
}
