import { useState, useEffect, useCallback } from 'react';
import { SchedulerState, IceSlot, Team, Game, Schedule, SchedulerSettings, FairnessReport, DEFAULT_SETTINGS } from '@/types/scheduler';
import { calculateFairnessReport } from '@/scheduler';
import { scheduleWrite, flushPending, cancelPending } from '@/lib/debouncedStorage';
import { generateId } from '@/lib/generateId';

const STORAGE_SLOTS_KEY = 'hockey_slots';
const STORAGE_TEAMS_KEY = 'hockey_teams';
const STORAGE_SCHEDULE_KEY = 'hockey_schedule';
const STORAGE_SETTINGS_KEY = 'hockey_settings';

const loadItem = <T>(key: string, fallback: T): T => {
  try {
    const stored = localStorage.getItem(key);
    if (stored) return JSON.parse(stored) as T;
  } catch {
    // ignore malformed storage
  }
  return fallback;
};

const migrateStorageIfNeeded = (): void => {
  const OLD_KEY = 'hockey-scheduler-state';
  const oldData = localStorage.getItem(OLD_KEY);
  if (!oldData) return;

  try {
    const parsed = JSON.parse(oldData) as Partial<SchedulerState & { schedule: unknown[] }>;
    if (parsed.iceSlots) localStorage.setItem(STORAGE_SLOTS_KEY, JSON.stringify(parsed.iceSlots));
    if (parsed.teams) localStorage.setItem(STORAGE_TEAMS_KEY, JSON.stringify(parsed.teams));
    if (parsed.settings) localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(parsed.settings));
    // Old schedule shape is incompatible; drop it so the user regenerates
  } catch {
    // ignore — old data unrecoverable
  } finally {
    localStorage.removeItem(OLD_KEY);
  }
};

const getInitialState = (): SchedulerState => {
  if (typeof window === 'undefined') {
    return {
      iceSlots: [], teams: [], schedule: null, unusedSlots: [],
      settings: DEFAULT_SETTINGS, currentTab: 0,
      fairnessReport: null, fairnessReportUpdated: false,
    };
  }

  migrateStorageIfNeeded();

  const iceSlots = loadItem<IceSlot[]>(STORAGE_SLOTS_KEY, []);
  const teams = loadItem<Team[]>(STORAGE_TEAMS_KEY, []);
  const schedule = loadItem<Schedule | null>(STORAGE_SCHEDULE_KEY, null);
  const settings = { ...DEFAULT_SETTINGS, ...loadItem<Partial<SchedulerSettings>>(STORAGE_SETTINGS_KEY, {}) };

  const fairnessReport: FairnessReport | null =
    schedule && iceSlots.length > 0 && teams.length > 0
      ? calculateFairnessReport(schedule, iceSlots, teams, settings)
      : null;

  return {
    iceSlots, teams, schedule, unusedSlots: [],
    settings, currentTab: 0,
    fairnessReport, fairnessReportUpdated: false,
  };
};

export const useSchedulerStore = () => {
  const [state, setState] = useState<SchedulerState>(getInitialState);

  useEffect(() => {
    scheduleWrite(STORAGE_SLOTS_KEY, JSON.stringify(state.iceSlots));
  }, [state.iceSlots]);

  useEffect(() => {
    scheduleWrite(STORAGE_TEAMS_KEY, JSON.stringify(state.teams));
  }, [state.teams]);

  useEffect(() => {
    scheduleWrite(
      STORAGE_SCHEDULE_KEY,
      state.schedule !== null ? JSON.stringify(state.schedule) : null,
    );
  }, [state.schedule]);

  useEffect(() => {
    scheduleWrite(STORAGE_SETTINGS_KEY, JSON.stringify(state.settings));
  }, [state.settings]);

  useEffect(() => {
    const onUnload = () => flushPending();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  /** Replaces the full set of ice slots (used after CSV import). */
  const setIceSlots = useCallback((slots: IceSlot[]) => {
    setState(prev => ({ ...prev, iceSlots: slots }));
  }, []);

  /** Appends a new team to the roster. */
  const addTeam = useCallback((team: Team) => {
    setState(prev => ({ ...prev, teams: [...prev.teams, team] }));
  }, []);

  /** Removes a team from the roster by id. */
  const removeTeam = useCallback((teamId: string) => {
    setState(prev => ({ ...prev, teams: prev.teams.filter(t => t.id !== teamId) }));
  }, []);

  /** Stores the schedule and auto-computes the fairness report. Resets the Updated badge. */
  const setSchedule = useCallback((schedule: Schedule, unusedSlots: IceSlot[]) => {
    setState(prev => ({
      ...prev,
      schedule,
      unusedSlots,
      fairnessReport: calculateFairnessReport(schedule, prev.iceSlots, prev.teams, prev.settings),
      fairnessReportUpdated: false,
    }));
  }, []);

  /** Merges partial settings into the current settings. */
  const updateSettings = useCallback((settings: Partial<SchedulerSettings>) => {
    setState(prev => ({ ...prev, settings: { ...prev.settings, ...settings } }));
  }, []);

  /** Navigates to the given tab index. */
  const setCurrentTab = useCallback((tab: number) => {
    setState(prev => ({ ...prev, currentTab: tab }));
  }, []);

  /** Swaps slot assignments for two games and recalculates the fairness report. */
  const swapGames = useCallback((gameId1: string, gameId2: string) => {
    setState(prev => {
      if (!prev.schedule) return prev;

      const game1 = prev.schedule.games.find(g => g.id === gameId1);
      const game2 = prev.schedule.games.find(g => g.id === gameId2);
      if (!game1 || !game2) return prev;

      const newGames = prev.schedule.games.map(g => {
        if (g.id === gameId1) return { ...g, slotId: game2.slotId };
        if (g.id === gameId2) return { ...g, slotId: game1.slotId };
        return g;
      });
      const newSchedule = { ...prev.schedule, games: newGames };

      return {
        ...prev,
        schedule: newSchedule,
        fairnessReport: calculateFairnessReport(newSchedule, prev.iceSlots, prev.teams, prev.settings),
        fairnessReportUpdated: true,
      };
    });
  }, []);

  /** Removes a game, returns its slot to unusedSlots, and recalculates the fairness report. */
  const removeGame = useCallback((gameId: string) => {
    setState(prev => {
      if (!prev.schedule) return prev;

      const game = prev.schedule.games.find(g => g.id === gameId);
      if (!game) return prev;

      const slot = prev.iceSlots.find(s => s.id === game.slotId);
      const newUnusedSlots = slot ? [...prev.unusedSlots, slot] : prev.unusedSlots;
      const newSchedule = { ...prev.schedule, games: prev.schedule.games.filter(g => g.id !== gameId) };

      return {
        ...prev,
        schedule: newSchedule,
        unusedSlots: newUnusedSlots,
        fairnessReport: calculateFairnessReport(newSchedule, prev.iceSlots, prev.teams, prev.settings),
        fairnessReportUpdated: true,
      };
    });
  }, []);

  /** Adds a manually assigned game to the schedule and removes the slot from unusedSlots. */
  const reassignSlot = useCallback((slotId: string, homeTeamId: string, awayTeamId: string, division: 'A' | 'B') => {
    setState(prev => {
      if (!prev.schedule) return prev;

      const newGame: Game = {
        id: generateId(),
        homeTeamId,
        awayTeamId,
        division,
        slotId,
      };
      const newSchedule = { ...prev.schedule, games: [...prev.schedule.games, newGame] };
      const newUnusedSlots = prev.unusedSlots.filter(s => s.id !== slotId);

      return {
        ...prev,
        schedule: newSchedule,
        unusedSlots: newUnusedSlots,
        fairnessReport: calculateFairnessReport(newSchedule, prev.iceSlots, prev.teams, prev.settings),
        fairnessReportUpdated: true,
      };
    });
  }, []);

  /** Manually re-derives the fairness report from current state. Resets the Updated badge. */
  const recalculateFairnessReport = useCallback(() => {
    setState(prev => {
      if (!prev.schedule) return prev;
      return {
        ...prev,
        fairnessReport: calculateFairnessReport(prev.schedule, prev.iceSlots, prev.teams, prev.settings),
        fairnessReportUpdated: false,
      };
    });
  }, []);

  /** Clears the fairnessReportUpdated badge without recalculating the report. */
  const clearFairnessReportUpdated = useCallback(() => {
    setState(prev => ({ ...prev, fairnessReportUpdated: false }));
  }, []);

  /** Resets all state and clears localStorage — used for "Start New Season". */
  const clearAll = useCallback(() => {
    cancelPending();
    try {
      localStorage.removeItem(STORAGE_SLOTS_KEY);
      localStorage.removeItem(STORAGE_TEAMS_KEY);
      localStorage.removeItem(STORAGE_SCHEDULE_KEY);
      localStorage.removeItem(STORAGE_SETTINGS_KEY);
    } catch { /* ignore */ }
    setState({
      iceSlots: [], teams: [], schedule: null, unusedSlots: [],
      settings: DEFAULT_SETTINGS, currentTab: 0,
      fairnessReport: null, fairnessReportUpdated: false,
    });
  }, []);

  return {
    ...state,
    setIceSlots,
    addTeam,
    removeTeam,
    setSchedule,
    updateSettings,
    setCurrentTab,
    swapGames,
    removeGame,
    reassignSlot,
    recalculateFairnessReport,
    clearFairnessReportUpdated,
    clearAll,
  };
};
