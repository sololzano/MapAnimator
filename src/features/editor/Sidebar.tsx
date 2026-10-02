import { toMerc } from '../../core/geo';
import { makeSign, outputSize, rid, type Scene, type SignStyle, type TipKind } from '../../core/model';
import { runtime } from '../../core/runtime';
import { formatTime } from '../../core/timing';
import { MAP_THEMES } from '../../map/themes';
import { exportDims, exportFps } from '../../render/exporter';
import { currentScene, useApp, type Step } from '../../state/store';
import { Button, Cards, Group, Info, Segmented, Slider, Swatches, TextField, Toggle, cx } from '../../ui/controls';
import { Icon } from '../../ui/icons';

const TITLES = ['Route', 'Look', 'Signs', 'Camera', 'Preview & export'];
const DESCS = [
  'Click to draw, import a GPX or a dated JSON timeline, then drag points to reshape.',
  'Map style, labels and the look of the line. Appearance only — motion comes later.',
  'Add signboards on or off the route. Choose whether the line stops for them.',
  'Decide how the camera moves: follow, pan, zoom, rotate.',
  'Set pace and pauses, then pick resolution and frame rate.',
];
export const STEP_LABELS = ['Route', 'Look', 'Signs', 'Camera', 'Export'];

const LINE_COLORS = ['#179299', '#4c4f69', '#ffffff', '#1e66f5', '#40a02b', '#ea76cb', '#df8e1d', '#fe640b', '#d20f39'];
const TIPS: [TipKind, string, string][] = [['pulse', 'Pulse', '◉'], ['dot', 'Dot', '●'], ['arrow', 'Arrow', '▲'], ['pin', 'Pin', '◎'], ['diamond', 'Diamond', '◆'], ['plane', 'Plane', '✈︎']];
const SIGNS: [SignStyle, string, string][] = [
  ['postcard', 'Postcard', 'background:#fffdf8;border:1px solid #bcc0cc;border-top:4px solid var(--accent);border-radius:2px'],
  ['post', 'Signpost', 'background:#7a5238;clip-path:polygon(0 0,80% 0,100% 50%,80% 100%,0 100%)'],
  ['ticket', 'Ticket', 'background:var(--accent);border-radius:4px'],
  ['tag', 'Tag', 'background:#232634;border-radius:99px'],
];

function css(s: string): React.CSSProperties {
  return Object.fromEntries(s.split(';').filter(Boolean).map((d) => {
    const [k, ...v] = d.split(':');
    return [k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v.join(':').trim()];
  }));
}

export function Sidebar({ onImport, onExport }: { onImport: (kind: 'gpx' | 'json') => void; onExport: (all: boolean) => void }) {
  const step = useApp((s) => s.step);
  return (
    <aside className="flex min-h-0 w-[332px] flex-none flex-col border-r border-line bg-panel">
      <div className="flex flex-col gap-1.5 px-5 pt-5 pb-4">
        <div className="eyebrow">Step {step} of 5</div>
        <div className="text-[24px] leading-[1.1] font-semibold tracking-[-0.025em]">{TITLES[step - 1]}</div>
        <div className="text-[13px] leading-normal text-text-2 text-pretty">{DESCS[step - 1]}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {step === 1 && <RoutePanel onImport={onImport} />}
        {step === 2 && <LookPanel />}
        {step === 3 && <SignsPanel />}
        {step === 4 && <CameraPanel />}
        {step === 5 && <ExportPanel onExport={onExport} />}
      </div>
    </aside>
  );
}

function useScene(): [Scene, (fn: (s: Scene) => void, key?: string) => void] {
  const scene = useApp((s) => currentScene(s)!);
  const update = useApp((s) => s.updateScene);
  return [scene, update];
}

function RoutePanel({ onImport }: { onImport: (kind: 'gpx' | 'json') => void }) {
  const [scene, update] = useScene();
  const sel = useApp((s) => s.sel);
  const set = useApp((s) => s.set);
  const rt = runtime(scene);
  const big = scene.points.length > 40;
  const km = rt.route.metresAt(1) / 1000;
  return (
    <>
      <div className="grid grid-cols-2 gap-2 px-5 pb-4">
        <Button className="h-[38px]" onClick={() => onImport('gpx')}>Import GPX</Button>
        <Button className="h-[38px]" onClick={() => onImport('json')}>Import JSON timeline</Button>
      </div>
      <Group title="How to edit">
        <Info>Use the toolbar on the map. <b>Draw</b>: click to add points. <b>Move</b>: drag points; drag the small circles on the line to insert; right-click or <kbd>Delete</kbd> removes. <b>Pan</b>: hold the mouse wheel button and drag. Scroll to zoom. <kbd>Ctrl+Z</kbd> undoes.</Info>
      </Group>
      <Group title="Curve">
        <Toggle label="Smooth spline through points" value={scene.smooth} onChange={(v) => update((s) => { s.smooth = v; })} />
      </Group>
      <Group title={<>Points · {scene.points.length}{km > 0 && <span className="num normal-case tracking-normal"> · {km < 10 ? km.toFixed(1) : Math.round(km).toLocaleString()} km</span>}</>}
        right={scene.points.length > 0 && <button className="eyebrow bg-transparent p-0 text-red! hover:underline" onClick={() => { update((s) => { s.points = []; }); set({ sel: -1, tm: -1 }); }}>Clear</button>}>
        {big ? (
          <div className="rounded-[10px] border border-line bg-card px-3.5 py-3 text-[12.5px] leading-normal text-text-2">
            <div className="num mb-1 text-[20px] font-semibold text-text">{scene.points.length} points</div>
            Too many to list. Edit them directly on the map, or Clear to start over.
          </div>
        ) : (
          <div className="-mx-2 flex flex-col gap-0.5">
            {scene.points.map((q, i) => (
              <div key={q.id} onClick={() => set({ sel: i })}
                className={cx('flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5', sel === i ? 'bg-card shadow-[inset_0_0_0_1px_var(--accent)]' : 'hover:bg-panel-2')}>
                <span className={cx('num grid h-[22px] w-[22px] flex-none place-items-center rounded-full text-[11px] font-semibold', sel === i ? 'bg-accent text-on-accent' : 'bg-panel-2')}>{i + 1}</span>
                <input value={q.name ?? ''} placeholder={`Point ${i + 1}`} onClick={(e) => e.stopPropagation()}
                  onChange={(e) => update((s) => { s.points[i].name = e.target.value || undefined; }, 'name-' + q.id)}
                  className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-[13.5px] outline-none placeholder:text-text" />
                <span className="num text-[11px] text-muted">{q.time ? new Date(q.time).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : Math.round(rt.route.pointP[i] * 100) + '%'}</span>
                <button title="Delete point" onClick={(e) => { e.stopPropagation(); update((s) => { s.points.splice(i, 1); }); set({ sel: -1 }); }}
                  className="grid h-[22px] w-[22px] place-items-center rounded-[5px] border-0 bg-transparent p-0 text-muted hover:bg-panel-2 hover:text-text">
                  <Icon name="x" size={13} />
                </button>
              </div>
            ))}
            {!scene.points.length && <Info>No points yet — click on the map to start.</Info>}
          </div>
        )}
      </Group>
    </>
  );
}

function LookPanel() {
  const [scene, update] = useScene();
  const look = scene.look;
  const setL = <K extends keyof Scene['look']>(k: K) => (v: Scene['look'][K]) => update((s) => { s.look[k] = v; }, 'look-' + String(k));
  return (
    <>
      <Group title="Map">
        <Cards label="Theme" value={look.theme} onChange={setL('theme')}
          options={MAP_THEMES.map((t) => ({ id: t.id, label: t.name, preview: '', previewStyle: { background: `linear-gradient(115deg, ${t.water} 0 30%, ${t.land} 30%)` } }))} />
        {look.theme === 'satellite' && <Info>Sentinel‑2 cloudless imagery by EOX — free for non-commercial use, credited in the video.</Info>}
        <Segmented label="Place names" value={look.labels} options={[['off', 'Off'], ['cities', 'Cities'], ['all', 'All']]} onChange={setL('labels')} />
        {look.labels !== 'off' && <Segmented label="Label language" value={look.labelLang} options={[['local', 'Local'], ['en', 'English']]} onChange={setL('labelLang')} />}
        <Segmented label="Country shading" value={look.regions} options={[['off', 'Off'], ['visited', 'Visited'], ['all', 'All']]} onChange={setL('regions')} />
        <Toggle label="Streets & roads" value={look.roads} onChange={setL('roads')} />
        <Toggle label="3D terrain & relief" value={look.terrain} onChange={setL('terrain')} />
        {look.terrain && <Slider label="Relief strength" value={look.relief} min={0} max={100} step={5} format={(v) => v + '%'} onChange={setL('relief')} />}
      </Group>
      <Group title="Route line">
        <Swatches label="Colour" value={look.color} colors={LINE_COLORS} onChange={setL('color')} />
        <Slider label="Thickness" value={look.width} min={2} max={18} step={1} format={(v) => v + ' px'} onChange={setL('width')} />
        <Segmented label="Style" value={look.style} options={[['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']]} onChange={setL('style')} />
        <Toggle label="Outline (solid only)" value={look.casing} onChange={setL('casing')} disabled={look.style !== 'solid'} />
        <Toggle label="Glow" value={look.glow} onChange={setL('glow')} />
        <Toggle label="Show full route ahead" value={look.ghost} onChange={setL('ghost')} />
      </Group>
      <Group title="Markers">
        <Cards label="Symbol at the tip" value={look.tip} onChange={setL('tip')}
          options={TIPS.map(([id, label, glyph]) => ({ id, label, preview: glyph, previewStyle: { background: 'var(--panel-2)', color: look.color } }))} />
        <Slider label="Symbol size" value={look.tipSize} min={0.5} max={2.5} step={0.1} format={(v) => '×' + v.toFixed(1)} onChange={setL('tipSize')} />
        <Toggle label="Initial dot" value={look.startDot} onChange={setL('startDot')} />
        <Toggle label="End marker" value={look.endDot} onChange={setL('endDot')} />
      </Group>
    </>
  );
}

function SignsPanel() {
  const [scene, update] = useScene();
  const selSign = useApp((s) => s.selSign);
  const set = useApp((s) => s.set);
  const say = useApp((s) => s.say);
  const sg = scene.signs.find((g) => g.id === selSign);
  const add = (style: SignStyle) => {
    if (!scene.points.length) { say('Draw a route first'); return; }
    const st = useApp.getState(), rt = runtime(scene);
    const p = st.tm < 0 ? 0.5 : rt.tm.progressAt(st.tm);
    const [lng, lat] = rt.route.posLL(p < 0.03 ? 0.5 : p);
    const g = makeSign(lng, lat, { style });
    update((s) => { s.signs.push(g); });
    set({ selSign: g.id });
  };
  const patch = (key: string, fn: (g: Scene['signs'][number]) => void) => update((s) => { const g = s.signs.find((x) => x.id === selSign); if (g) fn(g); }, key + selSign);
  const rt = runtime(scene);
  return (
    <>
      <div className="flex flex-col gap-2.5 px-5 pb-4">
        <div className="eyebrow">Add a sign</div>
        <div className="grid grid-cols-2 gap-2">
          {SIGNS.map(([id, label, chip]) => (
            <button key={id} onClick={() => add(id)} className="flex h-14 items-center gap-2.5 rounded-[10px] border border-line-strong bg-card px-3 text-left text-[13px] font-medium hover:border-accent">
              <span className="h-5 w-[26px] flex-none" style={css(chip)} />{label}
            </button>
          ))}
        </div>
      </div>
      <Group title="Selected sign">
        {sg ? (
          <>
            <TextField label="Title" value={sg.title} onChange={(v) => patch('title', (g) => { g.title = v; })} />
            <TextField label="Subtitle" value={sg.sub} onChange={(v) => patch('sub', (g) => { g.sub = v; })} />
            <Segmented label="Design" value={sg.style} options={SIGNS.map(([id, l]) => [id, l])} onChange={(v) => patch('style', (g) => { g.style = v; })} />
            <Segmented label="When the line reaches it" value={sg.trigger} options={[['reach', 'Appear'], ['pause', 'Pause line'], ['always', 'Always on']]} onChange={(v) => patch('trigger', (g) => { g.trigger = v; })} />
            {sg.trigger === 'pause' && <Slider label="Pause for" value={sg.pause} min={0.5} max={8} step={0.5} format={(v) => v + ' s'} onChange={(v) => patch('pause', (g) => { g.pause = v; })} />}
            <Slider label="Size" value={sg.size} min={0.5} max={2} step={0.1} format={(v) => '×' + v.toFixed(1)} onChange={(v) => patch('size', (g) => { g.size = v; })} />
            <Info>Drag the card to place it; drag its small dot to change which spot on the map it points at.</Info>
            <Button className="h-9 text-red" onClick={() => { update((s) => { s.signs = s.signs.filter((g) => g.id !== sg.id); }); set({ selSign: null }); }}>Delete sign</Button>
          </>
        ) : <Info>Pick a sign on the map or in the list to edit its text, design and timing. Drag it anywhere — on the route or off it.</Info>}
      </Group>
      <Group title={`Signs · ${scene.signs.length}`}>
        <div className="-mx-2 flex flex-col gap-0.5">
          {scene.signs.map((g) => (
            <div key={g.id} onClick={() => set({ selSign: g.id })}
              className={cx('flex cursor-pointer items-center gap-2.5 rounded-lg px-[9px] py-[7px]', selSign === g.id ? 'bg-card shadow-[inset_0_0_0_1px_var(--accent)]' : 'hover:bg-panel-2')}>
              <span className="flex-1 truncate text-[13.5px]">{g.title}</span>
              <span className="num text-[11px] text-muted">{{ reach: 'appears', pause: `pause ${g.pause}s`, always: 'always' }[g.trigger]} · {formatTime(rt.tm.timeAtP(rt.route.nearest(toMerc(g.lng, g.lat)).p))}</span>
            </div>
          ))}
        </div>
      </Group>
    </>
  );
}

function CameraPanel() {
  const [scene, update] = useScene();
  const cam = scene.cam;
  const setC = <K extends keyof Scene['cam']>(k: K) => (v: Scene['cam'][K]) => update((s) => { s.cam[k] = v; }, 'cam-' + String(k));
  const rt = runtime(scene);
  const addKf = () => {
    const st = useApp.getState();
    const t = st.tm < 0 ? 0 : st.tm, p = rt.tm.progressAt(t);
    update((s) => { s.cam.kfs.push({ id: rid('k'), p, z: s.cam.zoom }); });
  };
  const zfmt = (v: number) => '×' + (2 ** v).toFixed(v >= 4 ? 0 : 1);
  return (
    <>
      <Group title="Movement">
        <Segmented label="Camera mode" value={cam.mode} options={[['follow', 'Follow line'], ['pan', 'Pan A→B'], ['overview', 'Overview']]} onChange={setC('mode')} />
        <Segmented label="Orientation" value={cam.orient} options={[['north', 'North up'], ['heading', 'Heading up']]} onChange={setC('orient')} />
        <Slider label="Zoom" value={cam.zoom} min={0} max={8} step={0.1} format={zfmt} onChange={setC('zoom')} />
        <Slider label="Look-ahead" value={cam.ahead} min={0} max={40} step={1} format={(v) => v + '%'} onChange={setC('ahead')} />
        <Slider label="Smoothing" value={cam.smooth} min={0} max={100} step={5} format={(v) => v + '%'} onChange={setC('smooth')} />
        <Slider label="Tilt (3D)" value={cam.tilt} min={0} max={60} step={1} format={(v) => v + '°'} onChange={setC('tilt')} />
        {cam.tilt > 0 && !scene.look.terrain && <Info>Tip: turn on <b>3D terrain</b> in step 2 to see mountains when tilted.</Info>}
      </Group>
      <Group title="Opening & closing">
        <Toggle label="Start wide, then zoom in" value={cam.intro} onChange={setC('intro')} />
        <Toggle label="Pull back to overview at the end" value={cam.outro} onChange={setC('outro')} />
      </Group>
      <Group title={`Zoom keyframes · ${cam.kfs.length}`}>
        <Info>Move the playhead, then add a keyframe. The camera eases between keyframes.</Info>
        <Button className="h-9 hover:border-accent" onClick={addKf}><Icon name="diamond" size={14} />Add keyframe at playhead</Button>
        {[...cam.kfs].sort((a, b) => a.p - b.p).map((k) => (
          <div key={k.id} className="flex flex-col gap-1.5 rounded-[10px] border border-line bg-card px-3 py-2.5">
            <div className="num flex items-center justify-between text-[12px] font-medium">
              <span>◆ {formatTime(rt.tm.timeAtP(k.p))}</span>
              <span className="text-text-2">{zfmt(k.z)}</span>
              <button className="border-0 bg-transparent px-1 text-muted hover:text-text" onClick={() => update((s) => { s.cam.kfs = s.cam.kfs.filter((q) => q.id !== k.id); })}><Icon name="x" size={13} /></button>
            </div>
            <input type="range" min={0} max={8} step={0.1} value={k.z} onChange={(e) => { const z = parseFloat(e.target.value); update((s) => { const q = s.cam.kfs.find((x) => x.id === k.id); if (q) q.z = z; }, 'kf-' + k.id); }} />
          </div>
        ))}
      </Group>
    </>
  );
}

function ExportPanel({ onExport }: { onExport: (all: boolean) => void }) {
  const [scene, update] = useScene();
  const count = useApp((s) => s.project?.scenes.length ?? 1);
  const ex = scene.exp;
  const setE = <K extends keyof Scene['exp']>(k: K) => (v: Scene['exp'][K]) => update((s) => { s.exp[k] = v; }, 'exp-' + String(k));
  const rt = runtime(scene);
  const T = rt.tm.T;
  const [w, h] = exportDims(scene), fps = exportFps(scene);
  const [fw, fh] = outputSize(scene.ratio, ex.res);
  // Rough size estimate at "high" quality.
  const mb = ex.fmt === 'gif' ? (w * h * fps * T) / 2.2e6 : ((fw * fh * fps) / (1920 * 1080 * 30)) * 8 * T / 8 * (ex.fmt === 'webm' ? 0.8 : 1);
  const summary: [string, string][] = [
    ['Duration', `${T.toFixed(1)} s`], ['Output', `${w}×${h}`], ['Frames', String(Math.ceil(T * fps))], ['Est. size', `${mb.toFixed(1)} MB`],
  ];
  return (
    <>
      <Group title="Motion">
        <Slider label="Speed" value={ex.speed} min={0.25} max={4} step={0.05} format={(v) => '×' + v.toFixed(2)} onChange={setE('speed')} />
        <Slider label="Smoothness (ease in / out)" value={ex.ease} min={0} max={100} step={5} format={(v) => v + '%'} onChange={setE('ease')} />
        <Slider label="Hold before start" value={ex.pre} min={0} max={5} step={0.5} format={(v) => v + ' s'} onChange={setE('pre')} />
        <Slider label="Hold after end" value={ex.post} min={0} max={8} step={0.5} format={(v) => v + ' s'} onChange={setE('post')} />
      </Group>
      <Group title="Output">
        <Segmented label="Resolution" value={ex.res} options={[['720p', '720p'], ['1080p', '1080p'], ['1440p', '1440p'], ['4K', '4K']]} onChange={setE('res')} />
        <Segmented label="Frame rate" value={ex.fps} options={[[24, '24'], [30, '30'], [60, '60']]} onChange={setE('fps')} />
        <Segmented label="Format" value={ex.fmt} options={[['mp4', 'MP4'], ['webm', 'WebM'], ['gif', 'GIF']]} onChange={setE('fmt')} />
        {ex.fmt === 'gif' && <Info>GIFs are capped at 540p and 15 fps to keep files reasonable.</Info>}
      </Group>
      <div className="flex flex-col gap-3.5 border-t border-line px-5 pt-4 pb-6">
        <div className="grid grid-cols-2 gap-2">
          {summary.map(([k, v]) => (
            <div key={k} className="rounded-[10px] border border-line bg-card px-3 py-2.5">
              <div className="eyebrow text-[10px]!">{k}</div>
              <div className="num text-[16px] leading-snug font-semibold">{v}</div>
            </div>
          ))}
        </div>
        <Button variant="primary" className="h-11 text-[14px]" onClick={() => onExport(false)}>Export this scene</Button>
        <Button variant="outline" className="h-11 text-[14px]" onClick={() => onExport(true)}>Export all {count} {count === 1 ? 'scene' : 'scenes'}</Button>
        <div className="text-[12px] leading-normal text-muted">Rendered in your browser with your GPU. Nothing is uploaded. Keep this tab visible while exporting.</div>
      </div>
    </>
  );
}

export function StepNav() {
  const step = useApp((s) => s.step);
  const set = useApp((s) => s.set);
  const go = (n: Step) => set({ step: n, playing: false, tm: n >= 4 ? 0 : -1, sel: -1 });
  return (
    <nav className="flex items-center gap-1 rounded-xl bg-panel p-[3px]">
      {STEP_LABELS.map((label, i) => {
        const n = (i + 1) as Step, on = step === n;
        return (
          <button key={label} onClick={() => go(n)}
            className={cx('flex h-[34px] items-center gap-2 rounded-[9px] border-0 pr-3.5 pl-2 text-[13px] whitespace-nowrap', on ? 'bg-card font-semibold text-text shadow-[0_1px_3px_rgba(0,0,0,.15)]' : 'bg-transparent text-text-2 hover:text-text')}>
            <span className={cx('num grid h-5 w-5 place-items-center rounded-full text-[11px] font-semibold',
              on ? 'bg-accent text-on-accent' : step > n ? 'bg-accent-soft text-text' : 'border border-line-x text-muted')}>{n}</span>
            {label}
          </button>
        );
      })}
    </nav>
  );
}

