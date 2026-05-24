import type { Team } from '@/types/scheduler';
import type { DivisionId, MatchupsByDivision, UnorderedPair } from './types';

/**
 * Generates all ordered home/away pairs for a team list (each pair appears
 * in both directions so home/away balance can be optimised downstream).
 */
const generateBasePairs = (teams: Team[]): UnorderedPair[] => {
  const pairs: UnorderedPair[] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      pairs.push({ homeTeamId: teams[i].id, awayTeamId: teams[j].id });
      pairs.push({ homeTeamId: teams[j].id, awayTeamId: teams[i].id });
    }
  }
  return pairs;
};

/** Fisher-Yates shuffle using a caller-supplied RNG for reproducibility. */
const shuffleWith = <T>(array: T[], rng: () => number): T[] => {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

/**
 * Trims the matchup pool to exactly `target` pairs, preferring to drop pairs
 * whose participants already have the highest game counts. On a tie the pair
 * whose min-participant count is highest is preferred, so the resulting
 * per-team game-count range is minimised (≤1 whenever mathematically possible).
 */
const trimPool = (pool: UnorderedPair[], target: number): UnorderedPair[] => {
  if (pool.length <= target) return pool;

  const counts = new Map<string, number>();
  for (const p of pool) {
    counts.set(p.homeTeamId, (counts.get(p.homeTeamId) ?? 0) + 1);
    counts.set(p.awayTeamId, (counts.get(p.awayTeamId) ?? 0) + 1);
  }

  const remaining = pool.slice();
  while (remaining.length > target) {
    // Score each candidate pair: prefer the pair that maximises [max-count, min-count]
    // among its two participants — this removes from the most-loaded teams first,
    // spreading the reduction evenly and keeping the count range minimal.
    let bestIdx = remaining.length - 1;
    let bestMaxC = -1;
    let bestMinC = -1;
    for (let i = remaining.length - 1; i >= 0; i--) {
      const p = remaining[i];
      const a = counts.get(p.homeTeamId) ?? 0;
      const b = counts.get(p.awayTeamId) ?? 0;
      const mx = Math.max(a, b);
      const mn = Math.min(a, b);
      if (mx > bestMaxC || (mx === bestMaxC && mn > bestMinC)) {
        bestMaxC = mx;
        bestMinC = mn;
        bestIdx = i;
      }
    }
    const dropped = remaining.splice(bestIdx, 1)[0];
    counts.set(dropped.homeTeamId, (counts.get(dropped.homeTeamId) ?? 1) - 1);
    counts.set(dropped.awayTeamId, (counts.get(dropped.awayTeamId) ?? 1) - 1);
  }

  return remaining;
};

/**
 * Builds a shuffled matchup pool for each division, repeating the base pair
 * set as many times as needed to cover the available slot count.
 *
 * The pool is trimmed to exactly `slotsNeeded` pairs using {@link trimPool},
 * which drops surplus pairs from the teams with the highest game counts first,
 * keeping per-team game totals within ±1.
 *
 * @param teamsByDivision      - Teams grouped by division.
 * @param slotCountByDivision  - Number of slots available per division.
 * @param rng                  - RNG function used for shuffle randomisation.
 * @returns Matchup pool keyed by division.
 */
export const buildMatchups = (
  teamsByDivision: Record<DivisionId, Team[]>,
  slotCountByDivision: Record<DivisionId, number>,
  rng: () => number
): MatchupsByDivision => {
  const result = {} as MatchupsByDivision;

  for (const div of ['A', 'B'] as DivisionId[]) {
    const teams = teamsByDivision[div];
    const slotsNeeded = slotCountByDivision[div];

    if (teams.length < 2) {
      result[div] = [];
      continue;
    }

    const basePairs = generateBasePairs(teams);
    const repeats = Math.ceil(slotsNeeded / basePairs.length);
    let pool: UnorderedPair[] = [];
    for (let r = 0; r < repeats; r++) {
      pool = pool.concat(shuffleWith(basePairs, rng));
    }
    result[div] = trimPool(pool, slotsNeeded);
  }

  return result;
};
