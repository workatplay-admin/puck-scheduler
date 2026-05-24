import type { IceSlot, Team, Schedule, SchedulerSettings } from '@/types/scheduler';

/** Init message sent from the main thread to start the scheduler worker. */
export interface WorkerInit {
  slots: IceSlot[];
  teams: Team[];
  settings: SchedulerSettings;
  seed?: number;
}

/**
 * Discriminated union of all messages posted from the worker to the main thread.
 *
 * `progress` — emitted roughly every 500 SA iterations; drives the progress bar.
 * `done`     — generation succeeded; carries the full schedule + unused slots.
 * `error`    — generation failed; distinguishes invariant failures (recoverable
 *              via "Use this schedule anyway") from unhandled exceptions.
 */
export type WorkerMsg =
  | { type: 'progress'; iteration: number; currentScore: number; bestScore: number }
  | { type: 'done'; schedule: Schedule; unusedSlots: IceSlot[] }
  | { type: 'error'; code: 'invariant_failed' | 'unhandled_exception'; message: string; lastBestSchedule?: Schedule; unusedSlots?: IceSlot[] };
