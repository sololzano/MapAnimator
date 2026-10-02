// Natural Earth country polygons (public domain, via the world-atlas package),
// bundled with the app so "visited countries" needs no network lookup.
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { pointInRings } from '../core/geo';

interface Country { id: string; bbox: [number, number, number, number]; polys: number[][][][] }

let loading: Promise<{ url: string; countries: Country[] }> | null = null;

export function loadCountries() {
  loading ??= (async () => {
    const [{ feature }, topo] = await Promise.all([import('topojson-client'), import('world-atlas/countries-50m.json')]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = (topo as any).default ?? topo;
    const fc = feature(t, t.objects.countries) as unknown as FeatureCollection<Polygon | MultiPolygon>;
    const countries: Country[] = [];
    fc.features.forEach((f: Feature<Polygon | MultiPolygon>, i) => {
      const id = String(f.id ?? i);
      f.properties = { id, c: i, name: f.properties?.name };
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
      for (const p of polys) for (const [x, y] of p[0]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      countries.push({ id, bbox: [x0, y0, x1, y1], polys });
    });
    const url = URL.createObjectURL(new Blob([JSON.stringify(fc)], { type: 'application/json' }));
    return { url, countries };
  })();
  return loading;
}

/** Ids of the countries a route passes through (sampled). */
export function visitedCountries(countries: Country[], ll: [number, number][]): string[] {
  const out = new Set<string>();
  const step = Math.max(1, Math.floor(ll.length / 400));
  for (let i = 0; i < ll.length; i += step) {
    const [lng, lat] = ll[i];
    for (const c of countries) {
      if (out.has(c.id) || lng < c.bbox[0] || lng > c.bbox[2] || lat < c.bbox[1] || lat > c.bbox[3]) continue;
      if (c.polys.some((rings) => pointInRings(lng, lat, rings))) out.add(c.id);
    }
  }
  return [...out].sort();
}
