import { describe, it, expect } from 'vitest';
import { assignDays } from '../dayAssignment';
import { generateSchedule } from '../index';
import { DEFAULT_SETTINGS } from '@/types/scheduler';
import type { IceSlot, Team } from '@/types/scheduler';
import { loadRealSeason, byDate } from './realSeason';

const SLOTS = loadRealSeason();
const mk = (n: number, div: 'A' | 'B'): Team[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${div}${i}`, name: `${div}${i}`, division: div }));

describe('degenerate rosters', () => {
  it('gives a division with no teams no slots', () => {
    const { slots } = assignDays(SLOTS, mk(8, 'A'), DEFAULT_SETTINGS, Math.random);
    expect(slots.B).toHaveLength(0);
    expect(slots.A.length).toBeGreaterThan(0);
  });

  it('strands no ice on a single-team division', () => {
    // A one-team division cannot play a game, so its proportional share would be dead
    // ice. Everything placeable goes to the viable division instead.
    const teams = [...mk(8, 'A'), ...mk(1, 'B')];
    const { slots } = assignDays(SLOTS, teams, DEFAULT_SETTINGS, Math.random);
    expect(slots.B).toHaveLength(0);
  });

  it('caps a two-team division at one game per date', () => {
    const teams = [...mk(8, 'A'), ...mk(2, 'B')];
    const { slots } = assignDays(SLOTS, teams, DEFAULT_SETTINGS, Math.random);
    for (const [, dateSlots] of byDate(slots.B)) {
      expect(dateSlots).toHaveLength(1);
    }
  });

  it('splits a 6-slot date 3/3 for unequal 7-vs-8 divisions', () => {
    const teams = [...mk(7, 'A'), ...mk(8, 'B')];
    const { slots } = assignDays(SLOTS, teams, DEFAULT_SETTINGS, Math.random);
    const sundays = [...byDate(SLOTS)].filter(([, s]) => s.length === 6).map(([d]) => d);

    for (const date of sundays) {
      const a = byDate(slots.A).get(date)?.length ?? 0;
      const b = byDate(slots.B).get(date)?.length ?? 0;
      expect(a + b).toBe(6);
      expect(a).toBeLessThanOrEqual(3); // floor(7 / 2)
      expect(b).toBeLessThanOrEqual(4); // floor(8 / 2)
    }
  });

  it('leaves single-slot dates whole', () => {
    const oneSlotDates: IceSlot[] = Array.from({ length: 10 }, (_, i) => ({
      id: `s${i}`,
      date: `2026-03-0${i}`,
      startTime: '19:00',
      dayOfWeek: 'Monday',
    }));
    const { slots } = assignDays(oneSlotDates, [...mk(4, 'A'), ...mk(4, 'B')], DEFAULT_SETTINGS, Math.random);
    expect(slots.A.length + slots.B.length).toBe(10);
    for (const div of ['A', 'B'] as const) {
      for (const [, s] of byDate(slots[div])) expect(s).toHaveLength(1);
    }
  });

  it('never throws or loops on a division with zero eligible teams', () => {
    const { slots, feasibility } = assignDays(SLOTS, mk(1, 'A'), DEFAULT_SETTINGS, Math.random);
    expect(slots.A).toHaveLength(0);
    expect(slots.B).toHaveLength(0);
    expect(feasibility.ok).toBe(false);
  });
});

describe('the smaller division is never starved', () => {
  /**
   * Regression: pass 2 used to hand a date to whichever division could host it *whole*.
   * Any date whose slot count fell in `(cap(small), cap(large)]` therefore always went to
   * the larger division and the smaller one received nothing at all — A=80, B=0 on this
   * fixture, with six teams playing zero games behind an advisory warning.
   */
  const fourSlotDates: IceSlot[] = [];
  for (let d = 0; d < 20; d++) {
    for (let i = 0; i < 4; i++) {
      fourSlotDates.push({
        id: `d${d}s${i}`,
        date: `2026-01-${String(d + 1).padStart(2, '0')}`,
        startTime: `${17 + i}:00`,
        dayOfWeek: 'Monday',
      });
    }
  }

  it('splits dates the budget leader cannot host whole (8 v 6)', () => {
    const { slots, feasibility } = assignDays(
      fourSlotDates, [...mk(8, 'A'), ...mk(6, 'B')], DEFAULT_SETTINGS, Math.random,
    );
    expect(slots.B.length).toBeGreaterThan(0);
    expect(slots.A.length + slots.B.length).toBe(fourSlotDates.length);
    expect(feasibility.ok).toBe(true);
  });

  it('gives every team games (8 v 6)', () => {
    const teams = [...mk(8, 'A'), ...mk(6, 'B')];
    const { schedule } = generateSchedule(fourSlotDates, teams, DEFAULT_SETTINGS, { saIterations: 100 });
    const played = new Set(schedule.games.flatMap(g => [g.homeTeamId, g.awayTeamId]));
    teams.forEach(t => expect(played.has(t.id)).toBe(true));
  });

  it.each([[8, 6], [8, 4], [6, 4], [10, 6]])(
    'keeps both divisions supplied for %i v %i teams',
    (a, b) => {
      const { slots } = assignDays(fourSlotDates, [...mk(a, 'A'), ...mk(b, 'B')], DEFAULT_SETTINGS, Math.random);
      expect(slots.A.length).toBeGreaterThan(0);
      expect(slots.B.length).toBeGreaterThan(0);
    },
  );
});

describe('capacity overflow (only reachable via a misconfigured roster)', () => {
  const overflowSlots: IceSlot[] = Array.from({ length: 8 }, (_, i) => ({
    id: `s${i}`,
    date: '2026-01-09',
    startTime: `${13 + i}:00`,
    dayOfWeek: 'Friday',
  }));
  const teams = [...mk(4, 'A'), ...mk(2, 'B')];

  it('warns rather than forcing a same-day game', () => {
    const { feasibility } = assignDays(overflowSlots, teams, DEFAULT_SETTINGS, Math.random);
    expect(feasibility.ok).toBe(false);
    // The message must name the real cause — unusable ice — rather than describing it as
    // an uneven split, which it is not.
    expect(feasibility.reason).toMatch(/can't be used/i);
    expect(feasibility.reason).toMatch(/playing twice in one day/i);
  });

  it('surfaces the unplaceable slots instead of dropping them silently', () => {
    const { schedule, unusedSlots } = generateSchedule(overflowSlots, teams, DEFAULT_SETTINGS, { saIterations: 10 });
    expect(schedule.games.length).toBeGreaterThan(0);
    expect(schedule.games.length + unusedSlots.length).toBe(overflowSlots.length);
    expect(unusedSlots.length).toBeGreaterThan(0);
  });
});
