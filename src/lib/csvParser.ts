import { IceSlot } from '@/types/scheduler';

const getDayOfWeek = (dateStr: string): string => {
  const date = new Date(dateStr + 'T12:00:00');
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
};

const parseDate = (dateStr: string): string | null => {
  const formats = [
    /^(\d{4})-(\d{2})-(\d{2})$/,
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
  ];

  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      if (format === formats[0]) {
        return dateStr;
      } else {
        const [, month, day, year] = match;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }
  }

  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return null;
};

const parseTime = (timeStr: string): string | null => {
  const time24Match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (time24Match) {
    const [, hours, minutes] = time24Match;
    return `${hours.padStart(2, '0')}:${minutes}`;
  }

  const time12Match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)$/);
  if (time12Match) {
    const [, hours, minutes, period] = time12Match;
    let hour = parseInt(hours);
    if (period.toLowerCase() === 'pm' && hour !== 12) {
      hour += 12;
    } else if (period.toLowerCase() === 'am' && hour === 12) {
      hour = 0;
    }
    return `${hour.toString().padStart(2, '0')}:${minutes}`;
  }

  return null;
};

/**
 * Parses a CSV string containing ice-slot data into structured IceSlot objects.
 *
 * Accepts ISO (YYYY-MM-DD), US (MM/DD/YYYY), and US-dash (MM-DD-YYYY) date formats
 * as well as 12-hour and 24-hour time strings. Rows that cannot be parsed produce
 * an entry in `errors` and are excluded from `slots`. The returned slots are sorted
 * by date then start time. Whether a slot is "late" or a "weekend" slot is derived
 * at use time via `isDerivedLate` / `isDerivedWeekend` from `@/types/scheduler`.
 *
 * @param content - Raw CSV text (must include a header row).
 * @returns An object with the parsed `slots` array and any `errors` encountered.
 */
export const parseCSV = (content: string): { slots: IceSlot[]; errors: string[] } => {
  const lines = content.trim().split('\n');
  const slots: IceSlot[] = [];
  const errors: string[] = [];

  if (lines.length < 2) {
    return { slots: [], errors: ['File must contain a header row and at least one data row'] };
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(/[,\t]/).map(p => p.trim().replace(/^["']|["']$/g, ''));

    if (parts.length < 2) {
      errors.push(`Row ${i + 1}: Missing required columns`);
      continue;
    }

    const [dateStr, timeStr] = parts;
    const date = parseDate(dateStr);
    const time = parseTime(timeStr);

    if (!date) {
      errors.push(`Row ${i + 1}: Could not parse date "${dateStr}"`);
      continue;
    }

    if (!time) {
      errors.push(`Row ${i + 1}: Could not parse time "${timeStr}"`);
      continue;
    }

    const dayOfWeek = getDayOfWeek(date);

    slots.push({
      id: `slot-${i}-${Date.now()}`,
      date,
      startTime: time,
      dayOfWeek,
    });
  }

  slots.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.startTime.localeCompare(b.startTime);
  });

  return { slots, errors };
};

/**
 * Converts a 24-hour HH:MM string to a 12-hour display string (e.g. "19:00" → "7:00 PM").
 *
 * @param time24 - Time in HH:MM 24-hour format.
 * @returns Human-readable 12-hour time string.
 */
export const formatTime = (time24: string): string => {
  const [hours, minutes] = time24.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
};

/**
 * Formats an ISO date string (YYYY-MM-DD) into a locale-friendly display string
 * (e.g. "Jan 9, 2026"). Uses a noon anchor to avoid UTC/local timezone shifts.
 *
 * @param dateStr - ISO date string (YYYY-MM-DD).
 * @returns Formatted date string in en-US locale (e.g. "Jan 9, 2026").
 */
export const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
