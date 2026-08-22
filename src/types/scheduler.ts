import { z } from 'zod';

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
   * Start of the most-desirable band. Slots earlier than this are "afternoon"; slots from
   * here up to `lateGameThreshold` are "prime". Only the lower bound is stored — the upper
   * bound is the late threshold, so the three bands are contiguous and exhaustive by
   * construction. Note this does **not** make invalid states unrepresentable: a value at
   * or after the late threshold collapses the prime band, which `schedulerSettingsSchema`
   * rejects.
   */
  primeWindowStart: string;
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
  /** Games in the most-desirable band (prime window up to the late threshold). */
  primeGames: number;
  /** Games earlier than the prime window. */
  afternoonGames: number;
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
  /**
   * Whether the season contains any Friday or Saturday ice. Many seasons contain none,
   * in which case the weekend tables are all zeros and are hidden rather than shown as a
   * column of "✓ OK" that means nothing.
   */
  hasWeekendIce: boolean;
  /**
   * The band boundaries in force when this report was computed. Snapshotted alongside
   * `lateTimeSlots` so headers and numbers can never disagree: reading them live from
   * settings would relabel the columns while the counts underneath still reflected the
   * old boundaries.
   */
  bandBoundaries: { primeWindowStart: string; lateGameThreshold: string };
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
  primeWindowStart: '17:45',
  lateSlotVarianceFlag: 2,
  weekendVarianceFlag: 3,
  maxGamesPerWeek: 3,
};

/** Time-of-day band a slot falls into. Contiguous and exhaustive. */
export type Band = 'afternoon' | 'prime' | 'late';

/**
 * Classifies a slot by start time: afternoon below `primeWindowStart`, prime up to
 * `lateGameThreshold`, late at or after it. Boundaries are inclusive-low.
 */
export const bandOf = (slot: IceSlot, settings: SchedulerSettings): Band => {
  if (slot.startTime >= settings.lateGameThreshold) return 'late';
  return slot.startTime >= settings.primeWindowStart ? 'prime' : 'afternoon';
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Validates persisted or user-entered settings. Applied at the form boundary and again on
 * load — `JSON.parse(...) as T` validates nothing, so a hand-edited or extension-written
 * localStorage value would otherwise flow straight into the scheduler.
 */
export const schedulerSettingsSchema = z
  .object({
    lateGameThreshold: z.string().regex(HHMM, 'Use a 24-hour time such as 20:45'),
    primeWindowStart: z.string().regex(HHMM, 'Use a 24-hour time such as 17:45'),
    lateSlotVarianceFlag: z.number().int().min(1).max(5),
    weekendVarianceFlag: z.number().int().min(1).max(10),
    maxGamesPerWeek: z.number().int().min(2).max(5),
  })
  .refine(s => s.primeWindowStart < s.lateGameThreshold, {
    path: ['primeWindowStart'],
    message: 'Prime time must start before the late-game threshold',
  });

/**
 * Coerces unknown stored settings into a valid object, falling back to the default for
 * any field that fails rather than throwing — a bad stored value must never white-screen
 * the app on load.
 */
export const parseSettings = (raw: unknown): SchedulerSettings => {
  const merged = { ...DEFAULT_SETTINGS, ...(typeof raw === 'object' && raw !== null ? raw : {}) };
  const result = schedulerSettingsSchema.safeParse(merged);
  if (result.success) return merged as SchedulerSettings;

  const repaired: SchedulerSettings = { ...merged } as SchedulerSettings;
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof SchedulerSettings;
    if (key in DEFAULT_SETTINGS) {
      (repaired as Record<string, unknown>)[key] = DEFAULT_SETTINGS[key];
    }
  }

  // The cross-field refinement always reports against `primeWindowStart`, so if the bad
  // value was actually `lateGameThreshold` the repair above does not restore the
  // inequality. Reset the *pair* rather than the whole object — discarding a commissioner's
  // unrelated flag thresholds because two times disagree would be a silent data loss.
  if (!schedulerSettingsSchema.safeParse(repaired).success) {
    repaired.primeWindowStart = DEFAULT_SETTINGS.primeWindowStart;
    repaired.lateGameThreshold = DEFAULT_SETTINGS.lateGameThreshold;
  }
  return schedulerSettingsSchema.safeParse(repaired).success ? repaired : { ...DEFAULT_SETTINGS };
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
