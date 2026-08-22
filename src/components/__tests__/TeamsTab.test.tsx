// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TeamsTab } from '../TeamsTab';
import type { Team } from '@/types/scheduler';

const TEAMS: Team[] = [
  { id: 't0', name: 'Sharks', division: 'A' },
  { id: 't1', name: 'Jets', division: 'A' },
  { id: 't2', name: 'Wolves', division: 'B' },
  { id: 't3', name: 'Bears', division: 'B' },
];

const setup = (scheduleExists: boolean) => {
  const props = {
    teams: TEAMS,
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
