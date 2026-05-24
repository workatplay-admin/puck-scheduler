import { describe, it, expect, vi } from 'vitest';
import { generateId } from '../generateId';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('generateId', () => {
  it('returns a UUID v4-shaped string', () => {
    expect(generateId()).toMatch(UUID_V4);
  });

  it('produces 1000 unique ids that all match UUID v4', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const id = generateId();
      expect(id).toMatch(UUID_V4);
      ids.add(id);
    }
    expect(ids.size).toBe(1000);
  });

  it('falls back to getRandomValues when randomUUID is unavailable', () => {
    const original = crypto.randomUUID;
    // Simulate a non-secure context where randomUUID is missing.
    (crypto as { randomUUID?: typeof crypto.randomUUID }).randomUUID = undefined;
    try {
      const id = generateId();
      expect(id).toMatch(UUID_V4);
    } finally {
      crypto.randomUUID = original;
    }
  });

  it('throws when no crypto API is available', () => {
    const stash = globalThis.crypto;
    vi.stubGlobal('crypto', undefined);
    try {
      expect(() => generateId()).toThrow(/no crypto API/);
    } finally {
      vi.stubGlobal('crypto', stash);
    }
  });
});
