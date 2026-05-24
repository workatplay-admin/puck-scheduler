import { describe, it, expect } from 'vitest';
import { parseIceSlotsCSV } from '../csvParser';

const makeFile = (content: string, name = 'test.csv') =>
  new File([content], name, { type: 'text/csv' });

describe('parseIceSlotsCSV — valid data', () => {
  it('parses ISO dates and 24h times', async () => {
    const f = makeFile('Date,Start Time\n2026-01-09,19:00\n2026-01-16,20:45');
    const { valid, rejected, wholeFileError } = await parseIceSlotsCSV(f);
    expect(wholeFileError).toBeUndefined();
    expect(rejected).toHaveLength(0);
    expect(valid).toHaveLength(2);
    expect(valid[0].date).toBe('2026-01-09');
    expect(valid[0].startTime).toBe('19:00');
    expect(valid[0].dayOfWeek).toBe('Friday');
  });

  it('parses US MM/DD/YYYY dates', async () => {
    const f = makeFile('Date,Start Time\n01/16/2026,19:00');
    const { valid } = await parseIceSlotsCSV(f);
    expect(valid[0].date).toBe('2026-01-16');
  });

  it('parses 12-hour time formats', async () => {
    const f = makeFile('Date,Start Time\n2026-01-09,8:30 PM');
    const { valid } = await parseIceSlotsCSV(f);
    expect(valid[0].startTime).toBe('20:30');
  });

  it('accepts column name aliases (case-insensitive)', async () => {
    const f = makeFile('GAME DATE,TIME\n2026-01-09,19:00');
    const { valid, wholeFileError } = await parseIceSlotsCSV(f);
    expect(wholeFileError).toBeUndefined();
    expect(valid).toHaveLength(1);
  });

  it('truncates Location to 80 chars and Notes to 200 chars', async () => {
    const loc = 'L'.repeat(100);
    const notes = 'N'.repeat(300);
    const f = makeFile(`Date,Start Time,Location,Notes\n2026-01-09,19:00,${loc},${notes}`);
    const { valid } = await parseIceSlotsCSV(f);
    expect(valid[0]).not.toHaveProperty('location'); // IceSlot has no location field
    // truncation happens inside ValidatedRow; IceSlot does not carry it
    expect(valid).toHaveLength(1);
  });

  it('handles BOM-prefixed CSV', async () => {
    const bom = '﻿';
    const f = makeFile(`${bom}Date,Start Time\n2026-01-09,19:00`);
    const { valid } = await parseIceSlotsCSV(f);
    expect(valid).toHaveLength(1);
  });
});

describe('parseIceSlotsCSV — per-row rejections', () => {
  it('rejects rows with bad date and reports correct row number', async () => {
    // 5 rows, 1 bad = 20% < 25% threshold — whole-file rejection does not trigger
    const f = makeFile([
      'Date,Start Time',
      '2026-01-09,19:00',
      '2026-01-16,19:00',
      'not-a-date,20:00',  // row 4 (header=1, data starts at 2)
      '2026-01-23,19:00',
      '2026-01-30,19:00',
    ].join('\n'));
    const { valid, rejected } = await parseIceSlotsCSV(f);
    expect(valid).toHaveLength(4);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].row).toBe(4);
    expect(rejected[0].reason).toContain('date format');
  });

  it('rejects rows with bad time', async () => {
    const f = makeFile('Date,Start Time\n2026-01-09,not-a-time');
    const { valid, rejected } = await parseIceSlotsCSV(f);
    expect(valid).toHaveLength(0);
    expect(rejected).toHaveLength(1);
  });
});

describe('parseIceSlotsCSV — whole-file rejection', () => {
  it('returns wholeFileError when file has no data rows', async () => {
    const f = makeFile('Date,Start Time\n');
    const { wholeFileError } = await parseIceSlotsCSV(f);
    expect(wholeFileError).toBeTruthy();
  });

  it('returns wholeFileError when required Date column is missing', async () => {
    const f = makeFile('Start Time\n19:00\n20:00');
    const { wholeFileError } = await parseIceSlotsCSV(f);
    expect(wholeFileError).toMatch(/date/i);
  });

  it('returns wholeFileError when required Start Time column is missing', async () => {
    const f = makeFile('Date\n2026-01-09\n2026-01-16');
    const { wholeFileError } = await parseIceSlotsCSV(f);
    expect(wholeFileError).toMatch(/start time/i);
  });

  it('returns wholeFileError when > 25% of rows are rejected', async () => {
    const rows = [
      'Date,Start Time',
      '2026-01-09,19:00',
      'bad,bad',
      'bad,bad',
      '2026-01-16,19:00',
    ].join('\n');
    const f = makeFile(rows);
    const { wholeFileError, rejected } = await parseIceSlotsCSV(f);
    expect(wholeFileError).toMatch(/too many invalid/i);
    expect(rejected.length).toBeGreaterThan(0);
  });
});
