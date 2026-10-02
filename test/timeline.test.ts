import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dayHistogram, filterTimeline, modeCategory, modeDistances, parseLatLng, parseTimelineJson } from '../src/importers/timeline';

const fx = (n: string) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));

describe('google timeline parsers (synthetic fixtures)', () => {
  it('parses lat/lng strings in every flavour', () => {
    expect(parseLatLng('48.1234567°, 11.5678901°')).toEqual([48.1234567, 11.5678901]);
    expect(parseLatLng('geo:48.1,11.5')).toEqual([48.1, 11.5]);
  });
  it('android on-device export', () => {
    const tl = parseTimelineJson(fx('timeline-android.json'));
    expect(tl.format).toBe('android');
    expect(tl.hasSemantic && tl.hasRaw).toBe(true);
    expect(dayHistogram(tl.samples).map((d) => d.day)).toEqual(['2025-10-03', '2025-10-04']);
    const r = filterTimeline(tl, '2025-10-03', '2025-10-03', 'clean');
    expect(r.stops.length).toBeGreaterThanOrEqual(2);
    expect(r.pts.every((p) => p.day === '2025-10-03')).toBe(true);
  });
  it('iOS export', () => {
    const tl = parseTimelineJson(fx('timeline-ios.json'));
    expect(tl.format).toBe('ios');
    expect(tl.samples.length).toBeGreaterThan(3);
  });
  it('legacy Records.json and Semantic history', () => {
    const rec = parseTimelineJson(fx('records.json'));
    expect(rec.format).toBe('records');
    expect(rec.samples[0].lat).toBeCloseTo(38.7223, 4);
    const sem = parseTimelineJson(fx('semantic.json'));
    expect(sem.format).toBe('semantic');
    expect(sem.samples.some((s) => s.name === 'Óbidos Castle')).toBe(true);
  });
  it('rejects unrelated JSON', () => {
    expect(() => parseTimelineJson({ hello: 'world' })).toThrow();
  });
  it('maps Google activity types to travel modes', () => {
    expect(modeCategory('IN_PASSENGER_VEHICLE')).toBe('car');
    expect(modeCategory('in passenger vehicle')).toBe('car');
    expect(modeCategory('WALKING')).toBe('walk');
    expect(modeCategory('IN_SUBWAY')).toBe('train');
    expect(modeCategory('FLYING')).toBe('plane');
    expect(modeCategory('IN_FERRY')).toBe('boat');
    expect(modeCategory('CYCLING')).toBe('bike');
    expect(modeCategory('MOTORCYCLING')).toBe('moto');
    expect(modeCategory('on a motorcycle')).toBe('moto');
    expect(modeCategory('UNKNOWN_ACTIVITY_TYPE')).toBe('other');
  });
  it('untagged path points inherit the mode of the activity covering them', () => {
    const tl = parseTimelineJson(fx('timeline-android.json'));
    expect(tl.modes).toEqual(['car', 'train']);
    const pathPts = tl.samples.filter((s) => s.kind === 'path' && s.day === '2025-10-03');
    expect(pathPts.every((s) => s.mode === 'car')).toBe(true);
    expect(tl.samples.find((s) => s.kind === 'raw')!.mode).toBe('car');
  });
  it('filters legs by travel mode but keeps stops', () => {
    const tl = parseTimelineJson(fx('timeline-android.json'));
    const all = filterTimeline(tl, '2025-10-03', '2025-10-04', 'clean');
    const noCar = filterTimeline(tl, '2025-10-03', '2025-10-04', 'clean', new Set(['train']));
    expect(noCar.pts.length).toBeLessThan(all.pts.length);
    expect(noCar.pts.some((q) => q.gapBefore)).toBe(true);
    expect(all.pts.some((q) => q.gapBefore)).toBe(false);
    expect(noCar.stops.length).toBe(all.stops.length);
    const d = modeDistances(tl, '2025-10-03', '2025-10-04', 'clean');
    expect(d.get('car')! / 1000).toBeGreaterThan(50);
    expect(d.get('train')! / 1000).toBeGreaterThan(80);
  });
});
