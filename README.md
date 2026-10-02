# ElChilaquilWasHere

Travel route animations, made entirely in your browser. Draw a route (or import a GPX
or your Google Maps Timeline), dress the map, drop signboards, direct the camera and
export a video. No account, no server, no uploads: everything runs on your machine and
your GPU.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

Production build (static files in `dist/`, deployable to any static host such as Vercel):

```bash
npm run build
npm run preview    # http://localhost:4173
```

Checks:

```bash
npm run typecheck
npm test
```

## How it works

| Step | What you do |
|---|---|
| Projects | Projects live in this browser (IndexedDB). Download one as a `.chilaquil` file to keep it, or open it later from file. |
| 1 · Route | Click to draw, drag points, drag the small circles to insert, right-click/Delete to remove. Import GPX/KML or a Google Timeline JSON and pick the dates and travel modes. Set a travel mode per leg, or hide legs you don't want drawn. |
| 2 · Look | Map theme (Latte, Frappé, Paper, Mono, Terrain, Satellite, Night, Blueprint), labels and language, visited-country shading, roads, 3D terrain, line and marker style. |
| 3 · Signs | Postcard, signpost, ticket and tag signboards hung on route points: pause the line, appear when it arrives, or stay on. Optional on-screen date and distance counters. |
| 4 · Camera | Follow the line or a static overview, framed right on the map (drag, scroll, right-drag). North-up or heading-up, zoom, look-ahead, smoothing, tilt, intro/outro and zoom keyframes. |
| 5 · Export | 720p–4K, 24/30/60 fps; MP4 (H.264), WebM (VP9) or GIF. Export one scene or all of them. Pace, easing and holds live on the timeline bar. |

Supported Google Timeline exports: the new on-device export (Android `Timeline.json` and
iPhone), and the legacy Takeout `Records.json` / `Semantic Location History`. Files are
parsed in a Web Worker on your device.

## Privacy

The only network requests are for public map data: vector tiles and fonts from
OpenFreeMap, elevation tiles from AWS Terrain Tiles (when 3D terrain is on) and
Sentinel‑2 imagery from EOX (when the satellite theme is on). These servers see which map
areas are being viewed, like any web map. A Content-Security-Policy in `index.html`
blocks every other host, so your routes, signs and projects cannot be sent anywhere.

## Credits and licences

Code: MIT. Transport badge icons from Tabler Icons (MIT). Map data © OpenStreetMap contributors (ODbL), OpenMapTiles schema, served by
OpenFreeMap. Terrain: Mapzen Terrain Tiles on AWS. Satellite: Sentinel‑2 cloudless by EOX
IT Services GmbH (contains modified Copernicus Sentinel data 2020, CC BY-NC-SA 4.0, so
**non-commercial use only**). Country shapes: Natural Earth (public domain) via
world-atlas. The required credits are drawn into every exported video.

Built with MapLibre GL JS, Mediabunny, React, Zustand, Dexie and Tailwind CSS.

See [docs/PLAN.md](docs/PLAN.md) for the architecture and roadmap.
