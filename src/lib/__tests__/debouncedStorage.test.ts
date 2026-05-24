import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { scheduleWrite, flushPending, cancelPending } from '../debouncedStorage';

describe('debouncedStorage', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      key: () => null,
      length: 0,
      clear: () => { store.clear(); },
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    cancelPending();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not write before the 200ms window elapses', () => {
    scheduleWrite('foo', '"bar"');
    vi.advanceTimersByTime(150);
    expect(store.get('foo')).toBeUndefined();
  });

  it('writes after the 200ms window elapses', () => {
    scheduleWrite('foo', '"bar"');
    vi.advanceTimersByTime(250);
    expect(store.get('foo')).toBe('"bar"');
  });

  it('coalesces repeated writes — only the most recent value lands', () => {
    scheduleWrite('foo', '"v1"');
    vi.advanceTimersByTime(100);
    scheduleWrite('foo', '"v2"');
    vi.advanceTimersByTime(250);
    expect(store.get('foo')).toBe('"v2"');
  });

  it('flushPending persists pending writes synchronously (beforeunload path)', () => {
    scheduleWrite('foo', '"bar"');
    vi.advanceTimersByTime(50);
    expect(store.get('foo')).toBeUndefined();
    flushPending();
    expect(store.get('foo')).toBe('"bar"');
  });

  it('flushPending honours pending removes (null value)', () => {
    store.set('foo', 'prev');
    scheduleWrite('foo', null);
    flushPending();
    expect(store.has('foo')).toBe(false);
  });

  it('cancelPending drops queued writes without persisting them', () => {
    scheduleWrite('foo', '"bar"');
    cancelPending();
    vi.advanceTimersByTime(500);
    expect(store.has('foo')).toBe(false);
  });

  it('supports custom delays', () => {
    scheduleWrite('foo', '"bar"', 50);
    vi.advanceTimersByTime(60);
    expect(store.get('foo')).toBe('"bar"');
  });
});
