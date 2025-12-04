import { useState, useEffect, useCallback } from 'react';
import { SchedulerState, IceSlot, Team, Game, SchedulerSettings, DEFAULT_SETTINGS } from '@/types/scheduler';

const STORAGE_KEY = 'hockey-scheduler-state';

const getInitialState = (): SchedulerState => {
  if (typeof window === 'undefined') {
    return {
      iceSlots: [],
      teams: [],
      schedule: [],
      unusedSlots: [],
      settings: DEFAULT_SETTINGS,
      currentTab: 0,
    };
  }
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        ...parsed,
        settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
      };
    }
  } catch (e) {
    console.error('Failed to load stored state:', e);
  }
  
  return {
    iceSlots: [],
    teams: [],
    schedule: [],
    unusedSlots: [],
    settings: DEFAULT_SETTINGS,
    currentTab: 0,
  };
};

export const useSchedulerStore = () => {
  const [state, setState] = useState<SchedulerState>(getInitialState);
  
  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Failed to save state:', e);
    }
  }, [state]);
  
  const setIceSlots = useCallback((slots: IceSlot[]) => {
    setState(prev => ({ ...prev, iceSlots: slots }));
  }, []);
  
  const addTeam = useCallback((team: Team) => {
    setState(prev => ({ ...prev, teams: [...prev.teams, team] }));
  }, []);
  
  const removeTeam = useCallback((teamId: string) => {
    setState(prev => ({
      ...prev,
      teams: prev.teams.filter(t => t.id !== teamId),
    }));
  }, []);
  
  const setSchedule = useCallback((schedule: Game[], unusedSlots: IceSlot[]) => {
    setState(prev => ({ ...prev, schedule, unusedSlots }));
  }, []);
  
  const updateSettings = useCallback((settings: Partial<SchedulerSettings>) => {
    setState(prev => ({
      ...prev,
      settings: { ...prev.settings, ...settings },
    }));
  }, []);
  
  const setCurrentTab = useCallback((tab: number) => {
    setState(prev => ({ ...prev, currentTab: tab }));
  }, []);
  
  const swapGames = useCallback((gameId1: string, gameId2: string) => {
    setState(prev => {
      const game1 = prev.schedule.find(g => g.id === gameId1);
      const game2 = prev.schedule.find(g => g.id === gameId2);
      
      if (!game1 || !game2) return prev;
      
      const newSchedule = prev.schedule.map(g => {
        if (g.id === gameId1) {
          return {
            ...g,
            date: game2.date,
            dayOfWeek: game2.dayOfWeek,
            startTime: game2.startTime,
            isLate: game2.isLate,
            isWeekend: game2.isWeekend,
            slotId: game2.slotId,
          };
        }
        if (g.id === gameId2) {
          return {
            ...g,
            date: game1.date,
            dayOfWeek: game1.dayOfWeek,
            startTime: game1.startTime,
            isLate: game1.isLate,
            isWeekend: game1.isWeekend,
            slotId: game1.slotId,
          };
        }
        return g;
      });
      
      return { ...prev, schedule: newSchedule };
    });
  }, []);
  
  const removeGame = useCallback((gameId: string) => {
    setState(prev => {
      const game = prev.schedule.find(g => g.id === gameId);
      if (!game) return prev;
      
      const slot = prev.iceSlots.find(s => s.id === game.slotId);
      const newUnusedSlots = slot ? [...prev.unusedSlots, slot] : prev.unusedSlots;
      
      return {
        ...prev,
        schedule: prev.schedule.filter(g => g.id !== gameId),
        unusedSlots: newUnusedSlots,
      };
    });
  }, []);
  
  const clearAll = useCallback(() => {
    setState({
      iceSlots: [],
      teams: [],
      schedule: [],
      unusedSlots: [],
      settings: DEFAULT_SETTINGS,
      currentTab: 0,
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
    clearAll,
  };
};
