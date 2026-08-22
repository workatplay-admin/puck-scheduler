import { useMemo, useState } from 'react';
import { Settings, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { SchedulerSettings, DEFAULT_SETTINGS, bandOf, schedulerSettingsSchema } from '@/types/scheduler';
import type { IceSlot } from '@/types/scheduler';
import { formatTime } from '@/lib/csvParser';
import { isDerivedWeekend } from '@/types/scheduler';

interface SettingsPanelProps {
  settings: SchedulerSettings;
  /** The loaded season, used to show what the current band boundaries actually select. */
  iceSlots?: IceSlot[];
  onUpdateSettings: (settings: Partial<SchedulerSettings>) => void;
}

export const SettingsPanel = ({ settings, iceSlots = [], onUpdateSettings }: SettingsPanelProps) => {
  const [primeError, setPrimeError] = useState<string | null>(null);
  const [lateError, setLateError] = useState<string | null>(null);

  const handleReset = () => {
    onUpdateSettings(DEFAULT_SETTINGS);
    setPrimeError(null);
    setLateError(null);
  };

  /**
   * Applies a change only if it leaves the settings valid, returning an error otherwise.
   *
   * Both time fields go through this. An empty `lateGameThreshold` — trivially produced by
   * clearing a `type="time"` input — makes `slot.startTime >= ''` true for every slot, so
   * every game is classified late and the afternoon and prime bands vanish. A threshold
   * earlier than `primeWindowStart` empties the prime band the same way.
   *
   * Errors are filtered to the field being edited: validation runs over the whole object,
   * so an unrelated invalid field would otherwise render its message under this control
   * and wedge it.
   */
  const applyIfValid = (key: keyof SchedulerSettings, value: string): string | null => {
    const result = schedulerSettingsSchema.safeParse({ ...settings, [key]: value });
    if (!result.success) {
      const own = result.error.issues.find(i => i.path[0] === key);
      return own?.message ?? result.error.issues[0]?.message ?? 'Invalid value';
    }
    onUpdateSettings({ [key]: value } as Partial<SchedulerSettings>);
    return null;
  };

  // What the current boundaries select from the loaded season. Doubles as the definition
  // of all three bands, so nothing needs explaining in prose.
  // Many seasons contain no Friday or Saturday ice at all, which makes the weekend flag a
  // control that cannot affect anything.
  const hasWeekendIce = useMemo(() => iceSlots.some(isDerivedWeekend), [iceSlots]);

  const bandCounts = useMemo(() => {
    const counts = { afternoon: 0, prime: 0, late: 0 };
    for (const slot of iceSlots) counts[bandOf(slot, settings)]++;
    return counts;
  }, [iceSlots, settings]);

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
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Affects the fairness report now
          </p>

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
                  aria-label="Late game threshold"
                  value={settings.lateGameThreshold}
                  onChange={(e) => setLateError(applyIfValid('lateGameThreshold', e.target.value))}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">
                  (default: 8:45 PM)
                </span>
              </div>
              {lateError && <p className="text-xs text-destructive mt-2">{lateError}</p>}
            </CardContent>
          </Card>

          {/* Late Slot Variance Flag */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Late Slot Variance Flag</CardTitle>
              <CardDescription className="text-xs">
                Flag a team if they play this many more late-slot games in total than the team with the fewest in their division
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

          {/* Weekend Variance Flag — hidden when the season has no Friday or Saturday
              ice, where it is a control that cannot affect anything. */}
          {hasWeekendIce && (
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
          )}

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

          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground pt-2">
            Affects the next schedule you generate
          </p>

          {/* Time of Day */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Time of Day</CardTitle>
              <CardDescription className="text-xs">
                When prime time starts. Earlier games count as afternoon; games from the
                late threshold onward count as late.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="prime-start" className="sr-only">Prime time starts</Label>
                <Input
                  id="prime-start"
                  type="time"
                  value={settings.primeWindowStart}
                  onChange={(e) => setPrimeError(applyIfValid('primeWindowStart', e.target.value))}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">(default: 5:45 PM)</span>
              </div>
              {primeError && <p className="text-xs text-destructive">{primeError}</p>}
              {iceSlots.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Your ice times: <strong>{bandCounts.afternoon}</strong> afternoon (before{' '}
                  {formatTime(settings.primeWindowStart)}) · <strong>{bandCounts.prime}</strong> prime ·{' '}
                  <strong>{bandCounts.late}</strong> late (from {formatTime(settings.lateGameThreshold)})
                </p>
              )}
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
            Changes are saved automatically. Settings in the first group re-flag the fairness
            report as soon as you recalculate it; those in the second apply the next time you
            generate a schedule.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
};
