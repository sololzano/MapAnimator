import { describe, expect, it } from 'vitest';
import { simplifyToCount, toMerc, fromMerc } from '../src/core/geo';
import { makeScene, makeSign, normalizeScene, outputSize, removePoint, signPointIndex, type RoutePoint, type Scene } from '../src/core/model';
import { buildRoute } from '../src/core/route';
import { buildTimeMap } from '../src/core/timing';
import { buildCameraPath } from '../src/core/camera';
import { evaluate, runtime } from '../src/core/runtime';

const pts = (c: [number, number][]): RoutePoint[] => c.map(([lng, lat], i) => ({ id: 'p' + i, lng, lat }));

describe('geo', () => {
  it('round-trips mercator', () => {
    const m = toMerc(-8.61, 41.15);
    const [lng, lat] = fromMerc(m.x, m.y);
    expect(lng).toBeCloseTo(-8.61, 9);
    expect(lat).toBeCloseTo(41.15, 9);
  });
  it('simplifies to a budget but keeps forced points and endpoints', () => {
    const line = Array.from({ length: 500 }, (_, i) => ({ x: i, y: Math.sin(i / 20) * 10 }));
    const kept = simplifyToCount(line, 30, new Set([250]));
    expect(kept.length).toBeLessThanOrEqual(30);
    expect(kept).toContain(0);
    expect(kept).toContain(499);
    expect(kept).toContain(250);
  });
});

describe('timing', () => {
  const scene = makeScene('t', { points: pts([[0, 0], [1, 0], [2, 0]]) });
  scene.exp = { ...scene.exp, pre: 1, post: 2, speed: 1, ease: 0 };
  it('holds before and after, draws linearly with ease 0', () => {
    const tm = buildTimeMap(scene, buildRoute(scene.points, false));
    expect(tm.progressAt(0.5)).toBe(0);
    expect(tm.progressAt(1 + tm.travel / 2)).toBeCloseTo(0.5, 3);
    expect(tm.progressAt(tm.T - 0.5)).toBe(1);
    expect(tm.T).toBeCloseTo(1 + tm.travel + 2, 6);
  });
  it('pauses the line at a pausing sign', () => {
    const s2 = { ...scene, signs: [makeSign('p1', { trigger: 'pause', pause: 3 })] };
    const tm = buildTimeMap(s2, buildRoute(s2.points, false));
    const tReach = tm.timeAtP(0.5);
    expect(tm.progressAt(tReach + 1)).toBeCloseTo(0.5, 3);
    expect(tm.progressAt(tReach + 2.9)).toBeCloseTo(0.5, 3);
    expect(tm.progressAt(tReach + 3.5)).toBeGreaterThan(0.5);
    expect(tm.T).toBeCloseTo(1 + tm.travel + 3 + 2, 6);
  });
});

describe('camera', () => {
  it('is deterministic and frames the route at the start when intro is on', () => {
    const scene = makeScene('c', { points: pts([[-9.14, 38.72], [-8.41, 40.2], [-8.63, 41.16]]) });
    const rt = runtime(scene);
    const a = rt.camera.at(0.5), b = buildCameraPath(scene, rt.route, rt.tm).at(0.5);
    expect(a).toEqual(b);
    const mid = rt.camera.at(rt.tm.T / 2);
    expect(mid.zoom).toBeGreaterThan(a.zoom); // zoomed in while following
  });
  it('heading-up camera rotates toward travel direction', () => {
    const scene = makeScene('h', { points: pts([[0, 0], [0, 1], [0, 2]]), smooth: false });
    scene.cam = { ...scene.cam, orient: 'heading', intro: false, outro: false };
    const rt = runtime(scene);
    expect(Math.abs(rt.camera.at(rt.tm.T / 2).bearing)).toBeLessThan(1); // due north
    const east = makeScene('e', { points: pts([[0, 0], [1, 0], [2, 0]]), smooth: false });
    east.cam = { ...east.cam, orient: 'heading', intro: false, outro: false };
    const re = runtime(east);
    expect(re.camera.at(re.tm.T / 2).bearing).toBeCloseTo(90, 0);
  });
});

describe('frame', () => {
  it('reveals signs after the line reaches them', () => {
    const scene = makeScene('f', { points: pts([[0, 0], [1, 0], [2, 0]]) });
    scene.signs = [makeSign('p1', { trigger: 'reach' })];
    const rt = runtime(scene);
    const id = scene.signs[0].id;
    expect(evaluate(scene, rt, 0).signs.get(id)).toBe(0);
    expect(evaluate(scene, rt, rt.tm.T).signs.get(id)).toBe(1);
  });
  it('output sizes are even and match the ratio', () => {
    expect(outputSize('16:9', '1080p')).toEqual([1920, 1080]);
    expect(outputSize('9:16', '4K')).toEqual([2160, 3840]);
    expect(outputSize('4:5', '1080p')).toEqual([1080, 1350]);
  });
});

describe('signs attached to points', () => {
  it('trigger exactly at their point, even on a curved route', () => {
    const scene = makeScene('s', { points: pts([[0, 0], [1, 1], [2, 0], [3, 1]]) });
    scene.signs = [makeSign('p2', { trigger: 'pause', pause: 2 })];
    const rt = runtime(scene);
    expect(rt.tm.signP.get(scene.signs[0].id)).toBeCloseTo(rt.route.pointP[2], 9);
    const t = rt.tm.timeAtP(rt.route.pointP[2]);
    expect(rt.tm.progressAt(t + 1)).toBeCloseTo(rt.route.pointP[2], 6);
  });
  it('move to the previous point when their point is deleted', () => {
    const scene = makeScene('d', { points: pts([[0, 0], [1, 0], [2, 0]]) });
    scene.signs = [makeSign('p1'), makeSign('p0')];
    removePoint(scene, 1);
    expect(scene.signs.map((g) => g.pointId)).toEqual(['p0', 'p0']);
    removePoint(scene, 0);
    expect(scene.signs.map((g) => g.pointId)).toEqual(['p2', 'p2']);
    removePoint(scene, 0);
    expect(scene.signs).toEqual([]);
  });
  it('legacy free-position signs attach to the nearest point', () => {
    const points = pts([[0, 0], [5, 5], [10, 0]]);
    expect(signPointIndex(points, { ...makeSign(''), lng: 4.6, lat: 5.2 })).toBe(1);
  });
});

describe('distance-based timing', () => {
  const line = (km: number, n = 3): RoutePoint[] => {
    const deg = km / 111.2;
    return pts(Array.from({ length: n }, (_, i) => [(deg * i) / (n - 1), 0] as [number, number]));
  };
  it('longer trips take longer, but not proportionally', () => {
    const t = (km: number) => runtime(makeScene('x', { points: line(km), smooth: false })).tm.auto;
    expect(t(5)).toBeGreaterThan(5);
    expect(t(300)).toBeGreaterThan(t(5));
    expect(t(5000)).toBeGreaterThan(t(300));
    expect(t(5000) / t(5)).toBeLessThan(10);
  });
  it('more points make a longer clip', () => {
    const a = runtime(makeScene('a', { points: line(100, 3), smooth: false })).tm.auto;
    const b = runtime(makeScene('b', { points: line(100, 30), smooth: false })).tm.auto;
    expect(b).toBeGreaterThan(a);
  });
  it('pace presets scale the drawing time', () => {
    const s = makeScene('p', { points: line(100), smooth: false });
    const normal = runtime(s).tm.travel;
    const slow = runtime({ ...s, exp: { ...s.exp, pace: 'slow' } }).tm.travel;
    const custom = runtime({ ...s, exp: { ...s.exp, pace: 'custom', speed: 2 } }).tm.travel;
    expect(slow).toBeGreaterThan(normal);
    expect(custom).toBeCloseTo(normal / 2, 6);
  });
});

describe('camera framing & migration', () => {
  it('overview mode holds the custom view exactly', () => {
    const s = makeScene('o', { points: pts([[0, 0], [1, 1], [2, 0]]) });
    s.cam = { ...s.cam, mode: 'overview', view: { center: [10, 20], zoom: 5, bearing: 30, pitch: 40 } };
    const c = runtime(s).camera.at(3);
    expect(c.center[0]).toBeCloseTo(10, 6);
    expect(c.center[1]).toBeCloseTo(20, 6);
    expect(c.zoom).toBeCloseTo(5, 6);
    expect(c.bearing).toBeCloseTo(30, 6);
    expect(c.pitch).toBeCloseTo(40, 6);
  });
  it('migrates old pan-mode cameras and speed-only timing', () => {
    const s = makeScene('m', { points: pts([[0, 0], [1, 0]]) });
    const old = { ...s, cam: { ...s.cam, mode: 'pan', view: undefined }, exp: { ...s.exp, pace: undefined, speed: 1.5 } } as unknown as Scene;
    const n = normalizeScene(old);
    expect(n.cam.mode).toBe('follow');
    expect(n.cam.view).toBeNull();
    expect(n.exp.pace).toBe('custom');
  });
});
