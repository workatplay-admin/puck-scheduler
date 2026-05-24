import { generateSchedule } from './index';
import type { WorkerInit, WorkerMsg } from './workerTypes';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (e: MessageEvent<WorkerInit>) => {
  const { slots, teams, settings, seed } = e.data;

  try {
    const { schedule, unusedSlots } = generateSchedule(slots, teams, settings, {
      seed,
      onProgress: (iter, currentScore, bestScore) => {
        self.postMessage({ type: 'progress', iteration: iter, currentScore, bestScore } satisfies WorkerMsg);
      },
    });

    if (schedule.hasInvariantViolations) {
      self.postMessage({
        type: 'error',
        code: 'invariant_failed',
        message: schedule.violationSummary ?? 'Could not produce a valid schedule — try adjusting your ice slots or teams.',
        lastBestSchedule: schedule,
        unusedSlots,
      } satisfies WorkerMsg);
    } else {
      self.postMessage({ type: 'done', schedule, unusedSlots } satisfies WorkerMsg);
    }
  } catch (err) {
    self.postMessage({
      type: 'error',
      code: 'unhandled_exception',
      message: err instanceof Error ? err.message : 'Unknown error during schedule generation.',
    } satisfies WorkerMsg);
  }
};
