import type { Team } from '@/types/scheduler';
import type { DivisionId, MatchupsByDivision, UnorderedPair } from './types';

/** Fisher-Yates shuffle using a caller-supplied RNG for reproducibility. */
const shuffleWith = <T>(array: T[], rng: () => number): T[] => {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

/** Every unordered (i, j) pair with i < j. */
const generateUnorderedPairs = (teams: Team[]): Array<[string, string]> => {
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      pairs.push([teams[i].id, teams[j].id]);
    }
  }
  return pairs;
};

/**
 * Builds a matchup pool of exactly `slotsNeeded` entries for one division,
 * with per-pair frequency balanced **by construction**:
 *
 *   base       = floor(slotsNeeded / P)         where P = C(n, 2)
 *   remainder  = slotsNeeded − base · P
 *
 * Every unordered pair plays `base` games; `remainder` pairs play one extra
 * game (base + 1). Bonus pairs are picked greedily to keep per-team game
 * counts within ±1 — at each step we pick the candidate pair whose two
 * teams currently have the lowest combined game total. Ties are broken by
 * a seeded shuffle of the iteration order, preserving reproducibility.
 *
 * Final orientation is irrelevant downstream: {@link assignHomeAway} rewrites
 * home/away globally based on home-game counts. We emit a per-pair
 * alternating orientation with a random starting side and shuffle the pool.
 */
const buildBalancedPool = (
  teams: Team[],
  slotsNeeded: number,
  rng: () => number,
): UnorderedPair[] => {
  if (teams.length < 2 || slotsNeeded === 0) return [];

  const unordered = generateUnorderedPairs(teams);
  const P = unordered.length;
  const base = Math.floor(slotsNeeded / P);
  const remainder = slotsNeeded - base * P;

  const pairCount: number[] = new Array(P).fill(base);
  const teamCount = new Map<string, number>();
  for (const t of teams) teamCount.set(t.id, base * (teams.length - 1));

  const order = shuffleWith(Array.from({ length: P }, (_, i) => i), rng);
  for (let r = 0; r < remainder; r++) {
    let bestIdx = -1;
    let bestSum = Infinity;
    for (const i of order) {
      if (pairCount[i] > base) continue;
      const [a, b] = unordered[i];
      const s = (teamCount.get(a) ?? 0) + (teamCount.get(b) ?? 0);
      if (s < bestSum) {
        bestSum = s;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) break; // remainder > P is impossible by construction
    pairCount[bestIdx]++;
    const [a, b] = unordered[bestIdx];
    teamCount.set(a, (teamCount.get(a) ?? 0) + 1);
    teamCount.set(b, (teamCount.get(b) ?? 0) + 1);
  }

  const pool: UnorderedPair[] = [];
  for (let i = 0; i < P; i++) {
    const [a, b] = unordered[i];
    const k = pairCount[i];
    const aHomeFirst = rng() < 0.5;
    for (let g = 0; g < k; g++) {
      const aIsHome = aHomeFirst === (g % 2 === 0);
      pool.push({
        homeTeamId: aIsHome ? a : b,
        awayTeamId: aIsHome ? b : a,
      });
    }
  }

  return shuffleWith(pool, rng);
};

/**
 * Builds a matchup pool per division, sized to exactly the number of slots
 * available in each division.
 *
 * The pool is constructed so per-pair frequencies differ by at most 1 — this
 * is the property the post-run pairing-balance invariant checks for.
 * See {@link buildBalancedPool} for the algorithm.
 *
 * @param teamsByDivision      - Teams grouped by division.
 * @param slotCountByDivision  - Number of slots available per division.
 * @param rng                  - RNG function used for shuffle randomisation.
 * @returns Matchup pool keyed by division.
 */
export const buildMatchups = (
  teamsByDivision: Record<DivisionId, Team[]>,
  slotCountByDivision: Record<DivisionId, number>,
  rng: () => number,
): MatchupsByDivision => {
  const result = {} as MatchupsByDivision;
  for (const div of ['A', 'B'] as DivisionId[]) {
    result[div] = buildBalancedPool(
      teamsByDivision[div],
      slotCountByDivision[div],
      rng,
    );
  }
  return result;
};
