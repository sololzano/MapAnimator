import { buildCameraPath, type CameraPath } from './camera';
import type { Scene } from './model';
import { buildRoute, type RouteModel } from './route';
import { buildTimeMap, signVisibility, type TimeMap } from './timing';

export interface SceneRuntime {
  route: RouteModel;
  tm: TimeMap;
  camera: CameraPath;
}

/** All derived data for a scene. Each piece is memoised on immutable inputs. */
export function runtime(scene: Scene): SceneRuntime {
  const route = buildRoute(scene.points, scene.smooth);
  const tm = buildTimeMap(scene, route);
  return { route, tm, camera: buildCameraPath(scene, route, tm) };
}

export interface FrameState {
  t: number;
  /** Route progress 0..1. */
  p: number;
  /** Visibility per sign id (0..1). */
  signs: Map<string, number>;
}

/** The pure "what is on screen at time t" function shared by preview and export. */
export function evaluate(scene: Scene, rt: SceneRuntime, t: number): FrameState {
  const p = rt.tm.progressAt(t);
  const signs = new Map<string, number>();
  for (const g of scene.signs) signs.set(g.id, signVisibility(g.trigger, rt.tm.timeAtP(rt.tm.signP.get(g.id) ?? 0), t));
  return { t, p, signs };
}
