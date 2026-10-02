// Google Maps Timeline parsers. Pure functions (no DOM) so they can run in a
// worker. Supported:
//  - Android on-device export (2024+):  { semanticSegments: [...], rawSignals: [...] }
//  - iOS on-device export:              [ { startTime, visit | activity | timelinePath } ]
//  - Legacy Takeout Records.json:       { locations: [ { latitudeE7, longitudeE7, timestamp } ] }
//  - Legacy Takeout Semantic history:   { timelineObjects: [ { placeVisit | activitySegment } ] }
//  - Simple JSON:                       [ { lat, lon|lng, time|date, name } ]  (or { points: [...] })

import { haversine } from '../core/geo';

export type SampleKind = 'visit' | 'path' | 'raw';

export interface Sample {
  /** Epoch ms. */
  t: number;
  /** Local calendar day YYYY-MM-DD (from the timestamp's own UTC offset when present). */
  day: string;
  lat: number;
  lng: number;
  kind: SampleKind;
  name?: string;
  /** Travel mode (path and raw samples; inferred from the covering activity when untagged). */
  mode?: TravelMode;
}

export type TravelMode = 'car' | 'walk' | 'bike' | 'bus' | 'train' | 'plane' | 'boat' | 'other';

export const TRAVEL_MODES: [TravelMode, string][] = [
  ['car', 'Car'], ['walk', 'Walking'], ['bike', 'Bike'], ['bus', 'Bus'], ['train', 'Train'],
  ['plane', 'Plane'], ['boat', 'Boat'], ['other', 'Other / unknown'],
];

/** Google activity types (Android IN_PASSENGER_VEHICLE, iOS "in passenger vehicle", Takeout FLYING …) → mode. */
export function modeCategory(raw: unknown): TravelMode {
  const t = typeof raw === 'string' ? raw.toLowerCase().replace(/_/g, ' ') : '';
  if (!t) return 'other';
  if (/fly|plane|air/.test(t)) return 'plane';
  if (/train|subway|tram|rail|metro|underground|cable car|funicular/.test(t)) return 'train';
  if (/bus|coach/.test(t)) return 'bus';
  if (/ferry|boat|sail|kayak|row|surf/.test(t)) return 'boat';
  if (/cycl|bicycl|bike/.test(t)) return 'bike';
  if (/walk|foot|run|hik|jog/.test(t)) return 'walk';
  if (/vehicle|car|taxi|driv|motor|scooter/.test(t)) return 'car';
  return 'other';
}

interface Interval { a: number; b: number; mode: TravelMode }

export interface ParsedTimeline {
  format: 'android' | 'ios' | 'records' | 'semantic' | 'simple';
  samples: Sample[];
  hasSemantic: boolean;
  hasRaw: boolean;
  /** Travel modes present in the file. */
  modes: TravelMode[];
}

/** "48.1234567°, 11.5678901°" | "geo:48.1,11.5" | "48.1,11.5" */
export function parseLatLng(s: unknown): [number, number] | null {
  if (typeof s !== 'string') return null;
  const m = s.replace('geo:', '').replace(/°/g, '').split(',');
  if (m.length < 2) return null;
  const lat = parseFloat(m[0]), lng = parseFloat(m[1]);
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
}

function pad(n: number) { return String(n).padStart(2, '0'); }

function localDay(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** ISO string → [epoch ms, local day]. The day comes from the string itself when it carries an offset. */
export function parseTime(v: unknown): [number, string] | null {
  if (typeof v === 'number') return Number.isFinite(v) ? [v, localDay(v)] : null;
  if (typeof v !== 'string') return null;
  if (/^\d{10,}$/.test(v)) { const n = Number(v); return [n, localDay(n)]; }
  const t = Date.parse(v);
  if (!Number.isFinite(t)) return null;
  if (/^\d{4}-\d\d-\d\d$/.test(v)) return [t, v];
  const hasOffset = /([+-]\d\d:?\d\d|Z)$/.test(v) && !v.endsWith('Z');
  return [t, hasOffset ? v.slice(0, 10) : localDay(t)];
}

const e7 = (v: unknown) => (typeof v === 'number' ? v / 1e7 : NaN);

function push(out: Sample[], when: [number, string] | null, ll: [number, number] | null, kind: SampleKind, extra?: Partial<Sample>) {
  if (!when || !ll) return;
  const [lat, lng] = ll;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
  out.push({ t: when[0], day: when[1], lat, lng, kind, ...extra });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

function parseAndroid(j: J, iv: Interval[]): Sample[] {
  const out: Sample[] = [];
  for (const seg of j.semanticSegments ?? []) {
    const start = parseTime(seg.startTime), end = parseTime(seg.endTime);
    if (seg.visit) {
      const ll = parseLatLng(seg.visit.topCandidate?.placeLocation?.latLng);
      push(out, start, ll, 'visit', { name: seg.visit.topCandidate?.placeName ?? undefined });
      if (end && end[0] !== start?.[0]) push(out, end, ll, 'visit');
    }
    if (seg.activity) {
      const mode = modeCategory(seg.activity.topCandidate?.type);
      if (start && end) iv.push({ a: start[0], b: end[0], mode });
      push(out, start, parseLatLng(seg.activity.start?.latLng), 'path', { mode });
      push(out, end, parseLatLng(seg.activity.end?.latLng), 'path', { mode });
    }
    for (const tp of seg.timelinePath ?? []) push(out, parseTime(tp.time), parseLatLng(tp.point), 'path');
  }
  for (const r of j.rawSignals ?? []) {
    const p = r.position;
    if (p) push(out, parseTime(p.timestamp), parseLatLng(p.LatLng ?? p.latLng), 'raw');
  }
  return out;
}

function parseIOS(arr: J[], iv: Interval[]): Sample[] {
  const out: Sample[] = [];
  for (const seg of arr) {
    const start = parseTime(seg.startTime), end = parseTime(seg.endTime);
    if (seg.visit) {
      const ll = parseLatLng(seg.visit.topCandidate?.placeLocation);
      push(out, start, ll, 'visit');
      if (end) push(out, end, ll, 'visit');
    }
    if (seg.activity) {
      const mode = modeCategory(seg.activity.topCandidate?.type);
      if (start && end) iv.push({ a: start[0], b: end[0], mode });
      push(out, start, parseLatLng(seg.activity.start), 'path', { mode });
      push(out, end, parseLatLng(seg.activity.end), 'path', { mode });
    }
    if (Array.isArray(seg.timelinePath) && start) {
      for (const tp of seg.timelinePath) {
        const off = Number(tp.durationMinutesOffsetFromStartTime ?? 0) * 60000;
        const t = start[0] + off;
        // Keep the segment's own local day unless the offset crosses midnight (approximate with the start offset).
        const day = parseTime(seg.startTime)?.[1] ?? localDay(t);
        push(out, [t, off > 0 ? shiftDay(day, start[0], t) : day], parseLatLng(tp.point), 'path');
      }
    }
  }
  return out;
}

function shiftDay(day: string, t0: number, t1: number): string {
  const days = Math.floor((t1 - t0) / 86400000);
  if (days <= 0) return day;
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function parseRecords(j: J): Sample[] {
  const out: Sample[] = [];
  for (const l of j.locations ?? []) {
    push(out, parseTime(l.timestamp ?? (l.timestampMs ? Number(l.timestampMs) : undefined)), [e7(l.latitudeE7), e7(l.longitudeE7)], 'raw');
  }
  return out;
}

function parseSemantic(j: J, iv: Interval[]): Sample[] {
  const out: Sample[] = [];
  for (const o of j.timelineObjects ?? []) {
    if (o.placeVisit) {
      const v = o.placeVisit, ll: [number, number] = [e7(v.location?.latitudeE7), e7(v.location?.longitudeE7)];
      const name = v.location?.name || v.location?.address?.split(',')[0];
      push(out, parseTime(v.duration?.startTimestamp ?? v.duration?.startTimestampMs), ll, 'visit', { name });
      push(out, parseTime(v.duration?.endTimestamp ?? v.duration?.endTimestampMs), ll, 'visit', { name });
    }
    if (o.activitySegment) {
      const a = o.activitySegment, mode = modeCategory(a.activityType);
      const st = parseTime(a.duration?.startTimestamp ?? a.duration?.startTimestampMs);
      const en = parseTime(a.duration?.endTimestamp ?? a.duration?.endTimestampMs);
      if (st && en) iv.push({ a: st[0], b: en[0], mode });
      push(out, st, [e7(a.startLocation?.latitudeE7), e7(a.startLocation?.longitudeE7)], 'path', { mode });
      const raw = a.simplifiedRawPath?.points ?? [];
      for (const p of raw) push(out, parseTime(p.timestamp ?? p.timestampMs), [e7(p.latE7), e7(p.lngE7)], 'path', { mode });
      const wps = a.waypointPath?.waypoints ?? [];
      if (!raw.length && wps.length && st && en) {
        wps.forEach((w: J, i: number) => {
          const t = st[0] + ((en[0] - st[0]) * (i + 1)) / (wps.length + 1);
          push(out, [t, st[1]], [e7(w.latE7), e7(w.lngE7)], 'path', { mode });
        });
      }
      push(out, en, [e7(a.endLocation?.latitudeE7), e7(a.endLocation?.longitudeE7)], 'path', { mode });
    }
  }
  return out;
}

function parseSimple(arr: J[]): Sample[] {
  const out: Sample[] = [];
  arr.forEach((o, i) => {
    const lat = Number(o.lat ?? o.latitude), lng = Number(o.lon ?? o.lng ?? o.longitude);
    const when = parseTime(o.time ?? o.date ?? o.timestamp) ?? [i * 1000, ''];
    push(out, when, [lat, lng], o.name ? 'visit' : 'path', { name: o.name ?? o.label ?? o.place });
  });
  return out;
}

export function parseTimelineJson(j: J): ParsedTimeline {
  let format: ParsedTimeline['format'];
  let samples: Sample[];
  const iv: Interval[] = [];
  if (j && Array.isArray(j.semanticSegments)) { format = 'android'; samples = parseAndroid(j, iv); }
  else if (j && Array.isArray(j.timelineObjects)) { format = 'semantic'; samples = parseSemantic(j, iv); }
  else if (j && Array.isArray(j.locations)) { format = 'records'; samples = parseRecords(j); }
  else if (Array.isArray(j) && j.some((s) => s && (s.visit || s.activity || s.timelinePath))) { format = 'ios'; samples = parseIOS(j, iv); }
  else {
    const arr = Array.isArray(j) ? j : j?.points ?? j?.timeline ?? j?.stops ?? null;
    if (!Array.isArray(arr)) throw new Error('This JSON is not a Google Timeline export or a list of points.');
    format = 'simple'; samples = parseSimple(arr);
  }
  samples.sort((a, b) => a.t - b.t);
  assignModes(samples, iv);
  const present = new Set(samples.filter((s) => s.kind !== 'visit').map((s) => s.mode ?? 'other'));
  return {
    format, samples,
    hasSemantic: samples.some((s) => s.kind !== 'raw'),
    hasRaw: samples.some((s) => s.kind === 'raw'),
    modes: TRAVEL_MODES.map(([m]) => m).filter((m) => present.has(m)),
  };
}

/** Untagged path/raw samples take the mode of the activity whose time span covers them. */
function assignModes(samples: Sample[], iv: Interval[]) {
  if (!iv.length) return;
  iv.sort((x, y) => x.a - y.a);
  // Sweep: samples and intervals are both time-ordered.
  let k = 0;
  const open: Interval[] = [];
  for (const s of samples) {
    if (s.kind === 'visit' || s.mode) continue;
    while (k < iv.length && iv[k].a <= s.t) open.push(iv[k++]);
    for (let i = open.length - 1; i >= 0; i--) if (open[i].b < s.t) open.splice(i, 1);
    const hit = open.find((x) => x.mode !== 'other') ?? open[0];
    if (hit) s.mode = hit.mode;
  }
}

export interface DayCount { day: string; count: number; visits: number }

export function dayHistogram(samples: Sample[]): DayCount[] {
  const m = new Map<string, DayCount>();
  for (const s of samples) {
    if (!s.day) continue;
    const d = m.get(s.day) ?? { day: s.day, count: 0, visits: 0 };
    d.count++;
    if (s.kind === 'visit') d.visits++;
    m.set(s.day, d);
  }
  return [...m.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
}

export interface Stop { lat: number; lng: number; t: number; day: string; name?: string }

export interface FilteredRoute {
  /** Ordered route positions, with stops marked. */
  pts: { lat: number; lng: number; t: number; day: string; stop: boolean; name?: string }[];
  stops: Stop[];
}

function selectSamples(tl: ParsedTimeline, from: string, to: string, detail: 'clean' | 'raw'): Sample[] {
  const useRaw = detail === 'raw' || !tl.hasSemantic;
  return tl.samples.filter((s) => (!s.day || (s.day >= from && s.day <= to)) && (s.kind !== 'raw' || useRaw));
}

/** Distance travelled per mode within the dates (each leg counts for the mode of its moving end). */
export function modeDistances(tl: ParsedTimeline, from: string, to: string, detail: 'clean' | 'raw'): Map<TravelMode, number> {
  const sel = selectSamples(tl, from, to, detail);
  const out = new Map<TravelMode, number>();
  for (let i = 1; i < sel.length; i++) {
    const a = sel[i - 1], b = sel[i];
    const m = b.kind !== 'visit' ? b.mode ?? 'other' : a.kind !== 'visit' ? a.mode ?? 'other' : null;
    if (!m) continue;
    out.set(m, (out.get(m) ?? 0) + haversine([a.lng, a.lat], [b.lng, b.lat]));
  }
  return out;
}

/**
 * Keep samples whose local day is within [from, to] and build an ordered
 * route. `detail`: 'clean' = visits + paths, 'raw' = adds raw GPS signals.
 * `modes`: travel modes to keep (all when omitted); stops are always kept.
 * Consecutive visits to the same place collapse into one stop.
 */
export function filterTimeline(tl: ParsedTimeline, from: string, to: string, detail: 'clean' | 'raw', modes?: Set<TravelMode>): FilteredRoute {
  const sel = selectSamples(tl, from, to, detail).filter((s) => s.kind === 'visit' || !modes || modes.has(s.mode ?? 'other'));
  const pts: FilteredRoute['pts'] = [];
  const stops: Stop[] = [];
  for (const s of sel) {
    const last = pts[pts.length - 1];
    // Drop exact duplicates and sub-metre jitter.
    if (last && Math.abs(last.lat - s.lat) < 1e-5 && Math.abs(last.lng - s.lng) < 1e-5) {
      if (s.kind === 'visit') { last.stop = true; last.name = last.name ?? s.name; }
      continue;
    }
    pts.push({ lat: s.lat, lng: s.lng, t: s.t, day: s.day, stop: s.kind === 'visit', name: s.name });
  }
  for (const p of pts) if (p.stop) stops.push({ lat: p.lat, lng: p.lng, t: p.t, day: p.day, name: p.name });
  return { pts, stops };
}
