import { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, Check, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatTime, formatDate } from '@/lib/csvParser';
import { parseIceSlotsCSV } from '@/parsers/csvParser';
import { parseIceSlotsExcel } from '@/parsers/excelParser';
import { FeasibilityWarning } from '@/components/FeasibilityWarning';
import { IceSlot, SchedulerSettings, isDerivedLate, isDerivedWeekend } from '@/types/scheduler';
import type { Team } from '@/types/scheduler';

interface IceTimesTabProps {
  iceSlots: IceSlot[];
  settings: SchedulerSettings;
  teams?: Team[];
  onSlotsChange: (slots: IceSlot[]) => void;
  onNext: () => void;
}

export const IceTimesTab = ({ iceSlots, settings, teams = [], onSlotsChange, onNext }: IceTimesTabProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [wholeFileError, setWholeFileError] = useState<string | null>(null);
  const [rejectedRows, setRejectedRows] = useState<{ row: number; reason: string }[]>([]);
  const [showRejected, setShowRejected] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    setWholeFileError(null);
    setRejectedRows([]);
    setShowRejected(false);

    const ext = file.name.split('.').pop()?.toLowerCase();
    const result = ext === 'xlsx' || ext === 'xls'
      ? await parseIceSlotsExcel(file)
      : await parseIceSlotsCSV(file);

    if (result.wholeFileError) {
      setWholeFileError(result.wholeFileError);
      return;
    }

    setRejectedRows(result.rejected);
    if (result.valid.length > 0) {
      onSlotsChange(result.valid);
    }
  }, [onSlotsChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleClear = () => {
    onSlotsChange([]);
    setWholeFileError(null);
    setRejectedRows([]);
  };

  const uniqueDates = [...new Set(iceSlots.map(s => s.date))];
  const lateSlots = iceSlots.filter(s => isDerivedLate(s, settings.lateGameThreshold)).length;
  const weekendSlots = iceSlots.filter(s => isDerivedWeekend(s)).length;
  const dateRange = uniqueDates.length > 0
    ? `${formatDate(uniqueDates[0])} - ${formatDate(uniqueDates[uniqueDates.length - 1])}`
    : '';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Upload Section */}
      <Card className="card-interactive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-accent" />
            Upload Ice Times
          </CardTitle>
          <CardDescription>
            Upload a CSV or Excel file with Date and Start Time columns
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            aria-label="Upload CSV or Excel file"
            className={`upload-zone cursor-pointer ${isDragging ? 'upload-zone-active' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <input
              id="file-input"
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={handleFileInput}
            />
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Upload className="w-10 h-10" />
              <div className="text-center">
                <p className="font-medium text-foreground">Drop your CSV or Excel file here or click to browse</p>
                <p className="text-sm mt-1">Accepts CSV or Excel files with Date and Start Time columns</p>
              </div>
            </div>
          </div>

          {/* Expected Format */}
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <p className="text-sm font-medium mb-2">Expected Format (CSV or Excel):</p>
            <code className="text-xs font-mono bg-background p-2 rounded block">
              Date,Start Time<br/>
              2025-01-15,17:00<br/>
              2025-01-15,21:00<br/>
              2025-01-17,18:45
            </code>
          </div>
        </CardContent>
      </Card>

      {/* Whole-file error */}
      {wholeFileError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{wholeFileError}</AlertDescription>
        </Alert>
      )}

      {/* Per-row rejections expander */}
      {rejectedRows.length > 0 && !wholeFileError && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="flex items-center justify-between">
              <span>{rejectedRows.length} row{rejectedRows.length !== 1 ? 's' : ''} could not be imported.</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowRejected(v => !v)}
                className="h-6 px-2"
              >
                {showRejected ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {showRejected ? 'Hide' : 'View details'}
              </Button>
            </div>
            {showRejected && (
              <ul className="mt-2 list-disc list-inside text-sm space-y-1">
                {rejectedRows.map((r) => (
                  <li key={r.row}>Row {r.row}: {r.reason}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}

      <FeasibilityWarning iceSlots={iceSlots} teams={teams} settings={settings} />

      {/* Import Summary */}
      {iceSlots.length > 0 && (
        <Card className="animate-slide-up border-success/30 bg-success/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Check className="w-5 h-5 text-success" />
              Import Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center p-3 bg-background rounded-lg">
                <p className="text-2xl font-bold text-accent">{iceSlots.length}</p>
                <p className="text-sm text-muted-foreground">Ice Slots</p>
              </div>
              <div className="text-center p-3 bg-background rounded-lg">
                <p className="text-2xl font-bold text-accent">{uniqueDates.length}</p>
                <p className="text-sm text-muted-foreground">Unique Dates</p>
              </div>
              <div className="text-center p-3 bg-background rounded-lg">
                <p className="text-2xl font-bold text-warning">{lateSlots}</p>
                <p className="text-sm text-muted-foreground">Late Slots</p>
              </div>
              <div className="text-center p-3 bg-background rounded-lg">
                <p className="text-2xl font-bold text-purple-600">{weekendSlots}</p>
                <p className="text-sm text-muted-foreground">Weekend Slots</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              <strong>Date Range:</strong> {dateRange}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Preview Table */}
      {iceSlots.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Ice Slots Preview</CardTitle>
            <CardDescription>First 20 slots shown</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Day</th>
                    <th>Start Time</th>
                    <th>Indicators</th>
                  </tr>
                </thead>
                <tbody>
                  {iceSlots.slice(0, 20).map((slot) => (
                    <tr key={slot.id}>
                      <td className="font-mono tabular-nums">{formatDate(slot.date)}</td>
                      <td>{slot.dayOfWeek}</td>
                      <td className="font-mono tabular-nums">{formatTime(slot.startTime)}</td>
                      <td>
                        <div className="flex gap-2">
                          {isDerivedLate(slot, settings.lateGameThreshold) && (
                            <span className="badge-late">
                              <Clock className="w-3 h-3" />
                              Late
                            </span>
                          )}
                          {isDerivedWeekend(slot) && (
                            <span className="badge-weekend">Weekend</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {iceSlots.length > 20 && (
              <p className="text-sm text-muted-foreground mt-3 text-center">
                ...and {iceSlots.length - 20} more slots
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={handleClear} disabled={iceSlots.length === 0}>
          Clear
        </Button>
        <Button onClick={onNext} disabled={iceSlots.length === 0}>
          Next: Add Teams
        </Button>
      </div>
    </div>
  );
};
