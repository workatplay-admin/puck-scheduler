#!/usr/bin/env node
// Local-only performance smoke check — NOT run in CI.
// Reports wall-clock time for the 8-team / 300-slot fixture.
// Run with: npm run perf

import { execSync } from 'node:child_process';

const start = Date.now();
try {
  execSync(
    'npx vitest run --reporter=verbose src/scheduler/__tests__/perf.test.ts',
    { stdio: 'inherit' }
  );
} catch {
  process.exitCode = 1;
}
const elapsed = Date.now() - start;
console.log(`\nPerf wall-clock: ${elapsed}ms`);
