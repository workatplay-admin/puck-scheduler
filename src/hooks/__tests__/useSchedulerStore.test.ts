// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSchedulerStore } from '../useSchedulerStore';
import { flushPending, cancelPending } from '@/lib/debouncedStorage';
import { generateSchedule } from '@/scheduler';
import { DEFAULT_SETTINGS } from '@/types/scheduler';
import type { IceSlot, Team } from '@/types/scheduler';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const SLOTS: IceSlot[] = Array.from({ length: 12 }, (_, i) => {
  const d = new Date('2026-01-05');
  d.setDate(d.getDate() + i * 2);
  const date = d.toISOString().split('T')[0];
  return { id: `s${i}`, date, startTime: '19:00', dayOfWeek: DAYS[d.getDay()] };
});

const TEAMS: Team[] = [
  { id: 't0', name: 'Sharks', division: 'A' },
  { id: 't1', name: 'Jets', division: 'A' },
  { id: 't2', name: 'Wolves', division: 'B' },
  { id: 't3', name: 'Bears', division: 'B' },
];

const makeSchedule = () =>
  generateSchedule(SLOTS, TEAMS, DEFAULT_SETTINGS, { seed: 11, saIterations: 50 });

/** Renders the store pre-loaded with slots, teams and a generated schedule. */
const renderLoaded = () => {
  const hook = renderHook(() => useSchedulerStore());
  const { schedule, unusedSlots } = makeSchedule();
  act(() => {
    hook.result.current.setIceSlots(SLOTS);
  });
  act(() => {
    TEAMS.forEach(t => hook.result.current.addTeam(t));
  });
  act(() => {
    hook.result.current.setSchedule(schedule, unusedSlots);
  });
  return hook;
};

beforeEach(() => {
  // Also drop any debounced write armed by a previous test's mount: those 200 ms timers
  // outlive the test that created them and would otherwise repopulate storage mid-test as
  // soon as anything in this file awaits.
  cancelPending();
  localStorage.clear();
});

describe('clearSchedule', () => {
  it('preserves ice slots, teams and settings', () => {
    const { result } = renderLoaded();
    expect(result.current.schedule).not.toBeNull();

    act(() => result.current.clearSchedule());

    expect(result.current.schedule).toBeNull();
    expect(result.current.fairnessReport).toBeNull();
    expect(result.current.unusedSlots).toEqual([]);
    expect(result.current.iceSlots).toHaveLength(SLOTS.length);
    expect(result.current.teams).toHaveLength(TEAMS.length);
    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('leaves slot and team storage intact while removing the schedule', () => {
    const { result } = renderLoaded();
    act(() => result.current.clearSchedule());
    flushPending();

    expect(localStorage.getItem('hockey_schedule')).toBeNull();
    expect(localStorage.getItem('hockey_unused_slots')).toBeNull();
    expect(JSON.parse(localStorage.getItem('hockey_slots')!)).toHaveLength(SLOTS.length);
    expect(JSON.parse(localStorage.getItem('hockey_teams')!)).toHaveLength(TEAMS.length);
  });
});

describe('renameTeam', () => {
  it('renames and re-keys the fairness report', () => {
    const { result } = renderLoaded();
    const before = result.current.fairnessReport!.teamStats.find(s => s.teamName === 'Sharks')!;

    act(() => result.current.renameTeam('t0', 'Ice Hawks'));

    const stats = result.current.fairnessReport!.teamStats;
    expect(stats.find(s => s.teamName === 'Ice Hawks')?.totalGames).toBe(before.totalGames);
    expect(stats.find(s => s.teamName === 'Sharks')).toBeUndefined();
    expect(result.current.fairnessReportUpdated).toBe(true);
  });

  it('rejects a name already taken, ignoring case', () => {
    const { result } = renderLoaded();
    act(() => result.current.renameTeam('t0', 'jets'));
    expect(result.current.teams.find(t => t.id === 't0')!.name).toBe('Sharks');
  });

  it('ignores a blank name', () => {
    const { result } = renderLoaded();
    act(() => result.current.renameTeam('t0', '   '));
    expect(result.current.teams.find(t => t.id === 't0')!.name).toBe('Sharks');
  });

  it('does not touch the schedule, which references team ids', () => {
    const { result } = renderLoaded();
    const games = JSON.stringify(result.current.schedule!.games);
    act(() => result.current.renameTeam('t0', 'Ice Hawks'));
    expect(JSON.stringify(result.current.schedule!.games)).toBe(games);
  });

  it('works with no schedule present', () => {
    const { result } = renderHook(() => useSchedulerStore());
    act(() => TEAMS.forEach(t => result.current.addTeam(t)));
    act(() => result.current.renameTeam('t0', 'Ice Hawks'));
    expect(result.current.teams.find(t => t.id === 't0')!.name).toBe('Ice Hawks');
  });
});

describe('unusedSlots persistence', () => {
  it('persists a slot freed by removing a game', () => {
    const { result } = renderLoaded();
    const gameId = result.current.schedule!.games[0].id;

    act(() => result.current.removeGame(gameId));
    flushPending();

    const stored = JSON.parse(localStorage.getItem('hockey_unused_slots')!);
    expect(stored).toHaveLength(1);
    expect(result.current.unusedSlots).toHaveLength(1);
  });

  it('restores unused slots on the next load', () => {
    const { schedule } = makeSchedule();
    localStorage.setItem('hockey_slots', JSON.stringify(SLOTS));
    localStorage.setItem('hockey_teams', JSON.stringify(TEAMS));
    localStorage.setItem('hockey_schedule', JSON.stringify(schedule));
    localStorage.setItem('hockey_unused_slots', JSON.stringify([SLOTS[0]]));

    const { result } = renderHook(() => useSchedulerStore());
    expect(result.current.unusedSlots).toHaveLength(1);
    expect(result.current.unusedSlots[0].id).toBe('s0');
  });

  it('prunes slots that no longer exist in the imported ice times', () => {
    const { schedule } = makeSchedule();
    localStorage.setItem('hockey_slots', JSON.stringify(SLOTS));
    localStorage.setItem('hockey_teams', JSON.stringify(TEAMS));
    localStorage.setItem('hockey_schedule', JSON.stringify(schedule));
    localStorage.setItem(
      'hockey_unused_slots',
      JSON.stringify([{ id: 'gone', date: '2026-01-05', startTime: '19:00', dayOfWeek: 'Monday' }]),
    );

    const { result } = renderHook(() => useSchedulerStore());
    expect(result.current.unusedSlots).toEqual([]);
  });

  it('drops unused slots when there is no schedule', () => {
    localStorage.setItem('hockey_slots', JSON.stringify(SLOTS));
    localStorage.setItem('hockey_unused_slots', JSON.stringify([SLOTS[0]]));

    const { result } = renderHook(() => useSchedulerStore());
    expect(result.current.unusedSlots).toEqual([]);
  });

  it('prunes unused slots when ice times are re-imported', () => {
    const { result } = renderLoaded();
    act(() => result.current.removeGame(result.current.schedule!.games[0].id));
    expect(result.current.unusedSlots).toHaveLength(1);

    // A fresh import with entirely new slot ids must not leave the freed slot offerable:
    // reassigning it would mint a game whose slotId does not exist, which both the report
    // and the CSV export skip silently.
    act(() => result.current.setIceSlots(SLOTS.map(s => ({ ...s, id: `new-${s.id}` }))));
    expect(result.current.unusedSlots).toEqual([]);
  });

  it('survives storage that parses to a non-array', () => {
    const { schedule } = makeSchedule();
    localStorage.setItem('hockey_slots', JSON.stringify(SLOTS));
    localStorage.setItem('hockey_teams', JSON.stringify(TEAMS));
    localStorage.setItem('hockey_schedule', JSON.stringify(schedule));
    // Valid JSON, wrong shape — `.filter` on this would throw inside useState and
    // white-screen the app on every reload with no way to clear the bad value.
    localStorage.setItem('hockey_unused_slots', '{"not":"an array"}');

    const { result } = renderHook(() => useSchedulerStore());
    expect(result.current.unusedSlots).toEqual([]);
  });

  it('falls back to an empty list on malformed storage', () => {
    localStorage.setItem('hockey_slots', JSON.stringify(SLOTS));
    localStorage.setItem('hockey_teams', JSON.stringify(TEAMS));
    localStorage.setItem('hockey_unused_slots', '{{{');

    expect(() => renderHook(() => useSchedulerStore())).not.toThrow();
  });

  it('clearAll removes the key', () => {
    const { result } = renderLoaded();
    act(() => result.current.removeGame(result.current.schedule!.games[0].id));
    flushPending();
    expect(localStorage.getItem('hockey_unused_slots')).not.toBeNull();

    act(() => result.current.clearAll());
    flushPending();
    expect(localStorage.getItem('hockey_unused_slots')).toBeNull();
  });
});
