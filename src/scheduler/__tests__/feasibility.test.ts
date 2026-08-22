import { describe, it, expect } from 'vitest';
import { generateSchedule } from '../index';
import { assignDays } from '../dayAssignment';
import { DEFAULT_SETTINGS } from '@/types/scheduler';
import type { IceSlot, Team } from '@/types/scheduler';
import { loadRealSeason, buildTeams } from './realSeason';

const SLOTS = loadRealSeason();
const FAST = { seed: 99, saIterations: 200 };

/**
 * 8 v 2. Division B can host only `floor(2 / 2) = 1` game per date, so it cannot absorb a
 * fair share of 6-slot Sundays and lands far below the allowed games-per-team band.
 *
 * Note 8 v 4 is *not* lopsided enough: proportional targets still land both divisions
 * inside the band, which is the check working as intended.
 */
const lopsided = (): Team[] => [
  ...Array.from({ length: 8 }, (_, i) => ({ id: `a${i}`, name: `A${i}`, division: 'A' as const })),
  ...Array.from({ length: 2 }, (_, i) => ({ id: `b${i}`, name: `B${i}`, division: 'B' as const })),
];

describe('the strict ADR §5.1 check', () => {
  it('accepts the real season', () => {
    const { feasibility } = assignDays(SLOTS, buildTeams(8), DEFAULT_SETTINGS, Math.random);
    expect(feasibility.ok).toBe(true);
    expect(feasibility.reason).toBeUndefined();
  });

  it('computes the allowed games-per-team band', () => {
    const { feasibility } = assignDays(SLOTS, buildTeams(8), DEFAULT_SETTINGS, Math.random);
    // 236 slots x 2 / 16 teams = 29.5
    expect(feasibility.allowedRange).toEqual([29, 30]);
    expect(feasibility.gamesPerTeam.A).toBeCloseTo(29.5);
    expect(feasibility.gamesPerTeam.B).toBeCloseTo(29.5);
  });

  it('reports numbers rather than pre-baked prose', () => {
    const { feasibility } = assignDays(SLOTS, lopsided(), DEFAULT_SETTINGS, Math.random);
    expect(typeof feasibility.gamesPerTeam.A).toBe('number');
    expect(typeof feasibility.gamesPerTeam.B).toBe('number');
    expect(feasibility.allowedRange).toHaveLength(2);
  });

  it('accepts a mix landing exactly on the band boundaries', () => {
    // 20 slots over 4v4 teams: 40 team-games / 8 = exactly 5 per team.
    const evenSlots: IceSlot[] = Array.from({ length: 20 }, (_, i) => ({
      id: `s${i}`,
      date: `2026-01-${String((i % 10) + 1).padStart(2, '0')}`,
      startTime: i % 2 === 0 ? '19:00' : '20:30',
      dayOfWeek: 'Monday',
    }));
    const { feasibility } = assignDays(evenSlots, buildTeams(4), DEFAULT_SETTINGS, Math.random);
    expect(feasibility.ok).toBe(true);
  });
});

describe('a feasibility failure never yields an empty schedule', () => {
  it('still generates on a lopsided roster, with a warning', () => {
    const { schedule } = generateSchedule(SLOTS, lopsided(), DEFAULT_SETTINGS, FAST);
    expect(schedule.games.length).toBeGreaterThan(0);
    expect(typeof schedule.feasibilityWarning).toBe('string');
  });

  it('keeps the warning channel separate from the invariant channel', () => {
    // 8 v 2 trips both: the slot split is infeasible *and* the resulting schedule breaks
    // the global games-per-team invariant. They are independent signals reported through
    // independent fields — feasibility must never be laundered through violationSummary,
    // which means "the schedule I produced is broken", not "your inputs are lopsided".
    const { schedule } = generateSchedule(SLOTS, lopsided(), DEFAULT_SETTINGS, FAST);
    expect(schedule.feasibilityWarning).toBeTruthy();
    expect(schedule.violationSummary).not.toBe(schedule.feasibilityWarning);
    expect(schedule.games.length).toBeGreaterThan(0);
  });

  it('sets neither flag for a healthy season', () => {
    const { schedule } = generateSchedule(SLOTS, buildTeams(8), DEFAULT_SETTINGS, FAST);
    expect(schedule.feasibilityWarning).toBeUndefined();
    expect(schedule.hasInvariantViolations).toBeFalsy();
  });

  it('leaves the real season unwarned', () => {
    const { schedule } = generateSchedule(SLOTS, buildTeams(8), DEFAULT_SETTINGS, FAST);
    expect(schedule.feasibilityWarning).toBeUndefined();
  });

  it.each([2, 3, 4, 5, 6, 8, 10])('generates games for %i teams per division', (n) => {
    const { schedule } = generateSchedule(SLOTS, buildTeams(n), DEFAULT_SETTINGS, FAST);
    expect(schedule.games.length).toBeGreaterThan(0);
  });

  it('generates when only one division is viable', () => {
    const teams: Team[] = [
      ...Array.from({ length: 8 }, (_, i) => ({ id: `a${i}`, name: `A${i}`, division: 'A' as const })),
      { id: 'b0', name: 'B0', division: 'B' as const },
    ];
    const { schedule } = generateSchedule(SLOTS, teams, DEFAULT_SETTINGS, FAST);
    expect(schedule.games.length).toBeGreaterThan(0);
  });

  it('returns an empty schedule only when no division can field a game', () => {
    const teams: Team[] = [
      { id: 'a0', name: 'A0', division: 'A' },
      { id: 'b0', name: 'B0', division: 'B' },
    ];
    const { schedule } = generateSchedule(SLOTS, teams, DEFAULT_SETTINGS, FAST);
    expect(schedule.games).toHaveLength(0);
  });
});
