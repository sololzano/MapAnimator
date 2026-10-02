// Small stroke icon set (20×20 grid), in the style of the design's toolbar.
const P: Record<string, string> = {
  draw: 'M3 16L8 9L12 12L17 4',
  move: 'M5 3L5 16L8.5 12.5L11 17L13 16L10.5 11.5L15 11Z',
  pan: 'M10 2V18M2 10H18M7 5L10 2L13 5M7 15L10 18L13 15M5 7L2 10L5 13M15 7L18 10L15 13',
  undo: 'M6 8H13A4 4 0 0113 16H8M6 8L9 5M6 8L9 11',
  redo: 'M14 8H7A4 4 0 007 16H12M14 8L11 5M14 8L11 11',
  trash: 'M4 6H16M8 6V4H12V6M6 6L7 17H13L14 6',
  zoomIn: 'M10 4V16M4 10H16',
  zoomOut: 'M4 10H16',
  fit: 'M3 7V3H7M13 3H17V7M17 13V17H13M7 17H3V13',
  download: 'M10 3V13M6 9L10 13L14 9M4 17H16',
  upload: 'M10 14V4M6 8L10 4L14 8M4 17H16',
  back: 'M16 10H4M9 5L4 10L9 15',
  plus: 'M10 4V16M4 10H16',
  x: 'M5 5L15 15M15 5L5 15',
  sun: 'M10 6.5A3.5 3.5 0 1 1 10 13.5A3.5 3.5 0 1 1 10 6.5ZM10 1.5V3.5M10 16.5V18.5M1.5 10H3.5M16.5 10H18.5M4 4L5.4 5.4M14.6 14.6L16 16M4 16L5.4 14.6M14.6 5.4L16 4',
  moon: 'M16.5 12.5A7 7 0 0 1 7.5 3.5A7 7 0 1 0 16.5 12.5Z',
  rewind: 'M5 4V16M16 4L8 10L16 16Z',
  play: 'M6 4L16 10L6 16Z',
  pause: 'M6 4V16M14 4V16',
  copy: 'M7 7H16V16H7ZM4 13V4H13',
  diamond: 'M10 3L17 10L10 17L3 10Z',
  file: 'M5 2H12L16 6V18H5ZM12 2V6H16',
  lock: 'M5 9H15V17H5ZM7 9V6A3 3 0 0 1 13 6V9',
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 18, className = '', strokeWidth = 1.6 }: { name: IconName | string; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={P[name] ?? ''} />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  // A route pin: teal disc, white core, with a little trail.
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden>
      <circle cx="14" cy="14" r="14" fill="var(--accent)" />
      <path d="M6 20C9 20 9 15 12.5 15S16 10 19.5 10" fill="none" stroke="var(--on-accent)" strokeWidth="2" strokeLinecap="round" strokeDasharray="0.1 3.6" />
      <circle cx="20" cy="9.5" r="3.6" fill="var(--on-accent)" />
    </svg>
  );
}
