import { describe, it, expect } from 'vitest';
import { generateSchedule, calculateFairnessReport } from '@/scheduler';
import { buildSlotsById } from '@/types/scheduler';
import type { IceSlot, Team, SchedulerSettings } from '@/types/scheduler';

const DEFAULT_SETTINGS: SchedulerSettings = {
  lateGameThreshold: '20:45',
  lateSlotVarianceFlag: 2,
  weekendVarianceFlag: 3,
  maxGamesPerWeek: 3,
};

// Reduced SA iterations keep unit tests fast; correctness (not quality) is the concern here.
const FAST_OPTS = { saIterations: 200 };

const buildSlots = (): IceSlot[] => [
  { id: 's1', date: '2026-01-09', startTime: '19:00', dayOfWeek: 'Friday' },
  { id: 's2', date: '2026-01-09', startTime: '20:45', dayOfWeek: 'Friday' },
  { id: 's3', date: '2026-01-16', startTime: '19:00', dayOfWeek: 'Friday' },
  { id: 's4', date: '2026-01-16', startTime: '20:45', dayOfWeek: 'Friday' },
  { id: 's5', date: '2026-01-23', startTime: '18:30', dayOfWeek: 'Friday' },
  { id: 's6', date: '2026-01-23', startTime: '20:45', dayOfWeek: 'Friday' },
  { id: 's7', date: '2026-01-30', startTime: '19:00', dayOfWeek: 'Friday' },
  { id: 's8', date: '2026-01-30', startTime: '20:45', dayOfWeek: 'Friday' },
  { id: 's9', date: '2026-02-06', startTime: '19:00', dayOfWeek: 'Friday' },
  { id: 's10', date: '2026-02-06', startTime: '20:00', dayOfWeek: 'Friday' },
  { id: 's11', date: '2026-02-13', startTime: '19:00', dayOfWeek: 'Friday' },
  { id: 's12', date: '2026-02-13', startTime: '21:00', dayOfWeek: 'Friday' },
  { id: 's13', date: '2026-02-20', startTime: '18:30', dayOfWeek: 'Friday' },
  { id: 's14', date: '2026-02-20', startTime: '20:45', dayOfWeek: 'Friday' },
  { id: 's15', date: '2026-02-27', startTime: '19:00', dayOfWeek: 'Friday' },
  { id: 's16', date: '2026-02-27', startTime: '20:45', dayOfWeek: 'Friday' },
];

const buildTeams = (): Team[] => [
  { id: 't1', name: 'Sharks', division: 'A' },
  { id: 't2', name: 'Jets', division: 'A' },
  { id: 't3', name: 'Wolves', division: 'A' },
  { id: 't4', name: 'Bears', division: 'A' },
  { id: 't5', name: 'Hawks', division: 'B' },
  { id: 't6', name: 'Rams', division: 'B' },
  { id: 't7', name: 'Lynx', division: 'B' },
  { id: 't8', name: 'Foxes', division: 'B' },
];

describe('generateSchedule — 4-team + 4-team, 16-slot fixture', () => {
  it('returns a schedule wrapper and unused slots', () => {
    const { schedule, unusedSlots } = generateSchedule(buildSlots(), buildTeams(), DEFAULT_SETTINGS, FAST_OPTS);
    expect(Array.isArray(schedule.games)).toBe(true);
    expect(Array.isArray(unusedSlots)).toBe(true);
  });

  it('total games + unused slots equals total input slots', () => {
    const slots = buildSlots();
    const { schedule, unusedSlots } = generateSchedule(slots, buildTeams(), DEFAULT_SETTINGS, FAST_OPTS);
    expect(schedule.games.length + unusedSlots.length).toBe(slots.length);
  });

  it('every game references a valid slot id', () => {
    const slots = buildSlots();
    const slotIds = new Set(slots.map(s => s.id));
    const { schedule } = generateSchedule(slots, buildTeams(), DEFAULT_SETTINGS, FAST_OPTS);
    schedule.games.forEach(g => expect(slotIds.has(g.slotId)).toBe(true));
  });

  it('each team plays at least one game', () => {
    const teams = buildTeams();
    const { schedule } = generateSchedule(buildSlots(), teams, DEFAULT_SETTINGS, FAST_OPTS);
    const playingIds = new Set([
      ...schedule.games.map(g => g.homeTeamId),
      ...schedule.games.map(g => g.awayTeamId),
    ]);
    teams.forEach(t => expect(playingIds.has(t.id)).toBe(true));
  });

  it('no game has the same home and away team', () => {
    const { schedule } = generateSchedule(buildSlots(), buildTeams(), DEFAULT_SETTINGS, FAST_OPTS);
    schedule.games.forEach(g => expect(g.homeTeamId).not.toBe(g.awayTeamId));
  });

  it('no two games share the same slotId', () => {
    const { schedule } = generateSchedule(buildSlots(), buildTeams(), DEFAULT_SETTINGS, FAST_OPTS);
    const slotIds = schedule.games.map(g => g.slotId);
    expect(new Set(slotIds).size).toBe(slotIds.length);
  });

  it('schedule is sorted by slot date then start time', () => {
    const slots = buildSlots();
    const slotsById = buildSlotsById(slots);
    const { schedule } = generateSchedule(slots, buildTeams(), DEFAULT_SETTINGS, FAST_OPTS);
    for (let i = 1; i < schedule.games.length; i++) {
      const prev = slotsById[schedule.games[i - 1].slotId];
      const curr = slotsById[schedule.games[i].slotId];
      const ordered =
        prev.date < curr.date ||
        (prev.date === curr.date && prev.startTime <= curr.startTime);
      expect(ordered).toBe(true);
    }
  });

  it('games only contain team ids from the correct division', () => {
    const teams = buildTeams();
    const divAIds = new Set(teams.filter(t => t.division === 'A').map(t => t.id));
    const divBIds = new Set(teams.filter(t => t.division === 'B').map(t => t.id));
    const { schedule } = generateSchedule(buildSlots(), teams, DEFAULT_SETTINGS, FAST_OPTS);
    schedule.games.forEach(g => {
      if (g.division === 'A') {
        expect(divAIds.has(g.homeTeamId)).toBe(true);
        expect(divAIds.has(g.awayTeamId)).toBe(true);
      } else {
        expect(divBIds.has(g.homeTeamId)).toBe(true);
        expect(divBIds.has(g.awayTeamId)).toBe(true);
      }
    });
  });
});

describe('calculateFairnessReport — snapshot shape', () => {
  it('returns teamStats for all teams', () => {
    const teams = buildTeams();
    const slots = buildSlots();
    const { schedule } = generateSchedule(slots, teams, DEFAULT_SETTINGS, FAST_OPTS);
    const report = calculateFairnessReport(schedule, slots, teams, DEFAULT_SETTINGS);
    expect(report.teamStats).toHaveLength(teams.length);
  });

  it('returns divisionBalance for both divisions', () => {
    const teams = buildTeams();
    const slots = buildSlots();
    const { schedule } = generateSchedule(slots, teams, DEFAULT_SETTINGS, FAST_OPTS);
    const report = calculateFairnessReport(schedule, slots, teams, DEFAULT_SETTINGS);
    const divs = report.divisionBalance.map(d => d.division).sort();
    expect(divs).toEqual(['A', 'B']);
  });

  it('allTimeSlots is a non-empty sorted array', () => {
    const teams = buildTeams();
    const slots = buildSlots();
    const { schedule } = generateSchedule(slots, teams, DEFAULT_SETTINGS, FAST_OPTS);
    const report = calculateFairnessReport(schedule, slots, teams, DEFAULT_SETTINGS);
    expect(report.allTimeSlots.length).toBeGreaterThan(0);
    const sorted = [...report.allTimeSlots].sort();
    expect(report.allTimeSlots).toEqual(sorted);
  });

  it('lateTimeSlots are all >= threshold', () => {
    const teams = buildTeams();
    const slots = buildSlots();
    const { schedule } = generateSchedule(slots, teams, DEFAULT_SETTINGS, FAST_OPTS);
    const report = calculateFairnessReport(schedule, slots, teams, DEFAULT_SETTINGS);
    report.lateTimeSlots.forEach(t =>
      expect(t >= DEFAULT_SETTINGS.lateGameThreshold).toBe(true)
    );
  });

  it('sum of team game counts equals schedule length * 2 (each game counted for both teams)', () => {
    const teams = buildTeams();
    const slots = buildSlots();
    const { schedule } = generateSchedule(slots, teams, DEFAULT_SETTINGS, FAST_OPTS);
    const report = calculateFairnessReport(schedule, slots, teams, DEFAULT_SETTINGS);
    const reportTotal = report.teamStats.reduce((sum, t) => sum + t.totalGames, 0);
    expect(reportTotal).toBe(schedule.games.length * 2);
  });
});
