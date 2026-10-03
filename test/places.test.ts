import { describe, expect, it } from 'vitest';
import { buildPlaces } from '../scripts/places';
import { normalize, parsePlaces, placeZoom, searchPlaces } from '../src/core/places';

const ix = parsePlaces(buildPlaces());

describe('offline place search', () => {
  it('normalizes accents, case and punctuation', () => {
    expect(normalize('São Paulo')).toBe('sao paulo');
    expect(normalize('Łódź')).toBe('lodz');
    expect(normalize("St. John's")).toBe('st johns');
  });

  it('ranks the biggest exact match first, ignoring accents', () => {
    const [first] = searchPlaces(ix, 'sao paulo');
    expect(first.name).toBe('São Paulo');
    expect(first.cc).toBe('BR');
    expect(searchPlaces(ix, 'obidos').map((p) => p.cc)).toEqual(expect.arrayContaining(['PT', 'BR']));
  });

  it('narrows by region or country after a comma', () => {
    const [il] = searchPlaces(ix, 'Springfield, Illinois');
    expect(il.region).toBe('Illinois');
    expect(Math.round(il.lat)).toBe(40);
    const pt = searchPlaces(ix, 'Óbidos, Portugal');
    expect(pt.length).toBeGreaterThan(0);
    expect(pt.every((p) => p.cc === 'PT')).toBe(true);
  });

  it('finds prefixes and later words', () => {
    expect(searchPlaces(ix, 'lisb')[0].name).toBe('Lisbon');
    expect(searchPlaces(ix, 'new york')[0].name).toBe('New York City');
    expect(searchPlaces(ix, 'angeles').some((p) => p.name === 'Los Angeles')).toBe(true);
    expect(searchPlaces(ix, '   ')).toEqual([]);
    expect(searchPlaces(ix, 'zzzzqqq')).toEqual([]);
  });

  it('zooms less for bigger places', () => {
    expect(placeZoom(8e6)).toBeLessThan(placeZoom(5e4));
  });
});
