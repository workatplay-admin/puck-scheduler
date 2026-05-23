import { RefreshCw, Check, AlertTriangle, Clock, Calendar as CalendarIcon, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FairnessReport, SchedulerSettings } from '@/types/scheduler';
import { formatTime } from '@/lib/csvParser';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface FairnessReportProps {
  report: FairnessReport;
  settings: SchedulerSettings;
  onRecalculate: () => void;
  isUpdated?: boolean;
  onDismissUpdated?: () => void;
}

export const FairnessReportSection = ({ report, settings, onRecalculate, isUpdated, onDismissUpdated }: FairnessReportProps) => {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['games', 'late', 'weekend']));

  const toggleSection = (section: string) => {
    const newSet = new Set(openSections);
    if (newSet.has(section)) {
      newSet.delete(section);
    } else {
      newSet.add(section);
    }
    setOpenSections(newSet);
  };

  const divisionAStats = report.teamStats.filter(t => t.division === 'A');
  const divisionBStats = report.teamStats.filter(t => t.division === 'B');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Check className="w-5 h-5 text-success" />
              Fairness Report
              {isUpdated && (
                <button
                  onClick={onDismissUpdated}
                  className="text-xs bg-accent text-accent-foreground px-2 py-0.5 rounded-full hover:opacity-80 font-normal"
                >
                  Updated
                </button>
              )}
            </CardTitle>
            <Button variant="outline" size="sm" onClick={onRecalculate}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Recalculate
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Section A: Games Per Team */}
      <Collapsible open={openSections.has('games')} onOpenChange={() => toggleSection('games')}>
        <Card>
          <CollapsibleTrigger className="w-full">
            <CardHeader className="pb-3 cursor-pointer hover:bg-muted/30 transition-colors">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-accent" />
                  Games Per Team
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform ${openSections.has('games') ? 'rotate-180' : ''}`} />
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                {/* Division A */}
                <div>
                  <h4 className="text-sm font-medium mb-2 badge-division-a inline-block">Division A</h4>
                  <table className="data-table text-sm">
                    <thead>
                      <tr>
                        <th>Team</th>
                        <th className="text-right">Games</th>
                      </tr>
                    </thead>
                    <tbody>
                      {divisionAStats.map(stat => (
                        <tr key={stat.teamName}>
                          <td>{stat.teamName}</td>
                          <td className="text-right font-mono tabular-nums">{stat.totalGames}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Division B */}
                <div>
                  <h4 className="text-sm font-medium mb-2 badge-division-b inline-block">Division B</h4>
                  <table className="data-table text-sm">
                    <thead>
                      <tr>
                        <th>Team</th>
                        <th className="text-right">Games</th>
                      </tr>
                    </thead>
                    <tbody>
                      {divisionBStats.map(stat => (
                        <tr key={stat.teamName}>
                          <td>{stat.teamName}</td>
                          <td className="text-right font-mono tabular-nums">{stat.totalGames}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Section B: Time Slot Distribution */}
      <Collapsible open={openSections.has('timeslots')} onOpenChange={() => toggleSection('timeslots')}>
        <Card>
          <CollapsibleTrigger className="w-full">
            <CardHeader className="pb-3 cursor-pointer hover:bg-muted/30 transition-colors">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-accent" />
                  Time Slot Distribution
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform ${openSections.has('timeslots') ? 'rotate-180' : ''}`} />
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
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Section C: Late Slot Fairness Summary */}
      <Collapsible open={openSections.has('late')} onOpenChange={() => toggleSection('late')}>
        <Card>
          <CollapsibleTrigger className="w-full">
            <CardHeader className="pb-3 cursor-pointer hover:bg-muted/30 transition-colors">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning" />
                  Late Slot Fairness Summary
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform ${openSections.has('late') ? 'rotate-180' : ''}`} />
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <table className="data-table text-sm">
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>Division</th>
                    <th>Worst Variance</th>
                    <th>Slot</th>
                    <th>Status</th>
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
                      <td className="font-mono tabular-nums">+{stat.worstVariance}</td>
                      <td>{stat.worstVarianceSlot ? formatTime(stat.worstVarianceSlot) : 'N/A'}</td>
                      <td>
                        <span className={stat.lateSlotFlagged ? 'badge-flagged' : 'badge-ok'}>
                          {stat.lateSlotFlagged ? '⚠ FLAG' : '✓ OK'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Section D: Friday & Saturday Games */}
      <Collapsible open={openSections.has('weekend')} onOpenChange={() => toggleSection('weekend')}>
        <Card>
          <CollapsibleTrigger className="w-full">
            <CardHeader className="pb-3 cursor-pointer hover:bg-muted/30 transition-colors">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-purple-500" />
                  Friday & Saturday Games
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform ${openSections.has('weekend') ? 'rotate-180' : ''}`} />
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <table className="data-table text-sm">
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>Division</th>
                    <th className="text-right">Friday</th>
                    <th className="text-right">Saturday</th>
                    <th className="text-right">Total</th>
                    <th>Status</th>
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
                      <td className="text-right font-mono tabular-nums">{stat.fridayGames}</td>
                      <td className="text-right font-mono tabular-nums">{stat.saturdayGames}</td>
                      <td className="text-right font-mono tabular-nums">{stat.totalWeekend}</td>
                      <td>
                        <span className={stat.weekendFlagged ? 'badge-flagged' : 'badge-ok'}>
                          {stat.weekendFlagged ? '⚠ FLAG' : '✓ OK'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Section E: Day-of-Week Distribution */}
      <Collapsible open={openSections.has('dayofweek')} onOpenChange={() => toggleSection('dayofweek')}>
        <Card>
          <CollapsibleTrigger className="w-full">
            <CardHeader className="pb-3 cursor-pointer hover:bg-muted/30 transition-colors">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Day-of-Week Distribution</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${openSections.has('dayofweek') ? 'rotate-180' : ''}`} />
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
                      <th className="text-center">Mon</th>
                      <th className="text-center">Tue</th>
                      <th className="text-center">Wed</th>
                      <th className="text-center">Thu</th>
                      <th className="text-center text-purple-500">Fri</th>
                      <th className="text-center text-purple-500">Sat</th>
                      <th className="text-center">Sun</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.teamStats.map(stat => (
                      <tr key={stat.teamName}>
                        <td>{stat.teamName}</td>
                        <td className="text-center font-mono tabular-nums">{stat.dayOfWeekGames['Monday'] || 0}</td>
                        <td className="text-center font-mono tabular-nums">{stat.dayOfWeekGames['Tuesday'] || 0}</td>
                        <td className="text-center font-mono tabular-nums">{stat.dayOfWeekGames['Wednesday'] || 0}</td>
                        <td className="text-center font-mono tabular-nums">{stat.dayOfWeekGames['Thursday'] || 0}</td>
                        <td className="text-center font-mono tabular-nums text-purple-500">{stat.dayOfWeekGames['Friday'] || 0}</td>
                        <td className="text-center font-mono tabular-nums text-purple-500">{stat.dayOfWeekGames['Saturday'] || 0}</td>
                        <td className="text-center font-mono tabular-nums">{stat.dayOfWeekGames['Sunday'] || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Section F: Opponent Distribution */}
      <Collapsible open={openSections.has('opponents')} onOpenChange={() => toggleSection('opponents')}>
        <Card>
          <CollapsibleTrigger className="w-full">
            <CardHeader className="pb-3 cursor-pointer hover:bg-muted/30 transition-colors">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-accent" />
                  Opponent Distribution
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform ${openSections.has('opponents') ? 'rotate-180' : ''}`} />
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <div className="space-y-6">
                {/* Division A */}
                {divisionAStats.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 badge-division-a inline-block">Division A</h4>
                    <div className="overflow-x-auto">
                      <table className="data-table text-sm">
                        <thead>
                          <tr>
                            <th>Team</th>
                            {divisionAStats.map(stat => (
                              <th key={stat.teamName} className="text-center text-xs">vs {stat.teamName}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {divisionAStats.map(stat => (
                            <tr key={stat.teamName}>
                              <td className="font-medium">{stat.teamName}</td>
                              {divisionAStats.map(opponent => (
                                <td key={opponent.teamName} className="text-center font-mono tabular-nums">
                                  {stat.teamName === opponent.teamName ? '—' : (stat.opponentGames[opponent.teamName] || 0)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {/* Division B */}
                {divisionBStats.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 badge-division-b inline-block">Division B</h4>
                    <div className="overflow-x-auto">
                      <table className="data-table text-sm">
                        <thead>
                          <tr>
                            <th>Team</th>
                            {divisionBStats.map(stat => (
                              <th key={stat.teamName} className="text-center text-xs">vs {stat.teamName}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {divisionBStats.map(stat => (
                            <tr key={stat.teamName}>
                              <td className="font-medium">{stat.teamName}</td>
                              {divisionBStats.map(opponent => (
                                <td key={opponent.teamName} className="text-center font-mono tabular-nums">
                                  {stat.teamName === opponent.teamName ? '—' : (stat.opponentGames[opponent.teamName] || 0)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Section G: Division Balance Summary */}
      <Collapsible open={openSections.has('balance')} onOpenChange={() => toggleSection('balance')}>
        <Card>
          <CollapsibleTrigger className="w-full">
            <CardHeader className="pb-3 cursor-pointer hover:bg-muted/30 transition-colors">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Division Balance Summary</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${openSections.has('balance') ? 'rotate-180' : ''}`} />
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <table className="data-table text-sm">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th className="text-center">Division A</th>
                    <th className="text-center">Division B</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Teams</td>
                    <td className="text-center font-mono tabular-nums">{report.divisionBalance.find(d => d.division === 'A')?.teamCount || 0}</td>
                    <td className="text-center font-mono tabular-nums">{report.divisionBalance.find(d => d.division === 'B')?.teamCount || 0}</td>
                  </tr>
                  <tr>
                    <td>Total Games</td>
                    <td className="text-center font-mono tabular-nums">{report.divisionBalance.find(d => d.division === 'A')?.totalGames || 0}</td>
                    <td className="text-center font-mono tabular-nums">{report.divisionBalance.find(d => d.division === 'B')?.totalGames || 0}</td>
                  </tr>
                  <tr>
                    <td>Games Per Team</td>
                    <td className="text-center font-mono tabular-nums">{report.divisionBalance.find(d => d.division === 'A')?.gamesPerTeam || 0}</td>
                    <td className="text-center font-mono tabular-nums">{report.divisionBalance.find(d => d.division === 'B')?.gamesPerTeam || 0}</td>
                  </tr>
                  <tr>
                    <td>Friday Game Days</td>
                    <td className="text-center font-mono tabular-nums">{report.divisionBalance.find(d => d.division === 'A')?.fridayGameDays || 0}</td>
                    <td className="text-center font-mono tabular-nums">{report.divisionBalance.find(d => d.division === 'B')?.fridayGameDays || 0}</td>
                  </tr>
                  <tr>
                    <td>Saturday Game Days</td>
                    <td className="text-center font-mono tabular-nums">{report.divisionBalance.find(d => d.division === 'A')?.saturdayGameDays || 0}</td>
                    <td className="text-center font-mono tabular-nums">{report.divisionBalance.find(d => d.division === 'B')?.saturdayGameDays || 0}</td>
                  </tr>
                  <tr>
                    <td>Total Late Slots</td>
                    <td className="text-center font-mono tabular-nums">{report.divisionBalance.find(d => d.division === 'A')?.totalLateSlots || 0}</td>
                    <td className="text-center font-mono tabular-nums">{report.divisionBalance.find(d => d.division === 'B')?.totalLateSlots || 0}</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
};
