import { useState } from 'react';
import { Clock, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { formatTime } from '@/lib/csvParser';
import type { FairnessReport } from '@/types/scheduler';

interface SectionBProps {
  report: FairnessReport;
  open: boolean;
  onToggle: () => void;
}

/**
 * Section B — how each team's games fall across the day.
 *
 * Defaults to three summary columns rather than the full ten-column matrix: the per-slot
 * grid is where the imbalance hides, since a team can look fine on every individual column
 * while collecting a disproportionate share of an entire part of the day. The full grid is
 * kept behind a disclosure for anyone who wants it.
 */
export const FairnessSectionB = ({ report, open, onToggle }: SectionBProps) => {
  const [showMatrix, setShowMatrix] = useState(false);
  // From the report, not from live settings: the counts below were computed against these
  // boundaries, so labelling them with anything else would misdescribe the numbers.
  const { primeWindowStart, lateGameThreshold } = report.bandBoundaries;

  return (
    <Collapsible open={open} onOpenChange={onToggle}>
      <Card>
        <CollapsibleTrigger className="w-full">
          <CardHeader className="pb-3 cursor-pointer hover:bg-muted/30 transition-colors">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-accent" />
                Time of Day
              </span>
              <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="data-table text-sm">
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>Div</th>
                    <th className="text-center">Afternoon<br /><span className="font-normal text-xs text-muted-foreground">before {formatTime(primeWindowStart)}</span></th>
                    <th className="text-center">Prime<br /><span className="font-normal text-xs text-muted-foreground">{formatTime(primeWindowStart)}–{formatTime(lateGameThreshold)}</span></th>
                    <th className="text-center">Late ⚠<br /><span className="font-normal text-xs text-muted-foreground">from {formatTime(lateGameThreshold)}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {report.teamStats.map(stat => (
                    <tr key={stat.teamName}>
                      <td>{stat.teamName}</td>
                      <td>
                        <span className={stat.division === 'A' ? 'badge-division-a' : 'badge-division-b'}>
                          {stat.division}
                        </span>
                      </td>
                      <td className="text-center font-mono tabular-nums">{stat.afternoonGames}</td>
                      <td className="text-center font-mono tabular-nums">{stat.primeGames}</td>
                      <td className="text-center font-mono tabular-nums text-warning">{stat.totalLateGames}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-muted-foreground mt-3">
              Late games are graded for fairness and flagged in the next section. Afternoon
              and prime are balanced as far as the ice allows.
            </p>

            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setShowMatrix(v => !v)}
            >
              {showMatrix ? 'Hide all time slots' : 'Show all time slots'}
            </Button>

            {showMatrix && (
              <div className="overflow-x-auto mt-3">
                <table className="data-table text-sm">
                  <thead>
                    <tr>
                      <th>Team</th>
                      <th>Div</th>
                      {report.allTimeSlots.map(slot => (
                        <th key={slot} className="text-center">
                          <span className={report.lateTimeSlots.includes(slot) ? 'text-warning' : ''}>
                            {formatTime(slot)}
                            {report.lateTimeSlots.includes(slot) && ' ⚠'}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.teamStats.map(stat => (
                      <tr key={stat.teamName}>
                        <td>{stat.teamName}</td>
                        <td>
                          <span className={stat.division === 'A' ? 'badge-division-a' : 'badge-division-b'}>
                            {stat.division}
                          </span>
                        </td>
                        {report.allTimeSlots.map(slot => (
                          <td key={slot} className="text-center font-mono tabular-nums">
                            {stat.timeSlots[slot] || 0}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};
