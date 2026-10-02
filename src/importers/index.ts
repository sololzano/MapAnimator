import { gpx as gpxToGeoJSON } from '@tmcw/togeojson';
import { simplifyToCount, toMerc } from '../core/geo';
import { rid, type RoutePoint } from '../core/model';
import type { ParsedTimeline } from './timeline';

export interface RawRoutePoint { lat: number; lng: number; t?: number; stop?: boolean; name?: string }

export interface RouteImport {
  /** Full-resolution points; simplified on confirm. */
  pts: RawRoutePoint[];
  /** Named waypoints that are not part of the line (GPX <wpt>). */
  waypoints: RawRoutePoint[];
}

export function parseTimelineFile(file: File): Promise<ParsedTimeline> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./timeline.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e) => { w.terminate(); e.data.ok ? resolve(e.data.result) : reject(new Error(e.data.error)); };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message || 'Could not read that file')); };
    w.postMessage(file);
  });
}

/** GPX (tracks, routes and waypoints) via togeojson. */
export function parseGpx(text: string): RouteImport {
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('That GPX file is not valid XML.');
  const fc = gpxToGeoJSON(doc);
  const pts: RawRoutePoint[] = [], waypoints: RawRoutePoint[] = [];
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    const props = (f.properties ?? {}) as Record<string, unknown>;
    const times = (props.coordinateProperties as { times?: unknown } | undefined)?.times;
    const lines: number[][][] = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    lines.forEach((line, li) => {
      const tl = Array.isArray(times) ? (Array.isArray(times[0]) ? (times as string[][])[li] : (times as string[])) : undefined;
      line.forEach((c, i) => pts.push({ lng: c[0], lat: c[1], t: tl?.[i] ? Date.parse(tl[i]) : undefined }));
    });
    if (g.type === 'Point') {
      waypoints.push({ lng: g.coordinates[0], lat: g.coordinates[1], name: typeof props.name === 'string' ? props.name : undefined, t: typeof props.time === 'string' ? Date.parse(props.time) : undefined, stop: true });
    }
  }
  // A GPX with only waypoints is itself the route.
  if (pts.length < 2 && waypoints.length >= 2) return { pts: waypoints, waypoints: [] };
  if (pts.length < 2) throw new Error('No track or route found in that GPX file.');
  return { pts, waypoints };
}

/** Reduce to at most `max` editable points, always keeping stops and named points. */
export function toRoutePoints(pts: RawRoutePoint[], max: number): RoutePoint[] {
  const keep = new Set<number>();
  pts.forEach((p, i) => { if (p.stop || p.name) keep.add(i); });
  const idx = simplifyToCount(pts.map((p) => toMerc(p.lng, p.lat)), max, keep);
  return idx.map((i) => ({ id: rid('r'), lng: pts[i].lng, lat: pts[i].lat, name: pts[i].name, time: Number.isFinite(pts[i].t) ? pts[i].t : undefined }));
}

export function shortDate(t?: number): string {
  if (t == null || !Number.isFinite(t)) return '';
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
