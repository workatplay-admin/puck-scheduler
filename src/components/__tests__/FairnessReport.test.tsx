// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FairnessReportSection } from '../FairnessReport';
import { generateSchedule, calculateFairnessReport } from '@/scheduler';
import { DEFAULT_SETTINGS } from '@/types/scheduler';
import type { FairnessReport, IceSlot, Team } from '@/types/scheduler';

const TEAMS: Team[] = [
  { id: 'a0', name: 'Sharks', division: 'A' }, { id: 'a1', name: 'Jets', division: 'A' },
  { id: 'b0', name: 'Wolves', division: 'B' }, { id: 'b1', name: 'Bears', division: 'B' },
];

/** A short season whose weekday can be steered, so weekend gating is testable. */
const buildReport = (dayOfWeek: string): FairnessReport => {
  const slots: IceSlot[] = Array.from({ length: 8 }, (_, i) => ({
    id: `s${i}`,
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    startTime: i % 2 === 0 ? '16:30' : '21:00',
    dayOfWeek,
  }));
  const { schedule } = generateSchedule(slots, TEAMS, DEFAULT_SETTINGS, { seed: 3, saIterations: 50 });
  return calculateFairnessReport(schedule, slots, TEAMS, DEFAULT_SETTINGS);
};

const renderReport = (report: FairnessReport) =>
  render(
    <FairnessReportSection
      report={report}
      settings={DEFAULT_SETTINGS}
      onRecalculate={vi.fn()}
    />,
  );

describe('Section B — time of day', () => {
  it('shows band columns by default, not the full grid', () => {
    renderReport(buildReport('Monday'));
    expect(screen.getByText('Time of Day')).toBeInTheDocument();
    expect(screen.getByText('Afternoon')).toBeInTheDocument();
    expect(screen.getByText('Prime')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show all time slots/i })).toBeInTheDocument();
  });

  it('reveals the full grid behind the disclosure', async () => {
    const user = userEvent.setup();
    renderReport(buildReport('Monday'));
    expect(screen.queryByText('4:30 PM')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /show all time slots/i }));
    expect(screen.getAllByText('4:30 PM').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /hide all time slots/i })).toBeInTheDocument();
  });
});

describe('weekend gating', () => {
  it('hides the Friday & Saturday table when the season has no weekend ice', () => {
    const report = buildReport('Monday');
    expect(report.hasWeekendIce).toBe(false);
    renderReport(report);
    expect(screen.queryByText(/friday & saturday games/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Friday Game Days')).not.toBeInTheDocument();
  });

  it('shows it when the season does have weekend ice', () => {
    const report = buildReport('Friday');
    expect(report.hasWeekendIce).toBe(true);
    renderReport(report);
    expect(screen.getByText(/friday & saturday games/i)).toBeInTheDocument();
  });
});

describe('cross-division framing', () => {
  it('says the division comparison is not a fairness measure', async () => {
    const user = userEvent.setup();
    renderReport(buildReport('Monday'));
    // Section G is collapsed by default, so its content is not mounted until opened.
    await user.click(screen.getByText('Division Balance Summary'));
    expect(await screen.findByText(/never play across divisions/i)).toBeInTheDocument();
  });
});

describe('same-day column', () => {
  it('renders the column with no warning on a clean season', async () => {
    const user = userEvent.setup();
    const { container } = renderReport(buildReport('Monday'));
    await user.click(screen.getByText('Day-of-Week Distribution'));

    expect(await screen.findByText('2+ same day')).toBeInTheDocument();
    // A clean season must not show the warning badge anywhere in that table.
    expect(container.querySelectorAll('.badge-late')).toHaveLength(0);
  });
});

describe('vocabulary', () => {
  it('keeps internal terms off the screen', () => {
    const { container } = renderReport(buildReport('Monday'));
    expect(container.textContent).not.toMatch(/desirability/i);
    expect(container.textContent).not.toMatch(/\bband\b/i);
  });
});
