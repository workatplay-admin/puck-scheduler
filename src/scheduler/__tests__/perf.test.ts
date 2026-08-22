import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateSchedule } from '../index';
import { DEFAULT_SETTINGS } from '@/types/scheduler';
import type { IceSlot, Team } from '@/types/scheduler';

const BASELINE_PATH = resolve(__dirname, '../__fixtures__/perf-baseline.json');
const SA_ITERS = 5_000;

/** Build an 8-team / 300-slot fixture (4 teams per division, 150 slots each). */
const makeFixture = (): { teams: Team[]; slots: IceSlot[] } => {
  const divA = ['a1', 'a2', 'a3', 'a4'].map(id => ({ id, name: id.toUpperCase(), division: 'A' as const }));
  const divB = ['b1', 'b2', 'b3', 'b4'].map(id => ({ id, name: id.toUpperCase(), division: 'B' as const }));

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const slots: IceSlot[] = [];
  const start = new Date('2026-01-05'); // Monday

  for (let i = 0; i < 150; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i * 2);
    const dateStr = d.toISOString().split('T')[0];
    const dayOfWeek = days[d.getDay()];
    slots.push({ id: `s-${i * 2}`, date: dateStr, startTime: '18:00', dayOfWeek });
    slots.push({ id: `s-${i * 2 + 1}`, date: dateStr, startTime: '21:00', dayOfWeek });
  }

  return { teams: [...divA, ...divB], slots };
};

/**
 * Regression tripwire, **not** a tuning target.
 *
 * It runs 5,000 iterations against a synthetic fixture while the app runs 50,000 against
 * real data, so it says nothing about production quality or runtime — see
 * `standards.md` §2.1. Regenerate the baseline deliberately whenever the objective
 * function changes; v0.6 moved it twice (same-day penalty, then band terms).
 */
describe('perf regression — 8-team / 300-slot fixture', () => {
  it('stays within ±25% of stored baseline on bestScore and iterationCount', { timeout: 60_000 }, () => {
    const { teams, slots } = makeFixture();
    // Pinned seed. The generator is otherwise seeded randomly per run, which made this
    // comparison depend on luck — tolerable while the objective was dominated by
    // low-variance terms, but the v0.6 same-day penalty is charged in 5000-point steps
    // and swung the score far outside the +/-25% band between consecutive runs.
    const { schedule } = generateSchedule(slots, teams, DEFAULT_SETTINGS, {
      seed: 20260822,
      saIterations: SA_ITERS,
    });

    expect(schedule.games.length).toBeGreaterThan(0);
    // The pinned seed only governs attempt 0; attempts 1 and 2 reseed randomly. If this
    // fixture ever trips an invariant the comparison silently becomes non-deterministic,
    // so fail here instead.
    expect(schedule.hasInvariantViolations).toBeFalsy();

    const bestScore = schedule.fairnessScore;
    const iterationCount = SA_ITERS;

    if (!existsSync(BASELINE_PATH)) {
      mkdirSync(resolve(__dirname, '../__fixtures__'), { recursive: true });
      writeFileSync(BASELINE_PATH, JSON.stringify({ bestScore, iterationCount }, null, 2));
      return;
    }

    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as { bestScore: number; iterationCount: number };

    expect(bestScore).toBeLessThanOrEqual(baseline.bestScore * 1.25);
    expect(bestScore).toBeGreaterThanOrEqual(baseline.bestScore * 0.75);
    expect(iterationCount).toBeLessThanOrEqual(baseline.iterationCount * 1.25);
    expect(iterationCount).toBeGreaterThanOrEqual(baseline.iterationCount * 0.75);
  });
});
