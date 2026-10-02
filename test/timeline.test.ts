import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dayHistogram, filterTimeline, parseLatLng, parseTimelineJson } from '../src/importers/timeline';

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
});
