import { describe, it, expect } from 'vitest';
import { assignDays } from '../dayAssignment';
import { DEFAULT_SETTINGS } from '@/types/scheduler';
import { loadRealSeason, buildTeams, byDate } from './realSeason';

const SLOTS = loadRealSeason();
const TEAMS = buildTeams(8);
const assign = () => assignDays(SLOTS, TEAMS, DEFAULT_SETTINGS, Math.random);

describe('block assignment — real season', () => {
  it('splits the slot budget evenly between divisions', () => {
    const { slots } = assign();
    expect(slots.A).toHaveLength(118);
    expect(slots.B).toHaveLength(118);
  });

  it('gives every division a contiguous run on every date', () => {
    const { slots } = assign();
    const all = byDate(SLOTS);

    for (const div of ['A', 'B'] as const) {
      for (const [date, divSlots] of byDate(slots[div])) {
        const order = all.get(date)!.map(s => s.id);
        const positions = divSlots.map(s => order.indexOf(s.id)).sort((a, b) => a - b);
        const span = positions[positions.length - 1] - positions[0] + 1;
        expect(span).toBe(positions.length);
      }
    }
  });

  it('never gives a division more games on a date than it has pairs of teams', () => {
    const { slots } = assign();
    for (const div of ['A', 'B'] as const) {
      for (const [, divSlots] of byDate(slots[div])) {
        expect(divSlots.length * 2).toBeLessThanOrEqual(8);
      }
    }
  });

  it('alternates the leading block across split dates, 12 / 11', () => {
    const { slots } = assign();
    const aByDate = byDate(slots.A);
    const bByDate = byDate(slots.B);

    const leads = { A: 0, B: 0 };
    for (const [date, dateSlots] of byDate(SLOTS)) {
      if (dateSlots.length <= 4) continue; // not a split date
      const first = dateSlots[0].id;
      if (aByDate.get(date)?.some(s => s.id === first)) leads.A++;
      else if (bByDate.get(date)?.some(s => s.id === first)) leads.B++;
    }

    expect(leads.A + leads.B).toBe(23);
    expect(Math.abs(leads.A - leads.B)).toBe(1);
  });

  it('is deterministic', () => {
    const first = assign().slots;
    const second = assign().slots;
    expect(second.A.map(s => s.id)).toEqual(first.A.map(s => s.id));
    expect(second.B.map(s => s.id)).toEqual(first.B.map(s => s.id));
  });
});

describe('block assignment — portable balance invariant', () => {
  it.each([4, 6, 8, 10])('keeps games-per-team within 1 across divisions (%i per side)', (n) => {
    const { slots } = assignDays(SLOTS, buildTeams(n), DEFAULT_SETTINGS, Math.random);
    const perTeamA = (slots.A.length * 2) / n;
    const perTeamB = (slots.B.length * 2) / n;
    expect(Math.abs(perTeamA - perTeamB)).toBeLessThanOrEqual(1);
  });
});
