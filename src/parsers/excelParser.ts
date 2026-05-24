import * as XLSX from 'xlsx';
import { resolveHeader, iceSlotRowSchema } from './iceSlotRow';
import type { CanonicalField } from './iceSlotRow';
import type { IceSlot } from '@/types/scheduler';
import type { ParseResult } from './csvParser';

let _idCounter = 0;
const nextId = () => `slot-xlsx-${++_idCounter}-${Date.now()}`;

/**
 * Parses an `.xlsx` or `.xls` file into {@link IceSlot} records using SheetJS.
 *
 * The first sheet is converted to JSON rows with `raw: false` so dates and
 * numbers arrive as formatted strings. Column names are matched
 * case-insensitively against field aliases defined in `iceSlotRow.ts`, then
 * validated through the shared Zod schema.
 *
 * Whole-file rejection rules match `parseIceSlotsCSV`:
 * - zero data rows
 * - any required column missing
 * - more than 25% of rows rejected
 *
 * @param file - The xlsx/xls File object from the browser file picker or drop zone.
 * @returns A {@link ParseResult} with valid slots, per-row rejections, and an
 *          optional whole-file error message.
 */
export const parseIceSlotsExcel = async (file: File): Promise<ParseResult> => {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { valid: [], rejected: [], wholeFileError: 'File contains no sheets' };
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { raw: false });

  if (rows.length === 0) {
    return { valid: [], rejected: [], wholeFileError: 'File contains no data rows' };
  }

  // Build header → canonical field map
  const rawHeaders = Object.keys(rows[0] ?? {});
  const headerMap = new Map<string, CanonicalField>();
  for (const h of rawHeaders) {
    const canonical = resolveHeader(h);
    if (canonical) headerMap.set(h, canonical);
  }

  const hasDate = [...headerMap.values()].includes('date');
  const hasTime = [...headerMap.values()].includes('startTime');
  if (!hasDate) return { valid: [], rejected: [], wholeFileError: 'Required column "Date" not found in header' };
  if (!hasTime) return { valid: [], rejected: [], wholeFileError: 'Required column "Start Time" not found in header' };

  const valid: IceSlot[] = [];
  const rejected: { row: number; reason: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rawRow = rows[i];
    const canonical: Record<string, string> = {};
    for (const [header, field] of headerMap) {
      const val = rawRow[header];
      if (val !== undefined && String(val).trim() !== '') canonical[field] = String(val).trim();
    }

    const result = iceSlotRowSchema.safeParse(canonical);
    if (!result.success) {
      const reason = result.error.errors.map(e => e.message).join('; ');
      rejected.push({ row: i + 2, reason });
    } else {
      valid.push({
        id: nextId(),
        date: result.data.dateISO,
        startTime: result.data.startTime,
        dayOfWeek: result.data.dayOfWeek,
      });
    }
  }

  const totalRows = rows.length;
  if (rejected.length > totalRows * 0.25) {
    return {
      valid: [],
      rejected,
      wholeFileError: `Too many invalid rows: ${rejected.length} of ${totalRows} rejected (> 25%)`,
    };
  }

  return { valid, rejected };
};
