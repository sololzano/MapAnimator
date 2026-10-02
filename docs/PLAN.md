# ElChilaquilWasHere: Implementation Plan

> **Status (2026-10-02):** v0.1 implemented, following `design/Wayline.dc.html` with
> Catppuccin Latte/Frappé + Teal and Inter. Done: projects page, `.chilaquil` files,
> editor shell, all five steps, Google Timeline (4 formats) and GPX/KML import,
> deterministic preview, and MP4/WebM/GIF export (single and batch). See "Deviations"
> at the end for what changed from this plan.

An open source, free, **100% client-side** web app for making travel route animations.
Everything (parsing, editing, rendering, video encoding) runs in the user's browser on
their own CPU/GPU. There is no backend, no account, and no upload.

---

## 1. Guiding principles

1. **Local-first, zero server.** The app is a static bundle (HTML/JS/CSS). Node.js is used
   only for tooling (dev server, build, tests). The same `dist/` folder runs from
   `npm run preview` locally or from Vercel/GitHub Pages/Cloudflare Pages as static hosting.
2. **Nothing leaves the machine except tile requests.** The only network traffic is
   fetching public map tiles, glyphs, and sprites by `{z}/{x}/{y}`. Track data, photos, and
   projects are never sent anywhere. This is enforced with a strict Content-Security-Policy
   (see §10), not just promised.
3. **WYSIWYG and deterministic.** The animation is a *pure function of time*:
   `evaluateScene(scene, t) → frameState`. Preview playback and export call the same
   function, so the exported video matches the preview frame for frame.
4. **Easy by default, flexible on demand.** Every step has sensible auto settings ("Auto
   camera", "Auto speed", "Auto signs from stops"). Advanced controls sit behind
   disclosure sections and never block the happy path:
   *import → look preset → export* should work in under a minute.

---

## 2. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Build / dev | **Vite** + **TypeScript** (Node 24) | Fast, static output, trivial to deploy |
| UI framework | **React 19** | Largest ecosystem for the editor-style UI (timeline, panels, dnd) |
| State | **Zustand** + **Immer** (+ `zundo` for undo/redo) | Simple global store, structural patches enable undo |
| UI primitives | **Radix UI** (headless) + own components | Accessible popovers, sliders, menus, dialogs, tabs |
| Styling | **Tailwind CSS v4** with Catppuccin tokens from **`@catppuccin/palette`** | Theme = CSS variables; Latte/Frappé switch is one attribute |
| Icons | **Lucide** (ISC) for UI; **Maki** (CC0) + **Tabler** (MIT) for map symbols | All open licenses, bundled locally |
| Fonts | **@fontsource** (Inter for UI; a few OFL display fonts for signboards) | Bundled, so no Google Fonts requests |
| Map | **MapLibre GL JS v5** | WebGL2 GPU rendering, terrain, hillshade, globe, sky |
| Vector tiles | **OpenFreeMap** (OpenMapTiles schema, OSM data) | Free, no API key, CORS-enabled |
| Terrain / hillshade | **AWS Terrain Tiles** (Terrarium encoding) | Free, global DEM |
| Satellite (optional) | **EOX Sentinel-2 cloudless** | Free with attribution, non-commercial terms on newer vintages |
| Country polygons | **Natural Earth** admin-0/admin-1 (public domain), bundled | OpenMapTiles has boundary *lines* only, and filling visited countries needs polygons |
| Video | **Mediabunny** (WebCodecs) | Hardware encoding where available, MP4/WebM muxing in the browser |
| Geo math | **@turf/*** (selected modules), own spline/arc code | Distances, bearings, along-line, simplification |
| GPX/KML | **@tmcw/togeojson** | Robust GPX/KML → GeoJSON |
| Storage | **Dexie** (IndexedDB) | Projects, scenes, blobs (photos), thumbnails |
| Project files | **fflate** (zip) + **zod** (schema validation) | `.mapanim` export/import, safe parsing of untrusted files |
| Workers | **Comlink** + Web Workers | Parsing huge Google exports and geometry prep off the UI thread |
| Routing | **TanStack Router** or React Router, hash history | Works on any static host without rewrites |
| Tests | **Vitest** (core logic), **Playwright** (E2E incl. a tiny export) | |
| PWA (later) | `vite-plugin-pwa` | App shell works offline; tiles cached opportunistically |

**License suggestion:** MIT for the code. Dependencies: MapLibre BSD-3, Mediabunny MPL-2.0,
Dexie Apache-2.0, Radix MIT. All compatible. Data licenses (ODbL, CC-BY) require
attribution (see §3).

---

## 3. Map data sources, URLs, and attribution

| Layer | Source URL (template) | Attribution / terms |
|---|---|---|
| Vector styles | `https://tiles.openfreemap.org/styles/{liberty,bright,positron}` (+ dark variants where available) | "© OpenMapTiles © OpenStreetMap contributors" (ODbL) and "OpenFreeMap" |
| Glyphs / sprites | Provided by the OpenFreeMap style JSON | same |
| Terrain DEM | `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`, `encoding: "terrarium"`, maxzoom 15 | Mapzen / AWS Terrain Tiles, with source credits per their docs |
| Satellite | `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg` | "Sentinel-2 cloudless, s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2020)". **2018+ vintages are CC BY-NC-SA 4.0 (non-commercial).** The 2016 vintage is CC BY 4.0. Show this in the UI when satellite is selected. |
| Country fills | Natural Earth 1:50m, simplified, bundled as GeoJSON (or PMTiles) | Public domain |

**Attribution in the video.** Exported videos get a small, unobtrusive attribution line
(position and opacity are configurable). It is on by default, and for satellite it can't
be turned off. An "Attributions" panel lists everything used.

**Terrain + hillshade:** use two separate `raster-dem` sources pointing at the same URL
(MapLibre recommends against sharing one source between terrain and hillshade).

**Satellite + labels ("Hybrid")** = Sentinel raster layer under the OpenMapTiles symbol
layers taken from the Liberty style.

---

## 4. Data model (persisted, versioned)

```ts
// core/model/types.ts (sketch)
type ID = string;                       // nanoid
type LngLat = [number, number];

interface Project {
  id: ID; name: string; schemaVersion: number;
  createdAt: number; updatedAt: number;
  sceneOrder: ID[];
  thumbnail?: BlobRef;                  // small PNG for the Projects page
}

interface Scene {
  id: ID; projectId: ID; name: string;
  aspect: '16:9' | '9:16' | '1:1' | '4:5' | '21:9';
  route: Route;            // Step 1
  look: Look;              // Step 2
  signs: Sign[];           // Step 3
  overlays: Overlay[];     // Step 3 (screen-space: title card, date ticker, distance)
  camera: CameraTrack;     // Step 4
  timing: Timing;          // Step 5 (speed, holds, easing)
  export: ExportSettings;  // Step 5
}

interface Route {
  waypoints: Waypoint[];             // ordered stops/vertices the user sees and edits
  segments: Segment[];               // between waypoints[i] and waypoints[i+1]
}
interface Waypoint {
  id: ID; pos: LngLat; time?: number;   // epoch ms (from GPX/Timeline)
  kind: 'stop' | 'via';                 // stop = visit/place; via = shape point
  label?: string;
}
interface Segment {
  id: ID;
  mode: 'auto' | 'walk' | 'bike' | 'car' | 'bus' | 'train' | 'boat' | 'plane';
  shape: 'straight' | 'spline' | 'arc' | 'track';
  track?: { coords: LngLat[]; times?: number[] };   // dense imported geometry for shape='track'
  splineHandles?: [LngLat, LngLat];                 // Bézier handles for shape='spline'
  styleOverride?: Partial<RouteStyle>;
  hidden?: boolean;                                  // e.g. hide GPS noise
}
```

Derived (never persisted, computed in a worker and memoized):

```ts
interface RouteGeometry {
  coords: LngLat[];          // densified final polyline (splines/arcs sampled)
  cumMerc: Float64Array;     // cumulative Web-Mercator length (matches MapLibre line-progress)
  cumMeters: Float64Array;   // geodesic distance, used by the distance counter
  segIndex: Uint32Array;     // which Segment each vertex belongs to
  waypointProgress: number[];// 0..1 progress of each waypoint along the line
}
```

`schemaVersion` + a `migrations/` folder so old `.mapanim` files keep opening.

---

## 5. Screens and UI

### 5.1 Theme

- **Catppuccin Frappé** (dark, default) and **Catppuccin Latte** (light), toggled in the
  Menu, following the OS by default. Accent: **Teal** (Frappé `#81c8be`, Latte `#179299`).
- Tokens: `--bg: base`, `--panel: mantle`, `--chrome: crust` (top bar / title strip),
  `--surface: surface0/1`, `--text: text`, `--muted: subtext0/overlay1`, `--accent: teal`,
  `--danger: red`, `--warn: peach`.
- Like the reference screenshot: dense 12–13px UI text, thin 1px `surface0` dividers,
  filled teal primary button with `crust`-colored text, teal underline for the active
  tab, ghost icon buttons in toolbars, muted helper text.
- Bonus: two **map themes named Catppuccin Latte / Frappé**, generated by recoloring the
  Positron style's layers at runtime, so the map matches the app.

### 5.2 Projects page (Step 0, `#/`)

```
┌ ☰ Menu ─ MapAnimator ──────────────────────────────── [⭳ Import project] [+ New project] ┐
│ ⚠ Storage is temporary in this browser (private window?). Download projects to keep them. │
│ ┌────────┐ ┌────────┐ ┌────────┐                                         Sort ▾  Search  │
│ │ thumb  │ │ thumb  │ │ thumb  │   Each card: thumbnail, name, #scenes, last edited, size  │
│ │ Japan  │ │ Alps   │ │ Peru   │   ⋯ menu: Open · Rename · Duplicate · Download · Delete │
│ └────────┘ └────────┘ └────────┘                                                          │
│ Storage used: 48 MB of ~2 GB  [Request persistent storage]                               │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

- **New project** → name dialog → opens the editor with one empty scene at Step 1.
- **Download** → `<name>.mapanim` (a zip of `project.json` plus `assets/` photos and icons).
- **Import project** → file picker or drag-and-drop; validated with zod and migrated.
- **Delete** → confirm dialog. Deletion is permanent, so offer "Download first".
- Private mode detection: `navigator.storage.persisted()` is false or the quota is tiny, so
  show the warning banner. Call `navigator.storage.persist()` on first project creation.

### 5.3 Editor (`#/p/:projectId/s/:sceneId/:step`)

```
┌ ☰ │ [Scene 1 ×] [Scene 2 ×] [+] │   ① Route  ② Look  ③ Signs  ④ Camera  ⑤ Export   │ 16:9 ▾ │ ● Saved │ [Export ▾] ┐
├──────────────────┬─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ LEFT SIDEBAR     │ map toolbar: [select][add point][insert][delete] │ [fit route][safe area][grid] │ zoom 25%     │
│ (step options +  ├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│  selection       │                                                                                                 │
│  properties)     │            MAP, letterboxed to the scene aspect ratio, outside area dimmed                        │
│                  │            (reference-resolution canvas, see §8.3)                                              │
│ ~300px,          │                                                                                                 │
│ scrollable,      ├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ collapsible      │      ⏮  ▶  ⏭   ⟲ loop      00:07.20 / 00:24.00                         preview quality ▾      │
│ sections         ├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│                  │ ↶ ↷ │ 0s     5s     10s     15s     20s     (playhead, scrubbable, zoomable)                   │
│                  │ Line   ▓▓▓▓▓▓▓▓▓▓▓░░▓▓▓▓▓▓▓▓▓░░░▓▓▓▓▓▓▓   (░ = pause holds at signs)                         │
│                  │ Signs        ◆           ◆        ◆                                                             │
│                  │ Camera [follow──────][fit──][follow──────────]  ◇ keyframes                                     │
└──────────────────┴─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Top bar:** Menu (theme, projects, attributions, about), scene tabs (rename by
  double-click, reorder by drag, right-click to duplicate or delete), step switcher
  (always freely navigable, not a locked wizard), aspect ratio, save status, Export
  split-button (export this scene / export all scenes), and an export queue badge.
- **Left sidebar:** options for the current step at the top, then a **Selection**
  section (selected waypoint, segment, sign, or camera keyframe). This replaces the
  right-hand inspector from the reference screenshot so the layout stays as specified.
- **Center:** the map in a frame matching the export aspect ratio. Map tools change by step.
- **Bottom bar:** transport controls plus a multi-track timeline: **Line** (progress with
  holds), **Signs** (event markers), **Camera** (mode blocks and keyframes). Drag a block
  edge to change a duration, drag a sign marker to move its trigger.
- Keyboard: `Space` play/pause, `Del` delete selection, `Ctrl+Z / Ctrl+Shift+Z`, `1–5`
  switch step, `F` fit route, `←/→` step a frame.
- Autosave: debounced (500ms) writes to IndexedDB, plus a "Saved" indicator.

---

## 6. The five steps in detail

### Step 1: Route

**Sources (all parsed in a Web Worker):**

1. **Manual drawing.** "Add point" tool: click to append, click on a line to insert,
   drag to move, `Del` or right-click to delete. Midpoint handles insert vertices. Per
   segment you can pick a **shape**: straight, smooth spline (Catmull-Rom by default,
   switchable to Bézier with draggable handles), or **great-circle arc** (flights). You
   can also pick a **mode** (walk/car/train/boat/plane...), which drives the tip icon and
   auto-camera zoom.
2. **GPX import** (also KML/GeoJSON for free via togeojson). Multiple tracks or segments
   become route segments; `<wpt>` elements become stops. Track times are kept.
3. **Google Maps Timeline JSON.** Format auto-detection:
   - **New on-device export (Android, 2024+)**: `Timeline.json` with `semanticSegments[]`
     (`visit`, `activity.topCandidate.type`, `timelinePath[{point:"lat°, lng°", time}]`)
     and `rawSignals[]`.
   - **iOS export**: top-level array with `visit` / `activity` / `timelinePath`, and
     points as `"geo:lat,lng"` plus minute offsets.
   - **Legacy Takeout**: `Records.json` (`locations[]` with `latitudeE7`/`longitudeE7`)
     and `Semantic Location History/YYYY/YYYY_MONTH.json` (`activitySegment`, `placeVisit`).

   **Date selection UX:** after the file is parsed, show a **calendar heatmap** of days
   that have data, with a date-range picker plus quick picks ("last trip" = longest
   cluster of away-from-home days). Live counts show "3 visits, 12 activities, 4,210 points".
   **Detail level:** *Clean* (visits + activity paths), *Detailed* (adds raw signals), or
   *Stops only* (straight hops between visits). Activity types map to modes automatically
   (`FLYING` → plane arc, `IN_TRAIN` → train...). Timezone offsets in the file are used so
   the filter matches the user's local trip days.

   Large files (100+ MB) are read with `File.stream()` in the worker; progress is shown;
   the UI never freezes.

**Cleanup tools:** simplify (Douglas-Peucker with a slider showing the vertex count),
remove GPS spikes (speed outlier filter), merge consecutive stops within N meters,
reverse route, split or join segments.

**Editing dense tracks:** imported tracks are shown simplified for editing; dragging a
vertex re-fits the local portion. "Convert to editable" turns a track segment into a spline.

**Implementation:** a custom editor on MapLibre GeoJSON layers plus pointer events
(vertices, midpoints, and handles as circle layers; hit-testing via `queryRenderedFeatures`).
I considered Terra Draw, but our spline/arc/segment model fits better with a small
custom tool. All edits go through store actions, so undo/redo works.

**Auto labels without the cloud:** suggest a stop's label from the nearest OpenMapTiles
`place` feature already in the loaded tiles (`queryRenderedFeatures` around the point).
No geocoding service is needed. An online place search (Photon/Nominatim) is optional,
**off by default**, and comes with a clear notice.

### Step 2: Look

- **Map theme presets:** Liberty, Bright, Positron, Dark, Catppuccin Latte, Catppuccin
  Frappé, Satellite, Hybrid. Each preset has an **edit** section: water, land, roads,
  park colors (simple recolor of layer groups), and a saturation/brightness slider.
- **Labels:** toggle place / road / POI / water labels, label density, language
  (`name:xx` with a `name` fallback), font size scale.
- **Regions:** borders (country/state) on/off and style; **highlight visited countries**
  (auto from route via point-in-polygon on Natural Earth, or pick manually) with fill
  color and opacity; dim everything else.
- **3D:** terrain on/off and exaggeration, hillshade intensity and color, 3D buildings
  (fill-extrusion from the `building` layer), globe projection at low zoom, sky/fog/atmosphere.
- **Route style:** color, width, casing/outline, glow, opacity, dashed, gradient along the
  route, line cap; **ghost route** (the full route shown faintly ahead of the drawn line);
  per-mode style defaults (for example, dashed for flights); per-segment overrides.
- **Markers:** start dot, end marker, stop dots (style and size), **tip symbol**: dot,
  arrow, auto-by-mode transport icon (rotates with heading), emoji, or a custom image upload.
  Optional pulse animation on the tip.

All style changes apply live via `setPaintProperty` / `setLayoutProperty` (no full style
reload) except base-theme switches.

### Step 3: Signs (and screen overlays)

- **Signboard templates** (rendered with Canvas2D so the same code serves preview and export):
  pin + label, card with photo, location stamp, wooden signpost, speech bubble, flag
  banner, date stamp, emoji badge. Each one has title, subtitle, date, optional photo
  (stored locally as a Blob, downscaled to 2048px on import), color, font, and scale.
- **Anchoring:** *on route* (snaps to the nearest route progress value) or *free* (any
  map location, with an optional leader line to a point).
- **Behavior / keyframe** (per sign):
  - Appear: **when the line reaches it** / at a specific time / from the start.
  - On reach: **continue** or **pause the line for X seconds** (creates a hold on the
    Line track).
  - Optional **camera focus** during the pause (zoom in / orbit), which links to Step 4.
  - Disappear: after Y seconds / when the next sign appears / never.
  - Entry and exit animation: pop, fade, drop, slide; duration.
- **Auto signs:** "Create signs from stops" in one click (uses visits from Google
  Timeline or GPX waypoints, with auto labels from §Step 1).
- **Screen overlays** (screen-space, not map-anchored): title card / intro text, live
  **date ticker** (when the route has timestamps), **distance counter** (km/mi), a
  progress bar, a watermark logo, and the attribution line.

### Step 4: Camera

Camera = an ordered list of **camera blocks** on the Camera track, each with a mode and
parameters, plus optional explicit keyframes. Transitions between blocks are smoothed
automatically.

| Mode | Behavior |
|---|---|
| **Follow** | Centers on the line tip with a configurable look-ahead and screen offset; zoom fixed, or **auto by speed** (zooms out for flights and in for walks) |
| **Fit** | Frames a route portion or the whole route with padding (good for intro and outro) |
| **Static** | Fixed view; the line draws through it |
| **Fly-to** | Smooth zoom-and-pan (van Wijk & Nuij, the same math as MapLibre `flyTo`) between two views, written as a pure function of t |
| **Orbit** | Rotates bearing around a point (great with terrain at a sign pause) |
| **Keyframes** | User sets the view at times with "Capture current view"; eased interpolation |

Per block: **bearing**: north-up / follow route heading / fixed / slow drift; **pitch**
(0–85°); **smoothing** (0–100). Heading-follow uses a smoothed heading over a
look-ahead window so the map does not jitter on noisy GPS.

**Smoothing is deterministic:** the raw camera path is sampled at a fixed rate
(e.g. 120 Hz of scene time), filtered (Gaussian / critically damped spring simulated at
fixed dt, with bearing unwrapped before filtering), and cached. `camera(t)` interpolates
the cached samples. The result is identical in preview and export and does not depend
on frame rate.

**Presets** for easy use: "Classic (fit → follow → fit)", "Cinematic 3D follow",
"Overview only", "Drone orbit at stops".

### Step 5: Preview and export

**Timing (affects the Line track):**
- Speed model: **total duration** (e.g. 20s), **constant speed** (map px/s), **per
  segment**, or **by day** (each day of the trip gets equal time; pairs nicely with the
  date ticker).
- Easing: linear / ease in-out / slow-down near stops.
- Holds: before start (s), after end (s), and sign pauses (from Step 3).
- Mode-aware: optionally compress long flights so they don't dominate.

**Export settings:** resolution (720p / 1080p / 1440p / 4K, with the shape following the
aspect ratio), frame rate (24/25/30/50/60), format (**MP4 H.264** default for
compatibility; WebM VP9/AV1; HEVC when the browser can encode it), quality/bitrate,
optional **motion blur** (N sub-frames averaged, which is slower but smoother), and an
optional **music track** (local audio file muxed via Mediabunny, with fade out at the end).

Codec availability is probed with Mediabunny's `canEncodeVideo` /
`getFirstEncodableVideoCodec`; unsupported options are disabled with an explanation.

**Batch:** "Export all scenes" queues them; with the File System Access API (Chromium)
the user picks a folder once and each scene is written directly to disk; otherwise each
file downloads in turn.

---

## 7. Animation engine (core, framework-free, unit-tested)

```
SceneData ──(worker)──▶ RouteGeometry ─┐
Timing + Signs ───────▶ TimeMap ───────┼─▶ evaluateScene(scene, t) ─▶ FrameState
CameraTrack ──────────▶ CameraPath ────┘
```

- **TimeMap** converts scene time `t` into route progress `p ∈ [0,1]`. It is built as a
  piecewise function: pre-roll hold → drawing segments (speed model + easing) → holds at
  pausing signs → post-roll hold. It also exposes `progressToTime` so the timeline can
  position sign markers.
- **FrameState** = `{ progress, tip: {pos, heading, mode}, camera: {center, zoom, bearing, pitch},
  signs: [{id, visibility 0..1, animPhase}], overlays: {...}, date?, distance? }`.
- Everything in `core/` is plain TypeScript with no DOM or MapLibre imports, so it is
  covered by fast Vitest tests (e.g. "pause sign at 40% holds progress for 2s").

---

## 8. Rendering

### 8.1 Drawing the route line

- One GeoJSON source with `lineMetrics: true` holding the full densified route.
- The **reveal** uses `line-gradient` with a `step` on `line-progress`:
  `['step', ['line-progress'], color, p, 'rgba(0,0,0,0)']`, updated per frame via
  `setPaintProperty`. This is cheap on the GPU, with no re-tiling. Progress is measured
  in Web-Mercator length (`cumMerc`), which matches how MapLibre computes `line-progress`.
- **Ghost route** = a second layer with the full line at low opacity.
- **Dashed styles** can't combine with `line-gradient`, so dashed segments fall back to
  `setData` with the sliced geometry (fine at export pace, and acceptable in preview).
- Tip, start, end, and stop markers are a small GeoJSON point source updated per frame
  (icon rotation = heading), using SDF icons so color is themeable.

### 8.2 Signs and overlays

HTML markers are **not** captured in the WebGL canvas, so signs and overlays are drawn by
a **Canvas2D compositor** shared by preview and export:

- Preview: a transparent 2D canvas stacked over the map, redrawn on each map `render` event.
- Export: map canvas → `drawImage` onto the output canvas, then the same overlay draw
  calls on top.
- Screen positions come from `map.project(lngLat)` (terrain-aware). Sign bitmaps are
  pre-rendered and cached per sign and rerendered only when the content changes.

### 8.3 Resolution-independent framing (WYSIWYG)

Each aspect ratio has a **reference logical size** (16:9 → 1920×1080 CSS px, 9:16 →
1080×1920, etc.). The map is always laid out at that logical size, so zoom levels, label
sizes, and line widths mean the same thing everywhere:

- **Export:** container is the reference size, `pixelRatio = outputWidth / refWidth`
  (4K → 2), giving a crisp 4K render with identical framing.
- **Preview:** container is the reference size with `pixelRatio < 1`, scaled to fit with
  CSS `transform: scale()`. *(Spike: verify MapLibre pointer mapping under a CSS scale;
  fallback: size the container to the fit and add `log2(fitWidth/refWidth)` to zoom.)*

### 8.4 Export pipeline

```ts
const output = new Output({ format: new Mp4OutputFormat(), target });   // StreamTarget → file, or BufferTarget
const video  = new CanvasSource(outCanvas, { codec, bitrate, latencyMode: 'quality' });
output.addVideoTrack(video, { frameRate: fps });
if (music) output.addAudioTrack(audioSource);
await output.start();

await warmTiles(scene);                         // dry-run the camera path, prefetch tiles into cache
for (let i = 0; i < totalFrames; i++) {
  const t = i / fps;
  const s = evaluateScene(scene, t);
  applyFrameState(map, s);                      // jumpTo + setPaintProperty + setData
  await mapSettled(map);                        // render + areTilesLoaded() (+ DEM), timeout fallback
  compositor.draw(outCtx, map.getCanvas(), s);  // map + signs + overlays + attribution
  await video.add(t, 1 / fps);                  // WebCodecs encode (HW when available)
  progress(i / totalFrames);                    // UI: progress bar, ETA, cancel
}
await output.finalize();
```

- Rendering happens in a dedicated **offscreen MapLibre instance** (hidden container,
  `preserveDrawingBuffer: true`, `fadeDuration: 0` so symbols don't fade in, and
  `maxTileCacheSize` raised), so the editor stays usable.
- **Not real-time:** each frame waits until its tiles are loaded, so there is never a
  blurry frame in the output. A tile cache in the Service Worker (Cache API) makes
  re-exports and batch exports much faster.
- Output goes to disk via `showSaveFilePicker` + `StreamTarget` when available (no RAM
  limit for long 4K videos), otherwise to a Blob download.

---

## 9. Storage

- **Dexie DB** tables: `projects`, `scenes` (one row per scene, so saves are small),
  `assets` (Blobs: photos, custom icons, music), `thumbnails`, `settings`.
- `.mapanim` file = zip: `manifest.json` (app version, schemaVersion), `project.json`,
  `scenes/*.json`, `assets/*`. Import validates every file with zod and re-IDs on
  collision ("Import as copy").
- Raw imported source files (GPX/Timeline) are **not** stored by default; only the
  filtered route is kept (privacy plus size). Optional "keep source" checkbox for re-filtering.
- Quota awareness via `navigator.storage.estimate()`, shown on the Projects page.

---

## 10. Privacy and security

- **CSP** (meta tag + Vercel headers): `connect-src 'self' https://tiles.openfreemap.org
  https://s3.amazonaws.com https://tiles.maps.eox.at` (plus optional geocoder only when
  enabled), `img-src 'self' blob: data: ...`, `worker-src 'self' blob:`. Uploading user
  data is then impossible even by mistake or through a malicious dependency.
- No analytics, no telemetry, no cookies, no third-party fonts.
- An honest "Privacy" note in the app: tile servers see which map areas you view (like any
  web map). Planned **offline mode**: load a local `.pmtiles` extract (Protomaps) and a
  local DEM, after which nothing leaves the machine at all.
- Untrusted inputs (project zips, GPX, JSON) are parsed in workers and schema-validated.
  User text is only ever drawn on canvas or set as `textContent`, never as `innerHTML`.
- Repo hygiene: `.gitignore` already blocks `*.gpx` and `data/`. Add
  `Timeline*.json`, `Records.json`, `*.mapanim`. Test fixtures are **synthetic** files under
  `test/fixtures/`.

---

## 11. Project structure

```
MapAnimator/
├─ index.html
├─ vite.config.ts · tsconfig.json · vercel.json (headers/CSP)
├─ public/                      # bundled geodata (Natural Earth), sprites, icons
├─ src/
│  ├─ main.tsx · routes.tsx
│  ├─ core/                     # pure TS, no DOM, 100% unit tested
│  │  ├─ model/                 # types, zod schemas, defaults, migrations
│  │  ├─ geo/                   # densify, spline, great-circle arc, simplify, heading, mercator length
│  │  ├─ timing/                # TimeMap, easing, speed models
│  │  ├─ camera/                # modes, van Wijk flyTo, smoothing, presets
│  │  └─ evaluate.ts            # evaluateScene(scene, t) → FrameState
│  ├─ importers/                # gpx.ts, googleTimeline/{android,ios,legacy,detect}.ts, worker.ts
│  ├─ map/                      # createMap, styleBuilder (themes/labels/terrain), routeLayers, editor tools
│  ├─ overlays/                 # Canvas2D signboard templates, HUD overlays, compositor
│  ├─ render/                   # exporter (Mediabunny), frame loop, tile warmup, batch queue
│  ├─ storage/                  # dexie db, autosave, .mapanim zip import/export
│  ├─ state/                    # zustand stores (project, editor UI, playback), undo/redo
│  ├─ ui/                       # theme (catppuccin tokens), primitives, layout (TopBar, Sidebar, Timeline)
│  └─ features/
│     ├─ projects/              # Projects page
│     ├─ route/  look/  signs/  camera/  export/   # sidebar panels + map tools per step
│     └─ timeline/              # bottom multi-track timeline
├─ test/
│  ├─ fixtures/                 # synthetic GPX + synthetic Timeline JSON (all 3 formats)
│  └─ e2e/                      # Playwright
└─ docs/PLAN.md
```

---

## 12. Milestones

Ordered to build a **walking skeleton** early (draw → animate → export), because export
is the riskiest part, then widen each step.

| # | Milestone | Done when |
|---|---|---|
| **M0** | **Spikes** (2–3 days): (a) MapLibre offscreen frame capture + Mediabunny 1080p30 MP4 with terrain on, measuring ms/frame on Linux Chrome & Firefox; (b) CORS + `canvas` readback works for OpenFreeMap, Terrain Tiles, and EOX; (c) reference-resolution preview scaling; (d) parse a *real* Google Timeline export from your phone | Numbers and a go/no-go per risk in §13 |
| **M1** | App shell: Vite/React/TS, Catppuccin Latte/Frappé + teal theme, Projects page (CRUD, download/import `.mapanim`, storage warning), editor layout with scene tabs + step switcher + empty panels | Create/rename/delete/download/import projects and scenes |
| **M2** | Step 1 core: manual draw/edit (straight/spline/arc), GPX import, undo/redo, autosave | Draw a route by hand or import a GPX and edit it |
| **M3** | Engine + skeleton export: TimeMap, line reveal, tip, playback, bottom timeline scrubbing, **basic MP4 export** (fit camera, default look) | First real video file exported end to end |
| **M4** | Google Timeline import (3 formats, worker, calendar heatmap date filter, modes from activities, cleanup tools) | Pick a date range from a real export and get a clean route |
| **M5** | Step 2 Look: theme presets, labels/language, borders + visited countries, terrain/hillshade/3D buildings/globe/sky, full route & marker styling, satellite | Every look option is visible in preview and export |
| **M6** | Step 4 Camera: blocks, follow/fit/static/fly-to/orbit/keyframes, bearing modes, deterministic smoothing, presets | Cinematic follow cam with no jitter on noisy GPS |
| **M7** | Step 3 Signs: templates, photos, anchoring, appear/pause behaviors, camera focus, auto-signs from stops, screen overlays (title, date, distance) | Pausing signs show up on the timeline and in the video |
| **M8** | Step 5 complete: speed models, holds, resolution/fps/codec probing, motion blur, music, stream-to-disk, **batch export all scenes**, tile cache | 4K60 export of a multi-scene project |
| **M9** | Polish: onboarding sample project, keyboard shortcuts, empty states, accessibility pass, PWA, CSP headers, Vercel config, README + attributions | Public v1.0 |

---

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Export speed (waiting for tiles every frame) | Tile warm-up pass, Service Worker tile cache, only wait when `areTilesLoaded()` is false, show ETA |
| No hardware H.264 encoding in Chrome/Firefox on Linux | Probe with `canEncodeVideo`; software AVC still works (slower); offer VP9/AV1 WebM; tell the user which encoder is used |
| Firefox / Safari gaps (File System Access API, some codecs) | Feature-detect; Blob download fallback; Chromium is the "best experience" browser |
| MapLibre symbol fade / async label placement causing flicker in export | `fadeDuration: 0`, wait for the `idle` event, constant `pixelRatio` |
| Very large Timeline files | Streaming parse in a worker, filter by date during the parse, progress UI |
| Google Timeline formats change | Detector + per-format parsers + fixtures; easy to add a new parser |
| Sentinel-2 non-commercial terms | Visible license notice when satellite is selected; mandatory attribution |
| OpenFreeMap / tile server availability | Style URLs are configurable; offline PMTiles mode as a fallback |
| GPU canvas size limits for 4K+ | Cap at the `MAX_RENDERBUFFER_SIZE`-derived limit; warn above 4K |
| Browser storage eviction (incognito, Safari 7-day rule) | `storage.persist()`, warning banner, prominent "Download project" |

---

## 14. Decisions I've made by default (change any of them)

1. **React + TS + Vite** for the UI (Svelte would also work; React wins on editor
   ecosystem and contributor familiarity).
2. **No "snap to roads"** routing. It needs an OSRM/Valhalla server, which breaks the
   local-only rule. Manual routes use straight/spline/arc shapes; real road geometry
   comes from GPX/Timeline.
3. **Online place search off by default** (opt-in Photon), with auto labels from local
   tile data instead.
4. **Chromium-first**, Firefox/Safari supported with graceful degradation.
5. **MIT license.**
6. **Music track** support in export (local file only), planned for M8.
7. The reference screenshot's right inspector is **folded into the left sidebar**, keeping
   the layout you specified (left / center / top / bottom).

---

## 15. Deviations in v0.1 (what was built vs. this plan)

- **Route, tip, markers and signs are drawn on a Canvas2D overlay** (`src/render/overlay.ts`),
  not MapLibre `line-gradient` layers. One code path serves preview and export, dashes,
  glow and tip symbols need no special cases, and line growth is synchronous (no GeoJSON
  worker round-trip per frame).
- **Reference frame:** logical 720p short side. The preview passes the frame scale to the
  style builder (labels, roads) and to the overlay, and shifts zoom by `log2(frame/logical)`,
  instead of CSS-scaling the map.
- **Export grabs pixels with `gl.readPixels`**, not `drawImage(webglCanvas)`. In Chromium
  the latter stalled about 200 ms per frame waiting on the compositor. 1080p30 now renders
  faster than real time on a GTX 1080 Ti.
- **MapLibre 6** locates its worker relative to its own module, so `src/map/setup.ts` sets
  the worker URL from a Vite `?worker&url` import.
- **Camera model:** Follow or Overview (Pan A→B was dropped), plus zoom keyframes and
  intro/outro. The Camera step is edited on the map itself: in Overview, gestures set a
  custom framing (`cam.view`) that the intro and outro reuse. In Follow, scroll changes the
  zoom at the playhead and right-drag sets the tilt. Smoothing is a fixed-rate Gaussian
  filter (`src/core/camera.ts`).
- **Timing is distance-based:** draw time = 6·km^0.2 × winding + 0.2 s per point (3–120 s),
  scaled by the pace preset (Slow / Normal / Fast / Custom). Pace, ease and holds live on
  the timeline bar.
- **Signs hang from route points** (`pointId`) and trigger exactly at them: pause, appear,
  or always on.
- **Not yet built:** per-segment transport modes and great-circle arcs, music track,
  motion blur, screen overlays (date ticker, distance counter), photo signboards, Service
  Worker tile cache, offline PMTiles, PWA.
