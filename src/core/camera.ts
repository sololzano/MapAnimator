import { TILE, clamp, fromMerc, smoothstep, toMerc } from './geo';
import { logicalSize, type Scene } from './model';
import type { RouteModel } from './route';
import type { TimeMap } from './timing';

/** Camera in logical units: `zoom` is for the logical frame size (short side 720 px). */
export interface CamState {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
}

interface View { x: number; y: number; z: number; b: number; pitch: number }

export const MAX_ZOOM = 17;
const SAMPLE_HZ = 30;

/** Zoom/centre that frames the whole route inside the logical frame (with margins). */
export function autoOverview(route: RouteModel, frame: [number, number]): View {
  const b = route.bounds;
  if (!b) return { x: 0.5, y: 0.42, z: 1.2, b: 0, pitch: 0 };
  const uw = frame[0] * 0.76, uh = frame[1] * 0.72;
  const dx = Math.max(1e-9, b.x1 - b.x0), dy = Math.max(1e-9, b.y1 - b.y0);
  const z = Math.log2(Math.min(uw / (dx * TILE), uh / (dy * TILE)));
  return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, z: clamp(z, 0.5, 14), b: 0, pitch: 0 };
}

/** The overview shot: the custom framing from the Camera step, or an automatic fit of the route. */
export function overview(scene: Scene, route: RouteModel): View {
  const v = scene.cam.view;
  if (!v) return autoOverview(route, logicalSize(scene.ratio));
  const m = toMerc(v.center[0], v.center[1]);
  return { x: m.x, y: m.y, z: v.zoom, b: v.bearing, pitch: v.pitch };
}

/** Zoom levels above the overview at progress p (base zoom + eased keyframes). */
export function zoomAt(cam: Scene['cam'], p: number): number {
  const kn = [{ p: 0, z: cam.zoom }, ...[...cam.kfs].sort((a, b) => a.p - b.p)];
  if (p <= kn[0].p) return kn[0].z;
  for (let i = 0; i < kn.length - 1; i++) {
    if (p < kn[i + 1].p) return kn[i].z + (kn[i + 1].z - kn[i].z) * smoothstep((p - kn[i].p) / (kn[i + 1].p - kn[i].p || 1));
  }
  return kn[kn.length - 1].z;
}

/** How much of the overview shot is blended in at progress p (opening / closing), 0..1. */
export function overviewWeight(c: Scene['cam'], p: number): number {
  if (c.mode === 'overview') return 1;
  return Math.max(c.intro ? 1 - smoothstep(p / 0.12) : 0, c.outro ? smoothstep((p - 0.88) / 0.12) : 0);
}

interface Raw { x: number; y: number; z: number; b: number; pitch: number }

function rawAt(scene: Scene, route: RouteModel, ov: View, p: number): Raw {
  const c = scene.cam;
  if (c.mode === 'overview' || route.S.length < 2) return { ...ov };
  // Follow zoom is relative to the automatic fit, so a custom overview framing doesn't change it.
  const zf = Math.min(MAX_ZOOM, autoOverview(route, logicalSize(scene.ratio)).z + zoomAt(c, p));
  const q = route.pos(Math.min(1, p + (c.ahead / 100) * 0.1));
  const rot = c.orient === 'heading' ? route.heading(p, 0.01 + (c.smooth / 100) * 0.05) : 0;
  const w = overviewWeight(c, p);
  const z = zf + (ov.z - zf) * w;
  // Interpolate the centre in screen-scale space so the target stays put while zooming.
  const sF = 2 ** -zf, sO = 2 ** -ov.z;
  const u = Math.abs(sO - sF) > 1e-12 ? (2 ** -z - sF) / (sO - sF) : w;
  let ob = ov.b;
  while (ob - rot > 180) ob -= 360;
  while (ob - rot < -180) ob += 360;
  return { x: q.x + (ov.x - q.x) * u, y: q.y + (ov.y - q.y) * u, z, b: rot + (ob - rot) * w, pitch: c.tilt + (ov.pitch - c.tilt) * w };
}

function gaussian(src: Float64Array, sigma: number): Float64Array {
  if (sigma < 0.5) return src;
  const r = Math.ceil(sigma * 3), n = src.length, out = new Float64Array(n);
  const k = new Float64Array(2 * r + 1);
  for (let i = -r; i <= r; i++) k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < n; i++) {
    let s = 0, ws = 0;
    for (let j = -r; j <= r; j++) {
      const v = src[Math.min(n - 1, Math.max(0, i + j))];
      s += v * k[j + r]; ws += k[j + r];
    }
    out[i] = s / ws;
  }
  return out;
}

export interface CameraPath { at(t: number): CamState }

const cache = new WeakMap<Scene, CameraPath>();

/**
 * Deterministic camera: the raw path is sampled at a fixed rate of scene time
 * and low-pass filtered once, so preview and export see exactly the same camera
 * regardless of frame rate.
 */
export function buildCameraPath(scene: Scene, route: RouteModel, tm: TimeMap): CameraPath {
  const hit = cache.get(scene);
  if (hit) return hit;
  const ov = overview(scene, route);
  const n = Math.max(2, Math.ceil(tm.T * SAMPLE_HZ) + 1);
  const X = new Float64Array(n), Y = new Float64Array(n), Z = new Float64Array(n), B = new Float64Array(n), P = new Float64Array(n);
  let prevB = 0;
  for (let i = 0; i < n; i++) {
    const r = rawAt(scene, route, ov, tm.progressAt(i / SAMPLE_HZ));
    X[i] = r.x; Y[i] = r.y; Z[i] = r.z; P[i] = r.pitch;
    // Unwrap bearing so smoothing never spins the long way round.
    let b = r.b;
    if (i) { while (b - prevB > 180) b -= 360; while (b - prevB < -180) b += 360; }
    B[i] = prevB = b;
  }
  const s = scene.cam.smooth / 100;
  const sPos = (0.12 + s * 0.5) * SAMPLE_HZ, sRot = (0.25 + s * 2.2) * SAMPLE_HZ;
  const Xs = gaussian(X, sPos), Ys = gaussian(Y, sPos), Zs = gaussian(Z, sPos), Bs = gaussian(B, sRot), Ps = gaussian(P, sPos);
  const path: CameraPath = {
    at(t) {
      const f = clamp(t * SAMPLE_HZ, 0, n - 1), i = Math.min(n - 2, Math.floor(f)), u = f - i;
      const l = (A: Float64Array) => A[i] + (A[i + 1] - A[i]) * u;
      const [lng, lat] = fromMerc(l(Xs), l(Ys));
      return { center: [lng, lat], zoom: l(Zs), bearing: ((l(Bs) % 360) + 540) % 360 - 180, pitch: l(Ps) };
    },
  };
  cache.set(scene, path);
  return path;
}
