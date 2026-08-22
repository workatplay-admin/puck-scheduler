import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Calendar, Users, FileSpreadsheet, Download, Trash2 } from 'lucide-react';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useSchedulerStore } from '@/hooks/useSchedulerStore';
import { IceTimesTab } from '@/components/IceTimesTab';
import { TeamsTab } from '@/components/TeamsTab';
import { ScheduleTab } from '@/components/ScheduleTab';
import { ExportTab } from '@/components/ExportTab';
import { SettingsPanel } from '@/components/SettingsPanel';
import { generateExportCSV, downloadCSV } from '@/lib/csvExport';
import { Schedule, IceSlot, buildSlotsById, buildTeamsById } from '@/types/scheduler';
import type { WorkerMsg, WorkerInit } from '@/scheduler/workerTypes';
import SchedulerWorker from '@/scheduler/worker?worker';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const SA_TOTAL_ITERS = 50_000;

interface GenError {
  code: 'invariant_failed' | 'unhandled_exception';
  message: string;
  lastBestSchedule?: Schedule;
  unusedSlots?: IceSlot[];
}

const TABS = [
  { id: 0, label: 'Ice Times', icon: FileSpreadsheet },
  { id: 1, label: 'Teams', icon: Users },
  { id: 2, label: 'Schedule', icon: Calendar },
  { id: 3, label: 'Export', icon: Download },
];

const Index = () => {
  const store = useSchedulerStore();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState<{ pct: number; bestScore: number } | null>(null);
  const [genError, setGenError] = useState<GenError | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const slotsById = useMemo(() => buildSlotsById(store.iceSlots), [store.iceSlots]);
  const teamsById = useMemo(() => buildTeamsById(store.teams), [store.teams]);

  useEffect(() => {
    return () => { workerRef.current?.terminate(); };
  }, []);

  const handleGenerateSchedule = useCallback((seed?: number) => {
    // Defensive: React onClick handlers pass an event as the first arg. If a
    // caller mistakenly wires `onClick={handleGenerateSchedule}` instead of
    // `onClick={() => handleGenerateSchedule()}`, that event lands in `seed`
    // and PointerEvents fail structured-clone in postMessage. Drop anything
    // that isn't a finite number.
    const safeSeed = typeof seed === 'number' && Number.isFinite(seed) ? seed : undefined;

    workerRef.current?.terminate();

    setIsGenerating(true);
    setGenProgress(null);
    setGenError(null);

    let worker: Worker;
    try {
      worker = new SchedulerWorker() as Worker;
    } catch (err) {
      console.error('Worker constructor threw:', err);
      setGenError({
        code: 'unhandled_exception',
        message: err instanceof Error ? err.message : 'Could not start schedule worker.',
      });
      setIsGenerating(false);
      return;
    }
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<WorkerMsg>) => {
      const msg = e.data;

      if (msg.type === 'progress') {
        setGenProgress({
          pct: Math.min(100, Math.round((msg.iteration / SA_TOTAL_ITERS) * 100)),
          bestScore: msg.bestScore,
        });
      } else if (msg.type === 'done') {
        store.setSchedule(msg.schedule, msg.unusedSlots);
        store.setCurrentTab(2);
        toast.success(`Schedule generated with ${msg.schedule.games.length} games!`);
        if (msg.schedule.feasibilityWarning) {
          toast.warning(msg.schedule.feasibilityWarning, { duration: 10_000 });
        }
        setIsGenerating(false);
        setGenProgress(null);
        workerRef.current = null;
      } else {
        setGenError({ code: msg.code, message: msg.message, lastBestSchedule: msg.lastBestSchedule, unusedSlots: msg.unusedSlots });
        setIsGenerating(false);
        setGenProgress(null);
        workerRef.current = null;
      }
    };

    worker.onerror = (e) => {
      console.error('Worker error:', e.message, e.filename, e.lineno, e.error);
      setGenError({ code: 'unhandled_exception', message: e.message || 'Schedule generation failed.' });
      setIsGenerating(false);
      setGenProgress(null);
      workerRef.current = null;
    };
    worker.onmessageerror = (e) => {
      console.error('Worker messageerror:', e);
    };

    const init: WorkerInit = { slots: store.iceSlots, teams: store.teams, settings: store.settings, seed: safeSeed };
    try {
      worker.postMessage(init);
    } catch (err) {
      console.error('Worker postMessage threw:', err);
      worker.terminate();
      workerRef.current = null;
      setGenError({
        code: 'unhandled_exception',
        message: err instanceof Error ? err.message : 'Could not send data to worker.',
      });
      setIsGenerating(false);
      setGenProgress(null);
    }
  }, [store]);

  const handleUseScheduleAnyway = useCallback(() => {
    if (genError?.lastBestSchedule) {
      store.setSchedule(genError.lastBestSchedule, genError.unusedSlots ?? []);
      store.setCurrentTab(2);
      toast.warning('Schedule has balance issues — review the fairness report before exporting.');
    }
    setGenError(null);
  }, [genError, store]);

  const handleRecalculateReport = useCallback(() => {
    store.recalculateFairnessReport();
    toast.success('Fairness report recalculated');
  }, [store]);

  const handleExport = useCallback(() => {
    if (!store.schedule || !store.fairnessReport) return;
    const csv = generateExportCSV(store.schedule, store.fairnessReport, slotsById, teamsById);
    const filename = `hockey_schedule_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(csv, filename);
    toast.success('Schedule exported successfully!');
  }, [store.schedule, store.fairnessReport, slotsById, teamsById]);

  const handleClearAll = useCallback(() => {
    store.clearAll();
    setShowClearConfirm(false);
    toast.success('All data cleared');
  }, [store]);

  const canAccessTeams = store.iceSlots.length > 0;
  const canAccessSchedule = store.schedule !== null && store.schedule.games.length > 0;
  const canAccessExport = store.schedule !== null && store.schedule.games.length > 0;

  const getTabState = (tabId: number) => {
    if (tabId === 0) return 'available';
    if (tabId === 1) return canAccessTeams ? 'available' : 'locked';
    if (tabId === 2) return canAccessSchedule ? 'available' : 'locked';
    if (tabId === 3) return canAccessExport ? 'available' : 'locked';
    return 'locked';
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-gradient-header text-primary-foreground sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
                <Calendar className="w-6 h-6 text-accent" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Beer League Hockey Scheduler</h1>
                <p className="text-xs text-primary-foreground/70">Fair scheduling made easy</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowClearConfirm(true)}
                className="text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Start New
              </Button>
              <SettingsPanel settings={store.settings} onUpdateSettings={store.updateSettings} />
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="bg-card border-b sticky top-[72px] z-40">
        <div className="container mx-auto px-4">
          <div className="flex gap-1 py-2">
            {TABS.map((tab) => {
              const state = getTabState(tab.id);
              const Icon = tab.icon;
              const isActive = store.currentTab === tab.id;
              const isLocked = state === 'locked';

              return (
                <button
                  key={tab.id}
                  onClick={() => !isLocked && store.setCurrentTab(tab.id)}
                  disabled={isLocked}
                  className={`
                    flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all
                    ${isActive
                      ? 'bg-accent text-accent-foreground shadow-sm'
                      : isLocked
                        ? 'text-muted-foreground/50 cursor-not-allowed'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }
                  `}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.id + 1}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 max-w-5xl">
        {store.currentTab === 0 && (
          <IceTimesTab
            iceSlots={store.iceSlots}
            settings={store.settings}
            teams={store.teams}
            onSlotsChange={store.setIceSlots}
            onNext={() => store.setCurrentTab(1)}
          />
        )}

        {store.currentTab === 1 && (
          <TeamsTab
            teams={store.teams}
            iceSlots={store.iceSlots}
            settings={store.settings}
            scheduleExists={canAccessSchedule}
            onAddTeam={store.addTeam}
            onRemoveTeam={store.removeTeam}
            onRenameTeam={store.renameTeam}
            onClearSchedule={store.clearSchedule}
            onBack={() => store.setCurrentTab(0)}
            onGenerate={handleGenerateSchedule}
          />
        )}

        {store.currentTab === 2 && store.schedule && (
          <ScheduleTab
            schedule={store.schedule}
            slotsById={slotsById}
            teamsById={teamsById}
            teams={store.teams}
            unusedSlots={store.unusedSlots}
            settings={store.settings}
            fairnessReport={store.fairnessReport}
            fairnessReportUpdated={store.fairnessReportUpdated}
            onRegenerate={handleGenerateSchedule}
            onReproduce={() => handleGenerateSchedule(store.schedule?.seed)}
            onSwapGames={store.swapGames}
            onRemoveGame={store.removeGame}
            onReassignSlot={store.reassignSlot}
            onRecalculateReport={handleRecalculateReport}
            onDismissUpdated={store.clearFairnessReportUpdated}
            onBack={() => store.setCurrentTab(1)}
            onExport={() => store.setCurrentTab(3)}
          />
        )}

        {store.currentTab === 3 && store.schedule && (
          <ExportTab
            schedule={store.schedule}
            slotsById={slotsById}
            fairnessReport={store.fairnessReport}
            onExport={handleExport}
            onBack={() => store.setCurrentTab(2)}
          />
        )}

        {/* Generation Overlay — progress or error */}
        {(isGenerating || genError) && (
          <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-50">
            <div className="bg-card border rounded-xl p-8 shadow-lg w-full max-w-sm text-center space-y-4">
              {isGenerating && (
                <>
                  <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-lg font-medium">Generating schedule...</p>
                  {genProgress ? (
                    <>
                      <Progress value={genProgress.pct} className="h-2" />
                      <p className="text-sm text-muted-foreground">
                        {genProgress.pct}% · best score {genProgress.bestScore.toLocaleString()}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Optimizing for fairness</p>
                  )}
                </>
              )}
              {genError && (
                <>
                  <p className="text-lg font-medium text-destructive">
                    {genError.code === 'invariant_failed' ? 'Schedule balance warning' : 'Generation failed'}
                  </p>
                  <p className="text-sm text-muted-foreground">{genError.message}</p>
                  <div className="flex flex-col gap-2">
                    {genError.code === 'invariant_failed' && genError.lastBestSchedule && (
                      <Button onClick={handleUseScheduleAnyway}>Use this schedule anyway</Button>
                    )}
                    {genError.code === 'unhandled_exception' && (
                      <Button onClick={() => { setGenError(null); handleGenerateSchedule(); }}>Retry</Button>
                    )}
                    <Button variant="outline" onClick={() => setGenError(null)}>Cancel</Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t mt-auto py-4">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>Your schedule is saved locally in this browser. Export to CSV for a permanent copy.</p>
        </div>
      </footer>

      {/* Clear Confirmation Dialog */}
      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start New Season?</AlertDialogTitle>
            <AlertDialogDescription>
              This will clear all ice times, teams, and the current schedule.
              Make sure to export your current schedule first if you need it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearAll}>
              Clear All Data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Toaster position="bottom-right" />
    </div>
  );
};

export default Index;
