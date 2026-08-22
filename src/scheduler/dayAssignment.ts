import type { IceSlot, Team, SchedulerSettings } from '@/types/scheduler';
import type { DayAssignmentResult, DivisionId, FeasibilityResult, SlotsByDivision } from './types';

const DIVISIONS: DivisionId[] = ['A', 'B'];

/**
 * Most games a division can host on a single date without some team playing twice.
 *
 * A date offering `n` slots to a division of `m` teams produces `2n` team-appearances;
 * once `2n > m` the pigeonhole principle forces at least one team into a double-header
 * before the optimiser makes any choice at all.
 */
const capacity = (teamCount: number): number => Math.floor(teamCount / 2);

/** Groups slots by date, each date's slots sorted chronologically by start time. */
const groupByDate = (slots: IceSlot[]): Map<string, IceSlot[]> => {
  const byDate = new Map<string, IceSlot[]>();
  for (const slot of slots) {
    const arr = byDate.get(slot.date) ?? [];
    arr.push(slot);
    byDate.set(slot.date, arr);
  }
  for (const arr of byDate.values()) {
    arr.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }
  return byDate;
};

/**
 * Proportional slot budget per division, nudged so the budgets sum to `totalSlots`
 * exactly after rounding (ADR §5.1 step 1).
 */
const computeTargets = (
  eligible: DivisionId[],
  teamCounts: Record<DivisionId, number>,
  totalSlots: number,
): Record<DivisionId, number> => {
  const target: Record<DivisionId, number> = { A: 0, B: 0 };
  const totalTeams = eligible.reduce((sum, d) => sum + teamCounts[d], 0);
  if (totalTeams === 0) return target;

  for (const d of eligible) {
    target[d] = Math.round((teamCounts[d] * totalSlots) / totalTeams);
  }
  const drift = totalSlots - eligible.reduce((sum, d) => sum + target[d], 0);
  if (drift !== 0) {
    const largest = eligible.reduce((a, b) => (target[a] >= target[b] ? a : b));
    target[largest] += drift;
  }
  return target;
};

/**
 * ADR §5.1 step 4. Every division's games-per-team must land within
 * `[floor(2S/T), ceil(2S/T)]` — the ±1 guarantee of PRD §3.2.2.
 *
 * The result is **advisory**: `generateSchedule` proceeds regardless and attaches the
 * reason to the schedule. Returning early here would hand the commissioner an empty
 * schedule for any slot/team mix that cannot split evenly.
 */
const checkFeasibility = (
  assignedSlots: SlotsByDivision,
  teamCounts: Record<DivisionId, number>,
  eligible: DivisionId[],
  totalSlots: number,
): FeasibilityResult => {
  const totalTeams = eligible.reduce((sum, d) => sum + teamCounts[d], 0);
  const targetPerTeam = totalTeams > 0 ? (2 * totalSlots) / totalTeams : 0;
  const allowedRange: [number, number] = [Math.floor(targetPerTeam), Math.ceil(targetPerTeam)];

  const gamesPerTeam: Record<DivisionId, number> = { A: 0, B: 0 };
  for (const d of DIVISIONS) {
    gamesPerTeam[d] = teamCounts[d] > 0 ? (assignedSlots[d].length * 2) / teamCounts[d] : 0;
  }

  const dropped = totalSlots - (assignedSlots.A.length + assignedSlots.B.length);
  const offenders = eligible.filter(
    d => gamesPerTeam[d] < allowedRange[0] || gamesPerTeam[d] > allowedRange[1],
  );
  if (offenders.length === 0 && dropped === 0) return { ok: true, gamesPerTeam, allowedRange };

  // Unplaceable ice is the more useful thing to say when it is the actual cause: a date
  // carrying more slots than the divisions can host is a roster problem, and reporting it
  // as "doesn't split evenly" would misdescribe it.
  const parts: string[] = [];
  if (dropped > 0) {
    const teamsNeeded = Math.max(...eligible.map(d => teamCounts[d])) + 2;
    parts.push(
      `${dropped} of your ${totalSlots} ice slots can't be used — some dates have more ` +
      `slots than your teams can fill without a team playing twice in one day. ` +
      `Adding teams (about ${teamsNeeded} per division) or removing those slots would fix it.`,
    );
  }
  if (offenders.length > 0) {
    const describe = (d: DivisionId) => `Division ${d} teams about ${Math.round(gamesPerTeam[d])}`;
    parts.push(
      eligible.length > 1
        ? `Your ice doesn't split evenly between divisions — ${eligible.map(describe).join(' and ')} games.`
        : `${describe(eligible[0])} games, short of the ${allowedRange[0]}–${allowedRange[1]} this much ice allows.`,
    );
  }
  parts.push('You can still generate, and teams within each division will still be balanced.');

  return { ok: false, gamesPerTeam, allowedRange, reason: parts.join(' ') };
};

/**
 * Assigns every ice slot to a division in **contiguous per-date blocks** (ADR §5.1).
 *
 * A date is kept whole wherever possible. It is split between the two divisions only
 * when a whole-date assignment would force same-day double-headers — with 6-slot dates
 * and 8-team divisions that is 12 appearances over 8 teams, so at least 4 teams would
 * play twice. Each division receives **at most one block per date**, which makes every
 * block contiguous by construction and preserves the post-game socialisation the
 * one-division-per-date rule existed to protect.
 *
 * Split-required dates are allocated first and chronologically (they are budget-inelastic
 * and the leading block alternates by date order); whole dates are then assigned greedily
 * against the remaining proportional budget.
 *
 * A division with fewer than two teams receives no slots at all — it cannot play a game,
 * so its proportional share would be stranded ice.
 *
 * @param slots    - All available ice slots for the season.
 * @param teams    - All registered teams.
 * @param settings - Scheduler settings (unused today; retained for signature stability).
 * @param _rng     - Unused: assignment is fully deterministic.
 * @returns Slot partition plus an advisory feasibility result.
 */
export const assignDays = (
  slots: IceSlot[],
  teams: Team[],
  settings: SchedulerSettings,
  _rng: () => number,
): DayAssignmentResult => {
  void settings;

  const teamCounts: Record<DivisionId, number> = {
    A: teams.filter(t => t.division === 'A').length,
    B: teams.filter(t => t.division === 'B').length,
  };
  const caps: Record<DivisionId, number> = {
    A: capacity(teamCounts.A),
    B: capacity(teamCounts.B),
  };
  const eligible = DIVISIONS.filter(d => teamCounts[d] >= 2);
  const assignedSlots: SlotsByDivision = { A: [], B: [] };

  if (eligible.length === 0) {
    return {
      slots: assignedSlots,
      feasibility: {
        ok: false,
        gamesPerTeam: { A: 0, B: 0 },
        allowedRange: [0, 0],
        reason: 'No division has at least two teams, so no games can be scheduled.',
      },
    };
  }

  const byDate = groupByDate(slots);
  const dates = [...byDate.keys()].sort();
  const target = computeTargets(eligible, teamCounts, slots.length);
  const assigned: Record<DivisionId, number> = { A: 0, B: 0 };

  /**
   * Places one date, giving `lead` the leading block. When `lead` can host the whole date
   * it does; otherwise the date is split, `lead` taking the earlier block up to its
   * capacity and `other` the rest up to its own.
   *
   * A date is *never* handed wholesale to whichever division happens to be able to host
   * it — doing so starves the smaller division of every date in the range
   * `(cap(small), cap(large)]`. Splitting is always preferred over reassignment.
   */
  const placeDate = (dateSlots: IceSlot[], lead: DivisionId, other?: DivisionId): void => {
    if (dateSlots.length <= caps[lead]) {
      assignedSlots[lead].push(...dateSlots);
      assigned[lead] += dateSlots.length;
      return;
    }

    const leadBlock = dateSlots.slice(0, caps[lead]);
    assignedSlots[lead].push(...leadBlock);
    assigned[lead] += leadBlock.length;

    if (!other) return; // surplus is unplaceable; it surfaces as unused ice
    const otherBlock = dateSlots.slice(
      caps[lead],
      Math.min(dateSlots.length, caps[lead] + caps[other]),
    );
    assignedSlots[other].push(...otherBlock);
    assigned[other] += otherBlock.length;
  };

  const largestWholeCap = Math.max(...eligible.map(d => caps[d]));
  const wholeDates: string[] = [];

  // Pass 1 — dates too large for any single division. Walked chronologically so the
  // leading (larger) block alternates evenly across the season rather than one division
  // always drawing the early slots.
  let leadIndex = 0;
  for (const date of dates) {
    const dateSlots = byDate.get(date)!;
    if (dateSlots.length <= largestWholeCap) {
      wholeDates.push(date);
      continue;
    }
    if (eligible.length === 1) {
      placeDate(dateSlots, eligible[0]);
      continue;
    }
    placeDate(
      dateSlots,
      eligible[leadIndex % eligible.length],
      eligible[(leadIndex + 1) % eligible.length],
    );
    leadIndex++;
  }

  // Pass 2 — remaining dates, largest first, led by whichever division is furthest below
  // its proportional budget. If that division cannot host the date whole, the date splits;
  // it is not reassigned to the division that can.
  wholeDates.sort((a, b) => {
    const diff = byDate.get(b)!.length - byDate.get(a)!.length;
    return diff !== 0 ? diff : a.localeCompare(b);
  });

  for (const date of wholeDates) {
    let lead = eligible[0];
    for (const d of eligible) {
      if (target[d] - assigned[d] > target[lead] - assigned[lead]) lead = d;
    }
    placeDate(byDate.get(date)!, lead, eligible.find(d => d !== lead));
  }

  return {
    slots: assignedSlots,
    feasibility: checkFeasibility(assignedSlots, teamCounts, eligible, slots.length),
  };
};
