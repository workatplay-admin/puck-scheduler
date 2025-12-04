import { Game, FairnessReport } from '@/types/scheduler';
import { formatDate, formatTime } from './csvParser';

export const generateExportCSV = (schedule: Game[], report: FairnessReport): string => {
  const lines: string[] = [];
  
  // Section 1: Schedule
  lines.push('SCHEDULE');
  lines.push('Date,Day,Start Time,Division,Home Team,Away Team,Late Game,Weekend Game');
  
  for (const game of schedule) {
    lines.push([
      formatDate(game.date),
      game.dayOfWeek,
      formatTime(game.startTime),
      `Division ${game.division}`,
      game.homeTeam,
      game.awayTeam,
      game.isLate ? 'Yes' : 'No',
      game.isWeekend ? 'Yes' : 'No',
    ].join(','));
  }
  
  lines.push('');
  lines.push('');
  
  // Section 2: Games Per Team
  lines.push('GAMES PER TEAM');
  lines.push('Team,Division,Total Games');
  
  for (const stat of report.teamStats) {
    lines.push([stat.teamName, `Division ${stat.division}`, stat.totalGames].join(','));
  }
  
  lines.push('');
  lines.push('');
  
  // Section 3: Time Slot Distribution
  lines.push('TIME SLOT DISTRIBUTION');
  const timeSlotHeaders = ['Team', 'Division', ...report.allTimeSlots.map(t => {
    const isLate = report.lateTimeSlots.includes(t);
    return `${formatTime(t)}${isLate ? ' (LATE)' : ''}`;
  })];
  lines.push(timeSlotHeaders.join(','));
  
  for (const stat of report.teamStats) {
    const row = [
      stat.teamName,
      `Division ${stat.division}`,
      ...report.allTimeSlots.map(t => stat.timeSlots[t] || 0),
    ];
    lines.push(row.join(','));
  }
  
  lines.push('');
  lines.push('');
  
  // Section 4: Late Slot Fairness Summary
  lines.push('LATE SLOT FAIRNESS SUMMARY');
  lines.push('Team,Division,Worst Variance,Slot,Status');
  
  for (const stat of report.teamStats) {
    lines.push([
      stat.teamName,
      `Division ${stat.division}`,
      `+${stat.worstVariance}`,
      stat.worstVarianceSlot ? formatTime(stat.worstVarianceSlot) : 'N/A',
      stat.lateSlotFlagged ? 'FLAGGED' : 'OK',
    ].join(','));
  }
  
  lines.push('');
  lines.push('');
  
  // Section 5: Friday & Saturday Games
  lines.push('FRIDAY & SATURDAY GAMES');
  lines.push('Team,Division,Friday,Saturday,Total Weekend,Status');
  
  for (const stat of report.teamStats) {
    lines.push([
      stat.teamName,
      `Division ${stat.division}`,
      stat.fridayGames,
      stat.saturdayGames,
      stat.totalWeekend,
      stat.weekendFlagged ? 'FLAGGED' : 'OK',
    ].join(','));
  }
  
  lines.push('');
  lines.push('');
  
  // Section 6: Day-of-Week Distribution
  lines.push('DAY-OF-WEEK DISTRIBUTION');
  lines.push('Team,Division,Mon,Tue,Wed,Thu,Fri,Sat,Sun');
  
  for (const stat of report.teamStats) {
    lines.push([
      stat.teamName,
      `Division ${stat.division}`,
      stat.dayOfWeekGames['Monday'] || 0,
      stat.dayOfWeekGames['Tuesday'] || 0,
      stat.dayOfWeekGames['Wednesday'] || 0,
      stat.dayOfWeekGames['Thursday'] || 0,
      stat.dayOfWeekGames['Friday'] || 0,
      stat.dayOfWeekGames['Saturday'] || 0,
      stat.dayOfWeekGames['Sunday'] || 0,
    ].join(','));
  }
  
  lines.push('');
  lines.push('');
  
  // Section 7: Division Balance Summary
  lines.push('DIVISION BALANCE SUMMARY');
  lines.push('Metric,Division A,Division B');
  
  const divA = report.divisionBalance.find(d => d.division === 'A');
  const divB = report.divisionBalance.find(d => d.division === 'B');
  
  lines.push(['Teams', divA?.teamCount || 0, divB?.teamCount || 0].join(','));
  lines.push(['Total Games', divA?.totalGames || 0, divB?.totalGames || 0].join(','));
  lines.push(['Games Per Team', divA?.gamesPerTeam || 0, divB?.gamesPerTeam || 0].join(','));
  lines.push(['Friday Game Days', divA?.fridayGameDays || 0, divB?.fridayGameDays || 0].join(','));
  lines.push(['Saturday Game Days', divA?.saturdayGameDays || 0, divB?.saturdayGameDays || 0].join(','));
  lines.push(['Total Late Slots', divA?.totalLateSlots || 0, divB?.totalLateSlots || 0].join(','));
  
  return lines.join('\n');
};

export const downloadCSV = (content: string, filename: string): void => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
};
