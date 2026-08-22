import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { assignDays } from '@/scheduler/dayAssignment';
import type { IceSlot, SchedulerSettings, Team } from '@/types/scheduler';

interface FeasibilityWarningProps {
  iceSlots: IceSlot[];
  teams: Team[];
  settings: SchedulerSettings;
}

/**
 * Advance notice that the current slot/team mix cannot give every division the same
 * games-per-team (ADR §5.1 step 4).
 *
 * Rendered on both the Ice Times and Teams tabs: the imbalance is usually caused by team
 * counts, which are edited on Teams, so warning only on Ice Times would tell the user
 * about a problem on a screen they have already left.
 *
 * Purely advisory — generation is never blocked, and the message says so.
 */
export const FeasibilityWarning = ({ iceSlots, teams, settings }: FeasibilityWarningProps) => {
  // TeamsTab re-renders on every keystroke of its controlled name input, and this is a
  // full day-assignment pass over the season.
  const feasibility = useMemo(
    () =>
      iceSlots.length === 0 || teams.length < 2
        ? null
        : assignDays(iceSlots, teams, settings, Math.random).feasibility,
    [iceSlots, teams, settings],
  );

  if (!feasibility || feasibility.ok || !feasibility.reason) return null;

  return (
    <Alert>
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription>
        <strong>Heads up:</strong> {feasibility.reason}
      </AlertDescription>
    </Alert>
  );
};
