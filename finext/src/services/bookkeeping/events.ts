/** Tiny change emitter so screens re-read local data after any write. */
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeToChanges(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitChange(): void {
  listeners.forEach((fn) => fn());
}
