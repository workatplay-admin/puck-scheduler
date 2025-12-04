import { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, Check, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { parseCSV, formatTime, formatDate } from '@/lib/csvParser';
import { IceSlot, SchedulerSettings } from '@/types/scheduler';

interface IceTimesTabProps {
  iceSlots: IceSlot[];
  settings: SchedulerSettings;
  onSlotsChange: (slots: IceSlot[]) => void;
  onNext: () => void;
}

export const IceTimesTab = ({ iceSlots, settings, onSlotsChange, onNext }: IceTimesTabProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const handleFile = useCallback(async (file: File) => {
    const text = await file.text();
    const { slots, errors: parseErrors } = parseCSV(text, settings.lateGameThreshold);
    
    setErrors(parseErrors);
    if (slots.length > 0) {
      onSlotsChange(slots);
    }
  }, [settings.lateGameThreshold, onSlotsChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      handleFile(file);
    } else {
      setErrors(['Please upload a CSV file']);
    }
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  const handleClear = () => {
    onSlotsChange([]);
    setErrors([]);
  };

  // Calculate stats
  const uniqueDates = [...new Set(iceSlots.map(s => s.date))];
  const lateSlots = iceSlots.filter(s => s.isLate).length;
  const weekendSlots = iceSlots.filter(s => s.isWeekend).length;
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
            Upload a CSV file with Date and Start Time columns
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
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
                <p className="font-medium text-foreground">Drop your file here or click to browse</p>
                <p className="text-sm mt-1">Accepts CSV files with Date and Start Time columns</p>
              </div>
            </div>
          </div>

          {/* Expected Format */}
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <p className="text-sm font-medium mb-2">Expected CSV Format:</p>
            <code className="text-xs font-mono bg-background p-2 rounded block">
              Date,Start Time<br/>
              2025-01-15,17:00<br/>
              2025-01-15,21:00<br/>
              2025-01-17,18:45
            </code>
          </div>
        </CardContent>
      </Card>

      {/* Errors */}
      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <ul className="list-disc list-inside">
              {errors.slice(0, 5).map((err, i) => (
                <li key={i}>{err}</li>
              ))}
              {errors.length > 5 && <li>...and {errors.length - 5} more errors</li>}
            </ul>
          </AlertDescription>
        </Alert>
      )}

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
                          {slot.isLate && (
                            <span className="badge-late">
                              <Clock className="w-3 h-3" />
                              Late
                            </span>
                          )}
                          {slot.isWeekend && (
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
