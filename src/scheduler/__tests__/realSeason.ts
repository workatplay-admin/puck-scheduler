import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IceSlot, Team } from '@/types/scheduler';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * The committed real season: 236 slots over 72 dates (23 Sundays x 6 slots, 24 Tuesdays
 * and 25 Wednesdays x 2). Ten distinct start times, 51% of them late, zero Friday or
 * Saturday ice.
 *
 * Synthetic fixtures are not a substitute here — an earlier synthetic league converged at
 * 30k iterations and wrongly implied the budget could be cut, because it had two distinct
 * start times where this file has ten.
 */
export const loadRealSeason = (): IceSlot[] =>
  readFileSync(resolve(__dirname, '../../../examples/calendar_dates_times_sr_mens.csv'), 'utf8')
    .trim()
    .split('\n')
    .slice(1)
    .map((line, i) => {
      const [date, , time] = line.split(',').map(v => v.trim());
      return { id: `s${i}`, date, startTime: time, dayOfWeek: DAYS[new Date(`${date}T12:00:00`).getDay()] };
    });

/** Builds `perDivision` teams in each of A and B. */
export const buildTeams = (perDivision: number): Team[] => [
  ...Array.from({ length: perDivision }, (_, i) => ({ id: `a${i}`, name: `A${i}`, division: 'A' as const })),
  ...Array.from({ length: perDivision }, (_, i) => ({ id: `b${i}`, name: `B${i}`, division: 'B' as const })),
];

/** Groups a division's assigned slots by date, each sorted by start time. */
export const byDate = (slots: IceSlot[]): Map<string, IceSlot[]> => {
  const map = new Map<string, IceSlot[]>();
  for (const s of slots) {
    const arr = map.get(s.date) ?? [];
    arr.push(s);
    map.set(s.date, arr);
  }
  for (const arr of map.values()) arr.sort((a, b) => a.startTime.localeCompare(b.startTime));
  return map;
};

/** Counts games per (team, date) across a schedule. */
export const gamesPerTeamPerDate = (
  games: Array<{ homeTeamId: string; awayTeamId: string; slotId: string }>,
  slotsById: Record<string, IceSlot>,
): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const g of games) {
    const date = slotsById[g.slotId]?.date;
    if (!date) continue;
    for (const team of [g.homeTeamId, g.awayTeamId]) {
      const key = `${team}|${date}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
};
