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

interface ScheduleTabDialogsProps {
  seed: number;
  showRegenerateConfirm: boolean;
  showReproduceConfirm: boolean;
  showRemoveConfirm: string | null;
  onRegenerateConfirm: () => void;
  onReproduceConfirm: () => void;
  onRemoveConfirm: (gameId: string) => void;
  onRegenerateCancel: () => void;
  onReproduceCancel: () => void;
  onRemoveCancel: () => void;
}

/**
 * Confirmation dialogs for destructive schedule actions (regenerate, reproduce,
 * and remove a game). Extracted from ScheduleTab to keep that file under 500 lines.
 */
export const ScheduleTabDialogs = ({
  seed,
  showRegenerateConfirm,
  showReproduceConfirm,
  showRemoveConfirm,
  onRegenerateConfirm,
  onReproduceConfirm,
  onRemoveConfirm,
  onRegenerateCancel,
  onReproduceCancel,
  onRemoveCancel,
}: ScheduleTabDialogsProps) => (
  <>
    {/* Regenerate Confirmation Dialog */}
    <AlertDialog open={showRegenerateConfirm} onOpenChange={onRegenerateCancel}>
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
          <AlertDialogAction onClick={onRegenerateConfirm}>
            Regenerate
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Reproduce Confirmation Dialog */}
    <AlertDialog open={showReproduceConfirm} onOpenChange={onReproduceCancel}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reproduce this schedule?</AlertDialogTitle>
          <AlertDialogDescription>
            This will discard all manual edits and recreate the same schedule using Schedule ID {seed}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onReproduceConfirm}>
            Reproduce
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Remove Game Confirmation Dialog */}
    <AlertDialog open={!!showRemoveConfirm} onOpenChange={onRemoveCancel}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Game?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove the game and mark the ice slot as unused.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => { if (showRemoveConfirm) onRemoveConfirm(showRemoveConfirm); }}>
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
);
