import { describe, it, expect } from 'vitest';
import { generateSchedule, calculateFairnessReport } from '../index';
import type { IceSlot, Team, SchedulerSettings } from '@/types/scheduler';

const SETTINGS: SchedulerSettings = {
  lateGameThreshold: '20:45',
  lateSlotVarianceFlag: 2,
  weekendVarianceFlag: 3,
  maxGamesPerWeek: 3,
};

/** 6-team / 40-slot fixture used by the convergence gate (ADR §5.3.2). */
const buildConvergenceSlots = (): IceSlot[] => {
  const slots: IceSlot[] = [];
  const dates = [
    '2026-01-09', '2026-01-16', '2026-01-23', '2026-01-30',
    '2026-02-06', '2026-02-13', '2026-02-20', '2026-02-27',
    '2026-03-06', '2026-03-13', '2026-03-20', '2026-03-27',
    '2026-04-03', '2026-04-10', '2026-04-17', '2026-04-24',
    '2026-05-01', '2026-05-08', '2026-05-15', '2026-05-22',
  ];
  let id = 1;
  for (const date of dates) {
    slots.push({ id: `s${id++}`, date, startTime: '19:00', dayOfWeek: 'Friday' });
    slots.push({ id: `s${id++}`, date, startTime: '20:45', dayOfWeek: 'Friday' });
  }
  return slots;
};

const buildConvergenceTeams = (): Team[] => [
  { id: 't1', name: 'Alpha', division: 'A' },
  { id: 't2', name: 'Beta', division: 'A' },
  { id: 't3', name: 'Gamma', division: 'A' },
  { id: 't4', name: 'Delta', division: 'B' },
  { id: 't5', name: 'Epsilon', division: 'B' },
  { id: 't6', name: 'Zeta', division: 'B' },
];

describe('convergence — 6-team / 40-slot fixture', { timeout: 60_000 }, () => {
  /**
   * 10 runs at 5k iterations each: fast enough for CI while still exercising SA.
   * The full 50k-iteration tuning target is validated locally via `npm run perf`.
   */
  it('mean weekend variance ≤ 1 and max weekend variance ≤ 2 across 10 runs', () => {
    const slots = buildConvergenceSlots();
    const teams = buildConvergenceTeams();
    const variances: number[] = [];

    for (let run = 0; run < 10; run++) {
      const { schedule } = generateSchedule(slots, teams, SETTINGS, { saIterations: 5_000 });
      const report = calculateFairnessReport(schedule, slots, teams, SETTINGS);
      const weekendCounts = report.teamStats.map(t => t.totalWeekend);
      const range = Math.max(...weekendCounts) - Math.min(...weekendCounts);
      variances.push(range);
    }

    const mean = variances.reduce((s, v) => s + v, 0) / variances.length;
    const max = Math.max(...variances);

    expect(mean).toBeLessThanOrEqual(1);
    expect(max).toBeLessThanOrEqual(2);
  });
});

describe('seed reproducibility', () => {
  it('replaying with schedule.seed produces an identical Schedule', () => {
    const slots = buildConvergenceSlots();
    const teams = buildConvergenceTeams();

    // First run: capture whatever seed was used (may differ from opts.seed if retries occurred)
    const { schedule: s1 } = generateSchedule(slots, teams, SETTINGS, { saIterations: 500 });

    // Second run: replay with the actual seed from s1
    const { schedule: s2 } = generateSchedule(slots, teams, SETTINGS, { seed: s1.seed, saIterations: 500 });

    expect(s2.seed).toBe(s1.seed);
    expect(s2.games.length).toBe(s1.games.length);
    s1.games.forEach((g, i) => {
      expect(g.homeTeamId).toBe(s2.games[i].homeTeamId);
      expect(g.awayTeamId).toBe(s2.games[i].awayTeamId);
      expect(g.slotId).toBe(s2.games[i].slotId);
      expect(g.division).toBe(s2.games[i].division);
    });
  });
});

describe('post-run invariants', () => {
  it('game count is balanced ±1 across all teams', () => {
    const slots = buildConvergenceSlots();
    const teams = buildConvergenceTeams();
    const { schedule } = generateSchedule(slots, teams, SETTINGS, { saIterations: 500 });

    const gameCounts = new Map<string, number>();
    for (const t of teams) gameCounts.set(t.id, 0);
    for (const g of schedule.games) {
      gameCounts.set(g.homeTeamId, (gameCounts.get(g.homeTeamId) ?? 0) + 1);
      gameCounts.set(g.awayTeamId, (gameCounts.get(g.awayTeamId) ?? 0) + 1);
    }
    const counts = [...gameCounts.values()];
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('feasibility failure returns hasInvariantViolations:true without throwing', () => {
    // 1 slot + 4A/2B teams: target_B = 0 → feasibility failure
    const tinySlots: IceSlot[] = [
      { id: 's1', date: '2026-01-09', startTime: '19:00', dayOfWeek: 'Friday' },
    ];
    const manyTeams: Team[] = [
      { id: 't1', name: 'A1', division: 'A' },
      { id: 't2', name: 'A2', division: 'A' },
      { id: 't3', name: 'A3', division: 'A' },
      { id: 't4', name: 'A4', division: 'A' },
      { id: 't5', name: 'B1', division: 'B' },
      { id: 't6', name: 'B2', division: 'B' },
    ];
    const { schedule } = generateSchedule(tinySlots, manyTeams, SETTINGS, { saIterations: 10 });
    expect(schedule.hasInvariantViolations).toBe(true);
    expect(typeof schedule.violationSummary).toBe('string');
  });
});
