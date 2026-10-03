// Offline place search data, built from GeoNames (CC BY 4.0) at dev/build time:
// all-the-cities (every place with ≥1000 people: name, country, region code, position,
// population) and cities.json (region names). The result is one compact JSON file that
// the app fetches from its own origin the first time someone searches. Searching then
// happens in the browser, so typed place names never leave the device.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import type { Plugin } from 'vite';

interface City { name: string; country: string; featureCode: string; adminCode: string; population?: number; loc: { coordinates: [number, number] } }

// Historical, abandoned or destroyed places only confuse a search box.
const SKIP = new Set(['PPLH', 'PPLQ', 'PPLW']);

export function buildPlaces(): string {
  const require = createRequire(import.meta.url);
  const cities = require('all-the-cities') as City[];
  const admin1 = require('cities.json/admin1.json') as { code: string; name: string }[];
  const adminName = new Map(admin1.map((a) => [a.code, a.name]));
  const admins: string[] = [], adminIdx = new Map<string, number>();
  const rows = cities
    .filter((c) => !SKIP.has(c.featureCode) && c.name)
    .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
    .map((c) => {
      const region = adminName.get(`${c.country}.${c.adminCode}`) ?? (c.country === 'US' ? c.adminCode : '');
      let ai = '';
      if (region && region !== c.name) {
        if (!adminIdx.has(region)) { adminIdx.set(region, admins.length); admins.push(region); }
        ai = adminIdx.get(region)!.toString(36);
      }
      const [lng, lat] = c.loc.coordinates;
      return [c.name.replace(/[\t\n]/g, ' '), c.country, ai, +lat.toFixed(3), +lng.toFixed(3), (c.population ?? 0).toString(36)].join('\t');
    });
  return JSON.stringify({
    source: 'GeoNames (CC BY 4.0, geonames.org) via all-the-cities and cities.json',
    admins,
    rows: rows.join('\n'),
  });
}

/** `import placesUrl from 'virtual:places'`: the URL of the generated file. */
export function placesPlugin(): Plugin {
  const ID = 'virtual:places', RID = '\0' + ID, DEV_PATH = '/@places.json';
  let data: string | null = null, serve = false;
  const get = () => (data ??= buildPlaces());
  return {
    name: 'elchilaquil-places',
    configResolved(config) { serve = config.command === 'serve'; },
    resolveId: (id) => (id === ID ? RID : undefined),
    load(id) {
      if (id !== RID) return;
      if (serve) return `export default ${JSON.stringify(DEV_PATH)};`;
      const source = get();
      const fileName = `assets/places-${createHash('sha256').update(source).digest('hex').slice(0, 8)}.json`;
      this.emitFile({ type: 'asset', fileName, source });
      // The app is built with base './' and only uses hash routes, so this resolves next to index.html.
      return `export default ${JSON.stringify(fileName)};`;
    },
    configureServer(server) {
      server.middlewares.use(DEV_PATH, (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(get());
      });
    },
  };
}
