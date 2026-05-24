# Late-slot fairness: introduce per-team Late Surplus

**Status:** Archived (2026-05-24) — implementation landed in commit `45291ed`; PRD §3.2.3 and ADR §5.3.1 reflect the change.
**Related:** [PRD §3.2.3](../prd.md#323-fairness-optimization), [ADR §5.3.1](../adr.md#531-fairness-scoring-function), [SettingsPanel UI](../../src/components/SettingsPanel.tsx)

## Review Summary

**Reviewed:** 2026-05-23 · **Reviewers:** VP Product, VP Engineering, VP Design (via plan-review-skill v2.0.0)

### Changes applied to this plan

| # | Issue # | Change |
|---|---------|--------|
| 1 | ✅ #1 (Critical) | Added `src/lib/csvExport.ts` to Files-to-change scope; field removal would otherwise fail typecheck. |
| 2 | ✅ #2 (Critical) | Corrected pinned-baseline reference from `convergence.test.ts` to `src/scheduler/__fixtures__/perf-baseline.json` (consumed by `perf.test.ts`). |
| 3 | ✅ #3 (Critical) | Added §"Compatibility with the v0.5 migration plan" reconciling metric repurposing with `lateSlotVarianceFlag` being a report-only field per v0.5 plan §395. |
| 4 | ✅ #4 (High) | Naming note: keep `worstVariance` field, rename UI column to "Late Surplus" so users see new semantics without re-reading the spec. *(Superseded by second-pass row #13 — the field itself was renamed to `lateSurplus` instead of kept.)* |
| 5 | ✅ #5 (High) | Fixed ADR §5.3.1 pseudo-code to compute variance **per division** (matches `scoring.ts`); previous draft iterated across all teams. |
| 6 | ✅ #7 (High) | Named the release-note owner and location (CHANGELOG.md or new `docs/release-notes-v0.5.md`). |
| 7 | ✅ #8 (High) | Added concentration-guard test spec — assert score(concentrated) > score(dispersed) — with a stated trigger to bump ×100 → ×200 if it fails. |
| 8 | ✅ #9 (Medium) | Documented strict-greater flag semantics inline in the canonical definition. |
| 9 | ✅ #10 (Medium) | Made the fairness.ts loop deletion explicit (lines 109-124, replace with single-pass aggregate). |
| 10 | ✅ #11 (Medium) | UI column renamed from "Worst Variance" to "Late Surplus". |
| 11 | ✅ #12 (Medium) | Added card-caption requirement to FairnessReport.tsx Section C so the report self-explains. |

### Deferred from first pass (not applied)

- ⏭️ **Issue #6 (High)** — `FairnessReport` interface drift in ADR §5 (the example shape doesn't match the real TS type). Pre-existing doc/code drift; full ADR realignment belongs to a separate doc PR.
- ⏭️ **Issue #13 (Low)** — Legacy `src/lib/__tests__/scheduleGenerator.test.ts` may produce confusing assertions after the metric change. The underlying `src/lib/scheduleGenerator.ts` is already marked deprecated; full deletion is a v0.5 finalization PR, not this one. (Reclassified — see second-pass changes.)

### Second-pass critique (external review, 2026-05-23)

| # | Critique point | Disposition |
|---|----------------|-------------|
| 12 | Report metric (`floor-based surplus`) and scoring metric (`statistical variance`) are not identical — optimizer can reduce variance while leaving one team at +3. | ✅ **Applied** — added `maxLateSurplus * 250` scoring term to align the optimizer with the report's flagged condition. Added an explicit "report vs. scoring" paragraph at the top of §Scoring. |
| 13 | Keeping `worstVariance` field name carries semantic debt; future readers will assume per-slot semantics. | ✅ **Applied** — renamed `worstVariance` → `lateSurplus` outright. No alias kept; `localStorage` does not persist this field. |
| 14 | Overloaded use of "variance" across UI, metric, and scoring. | ✅ **Applied** — explicit three-term glossary added to §Context (Late Surplus / late-game count variance / per-slot late variance). |
| 15 | Concentration guard tests scoring only, not generation. | ✅ **Applied** — guard upgraded to two levels: scoring (unit test) and generation (synthetic-fixture test). |
| 16 | Manual integration test anchors to the broken-state totals; if the implementation works, the totals should improve. | ✅ **Applied** — reframed as a *consistency* check (Total Late = sum of late columns; Late Surplus = Total Late − division min; etc.) with an additional "should not regress" assertion. |
| 17 | Floor-based metric can exaggerate unfairness when one team is an outlier. | ✅ **Applied (softer form)** — added an explicit caveat to §Metric and a skewed-floor test case (Test plan §6). Did not surface mean/stddev in the UI. |
| 18 | Edge cases (empty division, single-team division, no late slots, etc.) not specified. | ✅ **Applied** — explicit edge-case list added to §Metric; tests required in Test plan §4. |
| 19 | Setting `lateSlotVarianceFlag` name is semantically stale. | ✅ **Applied (deferred form)** — added required JSDoc comment at the field definition explaining new semantics. Full rename deferred to a future PR that adds settings-schema migration to `migrateStorageIfNeeded`. |
| 20 | Rollback wording overcounted source files. | ✅ **Applied** — simplified to describe categories of revertable changes, not a file count. |
| 21 | CSV breakage should be explicit in release notes. | ✅ **Applied** — added to §Risks alongside the existing setting-drift mitigation. |
| 22 | Legacy `scheduleGenerator.test.ts` should be touched if it runs in CI. | ✅ **Applied (investigation form)** — moved from "Deferred" to §Risks as an implementation-time check (skip or update offending assertions; no deprecation cleanup). |
| 23 | Untuned weights are a load-bearing magic constant. | ✅ **Applied** — §Scoring marks weights as starting values with named retune triggers and a convergence-test gate. |

### Third-pass critique (external review, 2026-05-23)

| # | Critique point | Disposition |
|---|----------------|-------------|
| 24 | Title still says "redefine variance" while doc has moved to Late Surplus terminology. | ✅ **Applied** — renamed to "Late-slot fairness: introduce per-team Late Surplus". |
| 25 | Scope bullet still echoes the old "Late Slot Variance Flag setting" label. | ✅ **Applied** — bullet now reads "Late Surplus flag setting description, backed by the existing `lateSlotVarianceFlag` field". |
| 26 | **Zero-game team breaks the floor.** A team with no scheduled games has `totalLateGames = 0` and becomes the division floor, inflating every other team's surplus and creating false unfairness in the report. | ✅ **Applied** — `divisionFloor` is now defined over `scheduledTeams(d)`. Edge-case section, §Metric rationale, and a dedicated test (Test plan §7) all updated. |
| 27 | "Negative-clamped" wording in zero-game edge case contradicts the later "negatives can't occur" assertion. | ✅ **Applied** — removed the contradictory phrase; the new edge-case text reads cleanly. |
| 28 | `maxLateSurplus × 250` is linear, but user perception of unfairness is super-linear on outliers. | ✅ **Applied (softer form)** — kept linear ×250 as default because the statistical-variance term already captures spread non-linearity and squaring at ×250 would dominate the variance term. Documented `maxLateSurplus² × 50` as a retune path if outliers persist. |
| 29 | Generation-level concentration test may become brittle if SA dynamics shift. | ✅ **Applied** — added explicit "regression smoke test, not mathematical proof" disclaimer with a demote-to-fixture escape hatch. |
| 30 | "At least one team no longer flagged" integration assertion is too strong; can fail on a working implementation when the original had only one barely-flagged team. | ✅ **Applied** — reframed as "reduce `maxLateSurplus` or late-game-count variance; flag count must not increase". |
| 31 | Report-only setting contract is intentional but should be explicitly called out. | ✅ **Applied** — added "Future consideration" note to §Compatibility flagging direct-threshold optimization as a sensible v0.6+ follow-up. |
| 32 | Floor population can shift between regenerations if roster changes. | ✅ **Applied** — added explicit "Floor stability" paragraph in §Metric so a future reader doesn't mistake shifting surpluses for a bug. |
| 33 | No test for the new zero-game-team rule. | ✅ **Applied** — Test plan §7 added (5-team division, one team with 0 games, asserts floor = 5 not 0, surpluses computed against scheduled teams only). |

### Fourth-pass critique (external review, 2026-05-23)

| # | Critique point | Disposition |
|---|----------------|-------------|
| 34 | First-pass row #4 (keep `worstVariance` field) is contradicted by second-pass row #13 (rename to `lateSurplus`); reads as a contradiction for a top-to-bottom scanner. | ✅ **Applied** — row #4 now carries an italicized "Superseded by second-pass row #13" pointer. Audit trail preserved. |
| 35 | **Scoring population must equal report population.** Plan defines `divisionFloor` over `scheduledTeams(d)` but §Scoring text doesn't specify the same restriction on the variance / max-surplus / per-slot terms. Risk: a future reader implements scoring across all rostered teams; optimizer minimizes a different quantity than what the report shows. | ✅ **Applied** — added an explicit "Population alignment" paragraph at the top of §Scoring stating all three terms use `scheduledTeams(d)`. ADR pseudo-code already filters `scheduledDivTeams` for all three subterms. |
| 36 | Unscheduled team shown with Status "OK" is misleading — looks like the team was scheduled fairly. | ✅ **Applied (deferred form)** — added a "Known UX gap (future PR)" note to the zero-game edge case calling for a distinct "No games" status. Defer the UI work to a focused follow-up; this PR keeps OK to avoid expanding the status surface mid-metric-change. |
| 37 | Per-slot variance term may be distorted by unscheduled teams (zeros across every slot). | ✅ **Applied** — covered by #35's population-alignment paragraph; ADR §5.3.1 pseudo-code's 1c block already filters `scheduledDivTeams`. |
| 38 | Rollback line references `worstVarianceSlot` only; should also restore `worstVariance` (which was renamed, not just removed). | ✅ **Applied** — rollback now reads "restore both `worstVariance: number` (renamed to `lateSurplus`) and `worstVarianceSlot: string` (removed entirely)". |

## Context

The current fairness model measures **late-slot variance per individual late time slot**, within division. In practice this hides material unfairness on the metric league commissioners actually care about: total late-game count per team.

A real Division-A run produced this Time Slot Distribution:

| Team   | 8:45 | 9:00 | 9:45 | 10:15 | **Total late** |
|--------|------|------|------|-------|----------------|
| Team 1 | 1    | 4    | 4    | 1     | 10             |
| Team 2 | 1    | 4    | 4    | 0     | **9** (floor)  |
| Team 3 | 1    | 4    | 4    | 1     | 10             |
| Team 4 | 2    | 5    | 4    | 1     | **12** (+3)    |
| Team 5 | 1    | 5    | 4    | 1     | 11 (+2)        |

Per-slot variance reports every team at "+1 OK" because no team is more than +1 above the floor on any individual slot. But Team 4 plays three more late games in total than Team 2 — a complaint waiting to happen.

The fix: introduce a per-team **Late Surplus** metric (`totalLateGames(t) − divisionFloor(d)`) as the headline number in the report, drive the optimizer toward equalizing total late games per team, and keep the per-slot variance term in scoring at a downweighted multiplier so the optimizer doesn't pile a team's late games onto the 10:15 slot specifically.

**Terminology used throughout this doc** — three distinct concepts; don't conflate them:

| Term | What it is | Where it lives |
|------|------------|----------------|
| **Late Surplus** | Per-team integer: `totalLateGames(t) − divisionFloor(d)`. User-facing. | Report (UI + CSV), flagging logic, `TeamStats.lateSurplus`. |
| **Late-game count variance** | Statistical variance of `totalLateGames` across teams in a division. | Scoring objective (primary). |
| **Per-slot late variance** | Statistical variance per individual late time slot across teams in a division. | Scoring objective (secondary, prevents concentration). |

## Scope

In scope:
- Scoring function (`src/scheduler/scoring.ts`).
- Fairness report computation (`src/scheduler/fairness.ts`) and the `TeamStats` type (`src/types/scheduler.ts`).
- Late Slot Fairness Summary table (`src/components/FairnessReport.tsx`).
- Late Surplus flag setting description (`src/components/SettingsPanel.tsx`), backed by the existing `lateSlotVarianceFlag` settings field (renamed deferred — see §Settings UI).
- PRD §3.2.3 and §3.7.1 wording.
- ADR §5.3.1 scoring table and pseudo-code.
- Pinned convergence baseline regeneration.

Out of scope:
- Day-assignment, matchup-build, simulated-annealing inner loop, home/away assignment, worker plumbing — none change.
- The `Schedule` / `FairnessReport` outer shapes.
- The `lateSlotVarianceFlag` default value (`+2`) or its 1–5 dropdown range.

## Design

### Metric (canonical definition)

For each division `d` and team `t ∈ d`:

```
totalLateGames(t)   = Σ over s ∈ lateTimeSlots of gamesAt(t, s)
scheduledTeams(d)   = teams in d that appear in at least one scheduled game
divisionFloor(d)    = min over t ∈ scheduledTeams(d) of totalLateGames(t)    // empty division → 0
lateSurplus(t)      = totalLateGames(t) − divisionFloor(d)
flagged(t)          = lateSurplus(t) > settings.lateSlotVarianceFlag    // strict-greater: a team at exactly +flag is NOT flagged; matches existing per-slot semantics at fairness.ts:120
```

**Why "scheduled teams" and not "all teams" for the floor?** A team that hasn't been scheduled yet (or was excluded from this season) has `totalLateGames = 0`. If included in the floor, it would make every actually-scheduled team's surplus look artificially inflated against a non-competitor. Restricting the floor population to scheduled teams keeps the report meaningful in mid-build, partial-roster, and post-removal states.

The metric compares each team against the divisional **floor** (not the mean) to match the user-facing question — "how many more late games am I playing than the team with the fewest?" — and to keep the displayed integer interpretable. The trade-off: an outlier scheduled team with unusually few late games still makes everyone else's surplus look worse. This is acceptable because the surplus value still answers a question users actually ask; the skewed-floor case is covered by an explicit test (see Test plan §6).

**Floor stability.** The floor population is deterministic per schedule but can shift between regenerations if the roster changes (a team is added, removed, or its game count drops to zero). This is intentional — the floor reflects the schedule that exists, not a frozen baseline. Document this in the implementation so a future reader doesn't read shifting surplus values as a bug.

**Edge cases** (all behave intentionally — covered by `fairness.test.ts`):

- **Empty division** (0 teams): skip; no entries in the report.
- **Single-team division** (1 team, scheduled): `divisionFloor` equals that team's total; `lateSurplus` is 0; never flagged.
- **No configured late slots** (`lateTimeSlots` empty): `totalLateGames` is 0 for every team; no team flagged; UI shows the "Total Late" column as all zeros.
- **Late slot configured but not present in this season's schedule**: the slot contributes 0 to every team's `totalLateGames`. No special handling needed.
- **Team with zero scheduled games**: excluded from the `divisionFloor` calculation per the §Why "scheduled teams" rationale above. The unscheduled team still appears in the report with `totalLateGames = 0` and `lateSurplus = 0` (since it's also excluded from comparison), and is never flagged. *Known UX gap (future PR):* an unscheduled team shown with Status "OK" looks like it was scheduled fairly. A follow-up PR should introduce a distinct status — e.g. "No games" — so commissioners can tell the difference between "scheduled and fair" and "not in this season." This PR keeps OK to avoid expanding the status surface area mid-metric-change.
- **All teams in a division have zero scheduled games**: `scheduledTeams(d)` is empty; `divisionFloor(d)` defaults to 0; every team reports `totalLateGames = 0`, `lateSurplus = 0`, `lateSlotFlagged = false`. No division-wide report entry crash.
- **Negative surplus**: cannot occur by construction (every scheduled team's total is ≥ floor by definition of `min`). The implementation asserts `lateSurplus >= 0` at the end of the per-division pass as a tripwire; a failure here points at a bug in `scheduledTeams` filtering or `divisionFloor` computation.

### Scoring (optimization objective)

The optimizer uses **statistical variance** of total late-game counts as its smooth search objective; the report uses **floor-based surplus** because surplus is more interpretable to users. These metrics are intentionally related but not identical — minimizing statistical variance generally reduces surplus too, but the optimizer can leave one team with a high surplus if that's cheaper than other moves. The `maxLateSurplus` term below directly penalizes the user-visible flagged condition, closing that gap.

**Population alignment.** All three late-slot scoring terms below — total late-game count variance, max Late Surplus, and per-slot late variance — are computed over `scheduledTeams(d)` only, **the same population used by the report's floor calculation**. Including unscheduled teams (each with zero counts) would distort every term: it would lower the means, inflate the variances, and shift the floor toward zero. Keeping scoring and reporting on the same population is what makes the optimizer's objective and the report's flag condition mean the same thing.

Per division, the score gains a primary aggregate term plus a max-surplus alignment term, and the existing per-slot variance is downweighted:

| Term | Weight | Purpose |
|------|-------:|---------|
| **Total late-game count variance** (statistical variance of `totalLateGames` across teams) | **×1000** | Primary fairness signal. Equalizes how many late games each team plays. |
| **Max late surplus** (`max(lateSurplus(t))` over teams in division) | **×250** | Aligns the optimizer with the report — directly penalizes the worst single-team gap above the floor. |
| Per-individual-late-slot variance (existing computation) | **×100** (was ×1000) | Secondary signal. Prevents a team's late games from concentrating on the latest slot specifically. |
| Weekend variance | ×100 | Unchanged. |
| Consecutive-week same-opponent | ×50 | Unchanged. |
| Rest-day violations | ×25 | Unchanged. |
| `maxGamesPerWeek` excess | ×10000 | Unchanged. Hard constraint. |

**Weights are starting values, tunable.** The ×1000 / ×250 / ×100 ratios were chosen to make total-late count variance the dominant signal, max-surplus a meaningful tiebreaker, and per-slot a soft nudge. If the convergence fixture (Phase 3) shows schedules still produce flagged teams when statistical variance is acceptable, raise `×250` toward `×500`. If teams' late games concentrate on the latest slot, raise the per-slot term from `×100` toward `×200`. Both retunes are one-line changes; the convergence test gates the choice.

**Linear vs squared max-surplus.** The plan uses linear `maxLateSurplus × 250` because the existing statistical-variance term already captures non-linearity in the *spread* and squaring `maxLateSurplus` would double-count (and at ×250 would dominate the ×1000 variance term: a +3 max gives 9×250 = 2250 vs variance contributions of ~1000). A reasonable retune path if outliers persist: switch to `maxLateSurplus² × 50` (keeps the magnitudes balanced) and reaffirm the convergence baseline. Do not square without lowering the weight; the SA accept/reject dynamics get unstable when one term dominates.

**Concentration guard — two-level.** The per-slot multiplier protects against a real regression, so the guard is tested at two levels:

1. *Scoring level* (`fairness.test.ts`): paired-case unit test. Construct two assignments where aggregate late-game totals are identical, but in one layout Team X has all its late games stacked on the latest slot and in the other they're dispersed. Assert `score(concentrated) > score(dispersed)`.
2. *Generation level* (`fairness.test.ts` or `convergence.test.ts`): given a small synthetic division on a fixed seed where a dispersed solution is reachable, assert that `generateSchedule(...)` does not produce a layout where any team has all its late games on the latest slot. This catches optimizer-level failures the scoring test cannot — e.g., the score function prefers the right answer but the SA loop never finds it.

A failed level-1 assertion → raise the per-slot multiplier from ×100 to ×200. A failed level-2 assertion with level-1 still passing → investigate the SA neighbour selection (`slotOptimizer.ts:88-103`), not the score function.

Treat the level-2 generation test as a **regression smoke test, not a mathematical proof**. SA on a fixed seed should be deterministic across runs of the same build, but small refactors (neighbour-selection logic, RNG draw order, scoring weight changes) can shift outputs even when the change is correct. If this test becomes flaky, demote it to a manual `convergence.test.ts` fixture rather than weakening the level-1 scoring guarantee — the unit test is the load-bearing guard, the generation test is a sanity check.

### Report

`TeamStats` field changes (`src/types/scheduler.ts`):

- **Add** `totalLateGames: number` — denominator-free per-team aggregate, surfaced as the headline column.
- **Rename** `worstVariance: number` → **`lateSurplus: number`**. Carries the new meaning (`totalLateGames − divisionFloor`) with a name that says so. No compatibility alias kept — `localStorage` does not persist `TeamStats` (the store recomputes fairness on load per `useSchedulerStore.ts:56`), CSV is regenerated each export, and there is no external consumer. The few callsites (`fairness.ts`, `FairnessReport.tsx`, `csvExport.ts`) are updated in lockstep.
- **Remove** `worstVarianceSlot: string` — no longer meaningful when the metric is aggregate; the per-slot grid in Time Slot Distribution already shows where games landed.
- `lateSlotFlagged: boolean` — semantics unchanged; flag predicate becomes `lateSurplus > settings.lateSlotVarianceFlag`.
- `weekendFlagged` and all other fields — unchanged.

Late Slot Fairness Summary columns become: **Team | Division | Total Late | Late Surplus | Status**. Status badge logic unchanged. The "Slot" column is dropped.

**Card caption.** Add a small muted-text caption directly under the Late Slot Fairness Summary `CardTitle` in `FairnessReport.tsx` reading "Total late games per team, compared against the division minimum." This mirrors the SettingsPanel description so users see the new semantics in the report itself, not only in the settings drawer.

### Settings UI

Update the `lateSlotVarianceFlag` description text in `SettingsPanel.tsx` from "…at any specific late time slot" to "…in total than the team with the fewest in their division". Setting value, dropdown range (`1–5`), and default (`+2`) unchanged.

**Setting name (deferred rename).** The setting is still called `lateSlotVarianceFlag` in code even though it no longer bounds a variance — it bounds Late Surplus. Renaming would break existing `localStorage` settings unless a schema migration is added to `migrateStorageIfNeeded` (`useSchedulerStore.ts:22`), which the store currently doesn't do. Add an explanatory comment at the field definition (`src/types/scheduler.ts` `SchedulerSettings` interface):

```ts
/**
 * Maximum allowed Late Surplus (total late games above the division minimum)
 * before a team is flagged. Historical field name; kept for localStorage compatibility.
 */
lateSlotVarianceFlag: number;
```

A clean rename to `lateSurplusFlag` (or similar) belongs to a future PR that adds a settings-schema migration step.

## Compatibility with the v0.5 migration plan

`docs/v0.5-migration-plan.md:395` asserts that `lateSlotVarianceFlag` is a *report-only* field that affects flagging, not generation. That contract is preserved here at the field level — the setting still only changes when a team is flagged in the report. What changes is the **metric** the threshold bounds: it now compares aggregate late-game totals rather than per-individual-slot counts. The optimizer is driven by the hardcoded scoring weights, not by this setting. A forward pointer is added at `docs/v0.5-migration-plan.md:395`.

**Future consideration.** Letting the optimizer optimize *directly against* the configured Late Surplus threshold (e.g., a hard penalty when `lateSurplus > setting`) is a sensible next step but is intentionally out of scope here to preserve the v0.5 report-only contract. Re-evaluate after the new metric has shipped and we have field data on whether commissioners want the threshold to drive generation or just flagging.

## Files to change

```
src/types/scheduler.ts                 # TeamStats: add totalLateGames, rename worstVariance → lateSurplus, remove worstVarianceSlot; SchedulerSettings: add doc-comment on lateSlotVarianceFlag
src/scheduler/fairness.ts              # delete per-slot lateTimeSlots loop (lines 109-124); replace with one pass that sums totalLateGames per team, derives divisionFloor, sets lateSurplus = total − floor and lateSlotFlagged = lateSurplus > setting
src/scheduler/scoring.ts               # add per-division aggregate ×1000 + maxLateSurplus ×250; downweight per-slot variance ×1000 → ×100
src/components/FairnessReport.tsx              # table column swap (drop Slot)
src/components/SettingsPanel.tsx               # description text
src/lib/csvExport.ts                           # drop "Slot" column from LATE SLOT FAIRNESS SUMMARY block (mirrors UI)
src/scheduler/__fixtures__/perf-baseline.json  # regenerate pinned bestScore (scoring objective changed)
src/scheduler/__tests__/perf.test.ts           # ±25% baseline gate stays; baseline value refreshes
src/scheduler/__tests__/fairness.test.ts       # NEW FILE — add aggregate-variance + concentration-guard tests
docs/prd.md                            # §3.2.3, §3.4 example, §3.7.1
docs/adr.md                            # §5.3.1 scoring table + pseudo-code
```

No changes to `dayAssignment.ts`, `matchups.ts`, `slotOptimizer.ts`, `homeAway.ts`, `worker.ts`, the Zustand store, or `Schedule` / `FairnessReport` outer types.

## Test plan

1. **Unit (canonical metric)** — `fairness.test.ts` constructs a hand-crafted schedule with known per-team late totals across two slots and asserts `lateSurplus = total − floor` for every team in each division.
2. **Unit (concentration guard level 1)** — paired-case test described under §Concentration guard above.
3. **Generation test (concentration guard level 2)** — described under §Concentration guard above.
4. **Edge cases** — `fairness.test.ts` covers every case enumerated under §Metric (canonical definition) — empty division, single-team division, no late slots, configured-but-absent late slot, team with zero games. Negative surplus is checked via runtime invariant inside `fairness.ts`.
5. **Convergence / perf baseline** — regenerate `src/scheduler/__fixtures__/perf-baseline.json` (consumed by `perf.test.ts`; the ±25% gate). The scoring objective shifted, so the baseline value moves. Re-read `convergence.test.ts` after the change: it currently asserts weekend-variance bounds and is not pinned to `bestScore`, but its scoring-related assertions should be confirmed still meaningful under the new objective; update if they reference removed semantics.
6. **Skewed-floor case** — `fairness.test.ts` constructs a division where one team has unusually few late games (e.g., 2) and the rest are clustered (10–11). Asserts every other team's `lateSurplus` is computed correctly and that flagging behaves as designed (commissioners can see the outlier's effect). The point is to confirm intentional behavior, not regress against it.
7. **Zero-game-team case** — `fairness.test.ts` constructs a division with five teams where one team has 0 scheduled games and the others have 5/6/6/7 late games. Assert: the unscheduled team is excluded from the floor calculation; the floor is 5 (not 0); surpluses for the four scheduled teams are 0/1/1/2; the unscheduled team's row shows Total Late 0 / Late Surplus 0 / Status OK.
8. **Integration / consistency** — regenerate the 142-slot / 12-team season with the same seed previously used to produce the 9/10/10/11/12 totals. Do **not** assert the old totals; the scoring change may improve the distribution. Instead, assert:
   - **Internal consistency**: for every team, Total Late equals the sum of its row in the Time Slot Distribution late columns; Late Surplus equals Total Late minus the minimum Total Late among *scheduled* teams in its division; Status is OK iff Late Surplus ≤ `lateSlotVarianceFlag` (strict-greater triggers FLAG).
   - **Non-regression against the scoring objective**: the generated schedule reduces either `maxLateSurplus` or the late-game-count variance compared to the original-output baseline (or both). The number of Late Surplus flags does not increase.
9. **Reproducibility** — generate twice with the same seed via "Reproduce"; totals identical.
10. **Standards** — `npm run lint`, `npm run build`, `npm run audit:standards` all green.

## Risks and mitigations

- **Per-slot regression.** Downweighting the per-slot term to ×100 could allow one team to receive all late games on the latest slot if total counts match. Mitigation: the two-level concentration guard (Test plan §2-3) catches both scoring- and generation-level regressions. If observed, re-tune to ×200.
- **Weight-tuning drift.** The ×1000 / ×250 / ×100 ratios are starting values, not derived from first principles. Mitigation: the convergence fixture (`convergence.test.ts`) is the gate for any retune; weights live on three named constants in `scoring.ts` so retunes are one-line.
- **Baseline churn.** Pinned `bestScore` baseline must be regenerated. This is a one-time cost; the ±25% tolerance absorbs ongoing drift.
- **Setting interpretation drift.** Users who already configured `lateSlotVarianceFlag` will see different flagging behaviour after this lands. Mitigation: (a) the SettingsPanel description change makes the new semantics explicit; (b) the Late Slot Fairness Summary card gains a one-line caption ("Total late games above division minimum"); (c) the implementing PR adds a release-note entry — appended to `CHANGELOG.md` if one exists, otherwise created as `docs/release-notes-v0.5.md` — calling out the redefinition and the CSV-column change.
- **CSV-format breakage.** The `LATE SLOT FAIRNESS SUMMARY` CSV block drops the **Slot** column and renames **Worst Variance** to **Late Surplus**. Mitigation: the release note explicitly documents the new column set (Team, Division, Total Late, Late Surplus, Status) so commissioners with downstream spreadsheets can update their references.
- **Legacy test confusion.** `src/lib/__tests__/scheduleGenerator.test.ts` may reference the old per-slot semantics. During implementation, run the test suite and either skip or update offending assertions — but do not start a full deprecation cleanup of `src/lib/scheduleGenerator.ts` here.

## Rollback

Revert the implementation PR — source changes, test additions, regenerated perf baseline, and the PRD / ADR documentation edits ride together. If reverting to the old per-slot report model, restore both `worstVariance: number` (renamed to `lateSurplus`) and `worstVarianceSlot: string` (removed entirely) on `TeamStats`. No data migration is needed: `localStorage` does not persist fairness data; the report is recomputed on load (`useSchedulerStore.ts:56`).
