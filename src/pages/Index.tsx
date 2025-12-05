import { useState, useCallback, useMemo } from 'react';
import { Calendar, Users, FileSpreadsheet, Download, Trash2 } from 'lucide-react';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useSchedulerStore } from '@/hooks/useSchedulerStore';
import { IceTimesTab } from '@/components/IceTimesTab';
import { TeamsTab } from '@/components/TeamsTab';
import { ScheduleTab } from '@/components/ScheduleTab';
import { ExportTab } from '@/components/ExportTab';
import { SettingsPanel } from '@/components/SettingsPanel';
import { generateSchedule, calculateFairnessReport } from '@/lib/scheduleGenerator';
import { generateExportCSV, downloadCSV } from '@/lib/csvExport';
import { FairnessReport } from '@/types/scheduler';
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

const TABS = [
  { id: 0, label: 'Ice Times', icon: FileSpreadsheet },
  { id: 1, label: 'Teams', icon: Users },
  { id: 2, label: 'Schedule', icon: Calendar },
  { id: 3, label: 'Export', icon: Download },
];

const Index = () => {
  const store = useSchedulerStore();
  const [fairnessReport, setFairnessReport] = useState<FairnessReport | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateSchedule = useCallback(() => {
    // Validation: Check for minimum teams
    const divisionATeams = store.teams.filter(t => t.division === 'A');
    const divisionBTeams = store.teams.filter(t => t.division === 'B');

    if (divisionATeams.length < 2 && divisionBTeams.length < 2) {
      toast.error('Need at least 2 teams in one division to generate a schedule');
      return;
    }

    // Validation: Check for minimum ice slots
    const minGamesNeeded = Math.max(
      divisionATeams.length >= 2 ? divisionATeams.length * (divisionATeams.length - 1) : 0,
      divisionBTeams.length >= 2 ? divisionBTeams.length * (divisionBTeams.length - 1) : 0
    );

    if (store.iceSlots.length < minGamesNeeded) {
      toast.error(
        `Not enough ice slots. Need at least ${minGamesNeeded} slots for a basic round-robin schedule, but only have ${store.iceSlots.length} slots.`,
        { duration: 5000 }
      );
      return;
    }

    setIsGenerating(true);

    // Use setTimeout to allow UI to update
    setTimeout(() => {
      try {
        const { schedule, unusedSlots } = generateSchedule(
          store.iceSlots,
          store.teams,
          store.settings
        );

        store.setSchedule(schedule, unusedSlots);

        const report = calculateFairnessReport(schedule, store.teams, store.settings);
        setFairnessReport(report);

        store.setCurrentTab(2);
        toast.success(`Schedule generated with ${schedule.length} games!`);
      } catch (error) {
        toast.error('Failed to generate schedule. Please check your inputs.');
        console.error(error);
      } finally {
        setIsGenerating(false);
      }
    }, 100);
  }, [store]);

  const handleRecalculateReport = useCallback(() => {
    const report = calculateFairnessReport(store.schedule, store.teams, store.settings);
    setFairnessReport(report);
    toast.success('Fairness report recalculated');
  }, [store.schedule, store.teams, store.settings]);

  const handleExport = useCallback(() => {
    if (!fairnessReport) {
      const report = calculateFairnessReport(store.schedule, store.teams, store.settings);
      setFairnessReport(report);
    }
    
    const csv = generateExportCSV(store.schedule, fairnessReport || calculateFairnessReport(store.schedule, store.teams, store.settings));
    const filename = `hockey_schedule_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(csv, filename);
    toast.success('Schedule exported successfully!');
  }, [store.schedule, store.teams, store.settings, fairnessReport]);

  const handleClearAll = useCallback(() => {
    store.clearAll();
    setFairnessReport(null);
    setShowClearConfirm(false);
    toast.success('All data cleared');
  }, [store]);

  // Determine which tabs are accessible
  const canAccessTeams = store.iceSlots.length > 0;
  const canAccessSchedule = store.schedule.length > 0;
  const canAccessExport = store.schedule.length > 0;

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
            onSlotsChange={store.setIceSlots}
            onNext={() => store.setCurrentTab(1)}
          />
        )}
        
        {store.currentTab === 1 && (
          <TeamsTab
            teams={store.teams}
            onAddTeam={store.addTeam}
            onRemoveTeam={store.removeTeam}
            onBack={() => store.setCurrentTab(0)}
            onGenerate={handleGenerateSchedule}
          />
        )}
        
        {store.currentTab === 2 && (
          <ScheduleTab
            schedule={store.schedule}
            teams={store.teams}
            unusedSlots={store.unusedSlots}
            settings={store.settings}
            fairnessReport={fairnessReport}
            onRegenerate={handleGenerateSchedule}
            onSwapGames={store.swapGames}
            onRemoveGame={store.removeGame}
            onRecalculateReport={handleRecalculateReport}
            onBack={() => store.setCurrentTab(1)}
            onExport={() => store.setCurrentTab(3)}
          />
        )}
        
        {store.currentTab === 3 && (
          <ExportTab
            schedule={store.schedule}
            fairnessReport={fairnessReport}
            onExport={handleExport}
            onBack={() => store.setCurrentTab(2)}
          />
        )}

        {/* Loading Overlay */}
        {isGenerating && (
          <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-50">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-lg font-medium">Generating schedule...</p>
              <p className="text-sm text-muted-foreground">Optimizing for fairness</p>
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
