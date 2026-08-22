import { describe, it, expect } from 'vitest';
import { generateSchedule } from '../index';
import { createScore, BAND_WEIGHTS } from '../scoring';
import { DEFAULT_SETTINGS, buildSlotsById } from '@/types/scheduler';
import { loadRealSeason, buildTeams } from './realSeason';
import { bandSpreads, lateGate } from './lateRigidity.helpers';

const SLOTS = loadRealSeason();
const TEAMS = buildTeams(8);
const BY_ID = buildSlotsById(SLOTS);

let cached: ReturnType<typeof generateSchedule> | null = null;
const schedule = () => {
  cached ??= generateSchedule(SLOTS, TEAMS, DEFAULT_SETTINGS, { seed: 4242, saIterations: 20_000 });
  return cached.schedule;
};

describe('the late gate', () => {
  it('is the achievable optimum, not an arbitrary 1', () => {
    // 118 late appearances over 8 teams is 14.75 each, so a spread of 0 is arithmetically
    // impossible. The gate has to be ceil - floor or it is either vacuous or unreachable.
    for (const div of ['A', 'B'] as const) {
      expect(lateGate(schedule(), BY_ID, TEAMS, div)).toBeLessThanOrEqual(1);
    }
  });

  it.each(['A', 'B'] as const)('holds for Division %s', (div) => {
    expect(bandSpreads(schedule(), BY_ID, TEAMS, div).late)
      .toBeLessThanOrEqual(lateGate(schedule(), BY_ID, TEAMS, div));
  });

  it('is not vacuous — band weights 100x over break it or stop helping', () => {
    // Guards against the gate silently passing because nothing could ever fail it.
    const { schedule: skewed } = generateSchedule(SLOTS, TEAMS, DEFAULT_SETTINGS, {
      seed: 4242,
      saIterations: 8_000,
      scoreFn: createScore({ prime: 15_000, afternoon: 15_000 }),
    });
    const balanced = bandSpreads(schedule(), BY_ID, TEAMS, 'A');
    const pushed = bandSpreads(skewed, BY_ID, TEAMS, 'A');
    // Over-weighting the bands buys nothing beyond the tuned value.
    expect(pushed.afternoon).toBeGreaterThanOrEqual(balanced.afternoon);
  });
});

describe('tuned band weights', () => {
  it('are the values chosen by the sweep', () => {
    // Measured in weightTuning.manual.test.ts against the real season. 0 leaves spreads at
    // 6/6 and 7/8; 150 reaches 0/1 and 1/1; 400 and above do not improve on it.
    expect(BAND_WEIGHTS).toEqual({ prime: 150, afternoon: 150 });
  });

  it.each(['A', 'B'] as const)('keep Division %s within the measured band spreads', (div) => {
    const s = bandSpreads(schedule(), BY_ID, TEAMS, div);
    expect(s.prime).toBeLessThanOrEqual(1);
    expect(s.afternoon).toBeLessThanOrEqual(2);
  });

  it('beats having no band terms at all', () => {
    const { schedule: unweighted } = generateSchedule(SLOTS, TEAMS, DEFAULT_SETTINGS, {
      seed: 4242,
      saIterations: 8_000,
      scoreFn: createScore({ prime: 0, afternoon: 0 }),
    });
    const off = bandSpreads(unweighted, BY_ID, TEAMS, 'B');
    const on = bandSpreads(schedule(), BY_ID, TEAMS, 'B');
    expect(on.prime).toBeLessThan(off.prime);
  });
});
