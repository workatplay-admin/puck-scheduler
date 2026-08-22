import { bandOf } from '@/types/scheduler';
import type { Band, IceSlot, Schedule, Team } from '@/types/scheduler';
import { DEFAULT_SETTINGS } from '@/types/scheduler';

/** Per-team counts in each band, for one division. */
export const bandSpreads = (
  schedule: Schedule,
  slotsById: Record<string, IceSlot>,
  teams: Team[],
  division: 'A' | 'B',
): Record<Band, number> => {
  const ids = teams.filter(t => t.division === division).map(t => t.id);
  const per = new Map(ids.map(id => [id, { afternoon: 0, prime: 0, late: 0 }]));
  for (const g of schedule.games) {
    const slot = slotsById[g.slotId];
    if (!slot) continue;
    const band = bandOf(slot, DEFAULT_SETTINGS);
    for (const id of [g.homeTeamId, g.awayTeamId]) {
      const row = per.get(id);
      if (row) row[band]++;
    }
  }
  const spread = (pick: (r: Record<Band, number>) => number) => {
    const xs = ids.map(id => pick(per.get(id)!));
    return Math.max(...xs) - Math.min(...xs);
  };
  return {
    afternoon: spread(r => r.afternoon),
    prime: spread(r => r.prime),
    late: spread(r => r.late),
  };
};

/**
 * The smallest late spread the ice actually permits for a division.
 *
 * "Late spread <= 1" is not a meaningful gate on its own: with 59 late games over 8 teams
 * a division sees 118 late appearances, or 14.75 each, so a spread of 0 is arithmetically
 * impossible. The gate is the achievable optimum, `ceil(x) - floor(x)`.
 */
export const lateGate = (
  schedule: Schedule,
  slotsById: Record<string, IceSlot>,
  teams: Team[],
  division: 'A' | 'B',
): number => {
  const teamCount = teams.filter(t => t.division === division).length;
  if (teamCount === 0) return 0;

  const lateGames = schedule.games.filter(g => {
    const slot = slotsById[g.slotId];
    return g.division === division && slot && bandOf(slot, DEFAULT_SETTINGS) === 'late';
  }).length;

  const perTeam = (2 * lateGames) / teamCount;
  return Math.ceil(perTeam) - Math.floor(perTeam);
};
