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
}
```

## **4.4 Fairness Report Types**

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

## **5.1 Phase 1: Day-to-Division Assignment**

Assign each calendar date (with all its ice slots) to exactly one division. **Primary goal: balance games-per-team across all divisions to ±1 (PRD §3.2.2 priority 1).** Secondary goals (tiebreakers, in order):

* Balance Friday game-days between divisions
* Balance Saturday game-days between divisions
* Balance late slots between divisions
* Alternate divisions roughly (A, B, A, B...) where the above leave room

### Algorithm — proportional-target greedy assignment

1. **Compute targets.** `total_team_games = 2 × total_slots`; `target_per_team = total_team_games / total_teams` (a real number). For each division `d`, `target_slots[d] = round(team_count[d] × total_slots / total_teams)`. If `sum(target_slots) ≠ total_slots` after rounding, nudge the largest target up or down by 1 so the budgets sum exactly.
2. **Group and sort.** Group slots by date. Sort dates by `(slot_count_on_date desc, date asc)` — large-impact dates first so they can't push a division past its budget later.
3. **Greedy assign.** For each date in sorted order, assign it to the division with the largest remaining budget (`target_slots[d] − assigned_slots_so_far[d]`). On ties, prefer the division that more needs the resources on that date (Friday/Saturday/late counts). On further ties, alternate A/B.
4. **Feasibility check.** After assignment, verify `floor(target_per_team) ≤ games_per_team[d] ≤ ceil(target_per_team)` for every division. If not, return `{ ok: false, reason }` to the caller (which surfaces a warning in the Ice Times tab); otherwise return `{ ok: true }` alongside the date→division map. The post-run invariant in `scheduler/index.ts` is the final backstop if SA produces a violating schedule despite a feasible allocation.

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

* 50,000 iterations: Enough to explore the solution space for 150 games. Takes ~5-10 seconds.

* Initial temperature 1000: Matches the scale of our scoring weights.

* Cooling rate 0.9997: Slow enough to avoid getting stuck in local minima.

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
| §8 Coverage | Per-path threshold on `src/hooks/useSchedulerStore.ts` | Threshold deferred until React hook test infrastructure (jsdom + @testing-library/react) lands | DAV-64 acceptance criteria forbid coverage-padding tests; store coverage tickets to follow |

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
