# ElChilaquilWasHere

Travel route animations, made entirely in your browser. Draw a route (or import a GPX
or your Google Maps Timeline), dress the map, drop signboards with photos, direct the
camera, add a song and export a video. No account, no server, no uploads: everything
runs on your machine and your GPU.

## What you need

- A desktop or laptop computer. A mouse makes drawing easiest, but a trackpad works.
- **Chrome or Edge** (recommended). Other browsers work, but some can't save every video
  format; the app tells you when that happens and suggests an alternative.
- An internet connection for the map itself (map tiles). Your routes, photos and music
  never leave your computer.

## Run it

You need [Node.js](https://nodejs.org) 20.19+ or 22.12+. Then, in a terminal inside this
folder:

```bash
npm install
npm run dev        # then open http://localhost:5173
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

## Your first video in five steps

1. **New project**: give it a name, pick the video shape (16:9 for YouTube and TVs, 9:16
   for phone stories) and how you want to start. No projects yet? Open the sample trip.
2. **Route**: click the map with **Draw** to add stops, or import a file (see below).
3. **Look**: choose a map style and the colour of the line.
4. **Signs**: hang postcards or signposts on your stops, optionally with a photo.
5. **Export**: press **Preview** to watch it, then **Export this scene** to save the video.

Every step has sensible defaults, so you can jump straight from Route to Export. Your work
saves automatically in this browser.

## Getting your files

**Google Timeline on Android:** open the phone's **Settings** app › Location › Location
services › Timeline › **Export Timeline data** › Continue › Save.

**Google Timeline on iPhone:** open **Google Maps** › your profile picture › Settings ›
Location & Privacy › **Export Timeline data** › Save to Files.

Copy the file (`Timeline.json` or `location-history.json`) to your computer, for example
with a USB cable, AirDrop or Quick Share. The app lets you pick the dates to animate and
which kinds of travel to keep. Older Google Takeout files (`Records.json`, Semantic
Location History) work too.

**GPX / KML:** Strava, Komoot, Garmin Connect, Wikiloc and most sport or navigation apps
can export a GPX. Google My Maps exports KML (tick "Export to a .KML file").

The same instructions are in the app, under **Where do I get these files?** in the Route
step and in the New project dialog.

## How it works

| Step | What you do |
|---|---|
| Projects | Projects live in this browser (IndexedDB). **Download** one from its card as a `.chilaquil` file (photos and music included) to keep a backup or move it to another computer, then **Open from file**. |
| 1 · Route | Click to draw, drag points, drag the small circles to insert, right-click/Delete to remove. Drag the map to move around, scroll to zoom. Import GPX/KML or a Google Timeline JSON and pick the dates and travel modes. Set a travel mode per leg, or hide legs you don't want drawn. |
| 2 · Look | Map theme (Latte, Frappé, Paper, Mono, Terrain, Satellite, Night, Blueprint), labels and language, visited-country shading, roads, 3D terrain, line and marker style. |
| 3 · Signs | Postcard, signpost, ticket and tag signboards hung on route points: pause the line, appear when it arrives, or stay on. Add a photo to any sign. Optional on-screen date and distance counters. |
| 4 · Camera | Follow the line or a static overview, framed right on the map (drag, scroll, right-drag). North-up or heading-up, zoom, look-ahead, smoothing, tilt, intro/outro and zoom keyframes. |
| 5 · Export | 720p–4K, 24/30/60 fps; MP4 (H.264 + AAC), WebM (VP9 + Opus) or GIF. Optional soundtrack (volume, start point, fades) and motion blur. Export one scene or all of them. Pace, easing and holds are under **Timing** on the timeline bar. |

**Download** (on the Projects page) saves the editable project; **Export video** (in the
editor) makes the video file. Credits and licences are under **About** (Projects page) or
the ⓘ button (editor).

Supported Google Timeline exports: the new on-device export (Android `Timeline.json` and
iPhone `location-history.json`), and the legacy Takeout `Records.json` / `Semantic
Location History`. Files are parsed in a Web Worker on your device.

## Troubleshooting

- **My iPhone photo won't load.** Chrome and Firefox can't read HEIC photos. Convert it
  to JPEG first, or use Safari. On iPhone, Settings › Camera › Formats › Most Compatible
  makes new photos JPEG.
- **The export is slow or paused.** Keep the tab in front while exporting; browsers slow
  down hidden tabs. Motion blur makes exports 5–8× longer, and 4K is much slower than
  1080p. Try 1080p without motion blur first.
- **The map is blank or says it couldn't load.** The map tiles come from the internet:
  check your connection and press **Retry**.
- **My projects disappeared.** Private/incognito windows delete everything when closed,
  and clearing browsing data does too. Use **Download** on the Projects page to keep a copy.
- **My video has no sound.** GIFs never have sound. For MP4/WebM, check that a soundtrack
  is added in the Export step and its volume isn't at 0.
- **Can I use the Satellite style in a paid project?** No: its imagery is licensed for
  non-commercial use only. All other styles are fine with the credits shown in the video.

## Privacy

The only network requests are for public map data: vector tiles and fonts from
OpenFreeMap, elevation tiles from AWS Terrain Tiles (when 3D terrain is on) and
Sentinel‑2 imagery from EOX (when the satellite theme is on). These servers see which map
areas are being viewed, like any web map. A Content-Security-Policy in `index.html`
blocks every other host, so your routes, signs, photos, music and projects cannot be sent
anywhere.

## Credits and licences

Code: [MIT](LICENSE). Transport badge icons from Tabler Icons (MIT). Map data ©
OpenStreetMap contributors (ODbL), OpenMapTiles schema, served by OpenFreeMap. Terrain:
Mapzen Terrain Tiles on AWS. Satellite: Sentinel‑2 cloudless by EOX IT Services GmbH
(contains modified Copernicus Sentinel data 2020, CC BY-NC-SA 4.0, so **non-commercial
use only**). Country shapes: Natural Earth (public domain) via world-atlas. The required
credits are drawn into every exported video.

Built with MapLibre GL JS, Mediabunny (+ its AAC encoder extension, MPL-2.0, which uses
FFmpeg's AAC encoder, LGPL-2.1+), React, Zustand, Immer, Dexie, fflate, Zod, gifenc and
Tailwind CSS, with the Catppuccin palette and the Inter typeface. The full list with
licences is on the in-app **About** page.

See [docs/PLAN.md](docs/PLAN.md) for the architecture and roadmap.
