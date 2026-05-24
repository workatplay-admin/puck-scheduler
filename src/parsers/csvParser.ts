import Papa from 'papaparse';
import { resolveHeader, iceSlotRowSchema } from './iceSlotRow';
import type { CanonicalField } from './iceSlotRow';
import type { IceSlot } from '@/types/scheduler';

/** Parse result returned to callers; mirrors the shared contract with {@link parseIceSlotsExcel}. */
export interface ParseResult {
  valid: IceSlot[];
  rejected: { row: number; reason: string }[];
  wholeFileError?: string;
}

let _idCounter = 0;
const nextId = () => `slot-csv-${++_idCounter}-${Date.now()}`;

/**
 * Parses a CSV file into {@link IceSlot} records using PapaParse for robust
 * handling of BOM, quoted commas, mixed line endings, and blank trailing rows.
 *
 * Column names are matched case-insensitively against field aliases defined in
 * `iceSlotRow.ts`. Each data row is validated via the shared Zod schema.
 *
 * Whole-file rejection (returns `wholeFileError`) when:
 * - zero data rows after skipping blank lines
 * - any required column (`date`, `startTime`) is absent
 * - more than 25% of rows are rejected
 *
 * @param file - The CSV File object from the browser file picker or drop zone.
 * @returns A {@link ParseResult} with valid slots, per-row rejections, and an
 *          optional whole-file error message.
 */
export const parseIceSlotsCSV = async (file: File): Promise<ParseResult> => {
  const text = await file.text();

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (parsed.data.length === 0) {
    return { valid: [], rejected: [], wholeFileError: 'File contains no data rows' };
  }

  // Build header → canonical field map
  const rawHeaders = Object.keys(parsed.data[0] ?? {});
  const headerMap = new Map<string, CanonicalField>();
  for (const h of rawHeaders) {
    const canonical = resolveHeader(h);
    if (canonical) headerMap.set(h, canonical);
  }

  // Check required columns
  const hasDate = [...headerMap.values()].includes('date');
  const hasTime = [...headerMap.values()].includes('startTime');
  if (!hasDate) return { valid: [], rejected: [], wholeFileError: 'Required column "Date" not found in header' };
  if (!hasTime) return { valid: [], rejected: [], wholeFileError: 'Required column "Start Time" not found in header' };

  const valid: IceSlot[] = [];
  const rejected: { row: number; reason: string }[] = [];

  for (let i = 0; i < parsed.data.length; i++) {
    const rawRow = parsed.data[i];
    const canonical: Record<string, string> = {};
    for (const [header, field] of headerMap) {
      const val = rawRow[header];
      if (val !== undefined && val !== '') canonical[field] = val;
    }

    const result = iceSlotRowSchema.safeParse(canonical);
    if (!result.success) {
      const reason = result.error.errors.map(e => e.message).join('; ');
      rejected.push({ row: i + 2, reason }); // +2: 1-based + header row
    } else {
      valid.push({
        id: nextId(),
        date: result.data.dateISO,
        startTime: result.data.startTime,
        dayOfWeek: result.data.dayOfWeek,
      });
    }
  }

  const totalRows = parsed.data.length;
  if (rejected.length > totalRows * 0.25) {
    return {
      valid: [],
      rejected,
      wholeFileError: `Too many invalid rows: ${rejected.length} of ${totalRows} rejected (> 25%)`,
    };
  }

  return { valid, rejected };
};
