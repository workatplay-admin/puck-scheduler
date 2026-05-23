import type { IceSlot, SchedulerSettings } from '@/types/scheduler';

/** Union of the two supported division identifiers. */
export type DivisionId = 'A' | 'B';

/** Ice slots keyed by division after day-assignment. */
export type SlotsByDivision = Record<DivisionId, IceSlot[]>;

/** An ordered home/away matchup pair (home vs. away semantics may be swapped later). */
export interface UnorderedPair {
  homeTeamId: string;
  awayTeamId: string;
}

/** Full matchup pool keyed by division. */
export type MatchupsByDivision = Record<DivisionId, UnorderedPair[]>;

/** A resolved game assignment linking a matchup to a specific ice slot. */
export interface GameAssignment {
  division: DivisionId;
  homeTeamId: string;
  awayTeamId: string;
  slotId: string;
}

/**
 * Return shape of {@link assignDays}. Includes the partition result and a
 * feasibility discriminator the caller can surface to the UI.
 */
export interface DayAssignmentResult {
  slots: SlotsByDivision;
  feasibility: { ok: true } | { ok: false; reason: string };
}

/**
 * Global scoring function: takes the full assignment state and returns a
 * scalar penalty. Lower is better; 0 is a theoretically perfect schedule.
 */
export type ScoreFn = (
  assignments: GameAssignment[],
  slotsById: Record<string, IceSlot>,
  settings: SchedulerSettings
) => number;
