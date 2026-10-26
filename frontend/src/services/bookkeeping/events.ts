/** Tiny change emitter so screens re-read local data after local or sync writes. */
export type ChangeSource = 'local' | 'sync';
type Listener = (source: ChangeSource) => void;
const listeners = new Set<Listener>();

export function subscribeToChanges(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitChange(source: ChangeSource = 'local'): void {
  listeners.forEach((fn) => fn(source));
}
