import {
  bandOf, buildSlotsById, buildTeamsById, isDerivedLate, isDerivedWeekend,
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
      sameDayDates: [],
      primeGames: 0,
      afternoonGames: 0,
      totalLateGames: 0,
      lateSurplus: 0,
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

    const band = bandOf(slot, settings);

    if (homeStats) {
      homeStats.totalGames++;
      if (band === 'prime') homeStats.primeGames++;
      else if (band === 'afternoon') homeStats.afternoonGames++;
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
      if (band === 'prime') awayStats.primeGames++;
      else if (band === 'afternoon') awayStats.afternoonGames++;
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

  // Same-day games. Structurally impossible for a well-configured season since v0.6, but
  // still reachable through manual edits (`reassignSlot`) or a misconfigured roster.
  const perTeamDate = new Map<string, Map<string, number>>();
  for (const game of games) {
    const slot = slotsById[game.slotId];
    if (!slot) continue;
    for (const teamId of [game.homeTeamId, game.awayTeamId]) {
      const team = teamsById[teamId];
      if (!team) continue;
      const dates = perTeamDate.get(team.name) ?? new Map<string, number>();
      dates.set(slot.date, (dates.get(slot.date) ?? 0) + 1);
      perTeamDate.set(team.name, dates);
    }
  }
  for (const [teamName, dates] of perTeamDate) {
    const stats = teamStatsMap.get(teamName);
    if (!stats) continue;
    stats.sameDayDates = [...dates.entries()]
      .filter(([, count]) => count > 1)
      .map(([date]) => date)
      .sort();
  }

  for (const division of ['A', 'B'] as ('A' | 'B')[]) {
    const divisionTeams = teams.filter(t => t.division === division);

    // Late Surplus per team: aggregate late-game counts, compare against the
    // floor computed over scheduled teams only. A team with zero games is excluded
    // from the floor calculation so it can't artificially inflate every other
    // team's surplus (see docs/archive/late-fairness-redefinition.md §Metric). The unscheduled
    // team still appears in the report with totalLateGames=0, lateSurplus=0, and
    // is never flagged. Floor population may shift between regenerations if the
    // roster changes — this is intentional; the floor reflects the schedule that
    // exists, not a frozen baseline.
    for (const team of divisionTeams) {
      const stats = teamStatsMap.get(team.name)!;
      stats.totalLateGames = lateTimeSlots.reduce(
        (sum, slot) => sum + (stats.timeSlots[slot] || 0),
        0
      );
    }

    const scheduledDivTeams = divisionTeams.filter(
      t => teamStatsMap.get(t.name)!.totalGames > 0
    );
    const divisionFloor = scheduledDivTeams.length > 0
      ? Math.min(...scheduledDivTeams.map(t => teamStatsMap.get(t.name)!.totalLateGames))
      : 0;

    const scheduledNames = new Set(scheduledDivTeams.map(t => t.name));
    for (const team of divisionTeams) {
      const stats = teamStatsMap.get(team.name)!;
      // Unscheduled teams are excluded from the comparison: lateSurplus stays 0.
      const surplus = scheduledNames.has(team.name)
        ? stats.totalLateGames - divisionFloor
        : 0;
      // Tripwire: by construction every scheduled team's total is ≥ floor.
      // A negative surplus would mean a bug in scheduledDivTeams filtering or floor computation.
      if (surplus < 0) {
        throw new Error(
          `Negative Late Surplus for ${team.name} in division ${division}: ${surplus}`
        );
      }
      stats.lateSurplus = surplus;
      stats.lateSlotFlagged = scheduledNames.has(team.name)
        && surplus > settings.lateSlotVarianceFlag;
    }

    const weekendCounts = divisionTeams.map(t => teamStatsMap.get(t.name)!.totalWeekend);
    const minWeekend = weekendCounts.length > 0 ? Math.min(...weekendCounts) : 0;

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

    const perTeamCounts = divisionTeams.map(t => teamStatsMap.get(t.name)?.totalGames ?? 0);
    let gamesPerTeam = '0';
    if (perTeamCounts.length > 0) {
      const minGames = Math.min(...perTeamCounts);
      const maxGames = Math.max(...perTeamCounts);
      gamesPerTeam = minGames === maxGames ? String(minGames) : `${minGames}–${maxGames}`;
    }

    divisionBalance.push({
      division,
      teamCount: divisionTeams.length,
      totalGames: divisionGames.length,
      gamesPerTeam,
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
    hasWeekendIce: slots.some(isDerivedWeekend),
    bandBoundaries: {
      primeWindowStart: settings.primeWindowStart,
      lateGameThreshold: settings.lateGameThreshold,
    },
  };
};
