// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TeamsTab } from '../TeamsTab';
import type { IceSlot, Team } from '@/types/scheduler';
import { DEFAULT_SETTINGS } from '@/types/scheduler';

const TEAMS: Team[] = [
  { id: 't0', name: 'Sharks', division: 'A' },
  { id: 't1', name: 'Jets', division: 'A' },
  { id: 't2', name: 'Wolves', division: 'B' },
  { id: 't3', name: 'Bears', division: 'B' },
];

/** A feasible 4-slot / 4-team season, so the feasibility banner stays quiet by default. */
const SLOTS: IceSlot[] = Array.from({ length: 4 }, (_, i) => ({
  id: `s${i}`,
  date: `2026-01-0${i + 1}`,
  startTime: '19:00',
  dayOfWeek: 'Monday',
}));

const setup = (scheduleExists: boolean, iceSlots: IceSlot[] = SLOTS) => {
  const props = {
    teams: TEAMS,
    iceSlots,
    settings: DEFAULT_SETTINGS,
    scheduleExists,
    onAddTeam: vi.fn(),
    onRemoveTeam: vi.fn(),
    onRenameTeam: vi.fn(),
    onClearSchedule: vi.fn(),
    onBack: vi.fn(),
    onGenerate: vi.fn(),
  };
  render(<TeamsTab {...props} />);
  return { ...props, user: userEvent.setup() };
};

describe('TeamsTab — unlocked', () => {
  it('allows adding and deleting', () => {
    setup(false);
    expect(screen.getByLabelText('Team Name')).toBeEnabled();
    expect(screen.getByRole('button', { name: /add team/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^delete /i })).toHaveLength(TEAMS.length);
    expect(screen.queryByRole('button', { name: /clear schedule & unlock/i })).not.toBeInTheDocument();
  });

  it('deletes on click', async () => {
    const { onRemoveTeam, user } = setup(false);
    await user.click(screen.getByRole('button', { name: 'Delete Sharks' }));
    expect(onRemoveTeam).toHaveBeenCalledWith('t0');
  });
});

describe('TeamsTab — locked by an existing schedule', () => {
  it('removes every delete affordance and the add form', () => {
    setup(true);
    expect(screen.queryByLabelText('Team Name')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add team/i })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /^delete /i })).toHaveLength(0);
  });

  it('shows the lock without needing hover, with an accessible name', () => {
    setup(true);
    const locks = screen.getAllByRole('button', { name: /locked while a schedule exists/i });
    expect(locks).toHaveLength(TEAMS.length);
    // Reachable by keyboard: it is a real button, not a hover-revealed icon.
    expect(locks[0]).toBeEnabled();
  });

  it('explains the lock in text', () => {
    setup(true);
    expect(screen.getByText(/teams are locked while a schedule exists/i)).toBeInTheDocument();
  });

  it('offers a non-destructive unlock that keeps ice times', async () => {
    const { onClearSchedule, user } = setup(true);
    await user.click(screen.getByRole('button', { name: /clear schedule & unlock teams/i }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/ice times, \s*teams and settings are kept/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /^clear schedule$/i }));
    expect(onClearSchedule).toHaveBeenCalledTimes(1);
  });

  it('cancelling the dialog changes nothing', async () => {
    const { onClearSchedule, user } = setup(true);
    await user.click(screen.getByRole('button', { name: /clear schedule & unlock teams/i }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));
    expect(onClearSchedule).not.toHaveBeenCalled();
  });

  it('a lock button also routes to the unlock dialog', async () => {
    const { user } = setup(true);
    await user.click(screen.getAllByRole('button', { name: /locked while a schedule exists/i })[0]);
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
  });
});

describe('TeamsTab — rename', () => {
  it('commits on Enter, with a schedule present', async () => {
    const { onRenameTeam, user } = setup(true);
    await user.click(screen.getByRole('button', { name: 'Rename Sharks' }));
    const input = screen.getByRole('textbox', { name: 'Rename Sharks' });
    await user.clear(input);
    await user.type(input, 'Ice Hawks{Enter}');
    expect(onRenameTeam).toHaveBeenCalledWith('t0', 'Ice Hawks');
  });

  it('cancels on Escape without committing', async () => {
    const { onRenameTeam, user } = setup(false);
    await user.click(screen.getByRole('button', { name: 'Rename Sharks' }));
    const input = screen.getByRole('textbox', { name: 'Rename Sharks' });
    await user.clear(input);
    await user.type(input, 'Ice Hawks{Escape}');
    expect(onRenameTeam).not.toHaveBeenCalled();
  });

  it('rejects a duplicate name and explains why', async () => {
    const { onRenameTeam, user } = setup(false);
    await user.click(screen.getByRole('button', { name: 'Rename Sharks' }));
    const input = screen.getByRole('textbox', { name: 'Rename Sharks' });
    await user.clear(input);
    await user.type(input, 'jets{Enter}');
    expect(onRenameTeam).not.toHaveBeenCalled();
    expect(screen.getByText(/already exists/i)).toBeInTheDocument();
  });
});

describe('TeamsTab — feasibility banner', () => {
  it('stays quiet when the slot/team mix is balanced', () => {
    setup(false);
    expect(screen.queryByText(/can't be used|doesn't split evenly/i)).not.toBeInTheDocument();
  });

  it('warns above Generate when the mix is lopsided', () => {
    // One 8-slot date against 2v2 teams: each division can host only one game per date,
    // so most of the ice is unplaceable and games-per-team falls outside the allowed band.
    const crowded: IceSlot[] = Array.from({ length: 8 }, (_, i) => ({
      id: `c${i}`,
      date: '2026-02-01',
      startTime: `${13 + i}:00`,
      dayOfWeek: 'Sunday',
    }));
    setup(false, crowded);
    expect(screen.getByText(/can't be used/i)).toBeInTheDocument();
    // Advisory only: generation stays available.
    expect(screen.getByRole('button', { name: /generate schedule/i })).toBeEnabled();
  });
});
