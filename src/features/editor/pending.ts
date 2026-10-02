export type StartWith = 'draw' | 'gpx' | 'json';

/** Set by "New project → Start with: Import …" so the editor opens the file picker on arrival. */
export const pendingImport: { kind: 'gpx' | 'json' | null } = { kind: null };
