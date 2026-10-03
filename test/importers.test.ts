import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { kmzToKml, toRoutePoints, type RawRoutePoint } from '../src/importers';

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

describe('kmzToKml', () => {
  const kml = '<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Trip</name></Document></kml>';

  it('returns doc.kml from a KMZ, ignoring images and other layers', () => {
    const kmz = zipSync({ 'images/icon.png': new Uint8Array([137, 80, 78, 71]), 'layer2.kml': strToU8('<kml/>'), 'doc.kml': strToU8(kml) });
    expect(kmzToKml(kmz)).toBe(kml);
  });

  it('falls back to the only KML and explains bad files', () => {
    expect(kmzToKml(zipSync({ 'My trip.kml': strToU8(kml) }))).toBe(kml);
    expect(() => kmzToKml(zipSync({ 'photo.jpg': new Uint8Array([1, 2]) }))).toThrow(/No map data/);
    expect(() => kmzToKml(strToU8('not a zip'))).toThrow(/damaged/);
  });
});
