import type { Game } from '@/types/scheduler';
import type { GameAssignment } from './types';

/**
 * Converts resolved game assignments into fully-typed {@link Game} records,
 * balancing home-game counts across teams (ADR §5.4).
 *
 * The team with fewer home games gets the home slot. On a tie the seeded RNG
 * decides, ensuring full reproducibility (no `Math.random()` calls).
 *
 * @param assignments - Ordered list of slot assignments.
 * @param rng         - Seeded RNG for tie-breaking.
 * @returns Game records ready to be stored in the schedule.
 */
export const assignHomeAway = (assignments: GameAssignment[], rng: () => number): Game[] => {
  const ts = Date.now();
  const homeGameCounts = new Map<string, number>();

  return assignments.map((a, i) => {
    const hCount = homeGameCounts.get(a.homeTeamId) ?? 0;
    const aCount = homeGameCounts.get(a.awayTeamId) ?? 0;

    let finalHome: string;
    let finalAway: string;

    if (hCount < aCount) {
      finalHome = a.homeTeamId;
      finalAway = a.awayTeamId;
    } else if (aCount < hCount) {
      finalHome = a.awayTeamId;
      finalAway = a.homeTeamId;
    } else {
      if (rng() < 0.5) {
        finalHome = a.homeTeamId;
        finalAway = a.awayTeamId;
      } else {
        finalHome = a.awayTeamId;
        finalAway = a.homeTeamId;
      }
    }

    homeGameCounts.set(finalHome, (homeGameCounts.get(finalHome) ?? 0) + 1);

    return {
      id: `game-${i}-${ts}`,
      division: a.division,
      homeTeamId: finalHome,
      awayTeamId: finalAway,
      slotId: a.slotId,
    };
  });
};
