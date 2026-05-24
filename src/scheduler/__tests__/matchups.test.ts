import { describe, it, expect } from 'vitest';
import type { Team } from '@/types/scheduler';
import { mulberry32 } from '../rng';
import { buildMatchups } from '../matchups';

const makeTeams = (division: 'A' | 'B', n: number): Team[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${division.toLowerCase()}${i + 1}`,
    name: `${division}${i + 1}`,
    division,
  }));

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

const tallyPairs = (pairs: Array<{ homeTeamId: string; awayTeamId: string }>) => {
  const counts = new Map<string, number>();
  for (const p of pairs) {
    const k = pairKey(p.homeTeamId, p.awayTeamId);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
};

const tallyTeams = (
  pairs: Array<{ homeTeamId: string; awayTeamId: string }>,
  teams: Team[],
) => {
  const counts = new Map<string, number>(teams.map(t => [t.id, 0]));
  for (const p of pairs) {
    counts.set(p.homeTeamId, (counts.get(p.homeTeamId) ?? 0) + 1);
    counts.set(p.awayTeamId, (counts.get(p.awayTeamId) ?? 0) + 1);
  }
  return counts;
};

const spread = (m: Map<string, number>) => {
  const vals = [...m.values()];
  return Math.max(...vals) - Math.min(...vals);
};

describe('buildMatchups — pool balance by construction', () => {
  it('6 teams / 62 slots: per-pair spread ≤ 1 and per-team spread ≤ 1', () => {
    // Regression: reproduces the user-reported "Division A pairing imbalance"
    // from the 124-slot fixture (62 slots/division after assignDays). With the
    // old trim-based pool builder this produced pair spread 3.
    const teams = makeTeams('A', 6);
    const rng = mulberry32(42);
    const { A } = buildMatchups(
      { A: teams, B: [] },
      { A: 62, B: 0 },
      rng,
    );

    expect(A.length).toBe(62);
    expect(spread(tallyPairs(A))).toBeLessThanOrEqual(1);
    expect(spread(tallyTeams(A, teams))).toBeLessThanOrEqual(1);
  });

  it('produces exactly `slotsNeeded` matchups across a sweep of sizes', () => {
    const teams = makeTeams('A', 6);
    for (const slotsNeeded of [0, 1, 5, 14, 15, 16, 29, 30, 31, 60, 62, 90, 121, 200]) {
      const rng = mulberry32(slotsNeeded + 1);
      const { A } = buildMatchups(
        { A: teams, B: [] },
        { A: slotsNeeded, B: 0 },
        rng,
      );
      expect(A.length).toBe(slotsNeeded);
    }
  });

  it('keeps per-pair spread ≤ 1 across a sweep of team counts and slot counts', () => {
    const teamCounts = [3, 4, 5, 6, 7, 8];
    const slotCounts = [10, 20, 31, 50, 62, 100];
    for (const n of teamCounts) {
      const teams = makeTeams('A', n);
      for (const s of slotCounts) {
        const rng = mulberry32(n * 1000 + s);
        const { A } = buildMatchups(
          { A: teams, B: [] },
          { A: s, B: 0 },
          rng,
        );
        const pairS = spread(tallyPairs(A));
        expect(pairS, `n=${n} slots=${s} pair spread`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('keeps per-team spread ≤ 1 for fixtures where balance is achievable', () => {
    // For n teams and s slots, per-team spread ≤ 1 is achievable whenever the
    // bonus extras (s mod C(n,2)) can be distributed across distinct team
    // endpoints — which holds for all combinations exercised here.
    const cases: Array<[number, number]> = [
      [4, 12], [4, 20], [4, 31],
      [6, 30], [6, 31], [6, 60], [6, 62], [6, 90],
      [8, 56], [8, 100],
    ];
    for (const [n, s] of cases) {
      const teams = makeTeams('A', n);
      const rng = mulberry32(n * 17 + s);
      const { A } = buildMatchups(
        { A: teams, B: [] },
        { A: s, B: 0 },
        rng,
      );
      const teamS = spread(tallyTeams(A, teams));
      expect(teamS, `n=${n} slots=${s} team spread`).toBeLessThanOrEqual(1);
    }
  });

  it('every pair plays at least floor(s/P) games when s ≥ P', () => {
    const teams = makeTeams('A', 6);
    const slotsNeeded = 62;
    const P = 15; // C(6,2)
    const floor = Math.floor(slotsNeeded / P); // 4
    const rng = mulberry32(7);
    const { A } = buildMatchups(
      { A: teams, B: [] },
      { A: slotsNeeded, B: 0 },
      rng,
    );
    const counts = tallyPairs(A);
    expect(counts.size).toBe(P);
    for (const c of counts.values()) expect(c).toBeGreaterThanOrEqual(floor);
  });

  it('returns an empty pool when slotsNeeded is 0', () => {
    const teams = makeTeams('A', 6);
    const rng = mulberry32(1);
    const { A } = buildMatchups({ A: teams, B: [] }, { A: 0, B: 0 }, rng);
    expect(A).toEqual([]);
  });

  it('returns an empty pool when fewer than 2 teams', () => {
    const teams = makeTeams('A', 1);
    const rng = mulberry32(1);
    const { A } = buildMatchups({ A: teams, B: [] }, { A: 10, B: 0 }, rng);
    expect(A).toEqual([]);
  });

  it('reproduces an identical pool for the same seed', () => {
    const teams = makeTeams('A', 6);
    const a = buildMatchups({ A: teams, B: [] }, { A: 62, B: 0 }, mulberry32(99));
    const b = buildMatchups({ A: teams, B: [] }, { A: 62, B: 0 }, mulberry32(99));
    expect(a.A).toEqual(b.A);
  });
});
