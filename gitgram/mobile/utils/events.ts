/**
 * Lightweight app-wide event bus.
 *
 * A "soft reset" is the gesture of re-pressing the already-active bottom tab:
 * the active feed scrolls back to the top and reloads the latest content.
 * Screens subscribe with `listenSoftReset` and the tab bar fires `emitSoftReset`.
 *
 * Ported from Bluesky's `src/state/events.ts`, but reimplemented as a tiny
 * dependency-free emitter so we do not pull `eventemitter3` into the product.
 */

type EventName = 'soft-reset';
type Listener = () => void;
type UnlistenFn = () => void;

const listeners: Record<EventName, Set<Listener>> = {
  'soft-reset': new Set(),
};

function emit(event: EventName): void {
  // Copy before iterating so a listener that unsubscribes itself during
  // dispatch cannot mutate the set we are walking.
  for (const listener of [...listeners[event]]) {
    listener();
  }
}

function listen(event: EventName, fn: Listener): UnlistenFn {
  listeners[event].add(fn);
  return () => {
    listeners[event].delete(fn);
  };
}

export function emitSoftReset(): void {
  emit('soft-reset');
}

export function listenSoftReset(fn: Listener): UnlistenFn {
  return listen('soft-reset', fn);
}
