import { buildSlotsById } from '@/types/scheduler';
import type { IceSlot, Team, Game, SchedulerSettings, Schedule } from '@/types/scheduler';
import { generateSeed, mulberry32 } from './rng';
import { assignDays } from './dayAssignment';
import { buildMatchups } from './matchups';
import { score } from './scoring';
import type { ScoreFn } from './types';
import { assignSlots } from './slotOptimizer';
import { assignHomeAway } from './homeAway';

export { calculateFairnessReport } from './fairness';

const MAX_RETRIES = 3;

const checkInvariants = (games: Game[], teams: Team[]): string | null => {
  // Invariant 1: global game-count balance ±1 across all teams
  const gameCounts = new Map<string, number>();
  for (const t of teams) gameCounts.set(t.id, 0);
  for (const g of games) {
    gameCounts.set(g.homeTeamId, (gameCounts.get(g.homeTeamId) ?? 0) + 1);
    gameCounts.set(g.awayTeamId, (gameCounts.get(g.awayTeamId) ?? 0) + 1);
  }
  const counts = [...gameCounts.values()];
  if (counts.length > 0 && Math.max(...counts) - Math.min(...counts) > 1) {
    return `Game count imbalance: max ${Math.max(...counts)} − min ${Math.min(...counts)} > 1`;
  }

  // Invariant 2: pairing-count balance ±1 within each division
  for (const div of ['A', 'B'] as ('A' | 'B')[]) {
    const divTeams = teams.filter(t => t.division === div);
    if (divTeams.length < 2) continue;

    const pairCounts = new Map<string, number>();
    for (const t1 of divTeams) {
      for (const t2 of divTeams) {
        if (t1.id !== t2.id) pairCounts.set(`${t1.id}:${t2.id}`, 0);
      }
    }

    for (const g of games.filter(g => g.division === div)) {
      const k1 = `${g.homeTeamId}:${g.awayTeamId}`;
      const k2 = `${g.awayTeamId}:${g.homeTeamId}`;
      if (pairCounts.has(k1)) pairCounts.set(k1, pairCounts.get(k1)! + 1);
      if (pairCounts.has(k2)) pairCounts.set(k2, pairCounts.get(k2)! + 1);
    }

    const pValues = [...pairCounts.values()].filter(v => v > 0);
    if (pValues.length > 0 && Math.max(...pValues) - Math.min(...pValues) > 1) {
      return `Division ${div} pairing imbalance: max ${Math.max(...pValues)} − min ${Math.min(...pValues)} > 1`;
    }
  }

  return null;
};

/**
 * Generates a round-robin schedule for a two-division beer-league season.
 *
 * Orchestrates the full pipeline: proportional day assignment → matchup
 * generation → simulated-annealing slot optimisation → seeded home/away
 * assignment → post-run invariant checks with up to 3 retries.
 *
 * Returns an empty schedule only when neither division has at least two teams — there
 * is nothing to schedule. A feasibility failure (slot/team imbalance) is advisory: the
 * schedule is still produced and carries a `feasibilityWarning`.
 *
 * @param iceSlots - Available ice slots for the season.
 * @param teams    - All registered teams (any mix of divisions A and B).
 * @param settings - Scheduler settings controlling late/weekend thresholds.
 * @param opts     - Optional: `seed` for reproducible generation; `saIterations`
 *                   to override the SA iteration count (default 50k; use a small
 *                   value in tests to keep run-times short); `onProgress` callback
 *                   forwarded to the SA optimizer (used by the web worker).
 * @returns The generated {@link Schedule} and any slots left unfilled.
 */
export const generateSchedule = (
  iceSlots: IceSlot[],
  teams: Team[],
  settings: SchedulerSettings,
  opts?: { seed?: number; saIterations?: number; scoreFn?: ScoreFn; onProgress?: (iter: number, currentScore: number, bestScore: number) => void }
): { schedule: Schedule; unusedSlots: IceSlot[] } => {
  const divisionATeams = teams.filter(t => t.division === 'A');
  const divisionBTeams = teams.filter(t => t.division === 'B');

  if (divisionATeams.length < 2 && divisionBTeams.length < 2) {
    return {
      schedule: { games: [], seed: 0, generatedAt: new Date().toISOString(), fairnessScore: 0 },
      unusedSlots: iceSlots,
    };
  }

  const slotsById = buildSlotsById(iceSlots);
  let bestResult: { schedule: Schedule; unusedSlots: IceSlot[] } | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const seed = attempt === 0 ? (opts?.seed ?? generateSeed()) : generateSeed();
    const rng = mulberry32(seed);

    const { slots: slotsByDiv, feasibility } = assignDays(iceSlots, teams, settings, rng);

    // A feasibility failure is advisory, never fatal. Returning early here would hand the
    // user an empty schedule for any slot/team mix that cannot hit an exact games-per-team
    // split — which is a warning worth showing, not a reason to produce nothing.
    const feasibilityWarning = feasibility.ok ? undefined : feasibility.reason;

    const matchups = buildMatchups(
      { A: divisionATeams, B: divisionBTeams },
      { A: slotsByDiv.A.length, B: slotsByDiv.B.length },
      rng
    );

    const scoreFn = opts?.scoreFn ?? score;
    const { assignments, unusedSlots: unfilled } = assignSlots(matchups, slotsByDiv, settings, scoreFn, rng, opts?.saIterations, opts?.onProgress);

    // Slot conservation. Where day-assignment could not place a slot — only reachable
    // with a misconfigured roster, e.g. a date exceeding both divisions' per-date
    // capacity — it surfaces in the Unused Slots panel rather than disappearing.
    const placed = new Set([...slotsByDiv.A, ...slotsByDiv.B].map(s => s.id));
    const unusedSlots = [...unfilled, ...iceSlots.filter(s => !placed.has(s.id))];
    const games = assignHomeAway(assignments, rng);

    games.sort((a, b) => {
      const slotA = slotsById[a.slotId];
      const slotB = slotsById[b.slotId];
      if (!slotA || !slotB) return 0;
      if (slotA.date !== slotB.date) return slotA.date.localeCompare(slotB.date);
      return slotA.startTime.localeCompare(slotB.startTime);
    });

    const fairnessScore = scoreFn(assignments, slotsById, settings);
    const violation = checkInvariants(games, teams);

    const schedule: Schedule = {
      games,
      seed,
      generatedAt: new Date().toISOString(),
      fairnessScore,
      hasInvariantViolations: violation !== null,
      violationSummary: violation ?? undefined,
      feasibilityWarning,
    };

    const isBetter =
      bestResult === null ||
      (!violation && bestResult.schedule.hasInvariantViolations) ||
      (!!violation === !!bestResult.schedule.hasInvariantViolations &&
        fairnessScore < bestResult.schedule.fairnessScore);

    if (isBetter) {
      bestResult = { schedule, unusedSlots };
    }

    if (!violation) break;

    // Do not retry a violation the seed cannot influence.
    //
    // Both invariants are pinned by the slot split, which is deterministic since v0.6:
    // `buildMatchups` sizes each division's pool to exactly its slot count, and
    // `buildBalancedPool` distributes bonus games to whichever pair currently has the
    // lowest combined total — so per-team counts land at `2·S_d/T_d ± 1` and per-pair
    // counts at `base` or `base + 1` whatever the seed. The shuffle only breaks ties.
    //
    // So when day assignment produced an infeasible split, all three attempts fail
    // identically — three full 50k-iteration passes, ~190s on a real season, to reach the
    // same answer. (An earlier review argued the opposite, that bonus-pair selection made
    // per-team totals seed-dependent. It does not: the greedy keeps them within ±1 by
    // construction.)
    if (!feasibility.ok) break;
  }

  return bestResult!;
};
