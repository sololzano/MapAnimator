import { describe, expect, it } from 'vitest';
import { formatDate, formatDistance, hudItems, timeAt } from '../src/core/hud';
import { makeScene, makeSign, type RoutePoint } from '../src/core/model';
import { runtime } from '../src/core/runtime';

const day = (d: string) => new Date(d + 'T12:00:00').getTime();
const pts: RoutePoint[] = [
  { id: 'a', lng: 0, lat: 0, time: day('2025-10-03') },
  { id: 'b', lng: 1, lat: 0 },
  { id: 'c', lng: 2, lat: 0, time: day('2025-10-05') },
];

describe('on-screen counters', () => {
  it('interpolates the date between dated points and holds at the ends', () => {
    const s = makeScene('d', { points: pts, smooth: false });
    const r = runtime(s).route;
    expect(timeAt(s, r, 0)).toBe(day('2025-10-03'));
    expect(timeAt(s, r, 0.5)).toBeCloseTo(day('2025-10-04'), -3);
    expect(timeAt(s, r, 1)).toBe(day('2025-10-05'));
  });
  it('formats day counts, dates and distances', () => {
    expect(formatDate(day('2025-10-05'), day('2025-10-03'), 'day')).toBe('Day 3');
    expect(formatDistance(4321, 'km')).toBe('4.3 km');
    expect(formatDistance(296_800, 'km')).toBe('296 km');
    expect(formatDistance(16_093.44, 'mi')).toBe('10 mi');
  });
  it('freezes during a sign pause and is empty when off', () => {
    const s = makeScene('h', { points: pts, smooth: false });
    s.signs = [makeSign('b', { trigger: 'pause', pause: 3 })];
    expect(hudItems(s, runtime(s).route, 0.5)).toEqual([]);
    const on = { ...s, hud: { ...s.hud, date: true, distance: true } };
    const rt = runtime(on);
    const t0 = rt.tm.timeAtP(0.5);
    const a = hudItems(on, rt.route, rt.tm.progressAt(t0 + 0.5));
    const b = hudItems(on, rt.route, rt.tm.progressAt(t0 + 2.5));
    expect(a.map((x) => x.value)).toEqual(b.map((x) => x.value));
    expect(a.map((x) => x.label)).toEqual(['Date', 'Distance']);
  });
});
