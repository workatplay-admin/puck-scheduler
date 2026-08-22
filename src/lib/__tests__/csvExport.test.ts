import { describe, it, expect } from 'vitest';
import Papa from 'papaparse';
import { generateExportCSV } from '../csvExport';
import { generateSchedule, calculateFairnessReport } from '@/scheduler';
import { buildSlotsById, buildTeamsById, DEFAULT_SETTINGS } from '@/types/scheduler';
import type { IceSlot, Team } from '@/types/scheduler';


const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const buildSlots = (): IceSlot[] => {
  const slots: IceSlot[] = [];
  const start = new Date('2026-01-05');
  for (let i = 0; i < 12; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i * 2);
    const date = d.toISOString().split('T')[0];
    slots.push({ id: `s${i}`, date, startTime: '19:00', dayOfWeek: DAYS[d.getDay()] });
  }
  return slots;
};

/** Builds a full export from four teams whose names are the hostile inputs under test. */
const exportWith = (names: string[]): string => {
  const teams: Team[] = names.map((name, i) => ({
    id: `t${i}`,
    name,
    division: i < 2 ? 'A' : 'B',
  }));
  const slots = buildSlots();
  const { schedule } = generateSchedule(slots, teams, DEFAULT_SETTINGS, { seed: 7, saIterations: 50 });
  const report = calculateFairnessReport(schedule, slots, teams, DEFAULT_SETTINGS);
  return generateExportCSV(schedule, report, buildSlotsById(slots), buildTeamsById(teams));
};

const PLAIN = ['Sharks', 'Jets', 'Wolves', 'Bears'];

/** Splits the multi-section export into blocks of contiguous non-empty lines. */
const sections = (csv: string): string[][] =>
  csv
    .split('\n')
    .reduce<string[][]>((acc, line) => {
      if (line === '') {
        if (acc[acc.length - 1]?.length) acc.push([]);
      } else {
        acc[acc.length - 1].push(line);
      }
      return acc;
    }, [[]])
    .filter(block => block.length > 0);

describe('csvExport — field encoding', () => {
  it('leaves ordinary values unquoted', () => {
    const csv = exportWith(PLAIN);
    const block = sections(csv).find(b => b[0] === 'GAMES PER TEAM')!;
    // Team names carry no special characters, so they must not be quoted.
    expect(block.join('\n')).toContain('Sharks,Division A');
    expect(block.join('\n')).not.toContain('"');
  });

  it('quotes the formatted date, which always contains a comma', () => {
    // Regression: `formatDate` emits "Jan 5, 2026". Before quoting was added, every
    // schedule row was one field wider than its header — in every export ever produced,
    // regardless of team names.
    const csv = exportWith(PLAIN);
    const scheduleBlock = sections(csv)[0];
    expect(scheduleBlock[2]).toMatch(/^"[A-Z][a-z]{2} \d{1,2}, \d{4}"/);

    const header = Papa.parse<string[]>(scheduleBlock[1]).data[0];
    const firstRow = Papa.parse<string[]>(scheduleBlock[2]).data[0];
    expect(firstRow).toHaveLength(header.length);
  });

  it('quotes a value containing a comma', () => {
    const csv = exportWith(['Sluggers, Inc.', 'Jets', 'Wolves', 'Bears']);
    expect(csv).toContain('"Sluggers, Inc."');
  });

  it('doubles an embedded double quote', () => {
    const csv = exportWith(['The "Slug"', 'Jets', 'Wolves', 'Bears']);
    expect(csv).toContain('"The ""Slug"""');
  });

  it('quotes a value containing a newline without creating a new record', () => {
    const csv = exportWith(['Line\nBreak', 'Jets', 'Wolves', 'Bears']);
    expect(csv).toContain('"Line\nBreak"');
    const scheduleBlock = sections(csv)[0];
    const parsed = Papa.parse<string[]>(scheduleBlock.slice(1).join('\n'));
    parsed.data.filter(r => r.length > 1).forEach(row => expect(row).toHaveLength(8));
  });
});

describe('csvExport — spreadsheet formula injection', () => {
  it('neutralises a name that Excel would evaluate as a formula', () => {
    const csv = exportWith(['=HYPERLINK("http://evil","click")', 'Jets', 'Wolves', 'Bears']);
    // Quoting alone is not enough: the spreadsheet evaluates the decoded content, so the
    // value is prefixed with an apostrophe to force literal text.
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""click"")"`);
  });

  it.each(['=1+1', '@SUM(1)', '-2+3+cmd|calc', '+HYPERLINK(1)'])(
    'neutralises a name starting with %s',
    (name) => {
      const csv = exportWith([name, 'Jets', 'Wolves', 'Bears']);
      expect(csv).toContain(`'${name}`);
    },
  );

  it('leaves the exporter\'s own signed numbers alone', () => {
    // Late Surplus is formatted as "+2". Prefixing it would put a stray apostrophe in
    // every cell of that column for any non-spreadsheet consumer, to guard a value that
    // cannot execute anything.
    const csv = exportWith(PLAIN);
    const block = sections(csv).find(b => b[0] === 'LATE SLOT FAIRNESS SUMMARY')!;
    expect(block.slice(2).join('\n')).not.toContain("'+");
    expect(block.slice(2).join('\n')).toMatch(/,\+\d+,/);
  });

  it('leaves ordinary names unprefixed', () => {
    const csv = exportWith(PLAIN);
    expect(csv).not.toContain("'Sharks");
  });
});

describe('csvExport — structural integrity', () => {
  const hostile = ['Sluggers, Inc. "The Slug"', 'A,B,C', 'Quote"Team', 'Bears'];

  it('keeps every row the same width as its section header', () => {
    const csv = exportWith(hostile);
    for (const block of sections(csv)) {
      if (block.length < 3) continue; // title + header only
      const parsed = Papa.parse<string[]>(block.slice(1).join('\n'));
      const rows = parsed.data.filter(r => r.length > 1);
      const width = rows[0].length;
      rows.forEach(row => expect(row).toHaveLength(width));
    }
  });

  it('round-trips hostile team names through the schedule section', () => {
    const csv = exportWith(hostile);
    const scheduleBlock = sections(csv)[0];
    const parsed = Papa.parse<string[]>(scheduleBlock.slice(1).join('\n'));
    const rows = parsed.data.filter(r => r.length > 1).slice(1);

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(hostile).toContain(row[4]); // home team
      expect(hostile).toContain(row[5]); // away team
    }
  });

  it('round-trips hostile names through the games-per-team section', () => {
    const csv = exportWith(hostile);
    const block = sections(csv).find(b => b[0] === 'GAMES PER TEAM')!;
    const parsed = Papa.parse<string[]>(block.slice(2).join('\n'));
    const names = parsed.data.filter(r => r.length > 1).map(r => r[0]);
    hostile.forEach(name => expect(names).toContain(name));
  });

  it('produces byte-identical output for names needing no escaping', () => {
    expect(exportWith(PLAIN)).toBe(exportWith(PLAIN));
  });
});

describe('csvExport — orphaned games (the bug the roster lock prevents)', () => {
  it('silently drops games whose team was deleted after generation', () => {
    const teams: Team[] = PLAIN.map((name, i) => ({
      id: `t${i}`,
      name,
      division: i < 2 ? 'A' : 'B',
    }));
    const slots = buildSlots();
    const { schedule } = generateSchedule(slots, teams, DEFAULT_SETTINGS, { seed: 7, saIterations: 50 });

    // Simulate deleting a team from the roster while the schedule still references it.
    const survivors = teams.filter(t => t.id !== 't0');
    const report = calculateFairnessReport(schedule, slots, survivors, DEFAULT_SETTINGS);
    const csv = generateExportCSV(schedule, report, buildSlotsById(slots), buildTeamsById(survivors));

    const rows = sections(csv)[0].slice(2);
    expect(schedule.games.length).toBeGreaterThan(0);
    // Regression record: the export is short by every game the deleted team played, with
    // no warning anywhere. TeamsTab's roster lock is what makes this unreachable.
    expect(rows.length).toBeLessThan(schedule.games.length);
  });
});

describe('csvExport — v0.6 sections', () => {
  const buildFor = (dayOfWeek: string) => {
    const slots: IceSlot[] = Array.from({ length: 8 }, (_, i) => ({
      id: `w${i}`,
      date: `2026-02-${String(i + 1).padStart(2, '0')}`,
      startTime: i % 2 === 0 ? '16:30' : '21:00',
      dayOfWeek,
    }));
    const teams: Team[] = PLAIN.map((name, i) => ({
      id: `t${i}`, name, division: i < 2 ? 'A' : 'B',
    }));
    const { schedule } = generateSchedule(slots, teams, DEFAULT_SETTINGS, { seed: 7, saIterations: 50 });
    const report = calculateFairnessReport(schedule, slots, teams, DEFAULT_SETTINGS);
    return generateExportCSV(schedule, report, buildSlotsById(slots), buildTeamsById(teams));
  };

  it('carries the time-of-day summary as well as the full grid', () => {
    const csv = buildFor('Monday');
    const titles = sections(csv).map(b => b[0]);
    expect(titles).toContain('TIME OF DAY');
    expect(titles).toContain('TIME SLOT DISTRIBUTION');
  });

  it('omits the weekend section when the season has no Fri/Sat ice', () => {
    const csv = buildFor('Monday');
    expect(sections(csv).map(b => b[0])).not.toContain('FRIDAY & SATURDAY GAMES');
    expect(csv).not.toContain('Friday Game Days');
  });

  it('includes it when the season does', () => {
    const csv = buildFor('Friday');
    expect(sections(csv).map(b => b[0])).toContain('FRIDAY & SATURDAY GAMES');
    expect(csv).toContain('Friday Game Days');
  });

  it('carries the same-day column with formatted dates', () => {
    const csv = buildFor('Monday');
    const block = sections(csv).find(b => b[0] === 'DAY-OF-WEEK DISTRIBUTION')!;
    expect(block[1]).toContain('Same-Day Dates');
  });
});
