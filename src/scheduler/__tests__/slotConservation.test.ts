import { describe, it, expect } from 'vitest';
import { generateSchedule } from '../index';
import { DEFAULT_SETTINGS, buildSlotsById } from '@/types/scheduler';
import { loadRealSeason, buildTeams, gamesPerTeamPerDate } from './realSeason';

const SLOTS = loadRealSeason();
const FAST = { seed: 4242, saIterations: 400 };

describe('slot conservation', () => {
  it('turns every ice slot into a game on the real season', () => {
    const { schedule, unusedSlots } = generateSchedule(SLOTS, buildTeams(8), DEFAULT_SETTINGS, FAST);
    expect(schedule.games).toHaveLength(SLOTS.length);
    expect(unusedSlots).toHaveLength(0);
  });

  it.each([4, 6, 8, 10])('accounts for every slot with %i teams per division', (n) => {
    // Conservation holds unconditionally: a slot is either played or listed as unused.
    const { schedule, unusedSlots } = generateSchedule(SLOTS, buildTeams(n), DEFAULT_SETTINGS, FAST);
    expect(schedule.games.length + unusedSlots.length).toBe(SLOTS.length);
  });

  it.each([6, 8, 10])('leaves nothing unused with %i teams per division', (n) => {
    // Every slot is playable while the roster satisfies the capacity guarantee: a date
    // never carries more slots than the two divisions can host, i.e. n >= 6 against
    // 6-slot Sundays, since capacity per division is floor(teams / 2).
    const { unusedSlots } = generateSchedule(SLOTS, buildTeams(n), DEFAULT_SETTINGS, FAST);
    expect(unusedSlots).toHaveLength(0);
  });

  it('reports, rather than hides, ice a too-small roster cannot use', () => {
    // 4 teams per division caps each at 2 games per date, so 6-slot Sundays exceed the
    // combined capacity of 4 and two slots per Sunday become unplayable. That is a roster
    // problem, and it is surfaced instead of being silently dropped.
    const { schedule, unusedSlots } = generateSchedule(SLOTS, buildTeams(4), DEFAULT_SETTINGS, FAST);
    expect(unusedSlots).toHaveLength(46); // 23 Sundays x 2 surplus slots
    expect(schedule.games.length + unusedSlots.length).toBe(SLOTS.length);
    expect(schedule.feasibilityWarning).toBeTruthy();
  });

  it('never emits a game for a slot that does not exist', () => {
    const { schedule } = generateSchedule(SLOTS, buildTeams(8), DEFAULT_SETTINGS, FAST);
    const ids = new Set(SLOTS.map(s => s.id));
    schedule.games.forEach(g => expect(ids.has(g.slotId)).toBe(true));
  });

  it('assigns each slot exactly once', () => {
    const { schedule } = generateSchedule(SLOTS, buildTeams(8), DEFAULT_SETTINGS, FAST);
    expect(new Set(schedule.games.map(g => g.slotId)).size).toBe(schedule.games.length);
  });
});

describe('same-day double-headers are no longer structurally forced', () => {
  /**
   * Phase 2 removes the *pigeonhole floor*: with whole-date assignment a 6-slot Sunday
   * over 8 teams forced at least 4 teams into a double-header before the optimiser made
   * any choice. Driving the actual count to zero needs the scoring term from P3-1.
   */
  it('leaves no date whose division block exceeds its team pairs', () => {
    const { schedule } = generateSchedule(SLOTS, buildTeams(8), DEFAULT_SETTINGS, FAST);
    const slotsById = buildSlotsById(SLOTS);

    const gamesOnDatePerDivision = new Map<string, number>();
    for (const g of schedule.games) {
      const key = `${g.division}|${slotsById[g.slotId].date}`;
      gamesOnDatePerDivision.set(key, (gamesOnDatePerDivision.get(key) ?? 0) + 1);
    }
    for (const count of gamesOnDatePerDivision.values()) {
      expect(count * 2).toBeLessThanOrEqual(8);
    }
  });

  it('drops the forced floor from 92 extra games to 0', () => {
    const { schedule } = generateSchedule(SLOTS, buildTeams(8), DEFAULT_SETTINGS, FAST);
    const slotsById = buildSlotsById(SLOTS);
    const counts = gamesPerTeamPerDate(schedule.games, slotsById);

    // The structural minimum is now zero; any residual comes from optimiser choice, which
    // P3-1 eliminates. Before Phase 2 this floor was 92 extra games including 10 triples.
    let forcedFloor = 0;
    const perDivisionDate = new Map<string, number>();
    for (const g of schedule.games) {
      const key = `${g.division}|${slotsById[g.slotId].date}`;
      perDivisionDate.set(key, (perDivisionDate.get(key) ?? 0) + 1);
    }
    for (const games of perDivisionDate.values()) forcedFloor += Math.max(0, games * 2 - 8);

    expect(forcedFloor).toBe(0);
    expect(counts.size).toBeGreaterThan(0);
  });
});
