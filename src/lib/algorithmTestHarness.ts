import { IceSlot, Team, Game, SchedulerSettings, DEFAULT_SETTINGS } from '@/types/scheduler';
import { generateSchedule, calculateFairnessReport } from './scheduleGenerator';

export interface TestResult {
  runNumber: number;
  scheduleSize: number;
  fairnessScore: number;
  lateSlotMaxVariance: number;
  weekendMaxVariance: number;
  generationTime: number;
  flaggedTeams: number;
}

export interface TestSummary {
  runs: TestResult[];
  avgFairnessScore: number;
  avgLateSlotVariance: number;
  avgWeekendVariance: number;
  avgGenerationTime: number;
  bestRun: TestResult;
  worstRun: TestResult;
}

/**
 * Calculate a simple fairness score from the fairness report
 * Lower is better
 */
const calculateSimpleFairnessScore = (
  schedule: Game[],
  teams: Team[],
  settings: SchedulerSettings
): number => {
  const report = calculateFairnessReport(schedule, teams, settings);
  let score = 0;

  // Late slot variance penalty (weight: 1000)
  const lateSlotVariances = report.teamStats.map(stat => stat.worstVariance);
  const maxLateSlotVariance = Math.max(...lateSlotVariances, 0);
  score += maxLateSlotVariance * maxLateSlotVariance * 1000;

  // Weekend variance penalty (weight: 100)
  const weekendCounts = report.teamStats.map(stat => stat.totalWeekend);
  const maxWeekend = Math.max(...weekendCounts);
  const minWeekend = Math.min(...weekendCounts);
  const weekendVariance = maxWeekend - minWeekend;
  score += weekendVariance * weekendVariance * 100;

  return score;
};

/**
 * Get maximum late slot variance across all teams
 */
const getMaxLateSlotVariance = (
  schedule: Game[],
  teams: Team[],
  settings: SchedulerSettings
): number => {
  const report = calculateFairnessReport(schedule, teams, settings);
  const variances = report.teamStats.map(stat => stat.worstVariance);
  return Math.max(...variances, 0);
};

/**
 * Get maximum weekend variance across all teams
 */
const getMaxWeekendVariance = (
  schedule: Game[],
  teams: Team[],
  settings: SchedulerSettings
): number => {
  const report = calculateFairnessReport(schedule, teams, settings);
  const weekendCounts = report.teamStats.map(stat => stat.totalWeekend);
  const max = Math.max(...weekendCounts);
  const min = Math.min(...weekendCounts);
  return max - min;
};

/**
 * Count flagged teams in the fairness report
 */
const countFlaggedTeams = (
  schedule: Game[],
  teams: Team[],
  settings: SchedulerSettings
): number => {
  const report = calculateFairnessReport(schedule, teams, settings);
  return report.teamStats.filter(
    stat => stat.lateSlotFlagged || stat.weekendFlagged
  ).length;
};

/**
 * Run the algorithm multiple times with the same inputs and collect metrics
 */
export const runAlgorithmTest = (
  iceSlots: IceSlot[],
  teams: Team[],
  settings: SchedulerSettings = DEFAULT_SETTINGS,
  runs: number = 10
): TestSummary => {
  const results: TestResult[] = [];

  console.log(`Running algorithm test: ${runs} runs with ${iceSlots.length} ice slots and ${teams.length} teams`);

  for (let i = 0; i < runs; i++) {
    const startTime = performance.now();

    const { schedule } = generateSchedule(iceSlots, teams, settings);

    const endTime = performance.now();
    const generationTime = endTime - startTime;

    const fairnessScore = calculateSimpleFairnessScore(schedule, teams, settings);
    const lateSlotMaxVariance = getMaxLateSlotVariance(schedule, teams, settings);
    const weekendMaxVariance = getMaxWeekendVariance(schedule, teams, settings);
    const flaggedTeams = countFlaggedTeams(schedule, teams, settings);

    results.push({
      runNumber: i + 1,
      scheduleSize: schedule.length,
      fairnessScore,
      lateSlotMaxVariance,
      weekendMaxVariance,
      generationTime,
      flaggedTeams,
    });

    console.log(
      `Run ${i + 1}/${runs}: Score=${fairnessScore.toFixed(0)}, ` +
      `LateVar=${lateSlotMaxVariance}, WeekendVar=${weekendMaxVariance}, ` +
      `Time=${generationTime.toFixed(0)}ms, Flagged=${flaggedTeams}`
    );
  }

  // Calculate summary statistics
  const avgFairnessScore = results.reduce((sum, r) => sum + r.fairnessScore, 0) / runs;
  const avgLateSlotVariance = results.reduce((sum, r) => sum + r.lateSlotMaxVariance, 0) / runs;
  const avgWeekendVariance = results.reduce((sum, r) => sum + r.weekendMaxVariance, 0) / runs;
  const avgGenerationTime = results.reduce((sum, r) => sum + r.generationTime, 0) / runs;

  const bestRun = results.reduce((best, current) =>
    current.fairnessScore < best.fairnessScore ? current : best
  );

  const worstRun = results.reduce((worst, current) =>
    current.fairnessScore > worst.fairnessScore ? current : worst
  );

  return {
    runs: results,
    avgFairnessScore,
    avgLateSlotVariance,
    avgWeekendVariance,
    avgGenerationTime,
    bestRun,
    worstRun,
  };
};

/**
 * Format test summary for display
 */
export const formatTestSummary = (summary: TestSummary): string => {
  return `
Algorithm Test Summary (${summary.runs.length} runs)
=============================================

Average Metrics:
  Fairness Score: ${summary.avgFairnessScore.toFixed(0)}
  Late Slot Variance: ${summary.avgLateSlotVariance.toFixed(2)}
  Weekend Variance: ${summary.avgWeekendVariance.toFixed(2)}
  Generation Time: ${summary.avgGenerationTime.toFixed(0)}ms

Best Run (#${summary.bestRun.runNumber}):
  Fairness Score: ${summary.bestRun.fairnessScore.toFixed(0)}
  Late Slot Variance: ${summary.bestRun.lateSlotMaxVariance}
  Weekend Variance: ${summary.bestRun.weekendMaxVariance}
  Flagged Teams: ${summary.bestRun.flaggedTeams}

Worst Run (#${summary.worstRun.runNumber}):
  Fairness Score: ${summary.worstRun.fairnessScore.toFixed(0)}
  Late Slot Variance: ${summary.worstRun.lateSlotMaxVariance}
  Weekend Variance: ${summary.worstRun.weekendMaxVariance}
  Flagged Teams: ${summary.worstRun.flaggedTeams}

Variance in Results:
  Score Range: ${(summary.worstRun.fairnessScore - summary.bestRun.fairnessScore).toFixed(0)}
  Consistency: ${summary.runs.every(r => Math.abs(r.fairnessScore - summary.avgFairnessScore) < summary.avgFairnessScore * 0.2) ? 'Good' : 'High variance'}
`;
};

/**
 * Generate sample test data for algorithm testing
 */
export const generateSampleTestData = (): { iceSlots: IceSlot[]; teams: Team[] } => {
  const iceSlots: IceSlot[] = [];
  const teams: Team[] = [];

  // Generate 150 dates with 2 slots each (300 total ice slots)
  const startDate = new Date('2025-01-15');
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  for (let i = 0; i < 150; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    const dayOfWeek = daysOfWeek[date.getDay()];
    const isWeekend = dayOfWeek === 'Friday' || dayOfWeek === 'Saturday';

    // Add two time slots per date
    iceSlots.push({
      id: `slot-${i * 2}-test`,
      date: dateStr,
      startTime: '18:00',
      dayOfWeek,
      isLate: false,
      isWeekend,
    });

    iceSlots.push({
      id: `slot-${i * 2 + 1}-test`,
      date: dateStr,
      startTime: '21:15',
      dayOfWeek,
      isLate: true,
      isWeekend,
    });
  }

  // Generate 8 teams per division (16 total)
  const divisionANames = ['Ice Hawks', 'Polar Bears', 'Frost Giants', 'Snow Wolves', 'Blizzards', 'Avalanche', 'Glaciers', 'Penguins'];
  const divisionBNames = ['Thunder', 'Lightning', 'Storm', 'Cyclones', 'Hurricanes', 'Tornadoes', 'Tempest', 'Squall'];

  divisionANames.forEach((name, i) => {
    teams.push({
      id: `team-a-${i}`,
      name,
      division: 'A',
    });
  });

  divisionBNames.forEach((name, i) => {
    teams.push({
      id: `team-b-${i}`,
      name,
      division: 'B',
    });
  });

  return { iceSlots, teams };
};
