import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';
import type { Look } from '../core/model';
import { mapTheme } from './themes';

export const OPENFREEMAP = 'https://tiles.openfreemap.org/planet';
export const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
export const TERRARIUM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const SENTINEL = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg';

export interface StyleOptions {
  /** UI scale: label sizes and line widths are multiplied by this (1 = 720p logical frame). */
  scale: number;
  /** Blob URL of the Natural Earth countries GeoJSON, once loaded. */
  countriesUrl?: string;
  /** Country ids crossed by the route. */
  visited?: string[];
}

/** Credits that must appear on the map and in exported videos. */
export function attributionText(look: Look): string {
  const parts = ['© OpenStreetMap contributors', 'OpenMapTiles', 'OpenFreeMap'];
  if (look.theme === 'satellite') parts.push('Sentinel-2 cloudless by EOX (Copernicus data 2020)');
  if (look.terrain) parts.push('Terrain Tiles (Mapzen, AWS)');
  return parts.join(' · ');
}

export function buildStyle(look: Look, opts: StyleOptions): StyleSpecification {
  const th = mapTheme(look.theme);
  const k = opts.scale;
  const sat = look.theme === 'satellite';
  const z = (...stops: number[]): ExpressionSpecification => {
    const out: (string | number | string[])[] = ['interpolate', ['linear'], ['zoom']];
    for (let i = 0; i < stops.length; i += 2) out.push(stops[i], stops[i + 1] * k);
    return out as unknown as ExpressionSpecification;
  };
  const name: ExpressionSpecification = look.labelLang === 'en'
    ? ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name']]
    : ['coalesce', ['get', 'name'], ['get', 'name:latin']];
  const labelPaint = (color = th.ink) => ({ 'text-color': color, 'text-halo-color': th.halo, 'text-halo-width': 1.4 * k, 'text-halo-blur': 0.5 * k });
  const cls = (...c: string[]): ExpressionSpecification => ['match', ['get', 'class'], c, true, false];

  const sources: StyleSpecification['sources'] = {
    omt: { type: 'vector', url: OPENFREEMAP, attribution: '' },
  };
  const layers: LayerSpecification[] = [{ id: 'bg', type: 'background', paint: { 'background-color': th.land } }];

  if (sat) {
    sources.sat = { type: 'raster', tiles: [SENTINEL], tileSize: 256, maxzoom: 14 };
    layers.push({ id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-fade-duration': 0 } });
  } else {
    layers.push(
      { id: 'wood', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: cls('wood', 'forest'), paint: { 'fill-color': th.wood, 'fill-opacity': 0.7 } },
      { id: 'grass', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: cls('grass', 'farmland', 'wetland'), paint: { 'fill-color': th.park, 'fill-opacity': 0.45 } },
      { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': th.park, 'fill-opacity': 0.75 } },
    );
  }

  if (look.terrain) {
    sources['dem-hill'] = { type: 'raster-dem', tiles: [TERRARIUM], encoding: 'terrarium', tileSize: 256, maxzoom: 15 };
    sources['dem-3d'] = { type: 'raster-dem', tiles: [TERRARIUM], encoding: 'terrarium', tileSize: 256, maxzoom: 15 };
    layers.push({
      id: 'hillshade', type: 'hillshade', source: 'dem-hill',
      paint: {
        'hillshade-exaggeration': Math.min(1, look.relief / 100),
        'hillshade-shadow-color': th.shadow,
        'hillshade-highlight-color': th.dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.55)',
        'hillshade-accent-color': th.shadow,
      },
    });
  }

  if (!sat) {
    layers.push(
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', filter: ['!=', ['get', 'brunnel'], 'tunnel'], paint: { 'fill-color': th.water } },
      { id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway', minzoom: 7, filter: cls('river', 'canal'), paint: { 'line-color': th.water, 'line-width': z(7, 0.6, 14, 3) } },
    );
  }

  if (look.regions !== 'off' && opts.countriesUrl) {
    sources.countries = { type: 'geojson', data: opts.countriesUrl };
    const visited = opts.visited ?? [];
    if (look.regions === 'all') {
      layers.push({
        id: 'regions', type: 'fill', source: 'countries',
        paint: { 'fill-color': ['match', ['%', ['get', 'c'], 6], 0, th.regions[0], 1, th.regions[1], 2, th.regions[2], 3, th.regions[3], 4, th.regions[4], th.regions[5]], 'fill-opacity': sat ? 0.35 : 0.75 },
      });
    }
    layers.push(
      { id: 'visited', type: 'fill', source: 'countries', filter: ['in', ['get', 'id'], ['literal', visited]], paint: { 'fill-color': look.color, 'fill-opacity': 0.16 } },
      { id: 'visited-edge', type: 'line', source: 'countries', filter: ['in', ['get', 'id'], ['literal', visited]], paint: { 'line-color': look.color, 'line-opacity': 0.55, 'line-width': 1.2 * k } },
    );
  }

  if (look.roads) {
    const road = (id: string, classes: string[], minzoom: number, color: string, width: ExpressionSpecification): LayerSpecification => ({
      id, type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom, filter: ['all', cls(...classes), ['!=', ['get', 'brunnel'], 'tunnel']],
      layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': color, 'line-width': width },
    });
    if (!sat) {
      layers.push(
        road('road-casing-major', ['motorway', 'trunk', 'primary'], 6, th.roadCasing, z(6, 1.2, 10, 3, 14, 9, 18, 30)),
        road('road-casing-mid', ['secondary', 'tertiary'], 9, th.roadCasing, z(9, 1, 12, 3, 14, 7, 18, 24)),
      );
    }
    layers.push(
      road('road-minor', ['minor', 'service'], 12, th.roadMinor, z(12, 0.6, 14, 2.5, 18, 14)),
      road('road-mid', ['secondary', 'tertiary'], 9, th.roadMajor, z(9, 0.5, 12, 1.8, 14, 5, 18, 20)),
      road('road-major', ['motorway', 'trunk', 'primary'], 5, th.roadMajor, z(5, 0.4, 10, 1.8, 14, 6.5, 18, 26)),
    );
  }

  if (!sat) {
    layers.push({ id: 'building', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 14, paint: { 'fill-color': th.building, 'fill-opacity': 0.8 } });
  }

  layers.push(
    { id: 'boundary-state', type: 'line', source: 'omt', 'source-layer': 'boundary', minzoom: 4, filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]], paint: { 'line-color': th.boundary, 'line-opacity': 0.5, 'line-dasharray': [2, 2], 'line-width': z(4, 0.6, 10, 1.2) } },
    { id: 'boundary-country', type: 'line', source: 'omt', 'source-layer': 'boundary', filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]], paint: { 'line-color': th.boundary, 'line-opacity': 0.85, 'line-width': z(2, 0.7, 6, 1.3, 12, 2.6) } },
  );

  if (look.labels !== 'off') {
    const all = look.labels === 'all';
    const sym = (id: string, filter: ExpressionSpecification, font: string, size: ExpressionSpecification, extra: Partial<LayerSpecification> = {}, color = th.ink): LayerSpecification => ({
      id, type: 'symbol', source: 'omt', 'source-layer': 'place', filter,
      layout: { 'text-field': name, 'text-font': [font], 'text-size': size, 'text-max-width': 8, 'text-padding': 4 * k },
      paint: labelPaint(color), ...extra,
    } as LayerSpecification);
    layers.push({
      id: 'label-water', type: 'symbol', source: 'omt', 'source-layer': 'water_name', filter: ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false],
      layout: { 'text-field': name, 'text-font': ['Noto Sans Italic'], 'text-size': z(0, 10, 8, 14), 'text-letter-spacing': 0.15, 'text-max-width': 6 },
      paint: labelPaint(th.waterInk),
    });
    if (all) {
      layers.push({
        id: 'label-road', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 13,
        layout: { 'symbol-placement': 'line', 'text-field': name, 'text-font': ['Noto Sans Regular'], 'text-size': z(13, 10, 18, 14) },
        paint: labelPaint(),
      });
      layers.push(sym('label-village', cls('village', 'suburb', 'hamlet'), 'Noto Sans Regular', z(9, 10, 14, 13), { minzoom: 9 } as Partial<LayerSpecification>));
      layers.push(sym('label-state', cls('state'), 'Noto Sans Italic', z(4, 10, 8, 13), { minzoom: 4, maxzoom: 9 } as Partial<LayerSpecification>));
    }
    layers.push(sym('label-town', cls('town'), 'Noto Sans Regular', z(6, 11, 12, 15), { minzoom: all ? 6 : 8 } as Partial<LayerSpecification>));
    layers.push(sym('label-city', cls('city'), 'Noto Sans Bold', z(3, 11, 8, 15, 12, 20), { minzoom: 3 } as Partial<LayerSpecification>));
    layers.push({
      id: 'label-country', type: 'symbol', source: 'omt', 'source-layer': 'place', maxzoom: 8, filter: cls('country'),
      layout: { 'text-field': name, 'text-font': ['Noto Sans Bold'], 'text-size': z(1, 9, 4, 15, 7, 18), 'text-transform': 'uppercase', 'text-letter-spacing': 0.12, 'text-max-width': 7 },
      paint: labelPaint(),
    });
  }

  const style: StyleSpecification = { version: 8, glyphs: GLYPHS, sources, layers };
  if (look.terrain) {
    style.terrain = { source: 'dem-3d', exaggeration: 0.6 + (look.relief / 100) * 1.4 };
    style.sky = { 'sky-color': th.sky, 'horizon-color': th.land, 'fog-color': th.land, 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.8, 'atmosphere-blend': 0 };
  }
  return style;
}
