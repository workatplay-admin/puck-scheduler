import {
  buildSlotsById, buildTeamsById, isDerivedLate, isDerivedWeekend,
} from '@/types/scheduler';
import type {
  IceSlot, Team, Schedule, SchedulerSettings, FairnessReport, TeamStats, DivisionBalance,
} from '@/types/scheduler';

/**
 * Computes a detailed fairness report for a generated schedule.
 *
 * Tallies per-team game counts broken down by time slot, day of week,
 * and opponent, then flags teams whose late-slot or weekend exposure
 * exceeds the configured variance thresholds.
 *
 * @param schedule - The generated schedule containing the game list.
 * @param slots    - Full list of ice slots used during generation.
 * @param teams    - All teams participating in the season.
 * @param settings - Scheduler settings including variance thresholds.
 * @returns A {@link FairnessReport} with per-team stats and division balance.
 */
export const calculateFairnessReport = (
  schedule: Schedule,
  slots: IceSlot[],
  teams: Team[],
  settings: SchedulerSettings
): FairnessReport => {
  const { games } = schedule;
  const slotsById = buildSlotsById(slots);
  const teamsById = buildTeamsById(teams);

  const allTimeSlots = [...new Set(
    games.map(g => slotsById[g.slotId]?.startTime).filter((t): t is string => t !== undefined)
  )].sort();
  const lateTimeSlots = allTimeSlots.filter(t => t >= settings.lateGameThreshold);

  const teamStatsMap = new Map<string, TeamStats>();

  for (const team of teams) {
    teamStatsMap.set(team.name, {
      teamName: team.name,
      division: team.division,
      totalGames: 0,
      timeSlots: {},
      fridayGames: 0,
      saturdayGames: 0,
      totalWeekend: 0,
      dayOfWeekGames: {
        Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0,
        Friday: 0, Saturday: 0, Sunday: 0,
      },
      opponentGames: {},
      worstVariance: 0,
      worstVarianceSlot: '',
      lateSlotFlagged: false,
      weekendFlagged: false,
    });

    for (const opponent of teams) {
      if (opponent.name !== team.name && opponent.division === team.division) {
        teamStatsMap.get(team.name)!.opponentGames[opponent.name] = 0;
      }
    }

    for (const slot of allTimeSlots) {
      teamStatsMap.get(team.name)!.timeSlots[slot] = 0;
    }
  }

  for (const game of games) {
    const slot = slotsById[game.slotId];
    const homeTeam = teamsById[game.homeTeamId];
    const awayTeam = teamsById[game.awayTeamId];

    if (!slot || !homeTeam || !awayTeam) continue;

    const isWeekend = isDerivedWeekend(slot);

    const homeStats = teamStatsMap.get(homeTeam.name);
    const awayStats = teamStatsMap.get(awayTeam.name);

    if (homeStats) {
      homeStats.totalGames++;
      homeStats.timeSlots[slot.startTime] = (homeStats.timeSlots[slot.startTime] || 0) + 1;
      homeStats.dayOfWeekGames[slot.dayOfWeek] = (homeStats.dayOfWeekGames[slot.dayOfWeek] || 0) + 1;
      if (slot.dayOfWeek === 'Friday') homeStats.fridayGames++;
      if (slot.dayOfWeek === 'Saturday') homeStats.saturdayGames++;
      if (isWeekend) homeStats.totalWeekend++;
      if (awayStats && homeStats.division === awayStats.division) {
        homeStats.opponentGames[awayTeam.name] = (homeStats.opponentGames[awayTeam.name] || 0) + 1;
      }
    }

    if (awayStats) {
      awayStats.totalGames++;
      awayStats.timeSlots[slot.startTime] = (awayStats.timeSlots[slot.startTime] || 0) + 1;
      awayStats.dayOfWeekGames[slot.dayOfWeek] = (awayStats.dayOfWeekGames[slot.dayOfWeek] || 0) + 1;
      if (slot.dayOfWeek === 'Friday') awayStats.fridayGames++;
      if (slot.dayOfWeek === 'Saturday') awayStats.saturdayGames++;
      if (isWeekend) awayStats.totalWeekend++;
      if (homeStats && awayStats.division === homeStats.division) {
        awayStats.opponentGames[homeTeam.name] = (awayStats.opponentGames[homeTeam.name] || 0) + 1;
      }
    }
  }

  for (const division of ['A', 'B'] as ('A' | 'B')[]) {
    const divisionTeams = teams.filter(t => t.division === division);

    for (const lateSlot of lateTimeSlots) {
      const counts = divisionTeams.map(t => teamStatsMap.get(t.name)!.timeSlots[lateSlot] || 0);
      const minCount = Math.min(...counts);

      for (const team of divisionTeams) {
        const stats = teamStatsMap.get(team.name)!;
        const variance = (stats.timeSlots[lateSlot] || 0) - minCount;
        if (variance > stats.worstVariance) {
          stats.worstVariance = variance;
          stats.worstVarianceSlot = lateSlot;
        }
        if (variance > settings.lateSlotVarianceFlag) {
          stats.lateSlotFlagged = true;
        }
      }
    }

    const weekendCounts = divisionTeams.map(t => teamStatsMap.get(t.name)!.totalWeekend);
    const minWeekend = Math.min(...weekendCounts);

    for (const team of divisionTeams) {
      const stats = teamStatsMap.get(team.name)!;
      if (stats.totalWeekend - minWeekend > settings.weekendVarianceFlag) {
        stats.weekendFlagged = true;
      }
    }
  }

  const divisionBalance: DivisionBalance[] = [];

  for (const division of ['A', 'B'] as ('A' | 'B')[]) {
    const divisionTeams = teams.filter(t => t.division === division);
    const divisionGames = games.filter(g => g.division === division);
    const gameDates = [...new Set(divisionGames.map(g => slotsById[g.slotId]?.date).filter((d): d is string => d !== undefined))];

    const fridayDays = gameDates.filter(d => {
      const game = divisionGames.find(g => slotsById[g.slotId]?.date === d);
      return game ? slotsById[game.slotId]?.dayOfWeek === 'Friday' : false;
    }).length;

    const saturdayDays = gameDates.filter(d => {
      const game = divisionGames.find(g => slotsById[g.slotId]?.date === d);
      return game ? slotsById[game.slotId]?.dayOfWeek === 'Saturday' : false;
    }).length;

    const lateSlotCount = divisionGames.filter(g => {
      const slot = slotsById[g.slotId];
      return slot ? isDerivedLate(slot, settings.lateGameThreshold) : false;
    }).length;

    const totalTeamGames = divisionTeams.reduce(
      (sum, t) => sum + (teamStatsMap.get(t.name)?.totalGames || 0),
      0
    );

    divisionBalance.push({
      division,
      teamCount: divisionTeams.length,
      totalGames: divisionGames.length,
      gamesPerTeam: divisionTeams.length > 0 ? Math.round(totalTeamGames / divisionTeams.length) : 0,
      fridayGameDays: fridayDays,
      saturdayGameDays: saturdayDays,
      totalLateSlots: lateSlotCount,
    });
  }

  return {
    teamStats: Array.from(teamStatsMap.values()),
    divisionBalance,
    allTimeSlots,
    lateTimeSlots,
  };
};
