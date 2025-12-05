# Puck Scheduler - Phased Implementation Plan

**Version**: 1.0
**Date**: December 5, 2025
**Purpose**: Incremental rollout plan where each phase is independently deployable and user-testable

---

## Current State Assessment

### ✅ What Works Today
- Complete UI workflow (Ice Times → Teams → Schedule → Export)
- CSV upload and parsing with validation
- Basic greedy schedule generation algorithm
- Team management (add/remove, division assignment)
- Schedule display with filtering and sorting
- Manual game editing (swap/remove)
- Basic fairness report (games per team, time slot distribution, weekend games)
- CSV export functionality
- LocalStorage persistence
- Settings configuration panel

### ⚠️ Known Limitations
- **Algorithm**: Greedy approach instead of simulated annealing optimization
- **Constraints**: Missing max games/week enforcement, rest day tracking, consecutive opponent penalty
- **File Support**: CSV only (no Excel)
- **Performance**: No progress indicator for long-running generation
- **Validation**: Limited edge case handling

---

## Phase 0: Foundation & Stability 🔧
**Goal**: Get current codebase production-ready and deployable
**Duration**: 1-2 hours
**User Value**: Functional app they can start using immediately

### Tasks
1. ✅ Install dependencies (`npm install`)
2. ✅ Run build and fix any TypeScript/build errors
3. ✅ Test full workflow end-to-end locally
4. ✅ Add input validation improvements:
   - Duplicate team name detection
   - Minimum ice slots validation (need enough slots for teams)
   - Better error messages for CSV parsing failures
5. ✅ Deploy to production
6. ✅ Create quick-start user guide

### Success Criteria
- [ ] App builds without errors
- [ ] User can upload CSV, add teams, generate schedule, and export
- [ ] No console errors during normal operation
- [ ] Basic schedules are fair enough for initial testing

### Deployment Testing Checklist
```
□ Upload sample CSV with 50+ ice slots
□ Add 8 teams (4 per division)
□ Generate schedule successfully
□ Verify schedule appears with games
□ Check fairness report shows data
□ Export CSV downloads correctly
□ Refresh browser, data persists
□ Clear all data works
```

---

## Phase 1: Core Algorithm Enhancement 🎯
**Goal**: Implement simulated annealing optimization per ADR specs
**Duration**: 4-6 hours
**User Value**: Significantly fairer schedules with better late slot and weekend distribution

### Tasks
1. **Create new optimizer module** (`src/lib/optimizer.ts`):
   - Implement simulated annealing framework
   - Temperature scheduling (initial: 1000, cooling: 0.9997)
   - Neighbor generation (game swap operations)
   - Acceptance probability calculation

2. **Enhanced fairness scoring function**:
   - Late slot variance per time (weight: 1000, squared penalty)
   - Weekend variance (weight: 100, squared penalty)
   - Basic penalty tracking

3. **Integrate optimizer** into existing generator:
   - Keep phases 1, 2, and 4 (day assignment, matchups, home/away)
   - Replace phase 3 (slot assignment) with simulated annealing
   - Maintain backward compatibility with existing data structures

4. **Add algorithm performance metrics**:
   - Track iterations and best score found
   - Display optimization progress in console (for debugging)
   - Record seed for reproducibility

5. **Testing**:
   - Generate 10 schedules with same inputs, compare fairness
   - Verify improvement over greedy algorithm
   - Performance test with 300+ games

### Success Criteria
- [ ] Late slot variance reduced by >50% compared to Phase 0
- [ ] Weekend variance reduced by >40% compared to Phase 0
- [ ] Generation completes in <30 seconds for 300 games
- [ ] Schedules are reproducible with seed
- [ ] Fairness report shows improved distribution

### User Testing Guide
```
Test Scenario: 300-game season
- Upload CSV: 150 dates, 2 slots/day (300 total)
- Teams: 8 per division (16 total)
- Generate 3 schedules, compare fairness reports
- Look for: Max late slot variance ≤2, weekend variance ≤3
```

### Rollback Plan
If algorithm performs poorly, keep existing greedy algorithm and treat SA as "experimental mode" toggle.

---

## Phase 2: Complete Constraint System 📊
**Goal**: Add all PRD-specified constraints and comprehensive fairness tracking
**Duration**: 3-4 hours
**User Value**: More realistic schedules respecting game frequency limits and team rest needs

### Tasks
1. **Implement constraint tracking**:
   - Max games per week (configurable, default: 3)
   - Rest days between games (soft constraint: 2 days, hard: 1 day)
   - Consecutive opponent detection (same matchup in consecutive weeks)
   - Home/away balance per team

2. **Update fairness scoring**:
   - Add max games/week violation penalty (weight: 10,000)
   - Add rest day violation penalty (weight: 25)
   - Add consecutive opponent penalty (weight: 50)
   - Adjust weights based on testing

3. **Enhance fairness report**:
   - Add "Games Per Week" section showing weekly distribution
   - Add "Rest Days" section flagging violations
   - Add "Consecutive Matchups" section highlighting back-to-backs
   - Add "Home/Away Balance" showing split per team

4. **Settings panel updates**:
   - Add "Minimum rest days" setting
   - Add "Flag consecutive opponents" toggle
   - Add explanatory tooltips

5. **Algorithm integration**:
   - Update neighbor generation to be constraint-aware
   - Add constraint validation before accepting swaps
   - Prioritize constraint fixes in early annealing iterations

### Success Criteria
- [ ] No team exceeds max games per week threshold
- [ ] <5% of games violate minimum rest day constraint
- [ ] Consecutive opponent matchups <10% of total
- [ ] Home/away splits within ±2 games for all teams
- [ ] Fairness report clearly highlights any violations

### User Testing Guide
```
Test Scenario: Compressed season (many games, few weeks)
- Upload CSV: 40 dates over 6 weeks, 4 slots/day (160 games)
- Teams: 6 per division (12 total, ~26 games/team)
- Settings: Max 3 games/week, Min 2 rest days
- Verify: No team has >3 games in any rolling 7-day window
- Check: Fairness report flags violations clearly
```

---

## Phase 3: User Experience Enhancements ✨
**Goal**: Polish the app with nice-to-have features and UX improvements
**Duration**: 3-4 hours
**User Value**: Smoother workflow, fewer errors, better feedback

### Tasks
1. **Excel file support**:
   - Add SheetJS library integration
   - Support .xlsx and .xls file uploads
   - Auto-detect file type and parse accordingly
   - Show file format in upload preview

2. **Progress tracking during generation**:
   - Add Web Worker for algorithm execution (keep UI responsive)
   - Show progress bar with percentage (based on iteration count)
   - Display current best score
   - Add "Cancel" button for long-running generations
   - Estimated time remaining

3. **Better error handling**:
   - Input validation with helpful suggestions
   - Graceful degradation if localStorage is full
   - Better error messages for edge cases:
     - Not enough ice slots for teams
     - Unbalanced divisions (suggest redistribution)
     - Invalid date ranges (games in past)

4. **Performance optimizations**:
   - Memoize expensive calculations in fairness report
   - Virtual scrolling for large schedules (>200 games)
   - Debounce filter inputs
   - Lazy load fairness report sections

5. **Quality of life features**:
   - Keyboard shortcuts (e.g., Ctrl+G to generate, Ctrl+E to export)
   - "Download sample CSV" button with template
   - Schedule preview before full generation (quick estimate)
   - Undo/redo for manual edits
   - Copy schedule link (encode state in URL for sharing)

6. **Mobile responsiveness**:
   - Optimize table layouts for mobile
   - Touch-friendly controls for game swapping
   - Collapsible sections work well on small screens

### Success Criteria
- [ ] Excel files upload and parse correctly
- [ ] Progress bar updates smoothly during generation
- [ ] User can cancel long-running operations
- [ ] 500+ game schedule renders without lag
- [ ] App is usable on tablet devices
- [ ] All edge cases show helpful error messages

### User Testing Guide
```
Test Scenarios:
1. Excel Upload: Download sample, open in Excel, modify, upload
2. Large Schedule: 500 games, verify performance stays smooth
3. Mobile: Test on iPad/tablet, verify all features work
4. Error Cases: Try to generate with 0 teams, 1 ice slot, etc.
5. Cancellation: Start generation, cancel mid-way, verify clean state
```

---

## Phase 4: Advanced Features (Optional) 🚀
**Goal**: Power-user features and advanced analytics
**Duration**: 4-6 hours
**User Value**: Deeper insights and more control for experienced commissioners

### Tasks
1. **Multi-season comparison**:
   - Save multiple schedule versions
   - Compare fairness metrics side-by-side
   - Export comparison report

2. **Schedule templates**:
   - Save/load common team configurations
   - Template library (8-team league, 12-team league, etc.)

3. **Advanced analytics**:
   - Travel distance optimization (if rinks have multiple arenas)
   - Team performance prediction zones (avoid late games before 8am work days)
   - Historical fairness tracking across seasons

4. **Custom constraint builder**:
   - User-defined "blackout dates" per team
   - Preferred time slots per team
   - Rivalry matchups (schedule more/less frequently)

5. **Integration features**:
   - iCal/Google Calendar export
   - Email schedule to teams
   - API for external integrations

### Success Criteria
- [ ] Users can save and compare 3+ schedule versions
- [ ] Templates reduce setup time by 80%
- [ ] Custom constraints work without breaking core algorithm
- [ ] Export formats work in popular calendar apps

---

## Deployment Strategy

### For Each Phase:

1. **Pre-Deployment**:
   - Run full test suite
   - Manual QA using testing checklists
   - Update user documentation
   - Tag release in git (v0.1.0, v0.2.0, etc.)

2. **Deployment**:
   - Deploy to staging first
   - Smoke test on staging
   - Deploy to production (Lovable auto-deploy on push)
   - Monitor for errors (console logs, user feedback)

3. **Post-Deployment**:
   - Announce changes to user(s)
   - Provide testing instructions
   - Gather feedback (especially fairness perception)
   - Document any issues for next phase

4. **Validation Period**:
   - Phase 0: 1-2 days
   - Phase 1: 1 week (critical algorithm change)
   - Phase 2: 3-5 days
   - Phase 3: 2-3 days
   - Phase 4: 1 week

### Rollback Procedures:

Each phase should be feature-flagged or easily revertable:
- Keep old algorithm code commented/archived
- Use localStorage version key to detect migrations
- Git tags allow quick rollback to previous deployment

---

## Risk Assessment

| Phase | Risk Level | Main Risks | Mitigation |
|-------|-----------|-----------|------------|
| Phase 0 | Low | Build failures, environment issues | Test locally first, have rollback ready |
| Phase 1 | High | Algorithm slower/worse than current, user confusion about changes | Performance testing, side-by-side comparison, keep greedy as fallback |
| Phase 2 | Medium | Over-constrained schedules, impossible solutions | Relaxation strategy, clear constraint violation messaging |
| Phase 3 | Low | UX features have bugs, Excel parsing issues | Graceful degradation, CSV still works |
| Phase 4 | Low | Optional features, minimal risk | Can skip entirely if not needed |

---

## Success Metrics

### Phase 0 (Baseline):
- Schedule generation success rate: >95%
- User can complete end-to-end workflow: Yes/No

### Phase 1 (Key Performance Indicators):
- Late slot variance improvement: >50% reduction
- Weekend variance improvement: >40% reduction
- User satisfaction with fairness: Survey rating >4/5
- Algorithm performance: <30 seconds for 300 games

### Phase 2:
- Constraint violations: <5% of schedules have violations
- User-reported fairness complaints: <10% of previous level

### Phase 3:
- Excel upload success rate: >90%
- User workflow time reduction: 20% faster
- Mobile usage: >10% of sessions

### Phase 4:
- Template usage: >50% of users use templates
- Advanced features adoption: >20% of users

---

## Timeline Estimates

| Phase | Development | Testing | Deployment | Total |
|-------|------------|---------|------------|-------|
| Phase 0 | 1-2 hours | 1 hour | 30 min | ~3 hours |
| Phase 1 | 4-6 hours | 2 hours | 1 hour | ~8 hours |
| Phase 2 | 3-4 hours | 2 hours | 1 hour | ~7 hours |
| Phase 3 | 3-4 hours | 2 hours | 1 hour | ~7 hours |
| Phase 4 | 4-6 hours | 2 hours | 1 hour | ~9 hours |
| **Total** | | | | **~34 hours** |

**Recommended Cadence**: 1 phase per week with user validation between phases

---

## Next Steps

1. **Review this plan** with stakeholders
2. **Prioritize phases** - Phase 0 and 1 are most critical
3. **Get approval to proceed** with Phase 0
4. **Schedule user testing sessions** for validation periods
5. **Set up feedback collection mechanism** (form, email, etc.)

---

## Notes

- Each phase is designed to be **independently valuable**
- Phases 1-2 are **critical** for meeting PRD requirements
- Phase 3 is **polish** (nice to have)
- Phase 4 is **optional** (can skip if not needed)
- User testing feedback should inform priorities for subsequent phases
- Be prepared to adjust timeline based on complexity discovered during implementation

---

**Document Status**: Ready for Review
**Last Updated**: December 5, 2025
