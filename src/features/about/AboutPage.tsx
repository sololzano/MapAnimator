import { useEffect, useRef, type ReactNode } from 'react';
import { version } from '../../../package.json';
import { goProjects } from '../../nav';
import { Button, cx, Modal } from '../../ui/controls';
import { Icon, Logo } from '../../ui/icons';
import { ThemeToggle } from '../projects/ProjectsPage';

interface Credit { name: string; url: string; role: string; licence: string }

const MAP_CREDITS: Credit[] = [
  { name: 'OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright', role: 'Roads, places, borders and labels', licence: 'ODbL 1.0' },
  { name: 'OpenMapTiles', url: 'https://openmaptiles.org', role: 'Vector tile schema and map layers', licence: 'BSD-3-Clause · CC BY 4.0' },
  { name: 'OpenFreeMap', url: 'https://openfreemap.org', role: 'Free vector tile hosting, no key needed', licence: 'MIT' },
  { name: 'Terrain Tiles (Mapzen, AWS Open Data)', url: 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md', role: 'Elevation for 3D terrain and hillshade', licence: 'Open data, various' },
  { name: 'Sentinel-2 cloudless 2020 by EOX IT Services GmbH', url: 'https://s2maps.eu', role: 'Satellite imagery. Contains modified Copernicus Sentinel data 2020', licence: 'CC BY-NC-SA 4.0' },
  { name: 'GeoNames', url: 'https://www.geonames.org', role: 'Place names for the offline place search (via all-the-cities and cities.json)', licence: 'CC BY 4.0' },
  { name: 'Natural Earth', url: 'https://www.naturalearthdata.com', role: 'Country shapes for highlighting visited countries', licence: 'Public domain' },
];

const SOFTWARE_CREDITS: Credit[] = [
  { name: 'MapLibre GL JS', url: 'https://maplibre.org', role: 'Draws the map on your GPU', licence: 'BSD-3-Clause' },
  { name: 'Mediabunny', url: 'https://mediabunny.dev', role: 'Encodes and packs MP4 and WebM video', licence: 'MPL-2.0' },
  { name: 'Mediabunny AAC encoder', url: 'https://github.com/Vanilagy/mediabunny', role: "MP4 audio on browsers without AAC, using FFmpeg's encoder in WebAssembly", licence: 'MPL-2.0 · FFmpeg LGPL-2.1+' },
  { name: 'gifenc', url: 'https://github.com/mattdesl/gifenc', role: 'GIF export', licence: 'MIT' },
  { name: 'React', url: 'https://react.dev', role: 'Interface', licence: 'MIT' },
  { name: 'Zustand', url: 'https://zustand.docs.pmnd.rs', role: 'App state', licence: 'MIT' },
  { name: 'Immer', url: 'https://immerjs.github.io/immer/', role: 'Edits and undo history', licence: 'MIT' },
  { name: 'Dexie.js', url: 'https://dexie.org', role: 'Saves projects in this browser (IndexedDB)', licence: 'Apache-2.0' },
  { name: 'fflate', url: 'https://github.com/101arrowz/fflate', role: 'Zips and unzips project files', licence: 'MIT' },
  { name: 'Zod', url: 'https://zod.dev', role: 'Checks project files when they are opened', licence: 'MIT' },
  { name: '@tmcw/togeojson', url: 'https://github.com/placemark/togeojson', role: 'Reads GPX and KML files', licence: 'BSD-2-Clause' },
  { name: 'topojson-client and world-atlas', url: 'https://github.com/topojson/world-atlas', role: 'Packs and decodes the country shapes', licence: 'ISC' },
];

const DESIGN_CREDITS: Credit[] = [
  { name: 'Catppuccin', url: 'https://catppuccin.com', role: 'Latte and Frappé colour palettes', licence: 'MIT' },
  { name: 'Inter', url: 'https://rsms.me/inter/', role: 'Typeface by Rasmus Andersson', licence: 'SIL OFL 1.1' },
  { name: 'Tabler Icons', url: 'https://tabler.io/icons', role: 'Transport mode icons', licence: 'MIT' },
  { name: 'Tailwind CSS', url: 'https://tailwindcss.com', role: 'Styling', licence: 'MIT' },
  { name: 'Vite, TypeScript and Vitest', url: 'https://vite.dev', role: 'Build and test tools', licence: 'MIT · Apache-2.0' },
];

function CreditList({ title, items }: { title: string; items: Credit[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="eyebrow m-0">{title}</h3>
      <ul className="m-0 list-none rounded-[14px] border border-line bg-card p-0">
        {items.map((c) => (
          <li key={c.name} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-line px-4 py-3 first:border-t-0">
            <div className="flex min-w-0 flex-col gap-0.5">
              <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-[14px] font-semibold text-text underline decoration-line-x underline-offset-[3px] hover:text-accent hover:decoration-accent">{c.name}</a>
              <span className="text-[13px] text-text-2 text-pretty">{c.role}</span>
            </div>
            <span className="rounded-full bg-panel-2 px-2.5 py-1 text-[11.5px] font-medium whitespace-nowrap text-text-2">{c.licence}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Point({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-[14px] bg-panel px-5 py-[18px]">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-soft text-accent"><Icon name={icon} size={17} /></span>
      <h3 className="m-0 text-[15px] font-semibold">{title}</h3>
      <p className="m-0 text-[13.5px] leading-[1.55] text-text-2 text-pretty">{children}</p>
    </div>
  );
}

const INTRO = 'ElChilaquilWasHere turns a trip into a short map animation. Draw a route by hand, or import a GPX or KML file or your Google Maps Timeline. '
  + 'Pick a map style, add signs with photos, direct the camera, and export an MP4, WebM or GIF, with your own music if you like.';

/** Everything below the page header: shared by the About page and the editor's About dialog. */
function AboutContent({ compact = false }: { compact?: boolean }) {
  const h2 = cx('m-0 font-semibold tracking-[-0.015em]', compact ? 'text-[18px]' : 'text-[22px]');
  return (
    <>
      {compact ? (
        <section className="flex flex-col items-center gap-2.5 text-center">
          <Logo size={56} />
          <div className="text-[22px] font-semibold tracking-[-0.02em]">ElChilaquil<span className="text-accent">WasHere</span></div>
          <div className="num text-[12.5px] text-muted">Version {version} · MIT licence</div>
          <p className="m-0 max-w-[560px] text-[14.5px] leading-normal text-text-2 text-pretty">{INTRO}</p>
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          <div className="eyebrow">About</div>
          <h1 className="m-0 text-[34px] leading-[1.1] font-semibold tracking-[-0.03em] sm:text-[44px]">Your trips, animated <span className="text-accent">on your own computer.</span></h1>
          <p className="m-0 max-w-[680px] text-[16px] leading-normal text-text-2 text-pretty">{INTRO}</p>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className={h2}>Why it exists</h2>
        <p className="m-0 max-w-[680px] text-[14.5px] leading-[1.6] text-text-2 text-pretty">
          Most route animation tools want an account, a subscription, or an upload of your location history, and location history is about as personal as data gets.
          This one runs entirely in your browser instead.
        </p>
        <div className={cx('grid gap-3', compact ? 'grid-cols-[repeat(auto-fit,minmax(min(100%,190px),1fr))]' : 'grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))]')}>
          <Point icon="lock" title="Nothing leaves your device">
            Projects, photos and music are stored in this browser, and imported files are read here. The only network traffic is map tiles: tile servers see which map areas load, never your route or files.
          </Point>
          <Point icon="play" title="Your computer does the work">
            The map is drawn with WebGL on your GPU and the video is encoded by your browser, so export speed depends on your machine, not on a server queue.
          </Point>
          <Point icon="download" title="Free and open source">
            No account, no watermark, no limits. The code is under the MIT licence, and any project can be downloaded as a file to keep or share.
          </Point>
        </div>
      </section>

      <section className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h2 className={h2}>Credits</h2>
          <p className="m-0 max-w-[680px] text-[14.5px] leading-[1.6] text-text-2 text-pretty">
            Built on the work of these open projects and data providers. Map credits are also drawn into the corner of every exported video, as their licences require.
            Thanks to my friend Claudio for the help in building this freebie. We will keep working on this project for the foreseeable future. 
          </p>
        </div>
        <CreditList title="Map data and imagery" items={MAP_CREDITS} />
        <div className="flex items-start gap-3 rounded-[14px] bg-panel px-4 py-3.5">
          <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-accent" />
          <p className="m-0 text-[13px] leading-[1.55] text-text-2 text-pretty">
            <strong className="text-text">Satellite style is non-commercial only.</strong> Sentinel-2 cloudless is licensed CC BY-NC-SA 4.0, so videos made with it can't be used commercially. All other map styles have no such restriction.
          </p>
        </div>
        <CreditList title="Software" items={SOFTWARE_CREDITS} />
        <CreditList title="Design and tools" items={DESIGN_CREDITS} />
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-[12.5px] text-muted">
        {!compact && <span className="num">ElChilaquilWasHere {version} · MIT licence</span>}
        <span>Full licence texts are in each project's repository.</span>
      </footer>
    </>
  );
}

export function AboutPage() {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { scroller.current?.scrollTo(0, 0); }, []);
  return (
    <div ref={scroller} className="absolute inset-0 overflow-auto bg-bg">
      <div className="mx-auto flex max-w-[880px] flex-col gap-10 px-4 pt-5 pb-[72px] sm:px-10 sm:pt-7">
        <header className="flex items-center justify-between gap-4">
          <button onClick={goProjects} aria-label="Back to projects" className="flex items-center gap-2.5 border-0 bg-transparent p-0 text-text">
            <Logo />
            <span className="text-[16px] font-semibold tracking-[-0.02em] sm:text-[19px]">ElChilaquil<span className="text-accent">WasHere</span></span>
          </button>
          <div className="flex items-center gap-2.5">
            <Button className="h-[38px] px-3.5" onClick={goProjects}><Icon name="back" size={15} />Projects</Button>
            <ThemeToggle />
          </div>
        </header>
        <AboutContent />
      </div>
    </div>
  );
}

/** Desktop-style About box for the editor, so the open project stays open. */
export function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="About" onClose={onClose} width={720}>
      <div className="flex flex-col gap-8">
        <AboutContent compact />
      </div>
    </Modal>
  );
}
