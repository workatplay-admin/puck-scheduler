import { Schedule, FairnessReport, IceSlot, Team, isDerivedWeekend } from '@/types/scheduler';
import { formatDate, formatTime } from './csvParser';

/**
 * Encodes a single CSV field per RFC 4180: wraps the value in double quotes when it
 * contains a comma, double quote, CR or LF, and doubles any embedded double quote.
 * Values with no special characters are returned unchanged so ordinary exports stay
 * quote-free.
 *
 * Also neutralises spreadsheet formula injection. Team names are free text, and a name
 * beginning `=`, `@` or a signed expression is evaluated as a formula by Excel and Google
 * Sheets on open. Quoting alone does not help — the spreadsheet evaluates the field's
 * *decoded* content — so such values are prefixed with an apostrophe, which both
 * applications treat as "the rest of this cell is literal text".
 *
 * A plain signed number is deliberately left alone: the exporter formats Late Surplus as
 * `+2`, and prefixing that would put a stray apostrophe in every cell of the column for
 * any non-spreadsheet consumer, to guard against a value that cannot execute anything.
 *
 * @param value - Raw cell value.
 * @returns The field, escaped and quoted only if required.
 */
const SIGNED_NUMBER = /^[+-][\d.,]*\d$/;
const looksExecutable = (s: string): boolean =>
  /^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !SIGNED_NUMBER.test(s));

const csvCell = (value: string | number): string => {
  const raw = String(value);
  const s = looksExecutable(raw) ? `'${raw}` : raw;
  return /["\r\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Joins one row of cells into a CSV record, encoding each field via {@link csvCell}.
 *
 * @param cells - Ordered cell values for the row.
 * @returns A comma-delimited CSV record.
 */
const csvRow = (cells: Array<string | number>): string => cells.map(csvCell).join(',');

/**
 * Generates a multi-section CSV string from a completed schedule and fairness report.
 *
 * The output contains sections for the schedule, games per team, time slot distribution,
 * late slot fairness, Friday/Saturday games, day-of-week distribution, and division
 * balance. The string is suitable for download as a `.csv` file.
 *
 * @param schedule - Schedule wrapper produced by `generateSchedule`.
 * @param report - Fairness report produced by `calculateFairnessReport`.
 * @param slotsById - Map of slot id → IceSlot for denormalized rendering.
 * @param teamsById - Map of team id → Team for denormalized rendering.
 * @returns A CSV-formatted string ready for download.
 */
export const generateExportCSV = (
  schedule: Schedule,
  report: FairnessReport,
  slotsById: Record<string, IceSlot>,
  teamsById: Record<string, Team>,
): string => {
  const lines: string[] = [];

  lines.push('SCHEDULE');
  lines.push(csvRow(['Date', 'Day', 'Start Time', 'Division', 'Home Team', 'Away Team', 'Late Game', 'Weekend Game']));

  for (const game of schedule.games) {
    const slot = slotsById[game.slotId];
    const homeTeam = teamsById[game.homeTeamId];
    const awayTeam = teamsById[game.awayTeamId];
    if (!slot || !homeTeam || !awayTeam) continue;

    lines.push(csvRow([
      formatDate(slot.date),
      slot.dayOfWeek,
      formatTime(slot.startTime),
      `Division ${game.division}`,
      homeTeam.name,
      awayTeam.name,
      report.lateTimeSlots.includes(slot.startTime) ? 'Yes' : 'No',
      isDerivedWeekend(slot) ? 'Yes' : 'No',
    ]));
  }

  lines.push('');
  lines.push('');

  lines.push('GAMES PER TEAM');
  lines.push(csvRow(['Team', 'Division', 'Total Games']));

  for (const stat of report.teamStats) {
    lines.push(csvRow([stat.teamName, `Division ${stat.division}`, stat.totalGames]));
  }

  lines.push('');
  lines.push('');

  lines.push('TIME SLOT DISTRIBUTION');
  const timeSlotHeaders = ['Team', 'Division', ...report.allTimeSlots.map(t => {
    const isLate = report.lateTimeSlots.includes(t);
    return `${formatTime(t)}${isLate ? ' (LATE)' : ''}`;
  })];
  lines.push(csvRow(timeSlotHeaders));

  for (const stat of report.teamStats) {
    const row = [
      stat.teamName,
      `Division ${stat.division}`,
      ...report.allTimeSlots.map(t => stat.timeSlots[t] || 0),
    ];
    lines.push(csvRow(row));
  }

  lines.push('');
  lines.push('');

  lines.push('LATE SLOT FAIRNESS SUMMARY');
  lines.push(csvRow(['Team', 'Division', 'Total Late', 'Late Surplus', 'Status']));

  for (const stat of report.teamStats) {
    lines.push(csvRow([
      stat.teamName,
      `Division ${stat.division}`,
      stat.totalLateGames,
      `+${stat.lateSurplus}`,
      stat.lateSlotFlagged ? 'FLAGGED' : 'OK',
    ]));
  }

  lines.push('');
  lines.push('');

  lines.push('FRIDAY & SATURDAY GAMES');
  lines.push(csvRow(['Team', 'Division', 'Friday', 'Saturday', 'Total Weekend', 'Status']));

  for (const stat of report.teamStats) {
    lines.push(csvRow([
      stat.teamName,
      `Division ${stat.division}`,
      stat.fridayGames,
      stat.saturdayGames,
      stat.totalWeekend,
      stat.weekendFlagged ? 'FLAGGED' : 'OK',
    ]));
  }

  lines.push('');
  lines.push('');

  lines.push('DAY-OF-WEEK DISTRIBUTION');
  lines.push(csvRow(['Team', 'Division', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', '2+ Same Day']));

  for (const stat of report.teamStats) {
    lines.push(csvRow([
      stat.teamName,
      `Division ${stat.division}`,
      stat.dayOfWeekGames['Monday'] || 0,
      stat.dayOfWeekGames['Tuesday'] || 0,
      stat.dayOfWeekGames['Wednesday'] || 0,
      stat.dayOfWeekGames['Thursday'] || 0,
      stat.dayOfWeekGames['Friday'] || 0,
      stat.dayOfWeekGames['Saturday'] || 0,
      stat.dayOfWeekGames['Sunday'] || 0,
      stat.sameDayDates.map(formatDate).join('; '),
    ]));
  }

  lines.push('');
  lines.push('');

  lines.push('DIVISION BALANCE SUMMARY');
  lines.push(csvRow(['Metric', 'Division A', 'Division B']));

  const divA = report.divisionBalance.find(d => d.division === 'A');
  const divB = report.divisionBalance.find(d => d.division === 'B');

  lines.push(csvRow(['Teams', divA?.teamCount || 0, divB?.teamCount || 0]));
  lines.push(csvRow(['Total Games', divA?.totalGames || 0, divB?.totalGames || 0]));
  lines.push(csvRow(['Games Per Team', divA?.gamesPerTeam ?? '0', divB?.gamesPerTeam ?? '0']));
  lines.push(csvRow(['Friday Game Days', divA?.fridayGameDays || 0, divB?.fridayGameDays || 0]));
  lines.push(csvRow(['Saturday Game Days', divA?.saturdayGameDays || 0, divB?.saturdayGameDays || 0]));
  lines.push(csvRow(['Total Late Slots', divA?.totalLateSlots || 0, divB?.totalLateSlots || 0]));

  return lines.join('\n');
};

/**
 * Triggers a CSV file download in the browser.
 *
 * Creates a temporary anchor element, sets the blob URL and filename, clicks it
 * programmatically, then cleans up the URL object and DOM node.
 *
 * @param content - CSV string to download (e.g. the output of `generateExportCSV`).
 * @param filename - Suggested filename for the downloaded file (e.g. "schedule.csv").
 */
export const downloadCSV = (content: string, filename: string): void => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
};
