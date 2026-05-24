import { useState, useMemo } from 'react';
import { Calendar, Clock, RefreshCw, RotateCcw, Filter, ArrowUpDown, ArrowUp, ArrowDown, Trash2, ArrowLeftRight, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Schedule, Team, IceSlot, SchedulerSettings, FairnessReport,
  isDerivedLate, isDerivedWeekend,
} from '@/types/scheduler';
import { formatDate, formatTime } from '@/lib/csvParser';
import { FairnessReportSection } from './FairnessReport';
import { ScheduleTabDialogs } from './ScheduleTabDialogs';
import { UnusedSlotsSection } from './UnusedSlotsSection';

interface ScheduleTabProps {
  schedule: Schedule;
  slotsById: Record<string, IceSlot>;
  teamsById: Record<string, Team>;
  teams: Team[];
  unusedSlots: IceSlot[];
  settings: SchedulerSettings;
  fairnessReport: FairnessReport | null;
  onRegenerate: () => void;
  onReproduce: () => void;
  onSwapGames: (gameId1: string, gameId2: string) => void;
  onRemoveGame: (gameId: string) => void;
  onReassignSlot: (slotId: string, homeTeamId: string, awayTeamId: string, division: 'A' | 'B') => void;
  onRecalculateReport: () => void;
  onDismissUpdated: () => void;
  fairnessReportUpdated: boolean;
  onBack: () => void;
  onExport: () => void;
}

type SortField = 'date' | 'time' | 'division' | 'homeTeam';

export const ScheduleTab = ({
  schedule,
  slotsById,
  teamsById,
  teams,
  unusedSlots,
  settings,
  fairnessReport,
  onRegenerate,
  onReproduce,
  onSwapGames,
  onRemoveGame,
  onReassignSlot,
  onRecalculateReport,
  onDismissUpdated,
  fairnessReportUpdated,
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
  const [showReproduceConfirm, setShowReproduceConfirm] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState<string | null>(null);

  const qualityLabel = (s: number) => {
    if (s < 5_000) return { label: 'Excellent', cls: 'text-success' };
    if (s < 15_000) return { label: 'Good', cls: 'text-warning' };
    return { label: 'Needs review', cls: 'text-destructive' };
  };

  const slotIsLate = (slotId: string) => {
    const slot = slotsById[slotId];
    return slot ? isDerivedLate(slot, settings.lateGameThreshold) : false;
  };

  const slotIsWeekend = (slotId: string) => {
    const slot = slotsById[slotId];
    return slot ? isDerivedWeekend(slot) : false;
  };

  const uniqueDays = useMemo(
    () => [...new Set(schedule.games.map(g => slotsById[g.slotId]?.dayOfWeek).filter((d): d is string => !!d))],
    [schedule.games, slotsById]
  );

  const allDates = useMemo(
    () => [...new Set(schedule.games.map(g => slotsById[g.slotId]?.date).filter((d): d is string => !!d))].sort(),
    [schedule.games, slotsById]
  );
  const dateRange = allDates.length > 0
    ? `${formatDate(allDates[0])} - ${formatDate(allDates[allDates.length - 1])}`
    : '';

  const filteredGames = useMemo(() => {
    let games = [...schedule.games];

    if (divisionFilter !== 'all') {
      games = games.filter(g => g.division === divisionFilter);
    }
    if (teamFilter !== 'all') {
      games = games.filter(g =>
        teamsById[g.homeTeamId]?.name === teamFilter ||
        teamsById[g.awayTeamId]?.name === teamFilter
      );
    }
    if (dayFilter !== 'all') {
      games = games.filter(g => slotsById[g.slotId]?.dayOfWeek === dayFilter);
    }

    games.sort((a, b) => {
      const slotA = slotsById[a.slotId];
      const slotB = slotsById[b.slotId];
      let cmp = 0;
      switch (sortField) {
        case 'date':
          cmp = (slotA?.date ?? '').localeCompare(slotB?.date ?? '')
             || (slotA?.startTime ?? '').localeCompare(slotB?.startTime ?? '');
          break;
        case 'time':
          cmp = (slotA?.startTime ?? '').localeCompare(slotB?.startTime ?? '');
          break;
        case 'division':
          cmp = a.division.localeCompare(b.division);
          break;
        case 'homeTeam':
          cmp = (teamsById[a.homeTeamId]?.name ?? '').localeCompare(teamsById[b.homeTeamId]?.name ?? '');
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return games;
  }, [schedule.games, slotsById, teamsById, divisionFilter, teamFilter, dayFilter, sortField, sortAsc]);

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3" />;
    return sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  };

  const ariaSortAttr = (field: SortField): 'ascending' | 'descending' | 'none' => {
    if (sortField !== field) return 'none';
    return sortAsc ? 'ascending' : 'descending';
  };

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
      const game1 = schedule.games.find(g => g.id === selectedGame);
      const game2 = schedule.games.find(g => g.id === gameId);

      if (game1 && game2 && game1.division === game2.division) {
        onSwapGames(selectedGame, gameId);
      }
      setSelectedGame(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Summary Header */}
      <Card className="bg-gradient-ice border-accent/20">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold">Schedule Generated</h3>
              <p className="text-sm text-muted-foreground">
                {schedule.games.length} games • {dateRange}
              </p>
              {schedule.fairnessScore > 0 && (() => {
                const q = qualityLabel(schedule.fairnessScore);
                return (
                  <TooltipProvider>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-sm font-medium ${q.cls}`}>{q.label}</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">Fairness score: {schedule.fairnessScore.toLocaleString()}<br />Excellent &lt; 5,000 · Good &lt; 15,000 · Needs review ≥ 15,000</p>
                        </TooltipContent>
                      </Tooltip>
                      <span className="text-xs text-muted-foreground">({schedule.fairnessScore.toLocaleString()})</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">Schedule ID: {schedule.seed}</p>
                  </TooltipProvider>
                );
              })()}
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
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowReproduceConfirm(true)}
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Reproduce
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Recreate this exact schedule using the same Schedule ID</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowRegenerateConfirm(true)}
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Regenerate
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Discard and generate a new schedule</TooltipContent>
                </Tooltip>
              </TooltipProvider>
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
                  <th className="cursor-pointer" role="button" tabIndex={0}
                    aria-sort={ariaSortAttr('date')}
                    onClick={() => handleSort('date')}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('date'); } }}
                  >
                    <span className="flex items-center gap-1">Date{sortIcon('date')}</span>
                  </th>
                  <th>Day</th>
                  <th className="cursor-pointer" role="button" tabIndex={0}
                    aria-sort={ariaSortAttr('time')}
                    onClick={() => handleSort('time')}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('time'); } }}
                  >
                    <span className="flex items-center gap-1">Time{sortIcon('time')}</span>
                  </th>
                  <th className="cursor-pointer" role="button" tabIndex={0}
                    aria-sort={ariaSortAttr('division')}
                    onClick={() => handleSort('division')}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('division'); } }}
                  >
                    <span className="flex items-center gap-1">Div{sortIcon('division')}</span>
                  </th>
                  <th className="cursor-pointer" role="button" tabIndex={0}
                    aria-sort={ariaSortAttr('homeTeam')}
                    onClick={() => handleSort('homeTeam')}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('homeTeam'); } }}
                  >
                    <span className="flex items-center gap-1">Home{sortIcon('homeTeam')}</span>
                  </th>
                  <th>Away</th>
                  <th>Flags</th>
                  {editMode && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredGames.slice(0, 100).map((game) => {
                  const slot = slotsById[game.slotId];
                  const homeName = teamsById[game.homeTeamId]?.name ?? '';
                  const awayName = teamsById[game.awayTeamId]?.name ?? '';
                  return (
                    <tr
                      key={game.id}
                      className={`${editMode ? 'cursor-pointer' : ''} ${selectedGame === game.id ? 'bg-accent/20' : ''}`}
                      onClick={() => handleGameClick(game.id)}
                    >
                      <td className="font-mono tabular-nums">{slot ? formatDate(slot.date) : '—'}</td>
                      <td>{slot?.dayOfWeek.slice(0, 3) ?? '—'}</td>
                      <td className="font-mono tabular-nums">{slot ? formatTime(slot.startTime) : '—'}</td>
                      <td>
                        <span className={game.division === 'A' ? 'badge-division-a' : 'badge-division-b'}>
                          {game.division}
                        </span>
                      </td>
                      <td className="font-medium">{homeName}</td>
                      <td>{awayName}</td>
                      <td>
                        <div className="flex gap-1">
                          {slotIsLate(game.slotId) && (
                            <span className="badge-late">
                              <Clock className="w-3 h-3" />
                            </span>
                          )}
                          {slotIsWeekend(game.slotId) && (
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
                                  const game1 = schedule.games.find(g => g.id === selectedGame);
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
                  );
                })}
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
        <UnusedSlotsSection
          unusedSlots={unusedSlots}
          schedule={schedule}
          slotsById={slotsById}
          teams={teams}
          onReassignSlot={onReassignSlot}
        />
      )}

      {/* Fairness Report */}
      {fairnessReport && (
        <FairnessReportSection
          report={fairnessReport}
          settings={settings}
          onRecalculate={onRecalculateReport}
          isUpdated={fairnessReportUpdated}
          onDismissUpdated={onDismissUpdated}
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

      <ScheduleTabDialogs
        seed={schedule.seed}
        showRegenerateConfirm={showRegenerateConfirm}
        showReproduceConfirm={showReproduceConfirm}
        showRemoveConfirm={showRemoveConfirm}
        onRegenerateConfirm={() => { onRegenerate(); setShowRegenerateConfirm(false); }}
        onReproduceConfirm={() => { onReproduce(); setShowReproduceConfirm(false); }}
        onRemoveConfirm={(id) => { onRemoveGame(id); setShowRemoveConfirm(null); }}
        onRegenerateCancel={() => setShowRegenerateConfirm(false)}
        onReproduceCancel={() => setShowReproduceConfirm(false)}
        onRemoveCancel={() => setShowRemoveConfirm(null)}
      />
    </div>
  );
};
