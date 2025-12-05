/**
 * Algorithm Test Runner
 *
 * Run this script to test the current scheduling algorithm performance.
 * This will generate baseline metrics for comparison with future algorithm improvements.
 *
 * Usage:
 *   npx tsx test-algorithm.ts
 *
 * Or add to package.json scripts:
 *   "test:algorithm": "tsx test-algorithm.ts"
 */

import { runAlgorithmTest, formatTestSummary, generateSampleTestData } from './src/lib/algorithmTestHarness';
import { DEFAULT_SETTINGS } from './src/types/scheduler';

console.log('='.repeat(60));
console.log('PUCK SCHEDULER - ALGORITHM PERFORMANCE TEST');
console.log('='.repeat(60));
console.log();

// Generate sample test data (300 ice slots, 16 teams)
const { iceSlots, teams } = generateSampleTestData();

console.log('Test Configuration:');
console.log(`  Ice Slots: ${iceSlots.length}`);
console.log(`  Teams: ${teams.length} (8 per division)`);
console.log(`  Expected Games: ~304 per division, ~38 per team`);
console.log(`  Settings: Late threshold = ${DEFAULT_SETTINGS.lateGameThreshold}`);
console.log();

// Run the test
const NUM_RUNS = 10;
console.log(`Running ${NUM_RUNS} test iterations...`);
console.log('-'.repeat(60));

const summary = runAlgorithmTest(iceSlots, teams, DEFAULT_SETTINGS, NUM_RUNS);

console.log();
console.log('='.repeat(60));
console.log(formatTestSummary(summary));
console.log('='.repeat(60));
console.log();

// Save results to file
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
const resultsFile = join(__dirname, `docs/algorithm-baseline-${timestamp}.json`);

const resultsData = {
  timestamp: new Date().toISOString(),
  algorithmType: 'greedy',
  testConfiguration: {
    iceSlots: iceSlots.length,
    teams: teams.length,
    runs: NUM_RUNS,
    settings: DEFAULT_SETTINGS,
  },
  summary,
};

writeFileSync(resultsFile, JSON.stringify(resultsData, null, 2));

console.log(`Results saved to: ${resultsFile}`);
console.log();

// Determine if algorithm meets PRD requirements
console.log('PRD Requirements Check:');
console.log('-'.repeat(60));

const meetsLateSlotRequirement = summary.avgLateSlotVariance <= 2;
const meetsWeekendRequirement = summary.avgWeekendVariance <= 3;
const meetsPerformanceRequirement = summary.avgGenerationTime < 30000; // 30 seconds

console.log(`  Late Slot Variance ≤2: ${meetsLateSlotRequirement ? '✓ PASS' : '✗ FAIL'} (avg: ${summary.avgLateSlotVariance.toFixed(2)})`);
console.log(`  Weekend Variance ≤3: ${meetsWeekendRequirement ? '✓ PASS' : '✗ FAIL'} (avg: ${summary.avgWeekendVariance.toFixed(2)})`);
console.log(`  Generation Time <30s: ${meetsPerformanceRequirement ? '✓ PASS' : '✗ FAIL'} (avg: ${(summary.avgGenerationTime / 1000).toFixed(2)}s)`);
console.log();

if (!meetsLateSlotRequirement || !meetsWeekendRequirement) {
  console.log('⚠️  Current algorithm does NOT meet PRD fairness requirements.');
  console.log('   Simulated annealing implementation needed (Phase 1).');
} else {
  console.log('✓ Current algorithm meets PRD fairness requirements!');
}

console.log();
console.log('Test complete!');
