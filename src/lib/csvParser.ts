import { IceSlot } from '@/types/scheduler';

const getDayOfWeek = (dateStr: string): string => {
  const date = new Date(dateStr);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
};

const parseDate = (dateStr: string): string | null => {
  // Try various date formats
  const formats = [
    // ISO format
    /^(\d{4})-(\d{2})-(\d{2})$/,
    // US format MM/DD/YYYY
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    // US format MM-DD-YYYY
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

  // Try parsing with Date constructor
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return null;
};

const parseTime = (timeStr: string): string | null => {
  // Handle 24-hour format
  const time24Match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (time24Match) {
    const [, hours, minutes] = time24Match;
    return `${hours.padStart(2, '0')}:${minutes}`;
  }

  // Handle 12-hour format with AM/PM
  const time12Match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)$/);
  if (time12Match) {
    let [, hours, minutes, period] = time12Match;
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

const isLateGame = (time: string, threshold: string): boolean => {
  return time >= threshold;
};

const isWeekendDay = (dayOfWeek: string): boolean => {
  return dayOfWeek === 'Friday' || dayOfWeek === 'Saturday';
};

export const parseCSV = (content: string, lateThreshold: string): { slots: IceSlot[]; errors: string[] } => {
  const lines = content.trim().split('\n');
  const slots: IceSlot[] = [];
  const errors: string[] = [];

  if (lines.length < 2) {
    return { slots: [], errors: ['File must contain a header row and at least one data row'] };
  }

  // Skip header row
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
      isLate: isLateGame(time, lateThreshold),
      isWeekend: isWeekendDay(dayOfWeek),
    });
  }

  // Sort by date and time
  slots.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.startTime.localeCompare(b.startTime);
  });

  return { slots, errors };
};

export const formatTime = (time24: string): string => {
  const [hours, minutes] = time24.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
};

export const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
