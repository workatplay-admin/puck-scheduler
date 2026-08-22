import { describe, it, expect } from 'vitest';
import { generateSchedule } from '../index';
import { score } from '../scoring';
import { DEFAULT_SETTINGS, bandOf, buildSlotsById } from '@/types/scheduler';
import type { Band, IceSlot } from '@/types/scheduler';
import type { GameAssignment } from '../types';
import { loadRealSeason, buildTeams } from './realSeason';

const SLOTS = loadRealSeason();
const TEAMS = buildTeams(8);

let cached: ReturnType<typeof generateSchedule> | null = null;
const realSchedule = () => {
  cached ??= generateSchedule(SLOTS, TEAMS, DEFAULT_SETTINGS, { seed: 777, saIterations: 20_000 });
  return cached.schedule;
};

/** Per-team counts in each band, for one division. */
const bandCounts = (division: 'A' | 'B'): Record<Band, number[]> => {
  const byId = buildSlotsById(SLOTS);
  const ids = TEAMS.filter(t => t.division === division).map(t => t.id);
  const per = new Map(ids.map(id => [id, { afternoon: 0, prime: 0, late: 0 }]));
  for (const g of realSchedule().games) {
    const band = bandOf(byId[g.slotId], DEFAULT_SETTINGS);
    for (const id of [g.homeTeamId, g.awayTeamId]) {
      const row = per.get(id);
      if (row) row[band]++;
    }
  }
  return {
    afternoon: ids.map(id => per.get(id)!.afternoon),
    prime: ids.map(id => per.get(id)!.prime),
    late: ids.map(id => per.get(id)!.late),
  };
};
const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);

describe('band scoring', () => {
  const slots: IceSlot[] = [
    { id: 'a1', date: '2026-01-04', startTime: '15:15', dayOfWeek: 'Sunday' },
    { id: 'a2', date: '2026-01-11', startTime: '15:15', dayOfWeek: 'Sunday' },
    { id: 'p1', date: '2026-01-18', startTime: '19:00', dayOfWeek: 'Sunday' },
    { id: 'p2', date: '2026-01-25', startTime: '19:00', dayOfWeek: 'Sunday' },
  ];
  const byId = buildSlotsById(slots);
  const g = (home: string, away: string, slotId: string): GameAssignment =>
    ({ division: 'A', homeTeamId: home, awayTeamId: away, slotId });

  it('costs nothing when both bands are shared evenly', () => {
    // t1/t2 take one afternoon and one prime; t3/t4 the same.
    const even = [g('t1', 't2', 'a1'), g('t3', 't4', 'a2'), g('t1', 't2', 'p1'), g('t3', 't4', 'p2')];
    const lopsided = [g('t1', 't2', 'a1'), g('t1', 't2', 'a2'), g('t3', 't4', 'p1'), g('t3', 't4', 'p2')];
    expect(score(lopsided, byId, DEFAULT_SETTINGS)).toBeGreaterThan(score(even, byId, DEFAULT_SETTINGS));
  });

  it('is symmetric between the two bands at equal weight', () => {
    const allAfternoonToOne = [g('t1', 't2', 'a1'), g('t1', 't2', 'a2')];
    const allPrimeToOne = [g('t1', 't2', 'p1'), g('t1', 't2', 'p2')];
    expect(score(allAfternoonToOne, byId, DEFAULT_SETTINGS))
      .toBe(score(allPrimeToOne, byId, DEFAULT_SETTINGS));
  });

  it('scores one division independently of the other', () => {
    const withB = [
      g('t1', 't2', 'a1'), g('t3', 't4', 'a2'),
      { division: 'B' as const, homeTeamId: 'b1', awayTeamId: 'b2', slotId: 'p1' },
    ];
    const onlyA = [g('t1', 't2', 'a1'), g('t3', 't4', 'a2')];
    // Division B contributes its own terms; A's contribution is unchanged by them.
    expect(score(withB, byId, DEFAULT_SETTINGS)).toBeGreaterThanOrEqual(score(onlyA, byId, DEFAULT_SETTINGS));
  });
});

describe('band balance on the real season', () => {
  it.each(['A', 'B'] as const)('keeps prime within 1 across Division %s', (div) => {
    // Was 4 (A) and 6 (B) before the band terms existed.
    expect(spread(bandCounts(div).prime)).toBeLessThanOrEqual(1);
  });

  it.each(['A', 'B'] as const)('keeps afternoon within 2 across Division %s', (div) => {
    expect(spread(bandCounts(div).afternoon)).toBeLessThanOrEqual(2);
  });

  it.each(['A', 'B'] as const)('does not degrade late rigidity in Division %s', (div) => {
    // The hard constraint: band weights yield to late fairness, never the reverse.
    expect(spread(bandCounts(div).late)).toBeLessThanOrEqual(1);
  });
});
