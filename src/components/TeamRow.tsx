import { useState } from 'react';
import { Trash2, UserCircle, Lock, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Team } from '@/types/scheduler';

interface TeamRowProps {
  team: Team;
  /** When true the roster is frozen: the team cannot be deleted, only renamed. */
  locked: boolean;
  accentClass: string;
  onRemove: (teamId: string) => void;
  onRename: (teamId: string, name: string) => void;
  /** Opens the "clear schedule & unlock" confirmation. */
  onRequestUnlock: () => void;
  /** Returns an error message when `name` cannot be used, or null when it is free. */
  validateName: (teamId: string, name: string) => string | null;
}

/**
 * A single team entry with inline rename.
 *
 * Renaming is always available — games reference `teamId`, never the name, so a rename
 * cannot desynchronise a generated schedule. Deletion is not: once a schedule exists the
 * trash control is replaced by a lock button that offers the non-destructive unlock path,
 * because removing a team mid-schedule silently drops its games from the report and export.
 */
export const TeamRow = ({
  team, locked, accentClass, onRemove, onRename, onRequestUnlock, validateName,
}: TeamRowProps) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(team.name);
  const [error, setError] = useState<string | null>(null);

  const startEditing = () => {
    setDraft(team.name);
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === team.name) return cancel();

    const problem = validateName(team.id, trimmed);
    if (problem) {
      setError(problem);
      return;
    }

    onRename(team.id, trimmed);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') cancel();
  };

  if (editing) {
    return (
      <li className="p-3 bg-muted/50 rounded-lg space-y-2">
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            aria-label={`Rename ${team.name}`}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setError(null); }}
            onKeyDown={handleKeyDown}
            className="h-8"
          />
          <Button variant="ghost" size="sm" aria-label="Save name" onClick={commit}>
            <Check className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" aria-label="Cancel rename" onClick={cancel}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between p-3 bg-muted/50 rounded-lg group animate-scale-in">
      <button
        type="button"
        onClick={startEditing}
        aria-label={`Rename ${team.name}`}
        className="flex items-center gap-2 text-left hover:underline"
      >
        <UserCircle className={`w-4 h-4 ${accentClass}`} />
        {team.name}
      </button>

      {locked ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRequestUnlock}
          title="Teams are locked while a schedule exists"
          aria-label={`Teams are locked while a schedule exists. Clear the schedule to remove ${team.name}.`}
          className="text-muted-foreground hover:text-foreground"
        >
          <Lock className="w-4 h-4" />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRemove(team.id)}
          aria-label={`Delete ${team.name}`}
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      )}
    </li>
  );
};
