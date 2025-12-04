export interface IceSlot {
  id: string;
  date: string;
  startTime: string;
  dayOfWeek: string;
  isLate: boolean;
  isWeekend: boolean;
}

export interface Team {
  id: string;
  name: string;
  division: 'A' | 'B';
}

export interface Game {
  id: string;
  date: string;
  dayOfWeek: string;
  startTime: string;
  division: 'A' | 'B';
  homeTeam: string;
  awayTeam: string;
  isLate: boolean;
  isWeekend: boolean;
  slotId: string;
}

export interface SchedulerSettings {
  lateGameThreshold: string;
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
  worstVariance: number;
  worstVarianceSlot: string;
  lateSlotFlagged: boolean;
  weekendFlagged: boolean;
}

export interface DivisionBalance {
  division: 'A' | 'B';
  teamCount: number;
  totalGames: number;
  gamesPerTeam: number;
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
  schedule: Game[];
  unusedSlots: IceSlot[];
  settings: SchedulerSettings;
  currentTab: number;
}

export const DEFAULT_SETTINGS: SchedulerSettings = {
  lateGameThreshold: '20:45',
  lateSlotVarianceFlag: 2,
  weekendVarianceFlag: 3,
  maxGamesPerWeek: 3,
};
