# **Beer League Hockey Scheduler**

Architecture Document v1.0

# **1. Design Philosophy**

This is a single-user tool for one league commissioner. We optimize for shipping fast and keeping things simple. The guiding principles:

* **Ship the simplest thing that works.**

* No backend unless we absolutely need one.

* Fairness algorithm is the hard part — invest effort there.

* Everything else is just plumbing.

* Isolate the algorithm so we can rip it out and improve later.

# **2. Key Architectural Decisions**

## **2.1 Client-Side Only**

All computation happens in the browser. No server, no database, no auth. The commissioner's laptop can handle 300 games in under 30 seconds. Benefits: zero hosting cost, instant deployment, no cold starts.

## **2.2 "Good Enough" Algorithm**

Finding a mathematically optimal schedule for 150+ games with soft constraints is NP-hard and would take hours. Instead, we use simulated annealing to find a "statistically very good" solution in 5-15 seconds. In practice, the output is indistinguishable from optimal — no team will have legitimate grounds to complain.

## **2.3 Determinism with Seed**

The algorithm is non-deterministic by default (uses Math.random). This lets the commissioner "regenerate" and pick the best of several schedules. However, we store the random seed used so any schedule can be reproduced if needed.

## **2.4 Modular Algorithm**

The scheduler is isolated in its own module with a clean interface. If we later need to swap in OR-Tools, a genetic algorithm, or a constraint solver, we only touch that module. The rest of the app doesn't care how the schedule was generated.

# **3. Tech Stack**

| Layer | Choice & Rationale |
| :---- | :---- |
| Framework | React + TypeScript. Type safety helps with complex algorithm logic. React is boring and works. |
| Build Tool | Vite. Fast dev server, simple config, good defaults. |
| Styling | Tailwind CSS. Utility classes, no custom CSS files to manage. |
| State | React Context + useReducer. Overkill to add Redux/Zustand for a single-user app. |
| Persistence | localStorage. Simple, built-in, sufficient for one user. |
| File Parsing | PapaParse (CSV) + SheetJS (Excel). Battle-tested libraries. |
| Hosting | Vercel. Free tier is plenty. Git push to deploy. |

# **4. Data Schemas**

All data is defined in TypeScript interfaces. These are the core types that flow through the application.

## **4.1 Input Types**

```ts
// An available ice slot from the uploaded CSV/Excel
interface IceSlot {
  id: string;           // UUID, generated on import
  date: string;         // ISO date: '2025-01-15'
  startTime: string;    // 24h format: '21:15'
  dayOfWeek: number;    // 0=Sun, 1=Mon, ..., 6=Sat
  isLate: boolean;      // true if >= lateThreshold
  isWeekend: boolean;   // true if Fri (5) or Sat (6)
}

// A team entered by the commissioner
interface Team {
  id: string;           // UUID
  name: string;         // 'Sluggers'
  division: 'A' | 'B';
}
```

## **4.2 Schedule Types**

```ts
// A scheduled game (output of the algorithm)
interface Game {
  id: string;           // UUID
  slotId: string;       // References IceSlot.id
  homeTeamId: string;   // References Team.id
  awayTeamId: string;   // References Team.id
  division: 'A' | 'B';
}

// The complete generated schedule
interface Schedule {
  games: Game[];
  seed: number;         // Random seed used (for reproducibility)
  generatedAt: string;  // ISO timestamp
  fairnessScore: number; // Lower is better
}
```

## **4.3 Configuration Types**

```ts
interface Settings {
  lateGameThreshold: string;   // '20:45' (8:45pm)
  lateSlotVarianceFlag: number; // Flag if Late Surplus > this (default: 2). Field name kept for storage compatibility.
  weekendVarianceFlag: number;  // Flag if weekend-game count exceeds the division minimum by more than this (default: 3)
  maxGamesPerWeek: number;      // Hard cap (default: 3)
  // --- added in v0.6 ---
  primeWindowStart: string;     // '17:45'. Bands: afternoon < primeWindowStart
                                // <= prime < lateGameThreshold <= late. Only the lower
                                // bound is stored; the upper bound is lateGameThreshold.
                                // NOTE: this does NOT make invalid states unrepresentable —
                                // primeWindowStart >= lateGameThreshold silently collapses
                                // the prime band, so a Zod schema enforces the ordering at
                                // the form boundary and on load.
}

Same-day games are an **invariant, not a setting**: a team never plays twice on one
calendar date. Band balancing is likewise always on. Both were considered as settings
and cut — neither has an answer a commissioner could sensibly give.
```

## **4.4 Fairness Report Types**

> **Drift notice.** The shapes below are the original design and no longer match
> the code. The implemented `TeamStats` / `FairnessReport` live in
> `src/types/scheduler.ts` and differ substantially — notably they are keyed by
> **team name** rather than `teamId`, and expose `lateSurplus` / `lateSlotFlagged`
> per team instead of a separate `lateGameVarianceByTeam` map. Treat
> `src/types/scheduler.ts` as authoritative for these types.

```ts
interface TeamStats {
  teamId: string;
  totalGames: number;
  homeGames: number;
  awayGames: number;
  // Map of startTime -> count (e.g., '21:15' -> 4)
  gamesByTimeSlot: Record<string, number>;
  // Map of dayOfWeek -> count (e.g., 5 -> 6 for Friday)
  gamesByDay: Record<number, number>;
  fridayGames: number;
  saturdayGames: number;
  // Map of opponentId -> count
  gamesByOpponent: Record<string, number>;
}

interface FairnessReport {
  teamStats: TeamStats[];
  // Per-team aggregate: totalLateGames(team) − divisionFloor(team.division)
  lateGameVarianceByTeam: Record<string, number>;
  weekendVariance: number;
  flaggedTeams: string[];  // Team IDs exceeding thresholds
}
```

# **5. Scheduling Algorithm**

This is the heart of the application. The algorithm runs in four phases, each building on the previous. The entire process targets completion in under 15 seconds on a modern browser.

## **5.1 Phase 1: Slot-Block Assignment**

> **v0.6 — shipped** (DAV-201/202/203). This phase previously assigned whole *dates* to divisions. It now
> assigns **contiguous slot blocks**, because whole-date assignment structurally forces
> same-day double-headers. A date carrying 6 slots handed to an 8-team division yields
> 12 team-appearances over 8 teams — by pigeonhole at least 4 teams must play twice,
> before the optimizer makes a single choice. On a real 236-slot season this produced
> 92 forced extra games including 10 triple-headers.
>
> ### Blocking rule
>
> ```
> maxBlock(division) = floor(teamCount(division) / 2)     // 4 for an 8-team division
>
> for each date, slots sorted by startTime:
>   slotCount <= maxBlock  ->  assign the whole date (proportional greedy, below)
>   slotCount >  maxBlock  ->  split into contiguous blocks, largest legal block first
>                              (6 slots / 8 teams -> 4 + 2), alternating which division
>                              receives the leading block
> ```
>
> Blocks are **contiguous** by construction. This is not incidental: the one-division-per-date
> rule exists so teams in a division overlap at the rink and socialise afterwards, and a
> contiguous run preserves that. A 4-block is the ideal case — 8 appearances over 8 teams
> means every team plays exactly once and the whole division is present.
>
> Split-required dates are allocated **first, chronologically** (they are budget-inelastic);
> whole dates are then greedied against the remaining budget. **At most one block per
> division per date**, which makes contiguity unconditional. Where `slotCount` exceeds the
> combined `maxBlock` of both divisions, placing every slot without a same-day game is
> arithmetically impossible. This does not arise in practice: ice is booked against the
> league's own capacity, so `slotsOnDate <= maxBlock(A) + maxBlock(B)` holds for any
> properly-configured season. **Every ice slot must be used** is therefore an
> unconditional invariant (`games.length === iceSlots.length`). Overflow is reachable only
> via a misconfigured roster (e.g. 8-vs-1 teams, where the single-team division receives
> no slots and the other caps at 4 games per date); that is caught by the pre-generation
> feasibility warning, with a tripwire assertion as backstop.
>
> **Cross-division scope.** Only slot *count* is balanced across divisions. Late and prime
> supply are deliberately not equalised between divisions — there is no cross-division play,
> so the comparison has no audience (PRD §3.2.1 rule 3).

### Pre-v0.6 date-level algorithm (still used for whole dates)

Assign each calendar date (with all its ice slots) to exactly one division. **Primary goal: balance games-per-team across all divisions to ±1 (PRD §3.2.2 priority 1).** Secondary goals (tiebreakers, in order):

* Balance Friday game-days between divisions
* Balance Saturday game-days between divisions
* Balance late slots between divisions
* Alternate divisions roughly (A, B, A, B...) where the above leave room

### Algorithm — proportional-target greedy assignment

1. **Compute targets.** `total_team_games = 2 × total_slots`; `target_per_team = total_team_games / total_teams` (a real number). For each division `d`, `target_slots[d] = round(team_count[d] × total_slots / total_teams)`. If `sum(target_slots) ≠ total_slots` after rounding, nudge the largest target up or down by 1 so the budgets sum exactly.
2. **Group and sort.** Group slots by date. Sort dates by `(slot_count_on_date desc, date asc)` — large-impact dates first so they can't push a division past its budget later.
3. **Greedy assign.** For each date in sorted order, assign it to the division with the largest remaining budget (`target_slots[d] − assigned_slots_so_far[d]`). *(v0.6: the Friday/Saturday/late tiebreakers described here were removed. Block assignment is fully deterministic and ignores `settings`; cross-division balance of late or weekend ice is no longer a goal — see PRD §3.2.1 rule 3, since there is no cross-division play. Where the budget-leading division cannot host a date whole, the date is **split** rather than reassigned.)*
4. **Feasibility check.** After assignment, verify `floor(target_per_team) ≤ games_per_team[d] ≤ ceil(target_per_team)` for every division. If not, return `{ ok: false, reason }` to the caller (which surfaces a warning in the Ice Times tab); otherwise return `{ ok: true }` alongside the date→division map. *(**Shipped in v0.6.** The check is deliberately **warning-only**: `generateSchedule` no longer returns early on `!feasibility.ok`, because doing so handed the user an empty schedule for any mix that could not split evenly. The reason is returned as structured numbers — `gamesPerTeam` and `allowedRange` — so the UI phrases its own sentence, and is surfaced on both the Ice Times and Teams tabs.)* The post-run invariant in `scheduler/index.ts` is the final backstop if SA produces a violating schedule despite a feasible allocation.

**Pseudo-code:**

```ts
function assignDaysToDivisions(
  slots: IceSlot[],
  teams: Team[]
): { ok: true; map: Map<string, Division> } | { ok: false; reason: string } {
  const totalSlots = slots.length;
  const totalTeams = teams.length;
  const teamCount = countByDivision(teams); // { A: n, B: m }

  // 1. Compute per-division slot budgets
  const target: Record<Division, number> = {
    A: Math.round(teamCount.A * totalSlots / totalTeams),
    B: Math.round(teamCount.B * totalSlots / totalTeams),
  };
  if (target.A + target.B !== totalSlots) {
    // Nudge the larger budget to absorb rounding
    const larger = target.A >= target.B ? 'A' : 'B';
    target[larger] += totalSlots - (target.A + target.B);
  }

  // 2. Group slots by date, sort by (slotCount desc, date asc)
  const slotsByDate = groupBy(slots, s => s.date);
  const dates = Object.keys(slotsByDate).sort((a, b) => {
    const diff = slotsByDate[b].length - slotsByDate[a].length;
    return diff !== 0 ? diff : a.localeCompare(b);
  });

  // 3. Greedy assignment by remaining budget
  const assignment = new Map<string, Division>();
  const assigned: Record<Division, number> = { A: 0, B: 0 };
  const resourceTotals = { A: emptyResources(), B: emptyResources() };

  for (const date of dates) {
    const dateSlots = slotsByDate[date];
    const remaining: Record<Division, number> = {
      A: target.A - assigned.A,
      B: target.B - assigned.B,
    };
    const div = pickDivision(remaining, dateSlots, resourceTotals);
    assignment.set(date, div);
    assigned[div] += dateSlots.length;
    updateResources(resourceTotals[div], dateSlots);
  }

  // 4. Feasibility check
  const targetPerTeam = (2 * totalSlots) / totalTeams;
  for (const d of ['A', 'B'] as const) {
    const gpt = (assigned[d] * 2) / teamCount[d];
    if (gpt < Math.floor(targetPerTeam) || gpt > Math.ceil(targetPerTeam)) {
      return { ok: false, reason: `Division ${d} cannot reach ±1 games-per-team with current slot/team mix.` };
    }
  }
  return { ok: true, map: assignment };
}
```

**Tiebreak detail.** `pickDivision` chooses by `remaining_budget` first (largest wins). When `remaining.A === remaining.B`, it prefers the division most under-supplied on whichever resource this date carries most — Friday, Saturday, or late slots — using `resourceTotals`. Further ties fall back to alternation.

## **5.2 Phase 2: Matchup Generation**

Generate exactly `slotsNeeded` matchups per division, with per-pair frequency
balanced **by construction**. With N teams in a division, P = C(N, 2) unordered
pairs, and S slots available:

* base       = ⌊S / P⌋
* remainder  = S − base · P
* Every pair plays `base` games; `remainder` pairs play one extra game (base + 1)
* Per-pair spread ≤ 1 is guaranteed (every pair plays `base` or `base + 1`)
* Per-team game-count spread ≤ 1 follows from greedy bonus distribution
* This satisfies the post-run pairing-balance invariant (±1 per pair, per division)

Orientation (home vs. away) is irrelevant at this phase — Phase 4
(`assignHomeAway`) rewrites it globally based on home-game counts.

**Pseudo-code:**

```text
function buildBalancedPool(teams: Team[], slotsNeeded: number, rng: () => number): Matchup[] {
  const n = teams.length;
  if (n < 2 || slotsNeeded === 0) return [];

  // 1. Enumerate every unordered pair.
  const pairs: [Team, Team][] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      pairs.push([teams[i], teams[j]]);
    }
  }
  const P = pairs.length; // = C(n, 2)

  // 2. Base allocation: every pair plays `base` games.
  const base = Math.floor(slotsNeeded / P);
  const remainder = slotsNeeded - base * P;
  const pairCount = new Array(P).fill(base);
  const teamCount = new Map<string, number>();
  for (const t of teams) teamCount.set(t.id, base * (n - 1));

  // 3. Distribute `remainder` bonus games greedily — at each step pick the
  //    candidate pair whose two teams currently have the lowest combined
  //    total. Iterate in a seeded-shuffled order so ties are broken
  //    reproducibly. A pair can be bonused at most once (cap at base + 1).
  const order = shuffleWith(range(P), rng);
  for (let r = 0; r < remainder; r++) {
    let bestIdx = -1, bestSum = Infinity;
    for (const i of order) {
      if (pairCount[i] > base) continue; // already bonused
      const [a, b] = pairs[i];
      const sum = teamCount.get(a.id) + teamCount.get(b.id);
      if (sum < bestSum) { bestSum = sum; bestIdx = i; }
    }
    pairCount[bestIdx]++;
    teamCount.set(pairs[bestIdx][0].id, teamCount.get(pairs[bestIdx][0].id) + 1);
    teamCount.set(pairs[bestIdx][1].id, teamCount.get(pairs[bestIdx][1].id) + 1);
  }

  // 4. Emit the pool. Orientation is irrelevant (assignHomeAway rewrites it
  //    downstream); shuffle so consumers don't see runs of the same pair.
  const pool: Matchup[] = [];
  for (let i = 0; i < P; i++) {
    const [a, b] = pairs[i];
    for (let g = 0; g < pairCount[i]; g++) pool.push({ team1: a, team2: b });
  }
  return shuffleWith(pool, rng);
}
```

**Why not a trim-based approach?** An earlier implementation built a pool of
`⌈S / (2 · P)⌉` full round-robin rounds and trimmed surplus pairs greedily on
per-team game count. With S not divisible by `2 · P` (e.g. 62 slots over 6 teams,
P=15), the trimmer would drop multiple entries from the same pair while leaving
others untouched, producing per-pair spread up to 3 — which then violated the
post-run invariant. Constructing the pool from `base + remainder` removes that
failure mode entirely.

## **5.3 Phase 3: Slot Assignment (The Hard Part)**

This is where fairness optimization happens. We use simulated annealing to assign matchups to ice slots while minimizing unfairness.

### **5.3.1 Fairness Scoring Function**

The scoring function quantifies "unfairness" as a single number. Lower is better. We weight constraints by priority:

| Constraint | Weight | Rationale |
| :---- | :---- | :---- |
| **Total late-game count variance (per team)** | **1000** | Primary fairness signal per PRD §3.2.3. Equalizes how many late games each team plays in total. |
| Max late surplus (per division) | 250 | Aligns the optimizer with the user-visible flagged condition (`max(lateSurplus) > threshold`). |
| Per-individual-late-slot variance | 100 | Secondary signal. Prevents a team's late games from concentrating on the latest slot specifically. |
| Weekend variance | 100 | Second priority. Friday/Saturday games are undesirable. |
| Consecutive opponent penalty | 50 | Avoid playing same team in back-to-back weeks. |
| Rest day violation (<2 days) | 25 | Soft constraint. Less than 2 days rest is bad. |
| Max games/week violation | 10000 | Hard constraint. Massive penalty ensures this is never violated. |
| **Same-day game (per extra game)** | **5000** | v0.6 *(shipped)*. Above every soft term, below the hard weekly cap. Always on — same-day play is an invariant. Structural blocking (§5.1) does the real work; this penalises the remainder. |
| Prime-band total variance (per team) | 150 | v0.6 *(shipped; provisional pending Phase 5 tuning)*. Balances each team's total prime-time games; weighted below the late terms — where the two conflict, late fairness wins. Measured on the real season: prime spread fell from 4 (Div A) / 6 (Div B) to 1 / 1. |
| Afternoon-band total variance (per team) | 150 | v0.6 *(shipped; provisional)*. As above. Afternoon spread fell from 4 / 6 to 2 / 1. |

> **Band terms are per-band *totals*, not per-individual-slot.** Balancing all ten
> individual columns was considered and rejected: it adds five competing terms and is the
> most likely to fight the rigid late constraint. Per-band totals target the observed
> failure directly — on a real season one team drew 11 prime games and 3 afternoons while
> a divisionmate drew 5 and 9.

> **Note on the weekend term.** The pseudo-code below computes weekend penalty as
> `(max − min)² × 100` across all teams; `scoring.ts` computes per-division statistical
> variance × 100. The implementation is authoritative. The distinction is academic for
> seasons with no Friday/Saturday ice, which is common.

**Scoring Function Pseudo-code:**

```text
function calculateFairnessScore(games: Game[], slots: IceSlot[], teams: Team[]): number {
  let score = 0;
  const teamStats = computeTeamStats(games, slots);

  // 1. Late-game variance — computed PER DIVISION (matches scoring.ts which iterates
  //    a `divisions` set; a cross-division mean would conflate the two leagues).
  const lateTimeSlots = [...new Set(slots.filter(s => s.isLate).map(s => s.startTime))];
  for (const div of ['A', 'B'] as const) {
    const divTeams = teams.filter(t => t.division === div);
    if (divTeams.length === 0) continue;

    // Restrict to scheduled teams — a team with 0 games would otherwise become the
    // floor and inflate every other team's surplus (see PRD §3.2.3, late-fairness-redefinition.md §Metric).
    const scheduledDivTeams = divTeams.filter(t => teamStats[t.id].totalGames > 0);
    if (scheduledDivTeams.length === 0) continue;

    // 1a. Total late-game count variance per team (PRIMARY — equalizes total late burden)
    const totalLateByTeam = scheduledDivTeams.map(t =>
      lateTimeSlots.reduce((sum, ts) => sum + (teamStats[t.id].gamesByTimeSlot[ts] || 0), 0)
    );
    const lateMean = totalLateByTeam.reduce((s, c) => s + c, 0) / totalLateByTeam.length;
    const lateVar = totalLateByTeam.reduce((s, c) => s + (c - lateMean) ** 2, 0) / totalLateByTeam.length;
    score += lateVar * 1000;

    // 1b. Max late surplus (aligns optimizer with the user-visible flag condition)
    const divFloor = Math.min(...totalLateByTeam);
    const maxSurplus = Math.max(...totalLateByTeam.map(c => c - divFloor));
    score += maxSurplus * 250;

    // 1c. Per-individual-late-slot variance (SECONDARY — prevents concentration on latest slot).
    //     Use scheduledDivTeams; an unscheduled team would pull the mean toward 0 spuriously.
    for (const timeSlot of lateTimeSlots) {
      const counts = scheduledDivTeams.map(t => teamStats[t.id].gamesByTimeSlot[timeSlot] || 0);
      const slotMean = counts.reduce((s, c) => s + c, 0) / counts.length;
      const slotVar = counts.reduce((s, c) => s + (c - slotMean) ** 2, 0) / counts.length;
      score += slotVar * 100;
    }
  }

  // 2. Weekend variance
  const weekendCounts = teams.map(t =>
    teamStats[t.id].fridayGames + teamStats[t.id].saturdayGames);
  const weekendVariance = Math.max(...weekendCounts) - Math.min(...weekendCounts);
  score += weekendVariance * weekendVariance * 100;

  // 3. Consecutive opponent penalty
  const consecutiveCount = countConsecutiveOpponentGames(games, slots);
  score += consecutiveCount * 50;

  // 4. Rest day violations
  const restViolations = countRestDayViolations(games, slots, teams);
  score += restViolations * 25;

  // 5. Max games per week violations (HARD constraint)
  const maxGameViolations = countMaxGamesPerWeekViolations(games, slots, teams);
  score += maxGameViolations * 10000;

  return score;
}
```

### **5.3.2 Simulated Annealing**

We use simulated annealing because it's simple to implement, handles soft constraints well, and reliably finds good solutions. The "temperature" starts high (accepting worse solutions sometimes) and gradually cools (becoming more selective).

**Algorithm Pseudo-code:**

```text
function optimizeSchedule(
  matchups: Matchup[],
  slots: IceSlot[],
  maxIterations: number = 50000
): Game[] {
  // Initial assignment: random shuffle of matchups to slots
  let current = createInitialAssignment(matchups, slots);
  let currentScore = calculateFairnessScore(current);
  let best = current;
  let bestScore = currentScore;

  // Annealing parameters
  let temperature = 1000;
  const coolingRate = 0.9997;  // Slow cooling for better results
  const minTemperature = 0.1;

  for (let i = 0; i < maxIterations && temperature > minTemperature; i++) {
    // Generate neighbor by swapping two random games (same division)
    const neighbor = swapTwoGames(current);
    const neighborScore = calculateFairnessScore(neighbor);
    const delta = neighborScore - currentScore;

    // Accept if better, or probabilistically if worse
    if (delta < 0 || Math.random() < Math.exp(-delta / temperature)) {
      current = neighbor;
      currentScore = neighborScore;

      if (currentScore < bestScore) {
        best = current;
        bestScore = currentScore;
      }
    }

    temperature *= coolingRate;
  }

  return best;
}
```

**Why these parameters?**

* 50,000 iterations: **measured**, not guessed. On a real 236-slot / 16-team season the
  best score converges at ~50,000 (and is flat out to 200,000). Wall time ~50 s. An
  earlier synthetic fixture converged at 30,000 and wrongly suggested cutting the budget —
  it had only two distinct start times, where the real file has ten. Re-measure whenever
  the scoring function changes.

* Initial temperature 1000: Matches the scale of our scoring weights.

* Cooling rate 0.9997: fixed, and **independent of the iteration budget** — temperature
  reaches the `minTemperature` floor at iteration ~30,700 regardless of how many
  iterations are requested, after which the search is effectively greedy hill-climbing.
  This is why raising the iteration count alone buys nothing. Left as-is because the
  measured convergence point sits just above that floor; revisit only if the budget changes.

## **5.4 Phase 4: Home/Away Assignment**

After slots are assigned, we designate home/away for each game. This is a simpler optimization problem.

**Pseudo-code:**

```text
function assignHomeAway(games: Game[]): Game[] {
  const homeCount = new Map<string, number>();  // teamId -> home game count

  // Sort games by date so we can balance as we go
  const sorted = [...games].sort((a, b) => a.date.localeCompare(b.date));

  return sorted.map(game => {
    const team1Home = homeCount.get(game.team1Id) || 0;
    const team2Home = homeCount.get(game.team2Id) || 0;

    // Give home to team with fewer home games
    // Ties broken randomly for variety
    let homeTeam, awayTeam;
    if (team1Home < team2Home ||
        (team1Home === team2Home && Math.random() < 0.5)) {
      homeTeam = game.team1Id;
      awayTeam = game.team2Id;
    } else {
      homeTeam = game.team2Id;
      awayTeam = game.team1Id;
    }

    homeCount.set(homeTeam, (homeCount.get(homeTeam) || 0) + 1);
    return { ...game, homeTeamId: homeTeam, awayTeamId: awayTeam };
  });
}
```

# **6. Module Structure**

> **Drift notice.** The tree below is the original plan. See the Deviations table
> at the end of this document, and `CLAUDE.md` for the current layout.

The codebase is organized into isolated modules. The scheduling algorithm is deliberately separated so we can swap implementations later.

```text
src/
├── components/          # React UI components
│   ├── IceTimesTab.tsx
│   ├── TeamsTab.tsx
│   ├── ScheduleTab.tsx
│   ├── ExportTab.tsx
│   ├── SettingsPanel.tsx
│   └── FairnessReport.tsx
├── scheduler/           # ← ISOLATED: Can swap this entire module
│   ├── index.ts         # Public API: generateSchedule()
│   ├── dayAssignment.ts # Phase 1
│   ├── matchups.ts      # Phase 2
│   ├── slotOptimizer.ts # Phase 3 (simulated annealing)
│   ├── homeAway.ts      # Phase 4
│   ├── scoring.ts       # Fairness scoring function
│   └── types.ts         # Internal types
├── parsers/             # File parsing (CSV, Excel)
│   ├── csvParser.ts
│   └── excelParser.ts
├── state/               # React context + reducers
│   ├── AppContext.tsx
│   └── reducer.ts
├── utils/               # Helpers (date formatting, etc.)
├── types.ts             # Shared TypeScript types
└── App.tsx              # Main app shell
```

**Key Design Decisions:**

* scheduler/ has a single public function: generateSchedule(slots, teams, settings) → Schedule

* All internal algorithm details (phases, annealing, scoring) are hidden from the rest of the app.

* If we later want to use OR-Tools or a different approach, we replace only scheduler/.

# **7. Data Flow**

The application follows a linear workflow with clear data transformations at each step.

```text
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  CSV/Excel  │ ──► │  IceSlot[]  │ ──► │             │ ──► │  Schedule   │
│  Upload     │     │             │     │  Scheduler  │     │  (games,    │
└─────────────┘     └─────────────┘     │  Module     │     │   seed,     │
                                        │             │     │   score)    │
┌─────────────┐     ┌─────────────┐     │             │     └─────────────┘
│  Team       │ ──► │  Team[]     │ ──► │             │            │
│  Entry Form │     │             │     └─────────────┘            │
└─────────────┘     └─────────────┘                                ▼
                                                          ┌─────────────┐
┌─────────────┐                                           │  Fairness   │
│  Settings   │ ──────────────────────────────────────────│  Report     │
│  Panel      │                                           └─────────────┘
└─────────────┘                                                  │
                                                                 ▼
                                                          ┌─────────────┐
                                                          │  CSV Export │
                                                          └─────────────┘
```

# **8. Persistence Strategy**

All data is stored in localStorage. This is sufficient for a single-user application and avoids any backend complexity.

| Key | Data | When Updated |
| :---- | :---- | :---- |
| hockey_slots | IceSlot[] - imported ice times | After file upload |
| hockey_teams | Team[] - entered teams | After team add/delete |
| hockey_schedule | Schedule - generated schedule | After generate/edit |
| hockey_settings | Settings - fairness thresholds | After settings save |

## Deviations from Original Design

| Section | Original Design | Actual Implementation | Reason |
| :---- | :---- | :---- | :---- |
| §3 State | React Context + useReducer | Custom useState hook (`useSchedulerStore.ts`) | Simpler for single-component tree; no external Zustand dependency needed |
| §6 Module | `src/parsers/` with stub csvParser | `src/parsers/` with PapaParse CSV + SheetJS Excel | Tickets DAV-48/50 upgraded to real parsers |
| §6 Module | `src/state/` with AppContext + reducer | `src/hooks/useSchedulerStore.ts` | Flat hook is simpler; no routing needed |
| §4.1 IceSlot | `isLate: boolean`, `isWeekend: boolean` stored | Derived at render via `isDerivedLate`/`isDerivedWeekend` | Avoids stale stored state when threshold changes |
| §4.1 IceSlot | `dayOfWeek: number` (0=Sun…6=Sat) | `dayOfWeek: string` (`'Monday'`…) | Parsers derive the name once at import; string compares directly against the `'Friday'`/`'Saturday'` weekend test |
| §4.4 Report | `TeamStats` keyed by `teamId`; separate `lateGameVarianceByTeam`, `weekendVariance`, `flaggedTeams` | `TeamStats` keyed by **team name**, carrying `lateSurplus`, `lateSlotFlagged`, `weekendFlagged` inline | Report renders by name; per-team flags avoid a second lookup. Duplicate team names are blocked at entry (`TeamsTab`), which is what makes name-keying safe |
| §6 Module | `src/utils/` + root `src/types.ts` | `src/lib/` + `src/types/scheduler.ts` | Matches the `@/` alias layout used everywhere else |
| §6 Module | (not planned) | `src/scheduler/worker.ts` + `workerTypes.ts` | Annealing pass moved off the main thread to keep the UI responsive |
| §8 Coverage | Per-path threshold on `src/hooks/useSchedulerStore.ts` | **Resolved in v0.6** — jsdom + `@testing-library/react` landed with the roster-lock work (DAV-197/198); threshold now set to `{ lines: 70, branches: 85 }` | Deferred under DAV-64 because its acceptance criteria forbade coverage-padding tests. `src/components/**` stays excluded from the report so generated shadcn primitives do not drown the signal |

# **9. Future Considerations**

These are things we might want to change later. The architecture is designed so these can be swapped without rewriting the whole app.

## **9.1 Algorithm Upgrades**

If simulated annealing proves insufficient, the scheduler/ module can be replaced with:

* OR-Tools (compiled to WASM) for constraint programming

* Genetic algorithm if we need more exploration

* Server-side computation if client performance is an issue

## **9.2 Multi-User Support**

If multiple commissioners need access, we'd add:

* Authentication (Clerk, Auth0, or Supabase Auth)

* Database (Supabase or PlanetScale)

* Replace localStorage calls with API calls (isolated in state/ module)

## **9.3 Playoff Scheduling**

Would require a separate module with different constraints (bracket-based, single elimination, etc.). Completely different problem — don't try to generalize the regular season scheduler.

# **10. Risks & Mitigations**

| Risk | Mitigation |
| :---- | :---- |
| Algorithm too slow on weak hardware | Progress indicator + "this may take up to 30 seconds". If chronic, move to serverless function. |
| Commissioner clears browser data | Prominent warning to export. Schedule loss is recoverable by re-importing and regenerating. |
| Unfair schedules despite algorithm | Manual swap feature as escape hatch. Fairness report makes any unfairness visible and quantified. |
| Edge cases in input data | Validate on import. Reject invalid rows with clear error messages. Don't crash — fail gracefully. |

*— End of Architecture Document —*
