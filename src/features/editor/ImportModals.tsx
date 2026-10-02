import { useMemo, useState } from 'react';
import { makeSign, type RoutePoint, type Sign } from '../../core/model';
import { shortDate, toRoutePoints, type RouteImport } from '../../importers';
import { dayHistogram, filterTimeline, type ParsedTimeline } from '../../importers/timeline';
import { Button, Info, Modal, Segmented, Slider, Toggle } from '../../ui/controls';

export interface ImportResult { points: RoutePoint[]; signs: Sign[] }

const FORMAT_NAMES: Record<ParsedTimeline['format'], string> = {
  android: 'Google Timeline (Android export)', ios: 'Google Timeline (iPhone export)', records: 'Google Takeout · Records.json',
  semantic: 'Google Takeout · Semantic Location History', simple: 'List of points',
};

function stopSigns(stops: { lat: number; lng: number; t?: number; name?: string }[], max = 30): Sign[] {
  const step = Math.max(1, Math.ceil(stops.length / max));
  return stops.filter((_, i) => i % step === 0).map((s, i) => makeSign(s.lng, s.lat, {
    title: s.name || `Stop ${i + 1}`, sub: shortDate(s.t), style: 'tag', trigger: 'reach', dx: 90, dy: -50,
  }));
}

export function GpxImportModal({ data, fileName, onDone, onCancel }: { data: RouteImport; fileName: string; onDone: (r: ImportResult) => void; onCancel: () => void }) {
  const n = data.pts.length;
  const [max, setMax] = useState(Math.min(n, 80));
  const [signs, setSigns] = useState(data.waypoints.some((w) => w.name));
  const named = data.waypoints.filter((w) => w.name);
  return (
    <Modal title="Import GPX" onClose={onCancel} width={500}>
      <Info><b className="text-text">{fileName}</b> · {n.toLocaleString()} track points{data.waypoints.length ? ` · ${data.waypoints.length} waypoints` : ''}.</Info>
      <Slider label="Editable points" value={Math.min(max, n)} min={Math.min(2, n)} max={Math.min(n, 400)} step={1} format={(v) => `${v} of ${n.toLocaleString()}`} onChange={setMax} />
      <Info>Fewer points are easier to edit; the smooth spline keeps the shape. Named waypoints are always kept.</Info>
      {named.length > 0 && <Toggle label={`Add a sign at each named waypoint (${named.length})`} value={signs} onChange={setSigns} />}
      <div className="flex justify-end gap-2.5">
        <Button className="h-10 px-4" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" className="h-10 px-5" onClick={() => onDone({ points: toRoutePoints(data.pts, max), signs: signs ? stopSigns(named) : [] })}>Import route</Button>
      </div>
    </Modal>
  );
}

/** Longest run of consecutive days with data among the most recent ones (≤ 14 days). */
function defaultRange(days: string[]): [string, string] {
  if (!days.length) return ['', ''];
  let end = days.length - 1, start = end;
  const dayN = (d: string) => Date.parse(d + 'T12:00:00Z') / 86400000;
  while (start > 0 && dayN(days[start]) - dayN(days[start - 1]) <= 1.01 && dayN(days[end]) - dayN(days[start - 1]) < 14) start--;
  return [days[start], days[end]];
}

export function TimelineImportModal({ tl, fileName, onDone, onCancel }: { tl: ParsedTimeline; fileName: string; onDone: (r: ImportResult) => void; onCancel: () => void }) {
  const hist = useMemo(() => dayHistogram(tl.samples), [tl]);
  const days = hist.map((d) => d.day);
  const [[from, to], setRange] = useState<[string, string]>(() => defaultRange(days));
  const [detail, setDetail] = useState<'clean' | 'raw'>(tl.hasSemantic ? 'clean' : 'raw');
  const [max, setMax] = useState(80);
  const [signs, setSigns] = useState(true);
  const filtered = useMemo(() => (from && to ? filterTimeline(tl, from <= to ? from : to, from <= to ? to : from, detail) : { pts: [], stops: [] }), [tl, from, to, detail]);
  const peak = Math.max(1, ...hist.map((d) => d.count));
  const noDates = !days.length;

  const pick = (d: string, e: React.MouseEvent) => {
    if (e.shiftKey && from) setRange(d < from ? [d, from] : [from, d]);
    else setRange([d, d]);
  };

  return (
    <Modal title="Import JSON timeline" onClose={onCancel} width={620}>
      <Info><b className="text-text">{fileName}</b> · {FORMAT_NAMES[tl.format]} · {tl.samples.length.toLocaleString()} positions{days.length ? ` across ${days.length} days (${days[0]} → ${days[days.length - 1]})` : ''}.</Info>
      {!noDates && (
        <>
          <div className="flex flex-col gap-2">
            <div className="flex items-end justify-between">
              <span className="text-[13.5px]">Dates</span>
              <span className="text-[12px] text-muted">Click a day · Shift+click to extend</span>
            </div>
            <div className="flex h-16 items-end gap-px overflow-x-auto rounded-lg border border-line bg-card p-1.5">
              {hist.map((d) => {
                const on = d.day >= (from < to ? from : to) && d.day <= (from < to ? to : from);
                return (
                  <button key={d.day} title={`${d.day} · ${d.count} positions${d.visits ? ` · ${d.visits} visits` : ''}`} onClick={(e) => pick(d.day, e)}
                    className="flex h-full min-w-[5px] flex-1 items-end border-0 bg-transparent p-0">
                    <span className="block w-full rounded-t-[2px]" style={{ height: `${12 + (88 * d.count) / peak}%`, background: on ? 'var(--accent)' : 'var(--line-strong)' }} />
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-[12.5px] text-text-2">From
                <input type="date" value={from} min={days[0]} max={days[days.length - 1]} onChange={(e) => setRange([e.target.value, to])} className="num h-9 rounded-lg border border-line-strong bg-card px-2.5 text-[13.5px] text-text" />
              </label>
              <label className="flex flex-col gap-1 text-[12.5px] text-text-2">To
                <input type="date" value={to} min={days[0]} max={days[days.length - 1]} onChange={(e) => setRange([from, e.target.value])} className="num h-9 rounded-lg border border-line-strong bg-card px-2.5 text-[13.5px] text-text" />
              </label>
            </div>
          </div>
        </>
      )}
      {tl.hasSemantic && tl.hasRaw && <Segmented label="Detail" value={detail} options={[['clean', 'Clean (trips & visits)'], ['raw', 'Detailed (raw GPS)']]} onChange={setDetail} />}
      <Slider label="Editable points" value={Math.min(max, Math.max(2, filtered.pts.length))} min={2} max={Math.max(3, Math.min(400, filtered.pts.length))} step={1}
        format={(v) => `${Math.min(v, filtered.pts.length)} of ${filtered.pts.length.toLocaleString()}`} onChange={setMax} />
      {filtered.stops.length > 0 && <Toggle label={`Add a sign at each stop (${Math.min(30, filtered.stops.length)})`} value={signs} onChange={setSigns} />}
      <Info>Everything is processed on this device. Stops are kept as route points; you can rename them and the signs afterwards.</Info>
      <div className="flex justify-end gap-2.5">
        <Button className="h-10 px-4" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" className="h-10 px-5" disabled={filtered.pts.length < 2}
          onClick={() => onDone({ points: toRoutePoints(filtered.pts, max), signs: signs ? stopSigns(filtered.stops) : [] })}>
          {filtered.pts.length < 2 ? 'No route in these dates' : 'Import route'}
        </Button>
      </div>
    </Modal>
  );
}
