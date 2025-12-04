import { Download, FileCheck, AlertTriangle, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Game, FairnessReport } from '@/types/scheduler';
import { formatDate } from '@/lib/csvParser';

interface ExportTabProps {
  schedule: Game[];
  fairnessReport: FairnessReport | null;
  onExport: () => void;
  onBack: () => void;
}

export const ExportTab = ({ schedule, fairnessReport, onExport, onBack }: ExportTabProps) => {
  const divisionAGames = schedule.filter(g => g.division === 'A').length;
  const divisionBGames = schedule.filter(g => g.division === 'B').length;
  const dateRange = schedule.length > 0
    ? `${formatDate(schedule[0].date)} - ${formatDate(schedule[schedule.length - 1].date)}`
    : '';

  const flaggedTeams = fairnessReport?.teamStats.filter(t => t.lateSlotFlagged || t.weekendFlagged) || [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Summary */}
      <Card className="bg-gradient-ice border-accent/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-accent" />
            Schedule Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-background rounded-lg">
              <p className="text-3xl font-bold text-accent">{schedule.length}</p>
              <p className="text-sm text-muted-foreground">Total Games</p>
            </div>
            <div className="text-center p-4 bg-background rounded-lg">
              <p className="text-3xl font-bold text-primary">{divisionAGames}</p>
              <p className="text-sm text-muted-foreground">Division A</p>
            </div>
            <div className="text-center p-4 bg-background rounded-lg">
              <p className="text-3xl font-bold text-accent">{divisionBGames}</p>
              <p className="text-sm text-muted-foreground">Division B</p>
            </div>
            <div className="text-center p-4 bg-background rounded-lg">
              <p className="text-lg font-semibold text-foreground">{dateRange || 'N/A'}</p>
              <p className="text-sm text-muted-foreground">Date Range</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Warnings */}
      {flaggedTeams.length > 0 && (
        <Alert className="border-warning/30 bg-warning/5">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription>
            <strong className="text-warning">{flaggedTeams.length} team(s) flagged</strong> for fairness concerns.
            Review the schedule and consider manual adjustments before exporting.
          </AlertDescription>
        </Alert>
      )}

      {/* Export Contents */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-success" />
            Export Contents
          </CardTitle>
          <CardDescription>
            The CSV file will include all of the following:
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {[
              'Complete schedule with Date, Day, Start Time, Division, Home Team, Away Team',
              'Games Per Team summary',
              'Time Slot Distribution (all time slots)',
              'Late Slot Fairness Summary with flags',
              'Friday & Saturday Games count',
              'Day-of-Week Distribution',
              'Division Balance Summary',
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-success/20 text-success flex items-center justify-center text-xs font-semibold">
                  ✓
                </span>
                <span className="text-sm">{item}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Local Storage Warning */}
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Your schedule is saved locally in this browser. Export to CSV for a permanent copy.
          Clearing browser data will erase the schedule.
        </AlertDescription>
      </Alert>

      {/* Export Button */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-4">
            <Button size="lg" onClick={onExport} className="w-full max-w-xs">
              <Download className="w-5 h-5 mr-2" />
              Download CSV
            </Button>
            <p className="text-xs text-muted-foreground">
              File will be named: hockey_schedule_{new Date().toISOString().split('T')[0]}.csv
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back to Schedule
        </Button>
      </div>
    </div>
  );
};
