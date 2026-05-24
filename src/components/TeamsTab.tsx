import { useState } from 'react';
import { Users, Plus, Trash2, UserCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { Team } from '@/types/scheduler';

interface TeamsTabProps {
  teams: Team[];
  onAddTeam: (team: Team) => void;
  onRemoveTeam: (teamId: string) => void;
  onBack: () => void;
  onGenerate: () => void;
}

export const TeamsTab = ({ teams, onAddTeam, onRemoveTeam, onBack, onGenerate }: TeamsTabProps) => {
  const [teamName, setTeamName] = useState('');
  const [division, setDivision] = useState<'A' | 'B'>('A');
  const [duplicateTeam, setDuplicateTeam] = useState<string | null>(null);

  const divisionATeams = teams.filter(t => t.division === 'A');
  const divisionBTeams = teams.filter(t => t.division === 'B');

  const canGenerate = divisionATeams.length >= 2 || divisionBTeams.length >= 2;

  const handleAddTeam = () => {
    const trimmed = teamName.trim();
    if (!trimmed) return;

    const isDuplicate = teams.some(t => t.name.toLowerCase() === trimmed.toLowerCase());
    if (isDuplicate) {
      setDuplicateTeam(trimmed);
      return;
    }

    onAddTeam({
      id: `team-${Date.now()}`,
      name: trimmed,
      division,
    });
    setTeamName('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddTeam();
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Add Team Form */}
      <Card className="card-interactive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-accent" />
            Add Team
          </CardTitle>
          <CardDescription>
            Enter team details and assign to a division
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Label htmlFor="team-name">Team Name</Label>
              <Input
                id="team-name"
                placeholder="e.g., Ice Hawks"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                onKeyDown={handleKeyDown}
                className="mt-1.5"
              />
            </div>
            <div className="w-full sm:w-40">
              <Label>Division</Label>
              <Select value={division} onValueChange={(v) => setDivision(v as 'A' | 'B')}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Division A</SelectItem>
                  <SelectItem value="B">Division B</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleAddTeam} disabled={!teamName.trim()}>
                <Plus className="w-4 h-4 mr-2" />
                Add Team
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Teams by Division */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Division A */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Division A
              </span>
              <span className="badge-division-a">{divisionATeams.length} teams</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {divisionATeams.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-6">
                No teams in Division A yet
              </p>
            ) : (
              <ul className="space-y-2">
                {divisionATeams.map((team) => (
                  <li
                    key={team.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg group animate-scale-in"
                  >
                    <span className="flex items-center gap-2">
                      <UserCircle className="w-4 h-4 text-primary" />
                      {team.name}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveTeam(team.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {divisionATeams.length < 2 && (
              <p className="text-xs text-warning mt-3">
                Need at least 2 teams to generate schedule
              </p>
            )}
          </CardContent>
        </Card>

        {/* Division B */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Users className="w-5 h-5 text-accent" />
                Division B
              </span>
              <span className="badge-division-b">{divisionBTeams.length} teams</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {divisionBTeams.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-6">
                No teams in Division B yet
              </p>
            ) : (
              <ul className="space-y-2">
                {divisionBTeams.map((team) => (
                  <li
                    key={team.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg group animate-scale-in"
                  >
                    <span className="flex items-center gap-2">
                      <UserCircle className="w-4 h-4 text-accent" />
                      {team.name}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveTeam(team.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {divisionBTeams.length < 2 && divisionBTeams.length > 0 && (
              <p className="text-xs text-warning mt-3">
                Need at least 2 teams to generate schedule
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Add Suggestions */}
      {teams.length === 0 && (
        <Card className="bg-ice/30 border-accent/20">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground mb-3">Quick start with sample teams:</p>
            <div className="flex flex-wrap gap-2">
              {['Ice Hawks', 'Polar Bears', 'Frost Giants', 'Snow Wolves', 'Blizzards', 'Avalanche', 'Glaciers', 'Penguins'].map((name, i) => (
                <Button
                  key={name}
                  variant="outline"
                  size="sm"
                  onClick={() => onAddTeam({
                    id: `team-${Date.now()}-${i}`,
                    name,
                    division: i < 4 ? 'A' : 'B',
                  })}
                  className="text-xs"
                >
                  + {name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={() => onGenerate()} disabled={!canGenerate}>
          Generate Schedule
        </Button>
      </div>

      {/* Duplicate Name Dialog */}
      <AlertDialog open={duplicateTeam !== null} onOpenChange={() => setDuplicateTeam(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Team Name Already Exists</AlertDialogTitle>
            <AlertDialogDescription>
              A team named &quot;{duplicateTeam}&quot; already exists. Each team must have a unique name.
              Please choose a different name.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setDuplicateTeam(null)}>
              OK
            </AlertDialogAction>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
