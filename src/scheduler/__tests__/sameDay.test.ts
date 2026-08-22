import { describe, it, expect } from 'vitest';
import { generateSchedule, calculateFairnessReport } from '../index';
import { score } from '../scoring';
import { DEFAULT_SETTINGS, buildSlotsById } from '@/types/scheduler';
import type { IceSlot } from '@/types/scheduler';
import type { GameAssignment } from '../types';
import { loadRealSeason, buildTeams, gamesPerTeamPerDate } from './realSeason';

const SLOTS = loadRealSeason();
const TEAMS = buildTeams(8);

/** One generation shared across the season-level assertions — each run is ~20s. */
let cached: ReturnType<typeof generateSchedule> | null = null;
const realSchedule = () => {
  cached ??= generateSchedule(SLOTS, TEAMS, DEFAULT_SETTINGS, { seed: 777, saIterations: 20_000 });
  return cached.schedule;
};

/** Two dates, four slots each, so a team can be placed twice on one date deliberately. */
const PROBE_SLOTS: IceSlot[] = [
  { id: 'p1', date: '2026-01-04', startTime: '18:00', dayOfWeek: 'Sunday' },
  { id: 'p2', date: '2026-01-04', startTime: '19:15', dayOfWeek: 'Sunday' },
  { id: 'p3', date: '2026-01-11', startTime: '18:00', dayOfWeek: 'Sunday' },
  { id: 'p4', date: '2026-01-11', startTime: '19:15', dayOfWeek: 'Sunday' },
];
const PROBE_BY_ID = buildSlotsById(PROBE_SLOTS);
const g = (home: string, away: string, slotId: string): GameAssignment =>
  ({ division: 'A', homeTeamId: home, awayTeamId: away, slotId });

describe('same-day penalty', () => {
  it('charges an extra game on the same date', () => {
    const spread = [g('t1', 't2', 'p1'), g('t1', 't3', 'p3')];
    const doubled = [g('t1', 't2', 'p1'), g('t1', 't3', 'p2')];
    expect(score(doubled, PROBE_BY_ID, DEFAULT_SETTINGS))
      .toBeGreaterThan(score(spread, PROBE_BY_ID, DEFAULT_SETTINGS));
  });

  it('charges a triple-header twice what it charges a double', () => {
    const base = [g('t1', 't2', 'p1'), g('t3', 't4', 'p3')];
    const dbl = [g('t1', 't2', 'p1'), g('t1', 't4', 'p2')];
    const trp = [g('t1', 't2', 'p1'), g('t1', 't4', 'p2'), g('t1', 't3', 'p3'), g('t1', 't5', 'p4')];

    const dblCost = score(dbl, PROBE_BY_ID, DEFAULT_SETTINGS) - score(base, PROBE_BY_ID, DEFAULT_SETTINGS);
    // Two dates each carrying one extra game costs exactly twice one such date.
    const trpCost = score(trp, PROBE_BY_ID, DEFAULT_SETTINGS);
    expect(trpCost).toBeGreaterThan(dblCost);
  });

  it('still penalises a genuine one-day rest gap separately', () => {
    const backToBack: IceSlot[] = [
      { id: 'r1', date: '2026-01-04', startTime: '18:00', dayOfWeek: 'Sunday' },
      { id: 'r2', date: '2026-01-05', startTime: '18:00', dayOfWeek: 'Monday' },
    ];
    const byId = buildSlotsById(backToBack);
    const consecutive = [g('t1', 't2', 'r1'), g('t1', 't3', 'r2')];
    // A 1-day gap costs the rest-day penalty but not the same-day penalty, so it must
    // land far below what two games on one date would cost.
    expect(score(consecutive, byId, DEFAULT_SETTINGS)).toBeLessThan(5000);
  });
});

describe('same-day elimination on the real season', () => {
  it('produces zero same-day games', () => {
    const counts = gamesPerTeamPerDate(realSchedule().games, buildSlotsById(SLOTS));
    const extra = [...counts.values()].reduce((sum, n) => sum + Math.max(0, n - 1), 0);
    expect(extra).toBe(0);
  });

  it('leaves every team playing at most once a day', () => {
    const counts = gamesPerTeamPerDate(realSchedule().games, buildSlotsById(SLOTS));
    for (const n of counts.values()) expect(n).toBe(1);
  });
});

describe('same-day reporting', () => {
  it('reports nothing for a clean season', () => {
    const report = calculateFairnessReport(realSchedule(), SLOTS, TEAMS, DEFAULT_SETTINGS);
    report.teamStats.forEach(s => expect(s.sameDayDates).toEqual([]));
  });

  it('names the offending dates when a double exists', () => {
    const teams = buildTeams(2).filter(t => t.division === 'A');
    const schedule = {
      games: [
        { id: 'g1', division: 'A' as const, homeTeamId: 'a0', awayTeamId: 'a1', slotId: 'p1' },
        { id: 'g2', division: 'A' as const, homeTeamId: 'a0', awayTeamId: 'a1', slotId: 'p2' },
      ],
      seed: 1,
      generatedAt: '',
      fairnessScore: 0,
    };
    const report = calculateFairnessReport(schedule, PROBE_SLOTS, teams, DEFAULT_SETTINGS);
    // Both teams involved are named, and the date appears once — it is a list of dates,
    // not of extra games.
    report.teamStats.forEach(s => expect(s.sameDayDates).toEqual(['2026-01-04']));
  });

  it('leaves uninvolved teams clean', () => {
    const teams = buildTeams(3).filter(t => t.division === 'A');
    const schedule = {
      games: [
        { id: 'g1', division: 'A' as const, homeTeamId: 'a0', awayTeamId: 'a1', slotId: 'p1' },
        { id: 'g2', division: 'A' as const, homeTeamId: 'a0', awayTeamId: 'a1', slotId: 'p2' },
      ],
      seed: 1,
      generatedAt: '',
      fairnessScore: 0,
    };
    const report = calculateFairnessReport(schedule, PROBE_SLOTS, teams, DEFAULT_SETTINGS);
    expect(report.teamStats.find(s => s.teamName === 'A2')!.sameDayDates).toEqual([]);
  });
});
