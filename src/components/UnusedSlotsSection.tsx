import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Schedule, IceSlot, Team } from '@/types/scheduler';
import { formatDate, formatTime } from '@/lib/csvParser';

interface UnusedSlotsSectionProps {
  unusedSlots: IceSlot[];
  schedule: Schedule;
  slotsById: Record<string, IceSlot>;
  teams: Team[];
  onReassignSlot: (slotId: string, homeTeamId: string, awayTeamId: string, division: 'A' | 'B') => void;
}

interface Pairing {
  teamA: Team;
  teamB: Team;
  count: number;
  division: 'A' | 'B';
}

/** Returns the division that played on the same date as the given slot, or null if ambiguous. */
const inferSlotDivision = (slot: IceSlot, schedule: Schedule, slotsById: Record<string, IceSlot>): 'A' | 'B' | null => {
  const gamesOnDate = schedule.games.filter(g => slotsById[g.slotId]?.date === slot.date);
  if (gamesOnDate.length === 0) return null;
  const divA = gamesOnDate.some(g => g.division === 'A');
  const divB = gamesOnDate.some(g => g.division === 'B');
  if (divA && !divB) return 'A';
  if (divB && !divA) return 'B';
  return null;
};

/** Picks home team by fewer home games; deterministic tiebreak on id. */
const pickHomeAway = (teamAId: string, teamBId: string, games: Schedule['games']): { homeId: string; awayId: string } => {
  const aHome = games.filter(g => g.homeTeamId === teamAId).length;
  const bHome = games.filter(g => g.homeTeamId === teamBId).length;
  if (aHome < bHome) return { homeId: teamAId, awayId: teamBId };
  if (bHome < aHome) return { homeId: teamBId, awayId: teamAId };
  return teamAId < teamBId ? { homeId: teamAId, awayId: teamBId } : { homeId: teamBId, awayId: teamAId };
};

/**
 * Displays unused ice slots with a "Reassign" action on each row.
 * Opens a picker dialog to select a pairing (sorted by least-played first).
 */
export const UnusedSlotsSection = ({
  unusedSlots,
  schedule,
  slotsById,
  teams,
  onReassignSlot,
}: UnusedSlotsSectionProps) => {
  const [pickerSlot, setPickerSlot] = useState<IceSlot | null>(null);
  const [teamFilter, setTeamFilter] = useState('');

  const slotDivision = useMemo(
    () => pickerSlot ? inferSlotDivision(pickerSlot, schedule, slotsById) : null,
    [pickerSlot, schedule, slotsById]
  );

  const pairingCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of schedule.games) {
      const key = [g.homeTeamId, g.awayTeamId].sort().join(':');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [schedule.games]);

  const pairings: Pairing[] = useMemo(() => {
    const divs: ('A' | 'B')[] = slotDivision ? [slotDivision] : ['A', 'B'];
    const result: Pairing[] = [];
    for (const div of divs) {
      const divTeams = teams.filter(t => t.division === div);
      for (let i = 0; i < divTeams.length; i++) {
        for (let j = i + 1; j < divTeams.length; j++) {
          const key = [divTeams[i].id, divTeams[j].id].sort().join(':');
          result.push({ teamA: divTeams[i], teamB: divTeams[j], count: pairingCounts.get(key) ?? 0, division: div });
        }
      }
    }
    return result.sort((a, b) => a.count - b.count || a.teamA.name.localeCompare(b.teamA.name));
  }, [slotDivision, teams, pairingCounts]);

  const filteredPairings = useMemo(() => {
    if (!teamFilter.trim()) return pairings;
    const q = teamFilter.toLowerCase();
    return pairings.filter(p => p.teamA.name.toLowerCase().includes(q) || p.teamB.name.toLowerCase().includes(q));
  }, [pairings, teamFilter]);

  const handlePickPairing = (pairing: Pairing) => {
    if (!pickerSlot) return;
    const { homeId, awayId } = pickHomeAway(pairing.teamA.id, pairing.teamB.id, schedule.games);
    onReassignSlot(pickerSlot.id, homeId, awayId, pairing.division);
    setPickerSlot(null);
    setTeamFilter('');
  };

  return (
    <>
      <Card className="border-warning/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-warning">
            Unused Slots ({unusedSlots.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {unusedSlots.slice(0, 10).map(slot => (
              <div key={slot.id} className="flex items-center justify-between gap-2">
                <Badge variant="outline" className="text-xs">
                  {formatDate(slot.date)} @ {formatTime(slot.startTime)}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => { setPickerSlot(slot); setTeamFilter(''); }}
                >
                  Reassign
                </Button>
              </div>
            ))}
            {unusedSlots.length > 10 && (
              <Badge variant="outline" className="text-xs">+{unusedSlots.length - 10} more</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!pickerSlot} onOpenChange={(open) => { if (!open) { setPickerSlot(null); setTeamFilter(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Reassign slot — {pickerSlot ? `${formatDate(pickerSlot.date)} ${formatTime(pickerSlot.startTime)}` : ''}
            </DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Show pairings involving team…"
            value={teamFilter}
            onChange={e => setTeamFilter(e.target.value)}
            className="mb-2"
          />
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {filteredPairings.map(p => (
              <button
                key={`${p.teamA.id}:${p.teamB.id}`}
                className="w-full text-left px-3 py-2 rounded hover:bg-muted text-sm flex justify-between"
                onClick={() => handlePickPairing(p)}
              >
                <span>{p.teamA.name} vs {p.teamB.name}</span>
                <span className="text-muted-foreground">played {p.count}×</span>
              </button>
            ))}
            {filteredPairings.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No pairings match.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
