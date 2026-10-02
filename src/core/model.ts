// Persisted data model. Everything here is plain JSON so a project can be
// stored in IndexedDB and written to a project file unchanged.

export const SCHEMA_VERSION = 1;

export type Ratio = '16:9' | '9:16' | '1:1' | '4:5';
export const RATIOS: Ratio[] = ['16:9', '9:16', '1:1', '4:5'];

export interface RoutePoint {
  id: string;
  lng: number;
  lat: number;
  name?: string;
  /** Epoch milliseconds, when known (GPX / timeline imports). */
  time?: number;
}

export type SignStyle = 'postcard' | 'post' | 'ticket' | 'tag';
export type SignTrigger = 'reach' | 'pause' | 'always';

export interface Sign {
  id: string;
  /** Route point the sign is attached to. The line reaches the sign exactly at that point. */
  pointId: string;
  /** Legacy (pre-0.2) free position; only used to re-attach old signs to their nearest point. */
  lng?: number;
  lat?: number;
  /** Card offset from the point, in logical pixels (720p short side). */
  dx: number;
  dy: number;
  title: string;
  sub: string;
  style: SignStyle;
  /** reach: appears when the line gets there and stays · pause: also holds the line · always: visible from the start. */
  trigger: SignTrigger;
  /** Seconds the line waits when trigger === 'pause'. */
  pause: number;
  size: number;
}

export type MapThemeId = 'latte' | 'frappe' | 'paper' | 'mono' | 'terrain' | 'satellite' | 'night' | 'blueprint';
export type TipKind = 'pulse' | 'dot' | 'arrow' | 'pin' | 'diamond' | 'plane';

export interface Look {
  theme: MapThemeId;
  labels: 'off' | 'cities' | 'all';
  labelLang: 'local' | 'en';
  regions: 'off' | 'visited' | 'all';
  roads: boolean;
  terrain: boolean;
  /** 0..100, hillshade + 3D exaggeration. */
  relief: number;
  color: string;
  width: number;
  style: 'solid' | 'dashed' | 'dotted';
  casing: boolean;
  glow: boolean;
  ghost: boolean;
  tip: TipKind;
  tipSize: number;
  startDot: boolean;
  endDot: boolean;
}

export interface ZoomKeyframe {
  id: string;
  /** Route progress 0..1 the keyframe is pinned to. */
  p: number;
  /** Zoom levels closer than the overview. */
  z: number;
}

export interface CameraSettings {
  mode: 'follow' | 'pan' | 'overview';
  orient: 'north' | 'heading';
  /** Zoom levels closer than the overview (0 = overview, 1 = 2x, 2 = 4x ...). */
  zoom: number;
  /** Look-ahead, 0..40 (% of a tenth of the route). */
  ahead: number;
  /** 0..100 */
  smooth: number;
  /** Pitch in degrees, 0..60. */
  tilt: number;
  intro: boolean;
  outro: boolean;
  kfs: ZoomKeyframe[];
}

export type Resolution = '720p' | '1080p' | '1440p' | '4K';
export type VideoFormat = 'mp4' | 'webm' | 'gif';

export interface ExportSettings {
  /** Speed multiplier for drawing the line. */
  speed: number;
  /** 0..100 ease in/out. */
  ease: number;
  /** Seconds to hold before the line starts / after it ends. */
  pre: number;
  post: number;
  res: Resolution;
  fps: 24 | 30 | 60;
  fmt: VideoFormat;
}

export interface Scene {
  id: string;
  name: string;
  ratio: Ratio;
  smooth: boolean;
  points: RoutePoint[];
  signs: Sign[];
  look: Look;
  cam: CameraSettings;
  exp: ExportSettings;
}

export interface Project {
  schemaVersion: number;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  scenes: Scene[];
}

export function rid(prefix = ''): string {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return prefix + Array.from(a, (b) => (b % 36).toString(36)).join('');
}

export function defaultLook(): Look {
  return {
    theme: 'latte', labels: 'cities', labelLang: 'local', regions: 'off', roads: true, terrain: false, relief: 60,
    color: '#179299', width: 6, style: 'solid', casing: true, glow: false, ghost: true,
    tip: 'pulse', tipSize: 1, startDot: true, endDot: true,
  };
}

export function defaultCamera(): CameraSettings {
  return { mode: 'follow', orient: 'north', zoom: 1.5, ahead: 8, smooth: 50, tilt: 0, intro: true, outro: true, kfs: [] };
}

export function defaultExport(): ExportSettings {
  return { speed: 1, ease: 50, pre: 1, post: 2, res: '1080p', fps: 30, fmt: 'mp4' };
}

export function makeScene(name: string, over: Partial<Scene> = {}): Scene {
  return {
    id: rid('s'), name, ratio: '16:9', smooth: true, points: [], signs: [],
    look: defaultLook(), cam: defaultCamera(), exp: defaultExport(), ...over,
  };
}

export function makeProject(name: string, scenes: Scene[]): Project {
  const now = Date.now();
  return { schemaVersion: SCHEMA_VERSION, id: rid('p'), name, createdAt: now, updatedAt: now, scenes };
}

export function makeSign(pointId: string, over: Partial<Sign> = {}): Sign {
  return {
    id: rid('g'), pointId, dx: 110, dy: -70, title: 'New place', sub: 'Add a note',
    style: 'postcard', trigger: 'pause', pause: 2, size: 1, ...over,
  };
}

/** Delete route point i (inside an Immer recipe). Its signs move to the previous point, or the next one. */
export function removePoint(s: Scene, i: number): void {
  const gone = s.points[i];
  if (!gone) return;
  s.points.splice(i, 1);
  const to = s.points[Math.max(0, i - 1)];
  if (!to) { s.signs = []; return; }
  for (const g of s.signs) if (g.pointId === gone.id) g.pointId = to.id;
}

/** Index of the route point a sign hangs from (legacy signs: nearest point to their old position). */
export function signPointIndex(points: RoutePoint[], g: Sign): number {
  const i = points.findIndex((q) => q.id === g.pointId);
  if (i >= 0 || !points.length) return i;
  if (g.lng == null || g.lat == null) return 0;
  let best = 0, bd = Infinity;
  points.forEach((q, j) => { const d = (q.lng - g.lng!) ** 2 + (q.lat - g.lat!) ** 2; if (d < bd) { bd = d; best = j; } });
  return best;
}

/** Logical layout size per ratio: the short side is always 720 px. Export scales this up. */
export function logicalSize(ratio: Ratio): [number, number] {
  switch (ratio) {
    case '16:9': return [1280, 720];
    case '9:16': return [720, 1280];
    case '1:1': return [720, 720];
    case '4:5': return [720, 900];
  }
}

export function ratioValue(ratio: Ratio): number {
  const [w, h] = logicalSize(ratio);
  return w / h;
}

const SHORT_SIDE: Record<Resolution, number> = { '720p': 720, '1080p': 1080, '1440p': 1440, '4K': 2160 };

/** Output pixel size (always even, as H.264 requires). */
export function outputSize(ratio: Ratio, res: Resolution): [number, number] {
  const [lw, lh] = logicalSize(ratio);
  const k = SHORT_SIDE[res] / Math.min(lw, lh);
  const even = (n: number) => Math.round(n / 2) * 2;
  return [even(lw * k), even(lh * k)];
}

/** A small real-world sample so the app is never empty on first launch. */
export function sampleProject(): Project {
  const pts: [number, number, string?, string?][] = [
    [-9.1393, 38.7223, 'Lisbon', '2025-10-03'], [-9.17, 39.0], [-9.1571, 39.3606, 'Óbidos', '2025-10-04'],
    [-8.95, 39.65], [-8.4103, 40.2033, 'Coimbra', '2025-10-05'], [-8.65, 40.64], [-8.6291, 41.1579, 'Porto', '2025-10-07'],
  ];
  const points: RoutePoint[] = pts.map(([lng, lat, name, d]) => ({
    id: rid('r'), lng, lat, name, time: d ? Date.parse(d + 'T12:00:00Z') : undefined,
  }));
  const s = makeScene('Lisbon → Porto', { points });
  const at = (name: string) => points.find((q) => q.name === name)!.id;
  s.signs = [
    makeSign(at('Lisbon'), { title: 'Lisbon', sub: 'Day 1 · Start', style: 'postcard', dx: 120, dy: 40 }),
    makeSign(at('Óbidos'), { title: 'Óbidos', sub: 'Walled town', style: 'post', trigger: 'reach', dx: -150, dy: -10 }),
    makeSign(at('Coimbra'), { title: 'Coimbra', sub: 'Day 3', style: 'ticket', trigger: 'pause', pause: 1.5, dx: 140, dy: 10 }),
    makeSign(at('Porto'), { title: 'Porto', sub: 'Finish', style: 'tag', pause: 3, dx: 110, dy: -50 }),
  ];
  return makeProject('Portugal Coast Road Trip', [s]);
}
