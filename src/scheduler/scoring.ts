import { isDerivedLate, isDerivedWeekend } from '@/types/scheduler';
import type { IceSlot } from '@/types/scheduler';
import type { GameAssignment, ScoreFn } from './types';

const weekOf = (dateStr: string): number => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / (7 * 86400000));
};

const daysBetween = (a: string, b: string): number => {
  const parse = (s: string) => { const [y, mo, d] = s.split('-').map(Number); return Date.UTC(y, mo - 1, d); };
  return Math.abs(parse(b) - parse(a)) / 86400000;
};

/**
 * Global weighted-penalty scoring function for a candidate schedule (ADR §5.3.1).
 *
 * Penalties applied (lower = better, 0 = ideal):
 * - Total late-game count variance per team (per division), ×1000 — primary signal
 * - Max Late Surplus (per division), ×250 — aligns optimizer with the user-visible flag
 * - Per-individual-late-slot variance, ×100 — secondary, prevents concentration
 * - Weekend-game variance across teams, ×100
 * - Consecutive-week same-opponent pairings, ×50 each
 * - Rest-day violations (< 2 days between games), ×25 each
 * - `maxGamesPerWeek` excess games per team-week, ×10000 each
 *
 * Population alignment: all three late-slot terms are computed over scheduled
 * teams (teams in the division that appear in ≥1 assignment) — the same population
 * the report uses for its floor calculation. This keeps the optimizer's objective
 * and the report's flag condition pointed at the same quantity.
 */
export const score: ScoreFn = (assignments, slotsById, settings) => {
  let total = 0;

  const teamIds = [...new Set(assignments.flatMap(a => [a.homeTeamId, a.awayTeamId]))];

  const teamLateGames = new Map<string, Map<string, number>>();
  const teamWeekendGames = new Map<string, number>();
  const teamWeeklyGames = new Map<string, Map<number, number>>();
  const teamGameDates = new Map<string, string[]>();
  const teamOppByWeek = new Map<string, Map<number, string[]>>();

  for (const id of teamIds) {
    teamLateGames.set(id, new Map());
    teamWeekendGames.set(id, 0);
    teamWeeklyGames.set(id, new Map());
    teamGameDates.set(id, []);
    teamOppByWeek.set(id, new Map());
  }

  for (const a of assignments) {
    const slot = slotsById[a.slotId] as IceSlot | undefined;
    if (!slot) continue;
    const week = weekOf(slot.date);

    for (const [teamId, oppId] of [[a.homeTeamId, a.awayTeamId], [a.awayTeamId, a.homeTeamId]] as [string, string][]) {
      if (isDerivedLate(slot, settings.lateGameThreshold)) {
        const lm = teamLateGames.get(teamId)!;
        lm.set(slot.startTime, (lm.get(slot.startTime) ?? 0) + 1);
      }
      if (isDerivedWeekend(slot)) {
        teamWeekendGames.set(teamId, (teamWeekendGames.get(teamId) ?? 0) + 1);
      }
      const wm = teamWeeklyGames.get(teamId)!;
      wm.set(week, (wm.get(week) ?? 0) + 1);
      teamGameDates.get(teamId)!.push(slot.date);
      const owm = teamOppByWeek.get(teamId)!;
      const opps = owm.get(week) ?? [];
      opps.push(oppId);
      owm.set(week, opps);
    }
  }

  // Per-division variance penalties
  const divisions = [...new Set(assignments.map(a => a.division))] as ('A' | 'B')[];
  for (const div of divisions) {
    const divA = assignments.filter(a => a.division === div);
    const divTeamIds = [...new Set(divA.flatMap(a => [a.homeTeamId, a.awayTeamId]))];
    if (divTeamIds.length === 0) continue;

    const lateSlots = [...new Set(
      divA
        .map(a => slotsById[a.slotId] as IceSlot | undefined)
        .filter((s): s is IceSlot => !!s && isDerivedLate(s, settings.lateGameThreshold))
        .map(s => s.startTime)
    )];

    // Total late-game count variance per team ×1000 (primary fairness signal).
    const totalLateByTeam = divTeamIds.map(id => {
      const lm = teamLateGames.get(id);
      if (!lm) return 0;
      let sum = 0;
      for (const c of lm.values()) sum += c;
      return sum;
    });
    const lateMean = totalLateByTeam.reduce((s, c) => s + c, 0) / totalLateByTeam.length;
    const lateVar = totalLateByTeam.reduce((s, c) => s + (c - lateMean) ** 2, 0) / totalLateByTeam.length;
    total += lateVar * 1000;

    // Max Late Surplus ×250 — directly penalizes the worst single-team gap above the floor,
    // aligning the optimizer with the report's flag condition.
    const divFloor = Math.min(...totalLateByTeam);
    const maxSurplus = Math.max(...totalLateByTeam.map(c => c - divFloor));
    total += maxSurplus * 250;

    // Per-individual-late-slot variance ×100 (secondary — prevents concentration on the latest slot).
    for (const lateSlot of lateSlots) {
      const counts = divTeamIds.map(id => teamLateGames.get(id)?.get(lateSlot) ?? 0);
      const mean = counts.reduce((s, c) => s + c, 0) / counts.length;
      const variance = counts.reduce((s, c) => s + (c - mean) ** 2, 0) / counts.length;
      total += variance * 100;
    }

    // Weekend variance ×100
    const wCounts = divTeamIds.map(id => teamWeekendGames.get(id) ?? 0);
    const wMean = wCounts.reduce((s, c) => s + c, 0) / wCounts.length;
    const wVar = wCounts.reduce((s, c) => s + (c - wMean) ** 2, 0) / wCounts.length;
    total += wVar * 100;
  }

  // Consecutive-week same-opponent ×50
  for (const teamId of teamIds) {
    const owm = teamOppByWeek.get(teamId)!;
    const weeks = [...owm.keys()].sort((a, b) => a - b);
    for (let i = 1; i < weeks.length; i++) {
      if (weeks[i] !== weeks[i - 1] + 1) continue;
      const prev = owm.get(weeks[i - 1])!;
      for (const opp of owm.get(weeks[i])!) {
        if (prev.includes(opp)) total += 50;
      }
    }
  }

  // Rest-day violations ×25
  for (const teamId of teamIds) {
    const dates = [...teamGameDates.get(teamId)!].sort();
    for (let i = 1; i < dates.length; i++) {
      if (daysBetween(dates[i - 1], dates[i]) < 2) total += 25;
    }
  }

  // maxGamesPerWeek excess ×10000
  for (const teamId of teamIds) {
    for (const [, count] of teamWeeklyGames.get(teamId)!) {
      if (count > settings.maxGamesPerWeek) {
        total += (count - settings.maxGamesPerWeek) * 10000;
      }
    }
  }

  return total;
};
