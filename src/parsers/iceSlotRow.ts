import { z } from 'zod';

/** Accepted column-name variants (case-insensitive, trimmed) for each field. */
export const COL_ALIASES = {
  date: ['date', 'game date'],
  startTime: ['start', 'start time', 'time'],
  dayOfWeek: ['day', 'day of week', 'dow'],
  duration: ['duration', 'length', 'minutes'],
  location: ['location', 'rink', 'arena'],
  notes: ['notes', 'comments'],
} as const;

/** Canonical field names after header normalisation. */
export type CanonicalField = keyof typeof COL_ALIASES;

/**
 * Finds the canonical field name for a raw header string.
 * Returns `null` if no alias matches.
 */
export const resolveHeader = (raw: string): CanonicalField | null => {
  const normalised = raw.trim().toLowerCase();
  for (const [field, aliases] of Object.entries(COL_ALIASES)) {
    if ((aliases as readonly string[]).includes(normalised)) {
      return field as CanonicalField;
    }
  }
  return null;
};

/** Raw canonical-keyed row extracted from CSV/xlsx before validation. */
export interface RawIceSlotRow {
  date: string;
  startTime: string;
  dayOfWeek?: string;
  duration?: string;
  location?: string;
  notes?: string;
}

/** Validated, transformed row ready for IceSlot construction. */
export interface ValidatedRow {
  dateISO: string;
  startTime: string;
  dayOfWeek: string;
  location?: string;
  notes?: string;
}

const parseDate = (raw: string): string | null => {
  const iso = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return raw.trim();
  const us = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) {
    const [, m, d, y] = us;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
};

const getDayOfWeek = (isoDate: string): string => {
  const date = new Date(`${isoDate}T12:00:00`);
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
};

const parseTime = (raw: string): string | null => {
  const t24 = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (t24) {
    const [, h, m] = t24;
    return `${h.padStart(2, '0')}:${m}`;
  }
  const t12 = raw.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (t12) {
    let h = parseInt(t12[1]);
    const m = t12[2];
    const pm = t12[3].toLowerCase() === 'pm';
    if (pm && h !== 12) h += 12;
    if (!pm && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m}`;
  }
  return null;
};

/** Zod schema for a raw canonical row; produces a {@link ValidatedRow}. */
export const iceSlotRowSchema = z
  .object({
    date: z.string().min(1),
    startTime: z.string().min(1),
    dayOfWeek: z.string().optional(),
    location: z.string().optional(),
    notes: z.string().optional(),
  })
  .transform((row, ctx) => {
    const dateISO = parseDate(row.date);
    if (!dateISO) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unrecognised date format: "${row.date}"` });
      return z.NEVER;
    }

    const startTime = parseTime(row.startTime);
    if (!startTime) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unrecognised time format: "${row.startTime}"` });
      return z.NEVER;
    }

    const derivedDay = getDayOfWeek(dateISO);

    return {
      dateISO,
      startTime,
      dayOfWeek: derivedDay,
      location: row.location ? row.location.slice(0, 80) : undefined,
      notes: row.notes ? row.notes.slice(0, 200) : undefined,
    } satisfies ValidatedRow;
  });
