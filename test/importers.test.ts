import { describe, expect, it } from 'vitest';
import { toRoutePoints, type RawRoutePoint } from '../src/importers';

describe('toRoutePoints', () => {
  it('keeps gap ends, hides the gap leg and votes the leg mode', () => {
    const pts: RawRoutePoint[] = [];
    for (let i = 0; i < 50; i++) pts.push({ lng: i * 0.01, lat: Math.sin(i / 5) * 0.01, mode: 'moto' });
    for (let i = 0; i < 50; i++) pts.push({ lng: 5 + i * 0.01, lat: 0, mode: 'walk', gapBefore: i === 0 ? true : undefined });
    const out = toRoutePoints(pts, 10);
    expect(out.length).toBeLessThanOrEqual(12);
    const hidden = out.filter((q) => q.hidden);
    expect(hidden).toHaveLength(1);
    expect(hidden[0].lng).toBeCloseTo(5, 6);
    expect(out[1].mode).toBe('moto');
    expect(out[out.length - 1].mode).toBe('walk');
  });
});
