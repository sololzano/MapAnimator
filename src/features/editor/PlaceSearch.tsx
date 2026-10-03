import placesUrl from 'virtual:places';
import { useDeferredValue, useId, useMemo, useState } from 'react';
import { rid } from '../../core/model';
import { parsePlaces, placeDetail, placeZoom, searchPlaces, type Place, type PlaceIndex } from '../../core/places';
import { currentScene, useApp } from '../../state/store';
import { cx } from '../../ui/controls';
import { Icon } from '../../ui/icons';
import { stageBus } from './bus';

// The list (~2 MB compressed) comes from this app's own server the first time someone
// searches, then stays in memory. Nothing typed here is sent anywhere.
let loading: Promise<PlaceIndex> | null = null;
function loadPlaces(): Promise<PlaceIndex> {
  loading ??= fetch(placesUrl)
    .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.text(); })
    .then(parsePlaces)
    .catch((e) => { loading = null; throw e; });
  return loading;
}

export function PlaceSearch() {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState<PlaceIndex | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [active, setActive] = useState(0);
  const listId = useId();
  const q = useDeferredValue(query);
  const results = useMemo(() => (index ? searchPlaces(index, q) : []), [index, q]);

  const ensure = () => {
    if (index || status === 'loading') return;
    setStatus('loading');
    loadPlaces().then((ix) => { setIndex(ix); setStatus('idle'); }, () => setStatus('error'));
  };
  const show = (p: Place) => stageBus.emit('flyTo', { lng: p.lng, lat: p.lat, zoom: placeZoom(p.pop) });
  const add = (p: Place) => {
    const st = useApp.getState();
    st.updateScene((s) => { s.points.push({ id: rid('r'), lng: p.lng, lat: p.lat, name: p.name }); });
    const n = currentScene(useApp.getState())!.points.length;
    st.set({ sel: n - 1, tm: -1 });
    if (n >= 2) stageBus.emit('fit'); else show(p);
    st.say(`Added ${p.name} as point ${n}`);
    setQuery('');
    setActive(0);
  };

  const open = query.trim().length > 0;
  return (
    <div className="flex flex-col gap-2 px-5 pb-3">
      <label className="relative block">
        <span className="sr-only">Find a place</span>
        <Icon name="search" size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <input value={query} placeholder="Find a place, e.g. Lisbon" autoComplete="off" spellCheck={false}
          role="combobox" aria-expanded={open && results.length > 0} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
          onFocus={ensure}
          onChange={(e) => { ensure(); setQuery(e.target.value); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              if (results.length) setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length);
            } else if (e.key === 'Enter' && results[active]) { e.preventDefault(); add(results[active]); }
            else if (e.key === 'Escape' && query) { e.preventDefault(); e.stopPropagation(); setQuery(''); }
          }}
          className="h-[38px] w-full rounded-[9px] border border-line-strong bg-card pr-3 pl-9 text-[14px] text-text outline-none placeholder:text-muted focus:border-accent" />
      </label>

      {open && status === 'loading' && <div role="status" className="text-[12.5px] text-text-2">Loading the list of places… (only the first time)</div>}
      {open && status === 'error' && <div role="alert" className="text-[12.5px] text-red">The list of places couldn’t load. Check your connection and try again.</div>}
      {open && index && !results.length && (
        <div role="status" className="text-[12.5px] leading-normal text-text-2 text-pretty">
          No place called “{query.trim()}”. Try the English name or another spelling, or click the map with <b className="text-text">Draw</b>.
        </div>
      )}
      {open && results.length > 0 && (
        <ul id={listId} role="listbox" aria-label="Places" className="m-0 flex list-none flex-col gap-0.5 rounded-[10px] border border-line bg-card p-1">
          {results.map((p, i) => (
            <li key={`${p.name}|${p.lat}|${p.lng}`} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              className={cx('flex items-center gap-2 rounded-[7px] py-1.5 pr-1 pl-2.5 hover:bg-panel', i === active && 'bg-panel-2!')}>
              <button type="button" onClick={() => show(p)} title={`Show ${p.name} on the map`}
                className="flex min-w-0 flex-1 flex-col items-start border-0 bg-transparent p-0 text-left">
                <span className="w-full truncate text-[13.5px] font-medium text-text">{p.name}</span>
                <span className="w-full truncate text-[11.5px] text-muted">{placeDetail(p)}</span>
              </button>
              <button type="button" onClick={() => add(p)} title={`Add ${p.name} to the route`} aria-label={`Add ${p.name} to the route`}
                className="flex h-7 flex-none items-center gap-1 rounded-md border-0 bg-accent px-2 text-[12px] font-semibold text-on-accent hover:bg-accent-hover">
                <Icon name="plus" size={12} strokeWidth={2.2} />Add
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && results.length > 0 && <div className="text-[11.5px] text-muted">Click a name to look at it, or <b>Add</b> (Enter) to put it on the route.</div>}
    </div>
  );
}
