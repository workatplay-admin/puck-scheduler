// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPanel } from '../SettingsPanel';
import { DEFAULT_SETTINGS } from '@/types/scheduler';
import type { IceSlot } from '@/types/scheduler';

const SLOTS: IceSlot[] = [
  { id: 's1', date: '2026-01-04', startTime: '15:15', dayOfWeek: 'Sunday' },
  { id: 's2', date: '2026-01-04', startTime: '19:00', dayOfWeek: 'Sunday' },
  { id: 's3', date: '2026-01-04', startTime: '21:30', dayOfWeek: 'Sunday' },
];

const open = async (iceSlots: IceSlot[] = SLOTS) => {
  const onUpdateSettings = vi.fn();
  const user = userEvent.setup();
  render(<SettingsPanel settings={DEFAULT_SETTINGS} iceSlots={iceSlots} onUpdateSettings={onUpdateSettings} />);
  await user.click(screen.getByRole('button'));
  return { onUpdateSettings, user };
};

describe('time-of-day settings', () => {
  it('shows what the current boundaries select from the loaded season', async () => {
    await open();
    // One slot in each band: 15:15 afternoon, 19:00 prime, 21:30 late.
    const summary = screen.getByText(/your ice times:/i);
    expect(summary.textContent).toMatch(/1\s*afternoon/);
    expect(summary.textContent).toMatch(/1\s*prime/);
    expect(summary.textContent).toMatch(/1\s*late/);
  });

  it('renders without a season loaded', async () => {
    await open([]);
    expect(screen.queryByText(/your ice times:/i)).not.toBeInTheDocument();
  });

  it('groups controls by when they take effect', async () => {
    await open();
    expect(screen.getByText(/affects the fairness report now/i)).toBeInTheDocument();
    expect(screen.getByText(/affects the next schedule you generate/i)).toBeInTheDocument();
  });

  it('keeps internal vocabulary off the screen', async () => {
    await open();
    const panel = screen.getByText('Time of Day').closest('div')!.parentElement!.parentElement!;
    expect(panel.textContent).not.toMatch(/desirability/i);
  });
});

describe('validation', () => {
  it('refuses a prime window at or after the late threshold', async () => {
    const { onUpdateSettings } = await open();
    const prime = screen.getByLabelText('Prime time starts');
    fireEvent.change(prime, { target: { value: '22:00' } });
    fireEvent.blur(prime);
    expect(onUpdateSettings).not.toHaveBeenCalledWith(expect.objectContaining({ primeWindowStart: '22:00' }));
    expect(screen.getByText(/must start before the late-game threshold/i)).toBeInTheDocument();
  });

  it('refuses a late threshold earlier than the prime window', async () => {
    // Would empty the prime band, the same state the prime-side check prevents.
    const { onUpdateSettings } = await open();
    const late = screen.getByLabelText('Late game threshold');
    fireEvent.change(late, { target: { value: '17:00' } });
    fireEvent.blur(late);
    expect(onUpdateSettings).not.toHaveBeenCalledWith(expect.objectContaining({ lateGameThreshold: '17:00' }));
  });

  it('never persists an empty late threshold', async () => {
    // An empty value makes `startTime >= ''` true for every slot, classifying the whole
    // season as late.
    const { onUpdateSettings } = await open();
    const late = screen.getByLabelText('Late game threshold');
    fireEvent.change(late, { target: { value: '' } });
    fireEvent.blur(late);
    expect(onUpdateSettings).not.toHaveBeenCalledWith(expect.objectContaining({ lateGameThreshold: '' }));
  });
});

describe('typing through invalid intermediates', () => {
  it('lets a value be typed digit by digit without snapping back', async () => {
    // Committing per keystroke made 21/22/23 untypable: with prime at 17:45, the
    // intermediate "02:45" is a valid time but earlier than prime, so it was rejected and
    // the controlled input rewrote the old value before the second digit arrived.
    const { onUpdateSettings } = await open();
    const late = screen.getByLabelText('Late game threshold');

    fireEvent.change(late, { target: { value: '02:45' } }); // intermediate
    expect(late).toHaveValue('02:45');                      // draft is not reverted
    expect(onUpdateSettings).not.toHaveBeenCalled();        // nor committed

    fireEvent.change(late, { target: { value: '22:00' } }); // final
    fireEvent.blur(late);
    expect(onUpdateSettings).toHaveBeenCalledWith({ lateGameThreshold: '22:00' });
  });

  it('reverts the draft when the committed value is rejected', async () => {
    await open();
    const late = screen.getByLabelText('Late game threshold');
    fireEvent.change(late, { target: { value: '02:45' } });
    fireEvent.blur(late);
    expect(late).toHaveValue(DEFAULT_SETTINGS.lateGameThreshold);
  });
});
