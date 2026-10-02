import type { TravelMode } from '../core/model';
import { MODE_PATHS } from '../render/transport';

/** Travel-mode icon for the UI (same artwork as the map badges). */
export function ModeIcon({ mode, size = 18, className = '' }: { mode: TravelMode; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {MODE_PATHS[mode].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
