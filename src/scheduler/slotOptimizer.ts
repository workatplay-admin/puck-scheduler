import { isDerivedLate, isDerivedWeekend, buildSlotsById } from '@/types/scheduler';
import type { IceSlot, SchedulerSettings } from '@/types/scheduler';
import type { DivisionId, GameAssignment, MatchupsByDivision, ScoreFn, SlotsByDivision } from './types';

const SA_ITER = 50_000;
const T0 = 1000;
const MIN_T = 0.1;

/**
 * Cooling rate that brings the temperature from `T0` down to `MIN_T` across exactly
 * `iterations` steps.
 *
 * Previously this was a fixed 0.9997, which reached the floor at iteration ~30,700
 * regardless of the budget: `ln(MIN_T / T0) / ln(0.9997)`. Everything past that point was
 * greedy hill-climbing, so at 50k iterations 39% of the run explored nothing and raising
 * the count bought almost nothing at all. Tying the rate to the budget makes the iteration
 * count a real dial.
 */
const coolingFor = (iterations: number): number =>
  iterations < 2 ? 0 : Math.exp(Math.log(MIN_T / T0) / iterations);

/**
 * Assigns matchups to ice slots using simulated annealing (ADR §5.3.2).
 *
 * A greedy pass generates the initial assignment (most-constrained slots first).
 * SA then iterates, swapping slot assignments between two random same-division
 * games and accepting improvements unconditionally or worse states with
 * probability `exp(−Δ/T)`. The best-seen solution is always returned.
 *
 * Starting parameters: 50k iterations / T₀=1000 / minT=0.1, with the cooling rate derived
 * from the iteration budget so the whole run is spent exploring. A convergence test gates
 * any retune.
 *
 * @param matchups        - Shuffled matchup pool per division.
 * @param slotsByDivision - Ice slots partitioned by division.
 * @param settings        - Scheduler settings including late-game threshold.
 * @param scoreFn         - Global pluggable scoring function.
 * @param rng             - Seeded RNG; never calls `Math.random()` directly.
 * @param iterations      - SA iteration count; defaults to 50k. Pass a smaller
 *                          value in tests to keep run-times short.
 * @param onProgress      - Optional callback fired every 500 iterations with the
 *                          current iteration index, current score, and best score.
 *                          Used by the web worker to post progress messages.
 * @returns Best-seen assignments and any slots that could not be filled.
 */
export const assignSlots = (
  matchups: MatchupsByDivision,
  slotsByDivision: SlotsByDivision,
  settings: SchedulerSettings,
  scoreFn: ScoreFn,
  rng: () => number,
  iterations = SA_ITER,
  onProgress?: (iteration: number, currentScore: number, bestScore: number) => void
): { assignments: GameAssignment[]; unusedSlots: IceSlot[] } => {
  const allSlots = [...slotsByDivision.A, ...slotsByDivision.B];
  const slotsById = buildSlotsById(allSlots);

  const assignments: GameAssignment[] = [];
  const unusedSlots: IceSlot[] = [];

  // Greedy initial assignment: fill most-constrained slots (late/weekend) first
  for (const div of ['A', 'B'] as DivisionId[]) {
    const pool = [...matchups[div]];
    const sorted = [...slotsByDivision[div]].sort((a, b) => {
      const sA = (isDerivedLate(a, settings.lateGameThreshold) ? 2 : 0) + (isDerivedWeekend(a) ? 1 : 0);
      const sB = (isDerivedLate(b, settings.lateGameThreshold) ? 2 : 0) + (isDerivedWeekend(b) ? 1 : 0);
      return sB - sA;
    });

    for (const slot of sorted) {
      if (pool.length === 0) {
        unusedSlots.push(slot);
      } else {
        const pair = pool.shift()!;
        assignments.push({ division: div, homeTeamId: pair.homeTeamId, awayTeamId: pair.awayTeamId, slotId: slot.id });
      }
    }
  }

  if (assignments.length < 2) return { assignments, unusedSlots };

  // Index assignments by division for neighbour selection
  const divAIdx: number[] = [];
  const divBIdx: number[] = [];
  for (let i = 0; i < assignments.length; i++) {
    (assignments[i].division === 'A' ? divAIdx : divBIdx).push(i);
  }

  let current = assignments.slice();
  let currentScore = scoreFn(current, slotsById, settings);
  let best = current.slice();
  let bestScore = currentScore;
  let T = T0;
  const cooling = coolingFor(iterations);

  onProgress?.(0, currentScore, bestScore);

  for (let iter = 0; iter < iterations; iter++) {
    // Select a division that has ≥2 games
    const aOk = divAIdx.length >= 2;
    const bOk = divBIdx.length >= 2;
    if (!aOk && !bOk) break;

    const indices = (aOk && bOk)
      ? (rng() < divAIdx.length / (divAIdx.length + divBIdx.length) ? divAIdx : divBIdx)
      : (aOk ? divAIdx : divBIdx);

    // Pick two distinct positions
    const i = Math.floor(rng() * indices.length);
    let j = Math.floor(rng() * (indices.length - 1));
    if (j >= i) j++;

    const gi = indices[i];
    const gj = indices[j];

    // Build neighbour by swapping slotIds
    const neighbor = current.slice();
    neighbor[gi] = { ...current[gi], slotId: current[gj].slotId };
    neighbor[gj] = { ...current[gj], slotId: current[gi].slotId };

    const nScore = scoreFn(neighbor, slotsById, settings);
    const delta = nScore - currentScore;

    if (delta < 0 || rng() < Math.exp(-delta / T)) {
      current = neighbor;
      currentScore = nScore;
      if (currentScore < bestScore) {
        best = current.slice();
        bestScore = currentScore;
      }
    }

    T = Math.max(T * cooling, MIN_T);

    if (onProgress && (iter + 1) % 500 === 0) {
      onProgress(iter + 1, currentScore, bestScore);
    }
  }

  return { assignments: best, unusedSlots };
};
