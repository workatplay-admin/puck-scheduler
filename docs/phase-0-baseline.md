# Phase 0 - Baseline Performance Documentation

**Date**: December 5, 2025
**Algorithm**: Greedy slot assignment with fairness penalties
**Test Data**: 300 ice slots, 16 teams (8 per division), 10 test runs

---

## Executive Summary

The current greedy scheduling algorithm **PASSES all PRD fairness requirements** for the test scenario:

| Requirement | Target | Actual | Status |
|------------|--------|--------|--------|
| Late Slot Variance | ≤2 | 1.00 | ✓ **PASS** |
| Weekend Variance | ≤3 | 1.20 | ✓ **PASS** |
| Generation Time | <30s | 0.01s | ✓ **PASS** |

---

## Test Configuration

- **Ice Slots**: 300 (150 dates × 2 slots per day)
- **Teams**: 16 (8 per division)
- **Expected Games**: ~304 per division, ~38 per team
- **Settings**: Late threshold = 20:45 (8:45 PM)
- **Test Runs**: 10 iterations

---

## Performance Metrics

### Average Performance (10 runs)
- **Fairness Score**: 1,220 (lower is better)
- **Late Slot Variance**: 1.00 (max difference between teams)
- **Weekend Variance**: 1.20 (max difference between teams)
- **Generation Time**: 5ms

### Best Run
- **Fairness Score**: 1,100
- **Late Slot Variance**: 1
- **Weekend Variance**: 1
- **Flagged Teams**: 0

### Worst Run
- **Fairness Score**: 1,400
- **Late Slot Variance**: 1
- **Weekend Variance**: 2
- **Flagged Teams**: 0

### Consistency
- **Score Range**: 300 (best to worst)
- **Consistency Rating**: High variance in results
- **Reproducibility**: Randomized each run (no seed control)

---

## Key Findings

### ✓ **Strengths**
1. **Excellent Fairness**: Late slot distribution is very even (max variance = 1)
2. **Fast Performance**: Generates schedule in <10ms
3. **Meets PRD Requirements**: All fairness targets achieved
4. **Zero Violations**: No teams flagged for unfairness
5. **Good Weekend Distribution**: Variance of only 1.2 games

### ⚠️ **Limitations**
1. **No Seed Control**: Cannot reproduce exact same schedule
2. **High Result Variance**: Fairness score ranges from 1,100 to 1,400
3. **Missing Constraints**: Does not enforce max games/week, rest days, consecutive opponents
4. **Greedy Approach**: May not find optimal solution for more complex scenarios
5. **No Optimization**: Single-pass algorithm without iterative improvement

---

## Implications for Phase 1

### Question: Do we still need simulated annealing?

**Short Answer**: Potentially not for basic fairness, but YES for completeness and robustness.

### Reasons to Proceed with Phase 1:

1. **PRD Specifies Simulated Annealing**: The ADR explicitly calls for SA implementation
2. **Missing Constraints**: Current algorithm doesn't handle:
   - Max games per week enforcement (weight: 10,000)
   - Rest day violations (weight: 25)
   - Consecutive opponent penalties (weight: 50)
3. **No Reproducibility**: Lacking seed-based determinism
4. **Edge Cases**: May fail with:
   - Unbalanced division sizes
   - Heavily constrained ice slot availability
   - Different late slot time distributions
5. **Optimization Potential**: SA can explore solution space more thoroughly
6. **Production Requirements**: Need robust algorithm for real-world edge cases

### Alternative Approach:

Given the strong baseline performance, Phase 1 could be **de-prioritized or modified**:

**Option A**: Skip to Phase 2 (add constraint tracking to existing algorithm)
**Option B**: Implement SA as "premium" optimization mode
**Option C**: Proceed as planned but set higher bar for improvement

### Recommendation:

**Proceed with Phase 1 as planned**, but:
1. Use greedy algorithm as baseline to beat
2. Focus SA implementation on constraint handling (Phase 2 requirements)
3. Measure improvement in edge cases, not just average performance
4. Consider hybrid: greedy for initial solution, SA for refinement

---

## Test Data Files

- **Raw Results**: `docs/algorithm-baseline-2025-12-05.json`
- **Test Harness**: `src/lib/algorithmTestHarness.ts`
- **Test Runner**: `test-algorithm.ts`

### Running the Test

```bash
npm run test:algorithm
```

---

## Phase 0 Completion Checklist

- [x] Install dependencies
- [x] Build project successfully
- [x] Add input validation (duplicate teams, min slots, better error messages)
- [x] Create algorithm test harness
- [x] Document baseline performance
- [x] Generate baseline metrics file

**Status**: ✓ Phase 0 Complete

---

## Next Steps

**Phase 1 Decision Point**: Review this baseline with stakeholders to decide:
1. Proceed with simulated annealing as planned?
2. Modify Phase 1 scope based on baseline performance?
3. Skip to Phase 2 (constraint tracking)?

**Recommendation**: Proceed with Phase 1, focusing on:
- Seed-based reproducibility
- Constraint violation tracking
- Edge case robustness
- Measurable improvement over baseline
