import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseIceSlotsExcel } from '../excelParser';

/** Build an in-memory xlsx File from an array of row objects. */
const makeXlsx = (rows: Record<string, string>[], name = 'test.xlsx'): File => {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new File([buf], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

describe('parseIceSlotsExcel — round-trip', () => {
  it('parses a valid xlsx workbook and produces matching IceSlots', async () => {
    const input = [
      { Date: '2026-01-09', 'Start Time': '19:00' },
      { Date: '2026-01-16', 'Start Time': '20:45' },
    ];
    const f = makeXlsx(input);
    const { valid, rejected, wholeFileError } = await parseIceSlotsExcel(f);

    expect(wholeFileError).toBeUndefined();
    expect(rejected).toHaveLength(0);
    expect(valid).toHaveLength(2);
    expect(valid[0].date).toBe('2026-01-09');
    expect(valid[0].startTime).toBe('19:00');
    expect(valid[0].dayOfWeek).toBe('Friday');
    expect(valid[1].date).toBe('2026-01-16');
  });

  it('accepts column aliases (Game Date, Time)', async () => {
    const input = [{ 'Game Date': '2026-01-09', Time: '19:00' }];
    const f = makeXlsx(input);
    const { valid, wholeFileError } = await parseIceSlotsExcel(f);
    expect(wholeFileError).toBeUndefined();
    expect(valid).toHaveLength(1);
  });

  it('rejects rows with invalid dates and reports row numbers', async () => {
    // 5 rows, 1 bad = 20% < 25% threshold
    const input = [
      { Date: '2026-01-09', 'Start Time': '19:00' },
      { Date: '2026-01-16', 'Start Time': '19:00' },
      { Date: 'not-a-date', 'Start Time': '19:00' },
      { Date: '2026-01-23', 'Start Time': '19:00' },
      { Date: '2026-01-30', 'Start Time': '19:00' },
    ];
    const f = makeXlsx(input);
    const { valid, rejected } = await parseIceSlotsExcel(f);
    expect(valid).toHaveLength(4);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].row).toBe(4); // header=1, data starts at 2, bad row at index 2 → row 4
  });
});

describe('parseIceSlotsExcel — whole-file rejection', () => {
  it('returns wholeFileError when required Date column is missing', async () => {
    const f = makeXlsx([{ 'Start Time': '19:00' }]);
    const { wholeFileError } = await parseIceSlotsExcel(f);
    expect(wholeFileError).toMatch(/date/i);
  });

  it('returns wholeFileError when required Start Time column is missing', async () => {
    const f = makeXlsx([{ Date: '2026-01-09' }]);
    const { wholeFileError } = await parseIceSlotsExcel(f);
    expect(wholeFileError).toMatch(/start time/i);
  });

  it('returns wholeFileError when > 25% of rows are rejected', async () => {
    const input = [
      { Date: '2026-01-09', 'Start Time': '19:00' },
      { Date: 'bad', 'Start Time': 'bad' },
      { Date: 'bad', 'Start Time': 'bad' },
      { Date: '2026-01-16', 'Start Time': '19:00' },
    ];
    const f = makeXlsx(input);
    const { wholeFileError } = await parseIceSlotsExcel(f);
    expect(wholeFileError).toMatch(/too many invalid/i);
  });
});

describe('parseIceSlotsExcel — field-spec coverage', () => {
  it.each([
    ['ISO date', { Date: '2026-01-09', 'Start Time': '19:00' }, true],
    ['US date', { Date: '01/09/2026', 'Start Time': '19:00' }, true],
    ['bad date', { Date: 'tomorrow', 'Start Time': '19:00' }, false],
    ['24h time', { Date: '2026-01-09', 'Start Time': '20:45' }, true],
    ['12h time', { Date: '2026-01-09', 'Start Time': '8:30 PM' }, true],
    ['bad time', { Date: '2026-01-09', 'Start Time': 'noon' }, false],
    ['with location (arena alias)', { Date: '2026-01-09', 'Start Time': '19:00', Arena: 'Main Rink' }, true],
    ['with notes (comments alias)', { Date: '2026-01-09', 'Start Time': '19:00', Comments: 'Test' }, true],
  ])('%s → valid=%s', async (_label, row, expectValid) => {
    const f = makeXlsx([row]);
    const { valid } = await parseIceSlotsExcel(f);
    if (expectValid) {
      expect(valid).toHaveLength(1);
    } else {
      expect(valid).toHaveLength(0);
    }
  });
});
