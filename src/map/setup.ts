// MapLibre 6 locates its worker relative to its own module URL, which breaks
// once Vite bundles it. Point it at a worker chunk Vite builds for us.
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(workerUrl);
