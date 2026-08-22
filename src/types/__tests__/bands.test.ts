import { describe, it, expect } from 'vitest';
import { bandOf, DEFAULT_SETTINGS, schedulerSettingsSchema, parseSettings } from '../scheduler';
import type { IceSlot } from '../scheduler';

const at = (startTime: string): IceSlot => ({ id: 'x', date: '2026-01-04', startTime, dayOfWeek: 'Sunday' });

describe('bandOf', () => {
  it.each([
    ['15:15', 'afternoon'], ['16:30', 'afternoon'],
    ['17:45', 'prime'], ['19:00', 'prime'], ['20:15', 'prime'],
    ['20:45', 'late'], ['21:00', 'late'], ['21:30', 'late'], ['22:00', 'late'], ['22:15', 'late'],
  ])('classifies %s as %s', (time, expected) => {
    expect(bandOf(at(time), DEFAULT_SETTINGS)).toBe(expected);
  });

  it('treats the prime boundary as inclusive-low', () => {
    expect(bandOf(at('17:45'), DEFAULT_SETTINGS)).toBe('prime');
    expect(bandOf(at('17:44'), DEFAULT_SETTINGS)).toBe('afternoon');
  });

  it('treats the late boundary as inclusive-low', () => {
    expect(bandOf(at('20:45'), DEFAULT_SETTINGS)).toBe('late');
    expect(bandOf(at('20:44'), DEFAULT_SETTINGS)).toBe('prime');
  });

  it('follows a custom prime window', () => {
    const settings = { ...DEFAULT_SETTINGS, primeWindowStart: '19:00' };
    expect(bandOf(at('17:45'), settings)).toBe('afternoon');
    expect(bandOf(at('19:00'), settings)).toBe('prime');
  });
});

describe('schedulerSettingsSchema', () => {
  it('accepts the defaults', () => {
    expect(schedulerSettingsSchema.safeParse(DEFAULT_SETTINGS).success).toBe(true);
  });

  it('rejects a prime window that starts at or after the late threshold', () => {
    // This would silently collapse the prime band to nothing — the exact state the
    // "derive the upper bound" design does NOT prevent on its own.
    for (const primeWindowStart of ['20:45', '21:00']) {
      expect(schedulerSettingsSchema.safeParse({ ...DEFAULT_SETTINGS, primeWindowStart }).success).toBe(false);
    }
  });

  it.each(['25:00', '9:00', 'abc', '', '7:00 PM'])('rejects malformed time %s', (t) => {
    expect(schedulerSettingsSchema.safeParse({ ...DEFAULT_SETTINGS, primeWindowStart: t }).success).toBe(false);
  });

  it('enforces the documented numeric ranges', () => {
    expect(schedulerSettingsSchema.safeParse({ ...DEFAULT_SETTINGS, lateSlotVarianceFlag: 99 }).success).toBe(false);
    expect(schedulerSettingsSchema.safeParse({ ...DEFAULT_SETTINGS, maxGamesPerWeek: 1 }).success).toBe(false);
  });
});

describe('parseSettings', () => {
  it('fills in a missing prime window', () => {
    const { primeWindowStart, ...withoutPrime } = DEFAULT_SETTINGS;
    expect(parseSettings(withoutPrime).primeWindowStart).toBe('17:45');
  });

  it('repairs a single bad field and keeps the rest', () => {
    const parsed = parseSettings({ ...DEFAULT_SETTINGS, maxGamesPerWeek: 99, weekendVarianceFlag: 5 });
    expect(parsed.maxGamesPerWeek).toBe(DEFAULT_SETTINGS.maxGamesPerWeek);
    expect(parsed.weekendVarianceFlag).toBe(5);
  });

  it('falls back cleanly on an inverted window', () => {
    const parsed = parseSettings({ ...DEFAULT_SETTINGS, primeWindowStart: '22:00' });
    expect(schedulerSettingsSchema.safeParse(parsed).success).toBe(true);
  });

  it('keeps unrelated settings when the two times disagree', () => {
    // The cross-field refinement always reports against primeWindowStart, so a bad
    // lateGameThreshold used to fall through to a full reset — silently discarding the
    // commissioner's flag thresholds because two unrelated times conflicted.
    const parsed = parseSettings({
      lateGameThreshold: '17:00',
      primeWindowStart: '17:45',
      lateSlotVarianceFlag: 4,
      weekendVarianceFlag: 7,
      maxGamesPerWeek: 5,
    });
    expect(parsed.lateSlotVarianceFlag).toBe(4);
    expect(parsed.weekendVarianceFlag).toBe(7);
    expect(parsed.maxGamesPerWeek).toBe(5);
    expect(schedulerSettingsSchema.safeParse(parsed).success).toBe(true);
  });

  it('rejects an empty late threshold, which would classify every slot as late', () => {
    // `slot.startTime >= ''` is true for every slot, so an empty value collapses the
    // afternoon and prime bands entirely. Trivially produced by clearing a time input.
    expect(schedulerSettingsSchema.safeParse({ ...DEFAULT_SETTINGS, lateGameThreshold: '' }).success)
      .toBe(false);
    expect(parseSettings({ ...DEFAULT_SETTINGS, lateGameThreshold: '' }).lateGameThreshold)
      .toBe(DEFAULT_SETTINGS.lateGameThreshold);
  });

  it('rejects a late threshold earlier than the prime window', () => {
    expect(schedulerSettingsSchema.safeParse({ ...DEFAULT_SETTINGS, lateGameThreshold: '17:00' }).success)
      .toBe(false);
  });

  it.each([null, undefined, 'nonsense', 42, []])('survives %s', (raw) => {
    expect(() => parseSettings(raw)).not.toThrow();
    expect(schedulerSettingsSchema.safeParse(parseSettings(raw)).success).toBe(true);
  });
});
