type Fn = (payload?: unknown) => void;

/** Tiny event bus for imperative requests to the map stage (fit, zoom). */
export const stageBus = {
  map: new Map<string, Set<Fn>>(),
  on(name: string, fn: Fn) {
    const s = this.map.get(name) ?? new Set<Fn>();
    s.add(fn);
    this.map.set(name, s);
    return () => { s.delete(fn); };
  },
  emit(name: string, payload?: unknown) {
    this.map.get(name)?.forEach((fn) => fn(payload));
  },
};
