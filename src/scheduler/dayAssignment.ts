import { isDerivedLate, isDerivedWeekend } from '@/types/scheduler';
import type { IceSlot, Team, SchedulerSettings } from '@/types/scheduler';
import type { DayAssignmentResult, DivisionId } from './types';

/**
 * Partitions ice-slot dates between Division A and Division B using a
 * proportional-target greedy algorithm (ADR §5.1).
 *
 * Target slot budgets are computed as:
 *   `target_A = round(teamCount_A × totalSlots / totalTeams)`
 *   `target_B = totalSlots − target_A`
 *
 * Dates are sorted by slot count descending so high-density dates are
 * allocated first. Each date is assigned to the division whose current
 * assigned count is furthest below its target; ties break on weekend balance,
 * then late-slot balance, then alternation index.
 *
 * @param slots    - All available ice slots for the season.
 * @param teams    - All registered teams (used to compute proportional targets).
 * @param settings - Scheduler settings (late-game threshold for tiebreaking).
 * @param _rng     - RNG function (reserved for future use).
 * @returns Slot partition plus a feasibility discriminator.
 */
export const assignDays = (
  slots: IceSlot[],
  teams: Team[],
  settings: SchedulerSettings,
  _rng: () => number
): DayAssignmentResult => {
  const divACount = teams.filter(t => t.division === 'A').length;
  const divBCount = teams.filter(t => t.division === 'B').length;
  const totalTeams = divACount + divBCount;

  if (totalTeams === 0) {
    return { slots: { A: [], B: [] }, feasibility: { ok: false, reason: 'No teams registered' } };
  }

  const totalSlots = slots.length;
  const targetA = Math.round(divACount * totalSlots / totalTeams);
  const targetB = totalSlots - targetA;

  // Group slots by date
  const dateMap = new Map<string, IceSlot[]>();
  for (const slot of slots) {
    const arr = dateMap.get(slot.date) ?? [];
    arr.push(slot);
    dateMap.set(slot.date, arr);
  }

  // Sort dates: more slots per date first, then chronologically
  const dates = [...dateMap.keys()].sort((a, b) => {
    const diff = (dateMap.get(b)?.length ?? 0) - (dateMap.get(a)?.length ?? 0);
    return diff !== 0 ? diff : a.localeCompare(b);
  });

  const dateAssignments = new Map<string, DivisionId>();
  let assignedA = 0;
  let assignedB = 0;
  let weekendA = 0;
  let weekendB = 0;
  let lateA = 0;
  let lateB = 0;
  let altIndex = 0;

  for (const date of dates) {
    const dateSlots = dateMap.get(date)!;
    const count = dateSlots.length;
    const isWeekend = isDerivedWeekend(dateSlots[0]);
    const lateCount = dateSlots.filter(s => isDerivedLate(s, settings.lateGameThreshold)).length;

    // Assign to division that minimises total deviation from both targets
    const devIfA = Math.abs(assignedA + count - targetA) + Math.abs(assignedB - targetB);
    const devIfB = Math.abs(assignedA - targetA) + Math.abs(assignedB + count - targetB);

    let div: DivisionId;
    if (devIfA < devIfB) {
      div = 'A';
    } else if (devIfB < devIfA) {
      div = 'B';
    } else if (isWeekend) {
      div = weekendA <= weekendB ? 'A' : 'B';
    } else if (lateCount > 0) {
      div = lateA <= lateB ? 'A' : 'B';
    } else {
      div = altIndex % 2 === 0 ? 'A' : 'B';
    }

    dateAssignments.set(date, div);
    altIndex++;

    if (div === 'A') {
      assignedA += count;
      if (isWeekend) weekendA++;
      lateA += lateCount;
    } else {
      assignedB += count;
      if (isWeekend) weekendB++;
      lateB += lateCount;
    }
  }

  const result: DayAssignmentResult = {
    slots: {
      A: slots.filter(s => dateAssignments.get(s.date) === 'A'),
      B: slots.filter(s => dateAssignments.get(s.date) === 'B'),
    },
    feasibility: { ok: true },
  };

  if (divACount >= 2 && result.slots.A.length === 0) {
    result.feasibility = {
      ok: false,
      reason: 'Division A has teams but received no ice slots — add more slots or adjust team counts',
    };
  } else if (divBCount >= 2 && result.slots.B.length === 0) {
    result.feasibility = {
      ok: false,
      reason: 'Division B has teams but received no ice slots — add more slots or adjust team counts',
    };
  }

  return result;
};
