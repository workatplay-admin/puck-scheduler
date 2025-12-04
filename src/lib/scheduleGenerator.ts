import { IceSlot, Team, Game, SchedulerSettings, FairnessReport, TeamStats, DivisionBalance } from '@/types/scheduler';

// Generate unique matchups for a division
const generateMatchups = (teams: Team[]): { home: string; away: string }[] => {
  const matchups: { home: string; away: string }[] = [];
  
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      // Add both home/away variants
      matchups.push({ home: teams[i].name, away: teams[j].name });
      matchups.push({ home: teams[j].name, away: teams[i].name });
    }
  }
  
  return matchups;
};

// Shuffle array using Fisher-Yates
const shuffle = <T>(array: T[]): T[] => {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

// Get unique dates from ice slots
const getUniqueDates = (slots: IceSlot[]): string[] => {
  return [...new Set(slots.map(s => s.date))].sort();
};

// Assign dates to divisions, alternating and balancing weekend/late games
const assignDatesToDivisions = (slots: IceSlot[]): Map<string, 'A' | 'B'> => {
  const dates = getUniqueDates(slots);
  const dateAssignments = new Map<string, 'A' | 'B'>();
  
  // Count weekend days and late slots per date
  const dateInfo = new Map<string, { isWeekend: boolean; lateCount: number }>();
  
  for (const date of dates) {
    const dateSlots = slots.filter(s => s.date === date);
    const isWeekend = dateSlots[0]?.isWeekend || false;
    const lateCount = dateSlots.filter(s => s.isLate).length;
    dateInfo.set(date, { isWeekend, lateCount });
  }
  
  // Simple alternating assignment with some balancing
  let divisionAWeekends = 0;
  let divisionBWeekends = 0;
  let divisionALate = 0;
  let divisionBLate = 0;
  
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const info = dateInfo.get(date)!;
    
    // Prefer alternating, but balance weekends and late games
    let preferredDiv: 'A' | 'B' = i % 2 === 0 ? 'A' : 'B';
    
    if (info.isWeekend) {
      // Try to balance weekend days
      if (divisionAWeekends > divisionBWeekends + 1) preferredDiv = 'B';
      else if (divisionBWeekends > divisionAWeekends + 1) preferredDiv = 'A';
    }
    
    dateAssignments.set(date, preferredDiv);
    
    if (info.isWeekend) {
      if (preferredDiv === 'A') divisionAWeekends++;
      else divisionBWeekends++;
    }
    if (preferredDiv === 'A') divisionALate += info.lateCount;
    else divisionBLate += info.lateCount;
  }
  
  return dateAssignments;
};

// Calculate how many games each team needs
const calculateGamesNeeded = (teams: Team[], totalSlots: number): number => {
  if (teams.length < 2) return 0;
  // Each game uses one slot and involves 2 teams
  // Total games = totalSlots, each team should play ~ (totalSlots * 2) / teamCount
  return Math.floor((totalSlots * 2) / teams.length);
};

// Main schedule generation
export const generateSchedule = (
  iceSlots: IceSlot[],
  teams: Team[],
  settings: SchedulerSettings
): { schedule: Game[]; unusedSlots: IceSlot[] } => {
  const divisionATeams = teams.filter(t => t.division === 'A');
  const divisionBTeams = teams.filter(t => t.division === 'B');
  
  if (divisionATeams.length < 2 && divisionBTeams.length < 2) {
    return { schedule: [], unusedSlots: iceSlots };
  }

  // Assign dates to divisions
  const dateAssignments = assignDatesToDivisions(iceSlots);
  
  // Separate slots by division
  const divisionASlots = iceSlots.filter(s => dateAssignments.get(s.date) === 'A');
  const divisionBSlots = iceSlots.filter(s => dateAssignments.get(s.date) === 'B');
  
  const schedule: Game[] = [];
  const unusedSlots: IceSlot[] = [];
  
  // Generate games for each division
  const generateDivisionGames = (divTeams: Team[], divSlots: IceSlot[], division: 'A' | 'B'): void => {
    if (divTeams.length < 2) {
      unusedSlots.push(...divSlots);
      return;
    }
    
    // Generate all possible matchups
    let matchups = generateMatchups(divTeams);
    
    // Calculate how many times we need to repeat matchups
    const gamesNeeded = divSlots.length;
    const uniqueMatchups = (divTeams.length * (divTeams.length - 1));
    const repeats = Math.ceil(gamesNeeded / uniqueMatchups);
    
    // Create repeated and shuffled matchup pool
    let matchupPool: { home: string; away: string }[] = [];
    for (let r = 0; r < repeats; r++) {
      matchupPool = matchupPool.concat(shuffle(matchups));
    }
    
    // Track team game counts for balancing
    const teamGames = new Map<string, number>();
    const teamLateGames = new Map<string, Map<string, number>>();
    const teamWeekendGames = new Map<string, number>();
    
    divTeams.forEach(t => {
      teamGames.set(t.name, 0);
      teamLateGames.set(t.name, new Map());
      teamWeekendGames.set(t.name, 0);
    });
    
    // Sort slots to prioritize late/weekend slots first (harder to assign fairly)
    const sortedSlots = [...divSlots].sort((a, b) => {
      // Late weekend slots first, then late, then weekend, then regular
      const scoreA = (a.isLate ? 2 : 0) + (a.isWeekend ? 1 : 0);
      const scoreB = (b.isLate ? 2 : 0) + (b.isWeekend ? 1 : 0);
      return scoreB - scoreA;
    });
    
    // Assign matchups to slots
    for (const slot of sortedSlots) {
      // Find best matchup for this slot
      let bestMatchupIndex = -1;
      let bestScore = Infinity;
      
      for (let i = 0; i < matchupPool.length; i++) {
        const matchup = matchupPool[i];
        
        // Calculate fairness score for this assignment
        const homeGames = teamGames.get(matchup.home) || 0;
        const awayGames = teamGames.get(matchup.away) || 0;
        
        // Prefer teams with fewer games
        let score = homeGames + awayGames;
        
        // Penalize if this would give a team too many late games at this time
        if (slot.isLate) {
          const homeLate = teamLateGames.get(matchup.home)?.get(slot.startTime) || 0;
          const awayLate = teamLateGames.get(matchup.away)?.get(slot.startTime) || 0;
          score += (homeLate + awayLate) * 10;
        }
        
        // Penalize if this would give a team too many weekend games
        if (slot.isWeekend) {
          const homeWeekend = teamWeekendGames.get(matchup.home) || 0;
          const awayWeekend = teamWeekendGames.get(matchup.away) || 0;
          score += (homeWeekend + awayWeekend) * 5;
        }
        
        if (score < bestScore) {
          bestScore = score;
          bestMatchupIndex = i;
        }
      }
      
      if (bestMatchupIndex >= 0) {
        const matchup = matchupPool.splice(bestMatchupIndex, 1)[0];
        
        // Create game
        schedule.push({
          id: `game-${schedule.length}-${Date.now()}`,
          date: slot.date,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          division,
          homeTeam: matchup.home,
          awayTeam: matchup.away,
          isLate: slot.isLate,
          isWeekend: slot.isWeekend,
          slotId: slot.id,
        });
        
        // Update tracking
        teamGames.set(matchup.home, (teamGames.get(matchup.home) || 0) + 1);
        teamGames.set(matchup.away, (teamGames.get(matchup.away) || 0) + 1);
        
        if (slot.isLate) {
          const homeLateMap = teamLateGames.get(matchup.home)!;
          const awayLateMap = teamLateGames.get(matchup.away)!;
          homeLateMap.set(slot.startTime, (homeLateMap.get(slot.startTime) || 0) + 1);
          awayLateMap.set(slot.startTime, (awayLateMap.get(slot.startTime) || 0) + 1);
        }
        
        if (slot.isWeekend) {
          teamWeekendGames.set(matchup.home, (teamWeekendGames.get(matchup.home) || 0) + 1);
          teamWeekendGames.set(matchup.away, (teamWeekendGames.get(matchup.away) || 0) + 1);
        }
      } else {
        unusedSlots.push(slot);
      }
    }
  };
  
  generateDivisionGames(divisionATeams, divisionASlots, 'A');
  generateDivisionGames(divisionBTeams, divisionBSlots, 'B');
  
  // Sort schedule by date and time
  schedule.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.startTime.localeCompare(b.startTime);
  });
  
  return { schedule, unusedSlots };
};

// Calculate fairness report
export const calculateFairnessReport = (
  schedule: Game[],
  teams: Team[],
  settings: SchedulerSettings
): FairnessReport => {
  // Get all unique time slots
  const allTimeSlots = [...new Set(schedule.map(g => g.startTime))].sort();
  const lateTimeSlots = allTimeSlots.filter(t => t >= settings.lateGameThreshold);
  
  // Initialize team stats
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
        'Monday': 0,
        'Tuesday': 0,
        'Wednesday': 0,
        'Thursday': 0,
        'Friday': 0,
        'Saturday': 0,
        'Sunday': 0,
      },
      opponentGames: {},
      worstVariance: 0,
      worstVarianceSlot: '',
      lateSlotFlagged: false,
      weekendFlagged: false,
    });
    
    // Initialize opponent games
    for (const opponent of teams) {
      if (opponent.name !== team.name && opponent.division === team.division) {
        teamStatsMap.get(team.name)!.opponentGames[opponent.name] = 0;
      }
    }
    
    // Initialize time slots
    for (const slot of allTimeSlots) {
      teamStatsMap.get(team.name)!.timeSlots[slot] = 0;
    }
  }
  
  // Count games
  for (const game of schedule) {
    const homeStats = teamStatsMap.get(game.homeTeam);
    const awayStats = teamStatsMap.get(game.awayTeam);
    
    if (homeStats) {
      homeStats.totalGames++;
      homeStats.timeSlots[game.startTime] = (homeStats.timeSlots[game.startTime] || 0) + 1;
      homeStats.dayOfWeekGames[game.dayOfWeek] = (homeStats.dayOfWeekGames[game.dayOfWeek] || 0) + 1;
      
      if (game.dayOfWeek === 'Friday') homeStats.fridayGames++;
      if (game.dayOfWeek === 'Saturday') homeStats.saturdayGames++;
      if (game.isWeekend) homeStats.totalWeekend++;
      
      if (awayStats && homeStats.division === awayStats.division) {
        homeStats.opponentGames[game.awayTeam] = (homeStats.opponentGames[game.awayTeam] || 0) + 1;
      }
    }
    
    if (awayStats) {
      awayStats.totalGames++;
      awayStats.timeSlots[game.startTime] = (awayStats.timeSlots[game.startTime] || 0) + 1;
      awayStats.dayOfWeekGames[game.dayOfWeek] = (awayStats.dayOfWeekGames[game.dayOfWeek] || 0) + 1;
      
      if (game.dayOfWeek === 'Friday') awayStats.fridayGames++;
      if (game.dayOfWeek === 'Saturday') awayStats.saturdayGames++;
      if (game.isWeekend) awayStats.totalWeekend++;
      
      if (homeStats && awayStats.division === homeStats.division) {
        awayStats.opponentGames[game.homeTeam] = (awayStats.opponentGames[game.homeTeam] || 0) + 1;
      }
    }
  }
  
  // Calculate variance and flags per division
  const divisions: ('A' | 'B')[] = ['A', 'B'];
  
  for (const division of divisions) {
    const divisionTeams = teams.filter(t => t.division === division);
    
    // Calculate late slot variance
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
    
    // Calculate weekend variance
    const weekendCounts = divisionTeams.map(t => teamStatsMap.get(t.name)!.totalWeekend);
    const minWeekend = Math.min(...weekendCounts);
    
    for (const team of divisionTeams) {
      const stats = teamStatsMap.get(team.name)!;
      const variance = stats.totalWeekend - minWeekend;
      
      if (variance > settings.weekendVarianceFlag) {
        stats.weekendFlagged = true;
      }
    }
  }
  
  // Calculate division balance
  const divisionBalance: DivisionBalance[] = [];
  
  for (const division of divisions) {
    const divisionTeams = teams.filter(t => t.division === division);
    const divisionGames = schedule.filter(g => g.division === division);
    const gameDates = [...new Set(divisionGames.map(g => g.date))];
    
    const fridayDays = gameDates.filter(d => {
      const game = divisionGames.find(g => g.date === d);
      return game?.dayOfWeek === 'Friday';
    }).length;
    
    const saturdayDays = gameDates.filter(d => {
      const game = divisionGames.find(g => g.date === d);
      return game?.dayOfWeek === 'Saturday';
    }).length;
    
    const lateSlots = divisionGames.filter(g => g.isLate).length;
    
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
      totalLateSlots: lateSlots,
    });
  }
  
  return {
    teamStats: Array.from(teamStatsMap.values()),
    divisionBalance,
    allTimeSlots,
    lateTimeSlots,
  };
};
