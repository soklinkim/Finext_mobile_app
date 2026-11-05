import { createContext, useContext, useEffect, useRef, type ComponentRef } from 'react';
import { Platform, View } from 'react-native';

export interface FieldClaim {
  /** vertical position, comparable between fields on the same screen */
  y: number;
  node: unknown;
  focus?: () => void;
}

interface FieldFocusValue {
  /** goes up each time the screen's main button is pressed */
  tick: number;
  bump: () => void;
  claim: (claim: FieldClaim) => void;
  /** the scrolling content, which fields measure themselves against */
  inner: () => unknown;
  /** scroll the field that has the cursor into view above the keyboard (called whenever a field gets focus) */
  reveal?: () => void;
}

/** Provided by ScreenShell: lets fields with an error ask the screen to scroll to the first one. */
export const FieldFocusContext = createContext<FieldFocusValue | null>(null);

export const useBumpFieldFocus = () => useContext(FieldFocusContext)?.bump;

/** Lets a field ask the screen to scroll it above the keyboard when it gets focus. */
export const useRevealOnFocus = () => useContext(FieldFocusContext)?.reveal;

/**
 * Attach the returned ref to a field's outer View. When the field shows an error (it appears, or the main button is pressed
 * again while it is still there) the screen scrolls to the topmost field with an error and puts the cursor in it.
 * `skip` leaves the screen alone, e.g. while the user is typing in this very field.
 */
export function useScrollToError(error: string | undefined, opts: { focus?: () => void; skip?: boolean } = {}) {
  const ctx = useContext(FieldFocusContext);
  const ref = useRef<ComponentRef<typeof View>>(null);
  const previous = useRef<string | undefined>(undefined);
  const tick = ctx?.tick ?? 0;
  const lastTick = useRef(tick);

  useEffect(() => {
    const appeared = !!error && !previous.current;
    previous.current = error;
    const attempted = tick !== lastTick.current;
    lastTick.current = tick;
    if (!error || !ctx || !(appeared || attempted) || opts.skip) return;
    // Wait a moment so the screen has laid out the new error text before measuring.
    const timer = setTimeout(() => {
      const node = ref.current;
      if (!node) return;
      if (Platform.OS === 'web') {
        ctx.claim({ y: (node as unknown as HTMLElement).getBoundingClientRect().top, node, focus: opts.focus });
        return;
      }
      const inner = ctx.inner();
      if (!inner) return;
      node.measureLayout(inner as never, (_x, y) => ctx.claim({ y, node, focus: opts.focus }), () => undefined);
    }, 60);
    return () => clearTimeout(timer);
  }, [error, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  return ref;
}
