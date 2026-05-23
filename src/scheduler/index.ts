import { buildSlotsById } from '@/types/scheduler';
import type { IceSlot, Team, Game, SchedulerSettings, Schedule } from '@/types/scheduler';
import { generateSeed, mulberry32 } from './rng';
import { assignDays } from './dayAssignment';
import { buildMatchups } from './matchups';
import { score } from './scoring';
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
 * Returns early with an empty schedule when neither division has at least
 * two teams. On feasibility failure (slot/team imbalance) returns immediately
 * with `hasInvariantViolations: true` and a `violationSummary`.
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
  opts?: { seed?: number; saIterations?: number; onProgress?: (iter: number, currentScore: number, bestScore: number) => void }
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

    if (!feasibility.ok) {
      return {
        schedule: {
          games: [],
          seed,
          generatedAt: new Date().toISOString(),
          fairnessScore: 0,
          hasInvariantViolations: true,
          violationSummary: feasibility.reason,
        },
        unusedSlots: iceSlots,
      };
    }

    const matchups = buildMatchups(
      { A: divisionATeams, B: divisionBTeams },
      { A: slotsByDiv.A.length, B: slotsByDiv.B.length },
      rng
    );

    const { assignments, unusedSlots } = assignSlots(matchups, slotsByDiv, settings, score, rng, opts?.saIterations, opts?.onProgress);
    const games = assignHomeAway(assignments, rng);

    games.sort((a, b) => {
      const slotA = slotsById[a.slotId];
      const slotB = slotsById[b.slotId];
      if (!slotA || !slotB) return 0;
      if (slotA.date !== slotB.date) return slotA.date.localeCompare(slotB.date);
      return slotA.startTime.localeCompare(slotB.startTime);
    });

    const fairnessScore = score(assignments, slotsById, settings);
    const violation = checkInvariants(games, teams);

    const schedule: Schedule = {
      games,
      seed,
      generatedAt: new Date().toISOString(),
      fairnessScore,
      hasInvariantViolations: violation !== null,
      violationSummary: violation ?? undefined,
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
  }

  return bestResult!;
};
