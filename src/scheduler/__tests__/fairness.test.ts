import { describe, it, expect } from 'vitest';
import { calculateFairnessReport, generateSchedule } from '../index';
import { score } from '../scoring';
import { buildSlotsById } from '@/types/scheduler';
import type {
  IceSlot, Team, Game, Schedule, SchedulerSettings,
} from '@/types/scheduler';
import type { GameAssignment } from '../types';

const SETTINGS: SchedulerSettings = {
  lateGameThreshold: '20:45',
  lateSlotVarianceFlag: 2,
  weekendVarianceFlag: 3,
  maxGamesPerWeek: 3,
};

const mkSchedule = (games: Game[]): Schedule => ({
  games,
  seed: 0,
  generatedAt: '2026-01-01T00:00:00Z',
  fairnessScore: 0,
});

const findStat = (report: ReturnType<typeof calculateFairnessReport>, name: string) =>
  report.teamStats.find(s => s.teamName === name)!;

describe('fairness — canonical Late Surplus metric', () => {
  it('lateSurplus = totalLateGames − divisionFloor for every team in each division', () => {
    // Targets — Division A: A1=10, A2=9 (floor), A3=11, A4=12 → surpluses 1, 0, 2, 3
    //          Division B: B1=2 (floor), B2=4, B3=4              → surpluses 0, 2, 2
    // Construction yields exactly 21 division-A games and 5 division-B games at late times.
    const teams: Team[] = [
      { id: 'a1', name: 'A1', division: 'A' },
      { id: 'a2', name: 'A2', division: 'A' },
      { id: 'a3', name: 'A3', division: 'A' },
      { id: 'a4', name: 'A4', division: 'A' },
      { id: 'b1', name: 'B1', division: 'B' },
      { id: 'b2', name: 'B2', division: 'B' },
      { id: 'b3', name: 'B3', division: 'B' },
    ];

    // 26 distinct slots — even split between two late times to exercise the
    // "across two slots" canonical-metric requirement.
    const slots: IceSlot[] = [];
    for (let i = 0; i < 26; i++) {
      slots.push({
        id: `s${i}`,
        date: `2026-${String(Math.floor(i / 6) + 1).padStart(2, '0')}-${String((i % 6) + 1).padStart(2, '0')}`,
        startTime: i % 2 === 0 ? '20:45' : '21:00',
        dayOfWeek: 'Tuesday',
      });
    }

    // Division A pair counts: A1A2=3, A1A3=3, A1A4=4, A2A3=3, A2A4=3, A3A4=5 → 21 games
    const aPairs: [string, string, number][] = [
      ['a1', 'a2', 3], ['a1', 'a3', 3], ['a1', 'a4', 4],
      ['a2', 'a3', 3], ['a2', 'a4', 3], ['a3', 'a4', 5],
    ];
    // Division B pair counts: B1B2=1, B1B3=1, B2B3=3 → 5 games
    const bPairs: [string, string, number][] = [
      ['b1', 'b2', 1], ['b1', 'b3', 1], ['b2', 'b3', 3],
    ];

    const games: Game[] = [];
    let slotIdx = 0;
    for (const [home, away, count] of aPairs) {
      for (let i = 0; i < count; i++) {
        games.push({ id: `g${games.length}`, homeTeamId: home, awayTeamId: away, slotId: `s${slotIdx++}`, division: 'A' });
      }
    }
    for (const [home, away, count] of bPairs) {
      for (let i = 0; i < count; i++) {
        games.push({ id: `g${games.length}`, homeTeamId: home, awayTeamId: away, slotId: `s${slotIdx++}`, division: 'B' });
      }
    }

    const report = calculateFairnessReport(mkSchedule(games), slots, teams, SETTINGS);

    expect(findStat(report, 'A1').totalLateGames).toBe(10);
    expect(findStat(report, 'A2').totalLateGames).toBe(9);
    expect(findStat(report, 'A3').totalLateGames).toBe(11);
    expect(findStat(report, 'A4').totalLateGames).toBe(12);

    expect(findStat(report, 'A1').lateSurplus).toBe(1);
    expect(findStat(report, 'A2').lateSurplus).toBe(0);
    expect(findStat(report, 'A3').lateSurplus).toBe(2);
    expect(findStat(report, 'A4').lateSurplus).toBe(3);

    // Strict-greater flag predicate: A3 at exactly +2 is NOT flagged; A4 at +3 IS.
    expect(findStat(report, 'A1').lateSlotFlagged).toBe(false);
    expect(findStat(report, 'A2').lateSlotFlagged).toBe(false);
    expect(findStat(report, 'A3').lateSlotFlagged).toBe(false);
    expect(findStat(report, 'A4').lateSlotFlagged).toBe(true);

    expect(findStat(report, 'B1').totalLateGames).toBe(2);
    expect(findStat(report, 'B2').totalLateGames).toBe(4);
    expect(findStat(report, 'B3').totalLateGames).toBe(4);
    expect(findStat(report, 'B1').lateSurplus).toBe(0);
    expect(findStat(report, 'B2').lateSurplus).toBe(2);
    expect(findStat(report, 'B3').lateSurplus).toBe(2);
    // None flagged: strict-greater, surplus exactly equal to flag threshold doesn't trigger.
    expect(findStat(report, 'B2').lateSlotFlagged).toBe(false);
    expect(findStat(report, 'B3').lateSlotFlagged).toBe(false);
  });
});

describe('fairness — concentration guard (level 1, scoring)', () => {
  it('score(concentrated) > score(dispersed) when aggregate totals are equal', () => {
    // Identical aggregate per-team totals (4 each). Only difference: in Concentrated,
    // A1's 4 late games are all at 21:00; in Dispersed, every team plays 2× at each
    // late time. Per-individual-late-slot variance (×100) is the only term that differs.
    const slots: IceSlot[] = [
      { id: 'd1-2045', date: '2026-01-06', startTime: '20:45', dayOfWeek: 'Tuesday' },
      { id: 'd1-2100', date: '2026-01-06', startTime: '21:00', dayOfWeek: 'Tuesday' },
      { id: 'd2-2045', date: '2026-01-13', startTime: '20:45', dayOfWeek: 'Tuesday' },
      { id: 'd2-2100', date: '2026-01-13', startTime: '21:00', dayOfWeek: 'Tuesday' },
      { id: 'd3-2045', date: '2026-01-20', startTime: '20:45', dayOfWeek: 'Tuesday' },
      { id: 'd3-2100', date: '2026-01-20', startTime: '21:00', dayOfWeek: 'Tuesday' },
      { id: 'd4-2045', date: '2026-01-27', startTime: '20:45', dayOfWeek: 'Tuesday' },
      { id: 'd4-2100', date: '2026-01-27', startTime: '21:00', dayOfWeek: 'Tuesday' },
    ];
    const slotsById = buildSlotsById(slots);

    const concentrated: GameAssignment[] = [
      { division: 'A', homeTeamId: 'a2', awayTeamId: 'a3', slotId: 'd1-2045' },
      { division: 'A', homeTeamId: 'a1', awayTeamId: 'a4', slotId: 'd1-2100' },
      { division: 'A', homeTeamId: 'a3', awayTeamId: 'a4', slotId: 'd2-2045' },
      { division: 'A', homeTeamId: 'a1', awayTeamId: 'a2', slotId: 'd2-2100' },
      { division: 'A', homeTeamId: 'a2', awayTeamId: 'a4', slotId: 'd3-2045' },
      { division: 'A', homeTeamId: 'a1', awayTeamId: 'a3', slotId: 'd3-2100' },
      { division: 'A', homeTeamId: 'a2', awayTeamId: 'a3', slotId: 'd4-2045' },
      { division: 'A', homeTeamId: 'a1', awayTeamId: 'a4', slotId: 'd4-2100' },
    ];

    const dispersed: GameAssignment[] = [
      { division: 'A', homeTeamId: 'a1', awayTeamId: 'a2', slotId: 'd1-2045' },
      { division: 'A', homeTeamId: 'a3', awayTeamId: 'a4', slotId: 'd1-2100' },
      { division: 'A', homeTeamId: 'a1', awayTeamId: 'a3', slotId: 'd2-2045' },
      { division: 'A', homeTeamId: 'a2', awayTeamId: 'a4', slotId: 'd2-2100' },
      { division: 'A', homeTeamId: 'a3', awayTeamId: 'a4', slotId: 'd3-2045' },
      { division: 'A', homeTeamId: 'a1', awayTeamId: 'a2', slotId: 'd3-2100' },
      { division: 'A', homeTeamId: 'a2', awayTeamId: 'a4', slotId: 'd4-2045' },
      { division: 'A', homeTeamId: 'a1', awayTeamId: 'a3', slotId: 'd4-2100' },
    ];

    const sc = score(concentrated, slotsById, SETTINGS);
    const sd = score(dispersed, slotsById, SETTINGS);

    expect(sc).toBeGreaterThan(sd);
    // If this assertion ever fails, the per-slot multiplier is too small — bump
    // ×100 → ×200 in scoring.ts. See late-fairness-redefinition.md §Scoring.
  });
});

describe('fairness — concentration guard (level 2, generation)', () => {
  /**
   * Regression smoke test, not a mathematical proof. On a fixed seed the SA should
   * find a layout where no team has 100% of its late games stacked on the latest
   * slot. If this becomes flaky from SA-internal refactors, demote to a manual
   * convergence fixture rather than weakening the level-1 scoring guarantee.
   */
  it('no team ends up with 100% of its late games on the latest slot', () => {
    const teams: Team[] = [
      { id: 't1', name: 'T1', division: 'A' },
      { id: 't2', name: 'T2', division: 'A' },
      { id: 't3', name: 'T3', division: 'A' },
      { id: 't4', name: 'T4', division: 'A' },
    ];

    // 8 dates, each with one early + two late slots (20:45 and 21:00).
    const slots: IceSlot[] = [];
    const dates = [
      '2026-01-06', '2026-01-13', '2026-01-20', '2026-01-27',
      '2026-02-03', '2026-02-10', '2026-02-17', '2026-02-24',
    ];
    for (const date of dates) {
      slots.push({ id: `${date}-1800`, date, startTime: '18:00', dayOfWeek: 'Tuesday' });
      slots.push({ id: `${date}-2045`, date, startTime: '20:45', dayOfWeek: 'Tuesday' });
      slots.push({ id: `${date}-2100`, date, startTime: '21:00', dayOfWeek: 'Tuesday' });
    }

    const { schedule } = generateSchedule(slots, teams, SETTINGS, { seed: 12345, saIterations: 3000 });
    const report = calculateFairnessReport(schedule, slots, teams, SETTINGS);

    const latest = report.lateTimeSlots[report.lateTimeSlots.length - 1];
    for (const stat of report.teamStats) {
      if (stat.totalLateGames > 1) {
        const onLatest = stat.timeSlots[latest] ?? 0;
        expect(onLatest).toBeLessThan(stat.totalLateGames);
      }
    }
  });
});

describe('fairness — edge cases', () => {
  it('empty division: 0 A teams, 4 B teams — report contains no A entries and does not crash', () => {
    const teams: Team[] = [
      { id: 'b1', name: 'B1', division: 'B' },
      { id: 'b2', name: 'B2', division: 'B' },
      { id: 'b3', name: 'B3', division: 'B' },
      { id: 'b4', name: 'B4', division: 'B' },
    ];
    const slots: IceSlot[] = [
      { id: 's1', date: '2026-01-06', startTime: '20:45', dayOfWeek: 'Tuesday' },
    ];
    const games: Game[] = [
      { id: 'g1', division: 'B', homeTeamId: 'b1', awayTeamId: 'b2', slotId: 's1' },
    ];

    const report = calculateFairnessReport(mkSchedule(games), slots, teams, SETTINGS);
    expect(report.teamStats.filter(s => s.division === 'A')).toHaveLength(0);
    expect(report.teamStats.filter(s => s.division === 'B')).toHaveLength(4);
  });

  it('single-team division: 1 A team has 0 games → excluded from floor, surplus=0, not flagged', () => {
    const teams: Team[] = [
      { id: 'a1', name: 'A1', division: 'A' },
      { id: 'b1', name: 'B1', division: 'B' },
      { id: 'b2', name: 'B2', division: 'B' },
    ];
    const slots: IceSlot[] = [
      { id: 's1', date: '2026-01-06', startTime: '20:45', dayOfWeek: 'Tuesday' },
    ];
    const games: Game[] = [
      { id: 'g1', division: 'B', homeTeamId: 'b1', awayTeamId: 'b2', slotId: 's1' },
    ];

    const report = calculateFairnessReport(mkSchedule(games), slots, teams, SETTINGS);
    const a1 = findStat(report, 'A1');
    expect(a1.totalGames).toBe(0);
    expect(a1.totalLateGames).toBe(0);
    expect(a1.lateSurplus).toBe(0);
    expect(a1.lateSlotFlagged).toBe(false);
  });

  it('no late slots configured (threshold above any slot): all teams have totalLateGames=0', () => {
    const teams: Team[] = [
      { id: 'a1', name: 'A1', division: 'A' },
      { id: 'a2', name: 'A2', division: 'A' },
    ];
    const slots: IceSlot[] = [
      { id: 's1', date: '2026-01-06', startTime: '18:00', dayOfWeek: 'Tuesday' },
      { id: 's2', date: '2026-01-13', startTime: '19:00', dayOfWeek: 'Tuesday' },
    ];
    const games: Game[] = [
      { id: 'g1', division: 'A', homeTeamId: 'a1', awayTeamId: 'a2', slotId: 's1' },
      { id: 'g2', division: 'A', homeTeamId: 'a1', awayTeamId: 'a2', slotId: 's2' },
    ];
    const highThreshold: SchedulerSettings = { ...SETTINGS, lateGameThreshold: '23:00' };

    const report = calculateFairnessReport(mkSchedule(games), slots, teams, highThreshold);
    expect(report.lateTimeSlots).toEqual([]);
    for (const stat of report.teamStats) {
      expect(stat.totalLateGames).toBe(0);
      expect(stat.lateSurplus).toBe(0);
      expect(stat.lateSlotFlagged).toBe(false);
    }
  });

  it('configured-but-absent late slot: threshold is set, no game uses a late slot → 0s everywhere', () => {
    const teams: Team[] = [
      { id: 'a1', name: 'A1', division: 'A' },
      { id: 'a2', name: 'A2', division: 'A' },
    ];
    const slots: IceSlot[] = [
      { id: 's1', date: '2026-01-06', startTime: '18:00', dayOfWeek: 'Tuesday' },
    ];
    const games: Game[] = [
      { id: 'g1', division: 'A', homeTeamId: 'a1', awayTeamId: 'a2', slotId: 's1' },
    ];
    const report = calculateFairnessReport(mkSchedule(games), slots, teams, SETTINGS);
    for (const stat of report.teamStats) {
      expect(stat.totalLateGames).toBe(0);
      expect(stat.lateSurplus).toBe(0);
      expect(stat.lateSlotFlagged).toBe(false);
    }
  });
});

describe('fairness — skewed-floor case', () => {
  it('one outlier with very few late games still produces correct surpluses for the rest', () => {
    // A1=2 (outlier floor), A2=10, A3=10, A4=11 → surpluses 0, 8, 8, 9.
    // Demonstrates the trade-off documented in late-fairness-redefinition.md:
    // an outlier scheduled team makes everyone else's surplus look larger,
    // but the integer is still answering the user's actual question.
    const teams: Team[] = [
      { id: 'a1', name: 'A1', division: 'A' },
      { id: 'a2', name: 'A2', division: 'A' },
      { id: 'a3', name: 'A3', division: 'A' },
      { id: 'a4', name: 'A4', division: 'A' },
    ];

    // Targets A1=2, A2=9, A3=10, A4=11 (sum 32, 16 games). Pair counts solving
    // the linear system: A1A3=1, A1A4=1, A2A3=4, A2A4=5, A3A4=5.
    const pairs: [string, string, number][] = [
      ['a1', 'a3', 1], ['a1', 'a4', 1],
      ['a2', 'a3', 4], ['a2', 'a4', 5], ['a3', 'a4', 5],
    ];

    const slots: IceSlot[] = [];
    const games: Game[] = [];
    let slotIdx = 0;
    for (const [home, away, count] of pairs) {
      for (let i = 0; i < count; i++) {
        slots.push({
          id: `s${slotIdx}`,
          date: `2026-01-${String((slotIdx % 28) + 1).padStart(2, '0')}`,
          startTime: '20:45',
          dayOfWeek: 'Tuesday',
        });
        games.push({ id: `g${slotIdx}`, division: 'A', homeTeamId: home, awayTeamId: away, slotId: `s${slotIdx}` });
        slotIdx++;
      }
    }

    const report = calculateFairnessReport(mkSchedule(games), slots, teams, SETTINGS);

    expect(findStat(report, 'A1').totalLateGames).toBe(2);
    expect(findStat(report, 'A2').totalLateGames).toBe(9);
    expect(findStat(report, 'A3').totalLateGames).toBe(10);
    expect(findStat(report, 'A4').totalLateGames).toBe(11);

    // Floor=2; every other team's surplus is large because the outlier dragged
    // the floor down. Intentional — see late-fairness-redefinition.md §Metric.
    expect(findStat(report, 'A1').lateSurplus).toBe(0);
    expect(findStat(report, 'A2').lateSurplus).toBe(7);
    expect(findStat(report, 'A3').lateSurplus).toBe(8);
    expect(findStat(report, 'A4').lateSurplus).toBe(9);
    // All three non-floor teams get flagged because their surplus > 2.
    expect(findStat(report, 'A2').lateSlotFlagged).toBe(true);
    expect(findStat(report, 'A3').lateSlotFlagged).toBe(true);
    expect(findStat(report, 'A4').lateSlotFlagged).toBe(true);
  });
});

describe('fairness — zero-game team case', () => {
  it('unscheduled team is excluded from divisionFloor; scheduled teams compare against each other', () => {
    // 5 A teams: A0 has 0 games, A1=5, A2=6, A3=6, A4=7 late games.
    // Floor over scheduled teams = 5 (A1). Surpluses for scheduled: 0, 1, 1, 2.
    // A0 (unscheduled): totalLateGames=0, lateSurplus=0, not flagged.
    const teams: Team[] = [
      { id: 'a0', name: 'A0', division: 'A' },
      { id: 'a1', name: 'A1', division: 'A' },
      { id: 'a2', name: 'A2', division: 'A' },
      { id: 'a3', name: 'A3', division: 'A' },
      { id: 'a4', name: 'A4', division: 'A' },
    ];

    // pair counts: A1A2=1, A1A3=2, A1A4=2, A2A3=2, A2A4=3, A3A4=2 →
    // A1=5, A2=6, A3=6, A4=7. (No pairings involve A0.)
    const pairs: [string, string, number][] = [
      ['a1', 'a2', 1], ['a1', 'a3', 2], ['a1', 'a4', 2],
      ['a2', 'a3', 2], ['a2', 'a4', 3], ['a3', 'a4', 2],
    ];

    const slots: IceSlot[] = [];
    const games: Game[] = [];
    let slotIdx = 0;
    for (const [home, away, count] of pairs) {
      for (let i = 0; i < count; i++) {
        slots.push({
          id: `s${slotIdx}`,
          date: `2026-01-${String((slotIdx % 28) + 1).padStart(2, '0')}`,
          startTime: '20:45',
          dayOfWeek: 'Tuesday',
        });
        games.push({ id: `g${slotIdx}`, division: 'A', homeTeamId: home, awayTeamId: away, slotId: `s${slotIdx}` });
        slotIdx++;
      }
    }

    const report = calculateFairnessReport(mkSchedule(games), slots, teams, SETTINGS);

    expect(findStat(report, 'A0').totalGames).toBe(0);
    expect(findStat(report, 'A0').totalLateGames).toBe(0);
    expect(findStat(report, 'A0').lateSurplus).toBe(0);
    expect(findStat(report, 'A0').lateSlotFlagged).toBe(false);

    expect(findStat(report, 'A1').lateSurplus).toBe(0);
    expect(findStat(report, 'A2').lateSurplus).toBe(1);
    expect(findStat(report, 'A3').lateSurplus).toBe(1);
    expect(findStat(report, 'A4').lateSurplus).toBe(2);

    // None of the scheduled teams exceeds +2; none flagged.
    expect(findStat(report, 'A1').lateSlotFlagged).toBe(false);
    expect(findStat(report, 'A4').lateSlotFlagged).toBe(false);
  });
});
