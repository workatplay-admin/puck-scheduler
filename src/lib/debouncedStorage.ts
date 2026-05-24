/**
 * Debounced wrapper around localStorage so high-frequency state changes do not
 * generate one disk write per keystroke. Writes coalesce per key over a short
 * window; only the most recent value lands. Pair with `flushPending` from a
 * `beforeunload` handler so the final edit is never lost when the tab closes.
 */

const DEFAULT_DELAY_MS = 200;

interface Pending {
  timer: ReturnType<typeof setTimeout>;
  /** Serialized value to write, or `null` to remove the key. */
  value: string | null;
}

const pending = new Map<string, Pending>();

const writeNow = (key: string, value: string | null): void => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Quota exceeded, storage disabled, or running outside the browser.
  }
};

/** Schedules a write to `key`. Repeated calls within `delayMs` coalesce. */
export const scheduleWrite = (
  key: string,
  value: string | null,
  delayMs: number = DEFAULT_DELAY_MS,
): void => {
  const existing = pending.get(key);
  if (existing) clearTimeout(existing.timer);

  const timer = setTimeout(() => {
    pending.delete(key);
    writeNow(key, value);
  }, delayMs);

  pending.set(key, { timer, value });
};

/** Writes any pending values synchronously and clears the queue. */
export const flushPending = (): void => {
  pending.forEach(({ timer, value }, key) => {
    clearTimeout(timer);
    writeNow(key, value);
  });
  pending.clear();
};

/** Drops pending writes without persisting them. Used by `clearAll`. */
export const cancelPending = (): void => {
  pending.forEach(({ timer }) => clearTimeout(timer));
  pending.clear();
};
