import { useState, useMemo } from 'react';
import { Calendar, Clock, RefreshCw, Filter, ArrowUpDown, Trash2, ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Game, Team, IceSlot, SchedulerSettings, FairnessReport } from '@/types/scheduler';
import { formatDate, formatTime } from '@/lib/csvParser';
import { FairnessReportSection } from './FairnessReport';
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

interface ScheduleTabProps {
  schedule: Game[];
  teams: Team[];
  unusedSlots: IceSlot[];
  settings: SchedulerSettings;
  fairnessReport: FairnessReport | null;
  onRegenerate: () => void;
  onSwapGames: (gameId1: string, gameId2: string) => void;
  onRemoveGame: (gameId: string) => void;
  onRecalculateReport: () => void;
  onBack: () => void;
  onExport: () => void;
}

type SortField = 'date' | 'time' | 'division' | 'homeTeam';

export const ScheduleTab = ({
  schedule,
  teams,
  unusedSlots,
  settings,
  fairnessReport,
  onRegenerate,
  onSwapGames,
  onRemoveGame,
  onRecalculateReport,
  onBack,
  onExport,
}: ScheduleTabProps) => {
  const [divisionFilter, setDivisionFilter] = useState<'all' | 'A' | 'B'>('all');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [dayFilter, setDayFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortAsc, setSortAsc] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState<string | null>(null);

  // Filter and sort games
  const filteredGames = useMemo(() => {
    let games = [...schedule];

    // Apply filters
    if (divisionFilter !== 'all') {
      games = games.filter(g => g.division === divisionFilter);
    }
    if (teamFilter !== 'all') {
      games = games.filter(g => g.homeTeam === teamFilter || g.awayTeam === teamFilter);
    }
    if (dayFilter !== 'all') {
      games = games.filter(g => g.dayOfWeek === dayFilter);
    }

    // Apply sort
    games.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'date':
          cmp = a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime);
          break;
        case 'time':
          cmp = a.startTime.localeCompare(b.startTime);
          break;
        case 'division':
          cmp = a.division.localeCompare(b.division);
          break;
        case 'homeTeam':
          cmp = a.homeTeam.localeCompare(b.homeTeam);
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return games;
  }, [schedule, divisionFilter, teamFilter, dayFilter, sortField, sortAsc]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const handleGameClick = (gameId: string) => {
    if (!editMode) return;
    
    if (selectedGame === null) {
      setSelectedGame(gameId);
    } else if (selectedGame === gameId) {
      setSelectedGame(null);
    } else {
      // Check if both games are from the same division
      const game1 = schedule.find(g => g.id === selectedGame);
      const game2 = schedule.find(g => g.id === gameId);
      
      if (game1 && game2 && game1.division === game2.division) {
        onSwapGames(selectedGame, gameId);
      }
      setSelectedGame(null);
    }
  };

  const uniqueDays = [...new Set(schedule.map(g => g.dayOfWeek))];
  const dateRange = schedule.length > 0
    ? `${formatDate(schedule[0].date)} - ${formatDate(schedule[schedule.length - 1].date)}`
    : '';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Summary Header */}
      <Card className="bg-gradient-ice border-accent/20">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold">Schedule Generated</h3>
              <p className="text-sm text-muted-foreground">
                {schedule.length} games • {dateRange}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant={editMode ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setEditMode(!editMode);
                  setSelectedGame(null);
                }}
              >
                {editMode ? 'Done Editing' : 'Edit Mode'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRegenerateConfirm(true)}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Regenerate
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit Mode Instructions */}
      {editMode && (
        <Card className="border-warning/30 bg-warning/5 animate-slide-up">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm">
              <strong>Edit Mode:</strong> Click a game to select it, then click another game from the same division to swap their time slots.
              Or click the trash icon to remove a game.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="w-40">
              <Select value={divisionFilter} onValueChange={(v) => setDivisionFilter(v as typeof divisionFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="Division" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Divisions</SelectItem>
                  <SelectItem value="A">Division A</SelectItem>
                  <SelectItem value="B">Division B</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-48">
              <Select value={teamFilter} onValueChange={setTeamFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Teams</SelectItem>
                  {teams.map(t => (
                    <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <Select value={dayFilter} onValueChange={setDayFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Day" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Days</SelectItem>
                  {uniqueDays.map(day => (
                    <SelectItem key={day} value={day}>{day}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Schedule Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-accent" />
            Schedule ({filteredGames.length} games)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="cursor-pointer" onClick={() => handleSort('date')}>
                    <span className="flex items-center gap-1">
                      Date
                      <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th>Day</th>
                  <th className="cursor-pointer" onClick={() => handleSort('time')}>
                    <span className="flex items-center gap-1">
                      Time
                      <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th className="cursor-pointer" onClick={() => handleSort('division')}>
                    <span className="flex items-center gap-1">
                      Div
                      <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th className="cursor-pointer" onClick={() => handleSort('homeTeam')}>
                    <span className="flex items-center gap-1">
                      Home
                      <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th>Away</th>
                  <th>Flags</th>
                  {editMode && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredGames.slice(0, 100).map((game) => (
                  <tr
                    key={game.id}
                    className={`${editMode ? 'cursor-pointer' : ''} ${selectedGame === game.id ? 'bg-accent/20' : ''}`}
                    onClick={() => handleGameClick(game.id)}
                  >
                    <td className="font-mono tabular-nums">{formatDate(game.date)}</td>
                    <td>{game.dayOfWeek.slice(0, 3)}</td>
                    <td className="font-mono tabular-nums">{formatTime(game.startTime)}</td>
                    <td>
                      <span className={game.division === 'A' ? 'badge-division-a' : 'badge-division-b'}>
                        {game.division}
                      </span>
                    </td>
                    <td className="font-medium">{game.homeTeam}</td>
                    <td>{game.awayTeam}</td>
                    <td>
                      <div className="flex gap-1">
                        {game.isLate && (
                          <span className="badge-late">
                            <Clock className="w-3 h-3" />
                          </span>
                        )}
                        {game.isWeekend && (
                          <span className="badge-weekend">Wknd</span>
                        )}
                      </div>
                    </td>
                    {editMode && (
                      <td>
                        <div className="flex gap-1">
                          {selectedGame && selectedGame !== game.id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                const game1 = schedule.find(g => g.id === selectedGame);
                                if (game1?.division === game.division) {
                                  onSwapGames(selectedGame, game.id);
                                  setSelectedGame(null);
                                }
                              }}
                            >
                              <ArrowLeftRight className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowRemoveConfirm(game.id);
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredGames.length > 100 && (
            <p className="text-sm text-muted-foreground mt-3 text-center">
              Showing first 100 of {filteredGames.length} games
            </p>
          )}
        </CardContent>
      </Card>

      {/* Unused Slots */}
      {unusedSlots.length > 0 && (
        <Card className="border-warning/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-warning">
              Unused Slots ({unusedSlots.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {unusedSlots.slice(0, 10).map(slot => (
                <Badge key={slot.id} variant="outline" className="text-xs">
                  {formatDate(slot.date)} @ {formatTime(slot.startTime)}
                </Badge>
              ))}
              {unusedSlots.length > 10 && (
                <Badge variant="outline" className="text-xs">
                  +{unusedSlots.length - 10} more
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Fairness Report */}
      {fairnessReport && (
        <FairnessReportSection
          report={fairnessReport}
          settings={settings}
          onRecalculate={onRecalculateReport}
        />
      )}

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onExport}>
          Export to CSV
        </Button>
      </div>

      {/* Regenerate Confirmation Dialog */}
      <AlertDialog open={showRegenerateConfirm} onOpenChange={setShowRegenerateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate Schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              This will discard all manual edits and generate a new schedule.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              onRegenerate();
              setShowRegenerateConfirm(false);
            }}>
              Regenerate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove Game Confirmation Dialog */}
      <AlertDialog open={!!showRemoveConfirm} onOpenChange={() => setShowRemoveConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Game?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the game and mark the ice slot as unused.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (showRemoveConfirm) {
                onRemoveGame(showRemoveConfirm);
                setShowRemoveConfirm(null);
              }
            }}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
