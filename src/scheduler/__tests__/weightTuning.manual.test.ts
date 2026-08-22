import { describe, it } from 'vitest';
import { generateSchedule } from '../index';
import { createScore } from '../scoring';
import { DEFAULT_SETTINGS, bandOf, buildSlotsById } from '@/types/scheduler';
import { loadRealSeason, buildTeams } from './realSeason';
import { bandSpreads, lateGate } from './lateRigidity.helpers';

/**
 * Weight tuning harness. Skipped in CI — a full sweep is several minutes of annealing.
 *
 * Run deliberately when the objective function changes:
 *   npx vitest run src/scheduler/__tests__/weightTuning.manual.test.ts -t sweep
 *
 * Copy the chosen weights into `BAND_WEIGHTS` in `scoring.ts`; `lateRigidity.test.ts`
 * asserts them, so a later edit fails loudly rather than drifting.
 *
 * A candidate is only admissible if it holds the late gate. Band balance yields to late
 * fairness, never the reverse.
 */
describe.skip('band weight sweep', () => {
  it('sweep', { timeout: 3_000_000 }, () => {
    const slots = loadRealSeason();
    const teams = buildTeams(8);
    const byId = buildSlotsById(slots);

    console.log('\n weight |  Div A aft/prime/late  |  Div B aft/prime/late  | late gate | score');
    for (const w of [0, 50, 150, 400, 1000, 2500]) {
      const { schedule } = generateSchedule(slots, teams, DEFAULT_SETTINGS, {
        seed: 4242,
        scoreFn: createScore({ prime: w, afternoon: w }),
      });
      const a = bandSpreads(schedule, byId, teams, 'A');
      const b = bandSpreads(schedule, byId, teams, 'B');
      const gate = { A: lateGate(schedule, byId, teams, 'A'), B: lateGate(schedule, byId, teams, 'B') };
      const ok = a.late <= gate.A && b.late <= gate.B ? 'HOLDS' : 'BROKEN';
      console.log(
        ` ${String(w).padStart(6)} |` +
        ` ${a.afternoon}/${a.prime}/${a.late}`.padEnd(24) + '|' +
        ` ${b.afternoon}/${b.prime}/${b.late}`.padEnd(24) + '|' +
        ` ${ok.padEnd(9)} | ${schedule.fairnessScore}`,
      );
      void bandOf; // keep the import meaningful if the body is trimmed
    }
  });
});
