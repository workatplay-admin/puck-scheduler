import { Settings, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { SchedulerSettings, DEFAULT_SETTINGS } from '@/types/scheduler';

interface SettingsPanelProps {
  settings: SchedulerSettings;
  onUpdateSettings: (settings: Partial<SchedulerSettings>) => void;
}

export const SettingsPanel = ({ settings, onUpdateSettings }: SettingsPanelProps) => {
  const handleReset = () => {
    onUpdateSettings(DEFAULT_SETTINGS);
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <Settings className="w-5 h-5" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Settings
          </SheetTitle>
          <SheetDescription>
            Configure fairness thresholds and scheduling parameters
          </SheetDescription>
        </SheetHeader>
        
        <div className="mt-6 space-y-6">
          {/* Late Game Threshold */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Late Game Threshold</CardTitle>
              <CardDescription className="text-xs">
                Games starting at or after this time are considered "late"
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  value={settings.lateGameThreshold}
                  onChange={(e) => onUpdateSettings({ lateGameThreshold: e.target.value })}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">
                  (default: 8:45 PM)
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Late Slot Variance Flag */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Late Slot Variance Flag</CardTitle>
              <CardDescription className="text-xs">
                Flag a team if they have this many more games than another team at any specific late time slot
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select
                value={settings.lateSlotVarianceFlag.toString()}
                onValueChange={(v) => onUpdateSettings({ lateSlotVarianceFlag: parseInt(v) })}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map(n => (
                    <SelectItem key={n} value={n.toString()}>+{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Weekend Variance Flag */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Weekend Variance Flag</CardTitle>
              <CardDescription className="text-xs">
                Flag a team if they have this many more Friday/Saturday games than another team
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select
                value={settings.weekendVarianceFlag.toString()}
                onValueChange={(v) => onUpdateSettings({ weekendVarianceFlag: parseInt(v) })}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                    <SelectItem key={n} value={n.toString()}>+{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Max Games Per Week */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Max Games Per Week</CardTitle>
              <CardDescription className="text-xs">
                Hard cap on games per team in any 7-day window
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select
                value={settings.maxGamesPerWeek.toString()}
                onValueChange={(v) => onUpdateSettings({ maxGamesPerWeek: parseInt(v) })}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2, 3, 4, 5].map(n => (
                    <SelectItem key={n} value={n.toString()}>{n} games</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Reset Button */}
          <div className="pt-4 border-t">
            <Button variant="outline" onClick={handleReset} className="w-full">
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset to Defaults
            </Button>
          </div>

          {/* Note */}
          <p className="text-xs text-muted-foreground">
            Changes are saved automatically. Threshold changes affect fairness report flagging immediately,
            but do not regenerate the schedule.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
};
