// Offline place search over the GeoNames list built by scripts/places.ts.
// Pure functions: parsing and matching run in the browser (and in tests).

export interface Place { name: string; region: string; cc: string; country: string; lat: number; lng: number; pop: number }

export interface PlaceIndex {
  name: string[]; key: string[]; cc: string[]; admin: Int32Array; lat: Float32Array; lng: Float32Array; pop: Float64Array;
  admins: string[]; adminKeys: string[];
}

const FOLD: Record<string, string> = { ł: 'l', ø: 'o', ß: 'ss', æ: 'ae', œ: 'oe', đ: 'd', ð: 'd', þ: 'th', ı: 'i', ħ: 'h' };

/** Lowercase, no accents or punctuation: "São Paulo" → "sao paulo", "St. John's" → "st johns". */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[łøßæœđðþıħ]/g, (c) => FOLD[c]).replace(/[.'’`]/g, '').replace(/\s+/g, ' ');
}

export function parsePlaces(json: string): PlaceIndex {
  const data = JSON.parse(json) as { admins: string[]; rows: string };
  const lines = data.rows.split('\n'), n = lines.length;
  const ix: PlaceIndex = {
    name: new Array(n), key: new Array(n), cc: new Array(n), admin: new Int32Array(n),
    lat: new Float32Array(n), lng: new Float32Array(n), pop: new Float64Array(n),
    admins: data.admins, adminKeys: data.admins.map(normalize),
  };
  for (let i = 0; i < n; i++) {
    const [name, cc, a, lat, lng, pop] = lines[i].split('\t');
    ix.name[i] = name;
    ix.key[i] = normalize(name);
    ix.cc[i] = cc;
    ix.admin[i] = a ? parseInt(a, 36) : -1;
    ix.lat[i] = +lat;
    ix.lng[i] = +lng;
    ix.pop[i] = parseInt(pop, 36) || 0;
  }
  return ix;
}

const namers = new Map<string, Intl.DisplayNames | null>();
function regionName(cc: string, locale: string): string {
  if (!namers.has(locale)) {
    try { namers.set(locale, new Intl.DisplayNames([locale, 'en'], { type: 'region' })); } catch { namers.set(locale, null); }
  }
  try { return namers.get(locale)?.of(cc) ?? cc; } catch { return cc; }
}

/** Country name in the viewer's language (falls back to English, then the ISO code). */
export function countryName(cc: string, locale = typeof navigator !== 'undefined' ? navigator.language : 'en'): string {
  return regionName(cc, locale);
}

function matchesFilter(ix: PlaceIndex, i: number, f: string): boolean {
  const cc = ix.cc[i];
  if (f.length === 2 && cc.toLowerCase() === f) return true;
  if (normalize(countryName(cc)).startsWith(f) || normalize(regionName(cc, 'en')).startsWith(f)) return true;
  const a = ix.admin[i];
  return a >= 0 && (ix.adminKeys[a].startsWith(f) || ix.adminKeys[a] === f);
}

function place(ix: PlaceIndex, i: number): Place {
  const a = ix.admin[i];
  return { name: ix.name[i], region: a >= 0 ? ix.admins[a] : '', cc: ix.cc[i], country: countryName(ix.cc[i]), lat: ix.lat[i], lng: ix.lng[i], pop: ix.pop[i] };
}

/**
 * Best matches for "Porto" or "Springfield, Illinois": exact names first, then names
 * starting with the text, then names with a word starting with it ("york" → New York).
 * Rows are sorted by population, so each group is already ranked.
 */
export function searchPlaces(ix: PlaceIndex, query: string, limit = 8): Place[] {
  const [head, ...rest] = query.split(',');
  const q = normalize(head).trim(), f = normalize(rest.join(',')).trim();
  if (!q) return [];
  const exact: number[] = [], prefix: number[] = [], word: number[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < ix.key.length && exact.length < limit; i++) {
    const k = ix.key[i];
    const bucket = k === q ? exact : k.startsWith(q) ? (prefix.length < limit ? prefix : null)
      : word.length < limit && (k.includes(' ' + q) || k.includes('-' + q)) ? word : null;
    if (!bucket || (f && !matchesFilter(ix, i, f))) continue;
    // Skip near-duplicates (the same town listed twice, e.g. as a city and a district).
    const id = k + '|' + ix.admin[i] + '|' + ix.cc[i];
    if (seen.has(id)) continue;
    seen.add(id);
    bucket.push(i);
  }
  return [...exact, ...prefix, ...word].slice(0, limit).map((i) => place(ix, i));
}

/** A comfortable map zoom for a place: big cities need less zoom to fill the view. */
export function placeZoom(pop: number): number {
  return pop >= 5e6 ? 9 : pop >= 1e6 ? 10 : pop >= 1e5 ? 11 : pop >= 1e4 ? 12 : 13;
}

/** "Illinois, United States" (or just the country). */
export function placeDetail(p: Place): string {
  return p.region ? `${p.region}, ${p.country}` : p.country;
}
