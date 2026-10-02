// On-screen counters (date and distance travelled). Pure functions of progress p,
// so the counters freeze during sign pauses and match exactly between preview and export.
import type { HudSettings, Scene } from './model';
import type { RouteModel } from './route';

interface Known { p: number; t: number }

const cache = new WeakMap<Scene['points'], Known[]>();

/** Points that carry a time, in route order (by progress). */
export function knownTimes(scene: Scene, route: RouteModel): Known[] {
  let k = cache.get(scene.points);
  if (!k) {
    k = scene.points
      .map((q, i) => ({ p: route.pointP[i] ?? 0, t: q.time }))
      .filter((x): x is Known => x.t != null && Number.isFinite(x.t));
    cache.set(scene.points, k);
  }
  return k;
}

/** Time at progress p: interpolated between the dated points around it, held before the first and after the last. */
export function timeAt(scene: Scene, route: RouteModel, p: number): number | null {
  const k = knownTimes(scene, route);
  if (!k.length) return null;
  if (p <= k[0].p) return k[0].t;
  for (let i = 1; i < k.length; i++) {
    if (p <= k[i].p) {
      const f = (p - k[i - 1].p) / (k[i].p - k[i - 1].p || 1);
      return k[i - 1].t + (k[i].t - k[i - 1].t) * f;
    }
  }
  return k[k.length - 1].t;
}

function dayIndex(t: number): number {
  const d = new Date(t);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

export function formatDate(t: number, first: number, style: HudSettings['dateStyle']): string {
  const date = new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const day = `Day ${dayIndex(t) - dayIndex(first) + 1}`;
  return style === 'date' ? date : style === 'day' ? day : `${day} · ${new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

export function formatDistance(metres: number, units: HudSettings['units']): string {
  const v = units === 'mi' ? metres / 1609.344 : metres / 1000;
  const n = v < 10 ? v.toFixed(1) : Math.floor(v).toLocaleString();
  return `${n} ${units}`;
}

export interface HudItem { label: string; value: string; /** Widest value this item will show, to keep the card from resizing. */ widest: string }

/** What the counters read at progress p (empty when disabled or no data). */
export function hudItems(scene: Scene, route: RouteModel, p: number): HudItem[] {
  const h = scene.hud, out: HudItem[] = [];
  if (h.date) {
    const k = knownTimes(scene, route);
    const t = timeAt(scene, route, p);
    if (t != null) {
      const first = k[0].t, last = k[k.length - 1].t;
      const cands = [first, last, ...k.map((x) => x.t)].map((x) => formatDate(x, first, h.dateStyle));
      out.push({ label: 'Date', value: formatDate(t, first, h.dateStyle), widest: cands.reduce((a, b) => (b.length > a.length ? b : a)) });
    }
  }
  if (h.distance && route.S.length > 1) {
    out.push({ label: 'Distance', value: formatDistance(route.metresAt(p), h.units), widest: formatDistance(route.metresAt(1), h.units) });
  }
  return out;
}
