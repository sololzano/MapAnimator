import { gpx as gpxToGeoJSON, kml as kmlToGeoJSON } from '@tmcw/togeojson';
import { simplifyToCount, toMerc } from '../core/geo';
import { rid, type RoutePoint, type TravelMode } from '../core/model';
import type { ParsedTimeline } from './timeline';

export interface RawRoutePoint {
  lat: number; lng: number; t?: number; stop?: boolean; name?: string;
  /** Travel mode of the movement arriving at this point, when known. */
  mode?: TravelMode;
  /** A break before this point (GPX track/segment boundary, skipped travel mode): the leg is hidden. */
  gapBefore?: boolean;
}

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

/** GPX or KML (tracks, routes and waypoints) via togeojson. */
export function parseGpx(text: string, kml = false): RouteImport {
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('That file is not valid XML.');
  const fc = kml ? kmlToGeoJSON(doc) : gpxToGeoJSON(doc);
  const pts: RawRoutePoint[] = [], waypoints: RawRoutePoint[] = [];
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    const props = (f.properties ?? {}) as Record<string, unknown>;
    const times = (props.coordinateProperties as { times?: unknown } | undefined)?.times;
    const lines: number[][][] = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    lines.forEach((line, li) => {
      const tl = Array.isArray(times) ? (Array.isArray(times[0]) ? (times as string[][])[li] : (times as string[])) : undefined;
      // Separate tracks / segments are separate journeys: join them with a hidden leg.
      line.forEach((c, i) => pts.push({ lng: c[0], lat: c[1], t: tl?.[i] ? Date.parse(tl[i]) : undefined, gapBefore: i === 0 && pts.length > 0 ? true : undefined }));
    });
    if (g.type === 'Point') {
      waypoints.push({ lng: g.coordinates[0], lat: g.coordinates[1], name: typeof props.name === 'string' ? props.name : undefined, t: typeof props.time === 'string' ? Date.parse(props.time) : undefined, stop: true });
    }
  }
  // A GPX with only waypoints is itself the route.
  if (pts.length < 2 && waypoints.length >= 2) return { pts: waypoints, waypoints: [] };
  if (pts.length < 2) throw new Error('No track or route found in that file.');
  return { pts, waypoints };
}

/**
 * Reduce to at most `max` editable points, always keeping stops, named points and
 * both ends of every gap. Each kept leg takes the most common travel mode of the raw
 * points it covers, and is hidden when it spans a gap.
 */
export function toRoutePoints(pts: RawRoutePoint[], max: number): RoutePoint[] {
  const keep = new Set<number>();
  pts.forEach((p, i) => {
    if (p.stop || p.name) keep.add(i);
    if (p.gapBefore) { keep.add(i); if (i > 0) keep.add(i - 1); }
  });
  const idx = simplifyToCount(pts.map((p) => toMerc(p.lng, p.lat)), max, keep);
  return idx.map((i, j) => {
    const q: RoutePoint = { id: rid('r'), lng: pts[i].lng, lat: pts[i].lat, name: pts[i].name, time: Number.isFinite(pts[i].t) ? pts[i].t : undefined };
    if (j > 0) {
      const votes = new Map<TravelMode, number>();
      let hidden = false;
      for (let k = idx[j - 1] + 1; k <= i; k++) {
        if (pts[k].gapBefore) hidden = true;
        const m = pts[k].mode;
        if (m && m !== 'other') votes.set(m, (votes.get(m) ?? 0) + 1);
      }
      const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
      if (best) q.mode = best[0];
      if (hidden) q.hidden = true;
    }
    return q;
  });
}

export function shortDate(t?: number): string {
  if (t == null || !Number.isFinite(t)) return '';
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
