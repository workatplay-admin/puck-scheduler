import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseCSV } from '../csvParser';

const fixture = (name: string) =>
  readFileSync(resolve(__dirname, '../__fixtures__', name), 'utf-8');

describe('parseCSV — iso-dates fixture', () => {
  it('parses all 5 rows without errors', () => {
    const { slots, errors } = parseCSV(fixture('iso-dates.csv'));
    expect(errors).toHaveLength(0);
    expect(slots).toHaveLength(5);
  });

  it('normalises dates to ISO format', () => {
    const { slots } = parseCSV(fixture('iso-dates.csv'));
    slots.forEach(s => expect(s.date).toMatch(/^\d{4}-\d{2}-\d{2}$/));
  });

  it('IceSlot does not carry isLate or isWeekend (derived at use time)', () => {
    const { slots } = parseCSV(fixture('iso-dates.csv'));
    slots.forEach(s => {
      expect(s).not.toHaveProperty('isLate');
      expect(s).not.toHaveProperty('isWeekend');
    });
  });

  it('returns slots sorted by date then time', () => {
    const { slots } = parseCSV(fixture('iso-dates.csv'));
    for (let i = 1; i < slots.length; i++) {
      const prev = slots[i - 1];
      const curr = slots[i];
      const cmp =
        prev.date < curr.date ||
        (prev.date === curr.date && prev.startTime <= curr.startTime);
      expect(cmp).toBe(true);
    }
  });
});

describe('parseCSV — us-dates fixture', () => {
  it('parses US MM/DD/YYYY dates and produces same ISO dates as iso fixture', () => {
    const iso = parseCSV(fixture('iso-dates.csv')).slots;
    const us = parseCSV(fixture('us-dates.csv')).slots;
    expect(us.map(s => s.date)).toEqual(iso.map(s => s.date));
  });

  it('returns no errors', () => {
    const { errors } = parseCSV(fixture('us-dates.csv'));
    expect(errors).toHaveLength(0);
  });
});

describe('parseCSV — malformed-rows fixture', () => {
  it('rejects the bad-date row and the bad-time row', () => {
    const { slots, errors } = parseCSV(fixture('malformed-rows.csv'));
    expect(slots).toHaveLength(2);
    expect(errors).toHaveLength(2);
  });

  it('error messages reference the correct row numbers', () => {
    const { errors } = parseCSV(fixture('malformed-rows.csv'));
    expect(errors[0]).toContain('Row 3');
    expect(errors[1]).toContain('Row 4');
  });
});

describe('parseCSV — timezone regression (getDayOfWeek)', () => {
  it('returns Friday for 2026-01-09 regardless of host TZ', () => {
    const { slots } = parseCSV('Date,Time\n2026-01-09,19:00');
    expect(slots[0].dayOfWeek).toBe('Friday');
  });

  it('returns Saturday for 2026-01-10 regardless of host TZ', () => {
    const { slots } = parseCSV('Date,Time\n2026-01-10,20:00');
    expect(slots[0].dayOfWeek).toBe('Saturday');
  });

  it('returns Monday for 2026-11-02 (DST fall-back day in Americas)', () => {
    const { slots } = parseCSV('Date,Time\n2026-11-02,19:00');
    expect(slots[0].dayOfWeek).toBe('Monday');
  });
});
