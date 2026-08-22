export interface IceSlot {
  id: string;
  date: string;
  startTime: string;
  dayOfWeek: string;
}

export interface Team {
  id: string;
  name: string;
  division: 'A' | 'B';
}

export interface Game {
  id: string;
  division: 'A' | 'B';
  homeTeamId: string;
  awayTeamId: string;
  slotId: string;
}

export interface Schedule {
  games: Game[];
  seed: number;
  generatedAt: string;
  fairnessScore: number;
  hasInvariantViolations?: boolean;
  violationSummary?: string;
  /**
   * Advisory note from day assignment — e.g. the slot/team mix cannot give every
   * division the same games-per-team. Distinct from `hasInvariantViolations`, which
   * means the *produced* schedule breaks a hard invariant. A warning never blocks
   * generation and never yields an empty schedule.
   */
  feasibilityWarning?: string;
}

export interface SchedulerSettings {
  lateGameThreshold: string;
  /**
   * Maximum allowed Late Surplus (total late games above the division minimum)
   * before a team is flagged. Historical field name; kept for localStorage compatibility.
   */
  lateSlotVarianceFlag: number;
  weekendVarianceFlag: number;
  maxGamesPerWeek: number;
}

export interface TeamStats {
  teamName: string;
  division: 'A' | 'B';
  totalGames: number;
  timeSlots: Record<string, number>;
  fridayGames: number;
  saturdayGames: number;
  totalWeekend: number;
  dayOfWeekGames: Record<string, number>;
  opponentGames: Record<string, number>;
  /**
   * Dates on which this team plays more than once. Should be empty: same-day play is an
   * invariant, not a preference. Carries the dates rather than a count so the report can
   * point the commissioner at the games rather than just telling them a number.
   */
  sameDayDates: string[];
  totalLateGames: number;
  lateSurplus: number;
  lateSlotFlagged: boolean;
  weekendFlagged: boolean;
}

export interface DivisionBalance {
  division: 'A' | 'B';
  teamCount: number;
  totalGames: number;
  /**
   * Games each team plays in this division. Rendered as a single integer when
   * every team plays the same count, or `"min–max"` when the count varies
   * (which happens when total games is not divisible by teamCount/2).
   */
  gamesPerTeam: string;
  fridayGameDays: number;
  saturdayGameDays: number;
  totalLateSlots: number;
}

export interface FairnessReport {
  teamStats: TeamStats[];
  divisionBalance: DivisionBalance[];
  allTimeSlots: string[];
  lateTimeSlots: string[];
}

export interface SchedulerState {
  iceSlots: IceSlot[];
  teams: Team[];
  schedule: Schedule | null;
  unusedSlots: IceSlot[];
  settings: SchedulerSettings;
  currentTab: number;
  fairnessReport: FairnessReport | null;
  fairnessReportUpdated: boolean;
}

export const DEFAULT_SETTINGS: SchedulerSettings = {
  lateGameThreshold: '20:45',
  lateSlotVarianceFlag: 2,
  weekendVarianceFlag: 3,
  maxGamesPerWeek: 3,
};

/** Builds a lookup map from slot id → IceSlot for O(1) access. */
export const buildSlotsById = (slots: IceSlot[]): Record<string, IceSlot> =>
  Object.fromEntries(slots.map(s => [s.id, s]));

/** Builds a lookup map from team id → Team for O(1) access. */
export const buildTeamsById = (teams: Team[]): Record<string, Team> =>
  Object.fromEntries(teams.map(t => [t.id, t]));

/** Returns true if the slot's start time is at or after the configured late-game threshold. */
export const isDerivedLate = (slot: IceSlot, threshold: string): boolean =>
  slot.startTime >= threshold;

/** Returns true if the slot falls on a Friday or Saturday. */
export const isDerivedWeekend = (slot: IceSlot): boolean =>
  slot.dayOfWeek === 'Friday' || slot.dayOfWeek === 'Saturday';
