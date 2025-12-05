# **Beer League Hockey Scheduler**

Architecture Document v1.0

# **1\. Design Philosophy**

This is a single-user tool for one league commissioner. We optimize for shipping fast and keeping things simple. The guiding principles:

* **Ship the simplest thing that works.**

* No backend unless we absolutely need one.

* Fairness algorithm is the hard part — invest effort there.

* Everything else is just plumbing.

* Isolate the algorithm so we can rip it out and improve later.

# **2\. Key Architectural Decisions**

## **2.1 Client-Side Only**

All computation happens in the browser. No server, no database, no auth. The commissioner's laptop can handle 300 games in under 30 seconds. Benefits: zero hosting cost, instant deployment, no cold starts.

## **2.2 "Good Enough" Algorithm**

Finding a mathematically optimal schedule for 150+ games with soft constraints is NP-hard and would take hours. Instead, we use simulated annealing to find a "statistically very good" solution in 5-15 seconds. In practice, the output is indistinguishable from optimal — no team will have legitimate grounds to complain.

## **2.3 Determinism with Seed**

The algorithm is non-deterministic by default (uses Math.random). This lets the commissioner "regenerate" and pick the best of several schedules. However, we store the random seed used so any schedule can be reproduced if needed.

## **2.4 Modular Algorithm**

The scheduler is isolated in its own module with a clean interface. If we later need to swap in OR-Tools, a genetic algorithm, or a constraint solver, we only touch that module. The rest of the app doesn't care how the schedule was generated.

# **3\. Tech Stack**

| Layer | Choice & Rationale |
| :---- | :---- |
| Framework | React \+ TypeScript. Type safety helps with complex algorithm logic. React is boring and works. |
| Build Tool | Vite. Fast dev server, simple config, good defaults. |
| Styling | Tailwind CSS. Utility classes, no custom CSS files to manage. |
| State | React Context \+ useReducer. Overkill to add Redux/Zustand for a single-user app. |
| Persistence | localStorage. Simple, built-in, sufficient for one user. |
| File Parsing | PapaParse (CSV) \+ SheetJS (Excel). Battle-tested libraries. |
| Hosting | Vercel. Free tier is plenty. Git push to deploy. |

# **4\. Data Schemas**

All data is defined in TypeScript interfaces. These are the core types that flow through the application.

## **4.1 Input Types**

// An available ice slot from the uploaded CSV/Excel  
interface IceSlot {  
  id: string;           // UUID, generated on import  
  date: string;         // ISO date: '2025-01-15'  
  startTime: string;    // 24h format: '21:15'  
  dayOfWeek: number;    // 0=Sun, 1=Mon, ..., 6=Sat  
  isLate: boolean;      // true if \>= lateThreshold  
  isWeekend: boolean;   // true if Fri (5) or Sat (6)  
}  
   
// A team entered by the commissioner  
interface Team {  
  id: string;           // UUID  
  name: string;         // 'Sluggers'  
  division: 'A' | 'B';  
}

## **4.2 Schedule Types**

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
  games: Game\[\];  
  seed: number;         // Random seed used (for reproducibility)  
  generatedAt: string;  // ISO timestamp  
  fairnessScore: number; // Lower is better  
}

## **4.3 Configuration Types**

interface Settings {  
  lateGameThreshold: string;   // '20:45' (8:45pm)  
  lateSlotVarianceFlag: number; // Flag if variance \>= this (default: 2\)  
  weekendVarianceFlag: number;  // Flag if variance \>= this (default: 3\)  
  maxGamesPerWeek: number;      // Hard cap (default: 3\)  
}

## **4.4 Fairness Report Types**

interface TeamStats {  
  teamId: string;  
  totalGames: number;  
  homeGames: number;  
  awayGames: number;  
  // Map of startTime \-\> count (e.g., '21:15' \-\> 4\)  
  gamesByTimeSlot: Record\<string, number\>;  
  // Map of dayOfWeek \-\> count (e.g., 5 \-\> 6 for Friday)  
  gamesByDay: Record\<number, number\>;  
  fridayGames: number;  
  saturdayGames: number;  
  // Map of opponentId \-\> count  
  gamesByOpponent: Record\<string, number\>;  
}  
   
interface FairnessReport {  
  teamStats: TeamStats\[\];  
  lateSlotVariance: Record\<string, number\>; // per time slot  
  weekendVariance: number;  
  flaggedTeams: string\[\];  // Team IDs exceeding thresholds  
}

# **5\. Scheduling Algorithm**

This is the heart of the application. The algorithm runs in four phases, each building on the previous. The entire process targets completion in under 15 seconds on a modern browser.

## **5.1 Phase 1: Day-to-Division Assignment**

Assign each calendar date (with all its ice slots) to exactly one division. Goals:

* Alternate divisions roughly (A, B, A, B...)

* Balance Friday game-days between divisions

* Balance Saturday game-days between divisions

* Balance late slots between divisions

**Pseudo-code:**

function assignDaysToDivisions(slots: IceSlot\[\]): Map\<string, Division\> {  
  // Group slots by date  
  const slotsByDate \= groupBy(slots, s \=\> s.date);  
  const dates \= Object.keys(slotsByDate).sort();  
    
  // Count resources per date  
  const dateInfo \= dates.map(date \=\> ({  
    date,  
    isFriday: slotsByDate\[date\]\[0\].dayOfWeek \=== 5,  
    isSaturday: slotsByDate\[date\]\[0\].dayOfWeek \=== 6,  
    lateCount: slotsByDate\[date\].filter(s \=\> s.isLate).length,  
    totalSlots: slotsByDate\[date\].length  
  }));  
    
  // Greedy assignment with balancing  
  const assignment \= new Map\<string, 'A' | 'B'\>();  
  let divATotals \= { fridays: 0, saturdays: 0, lateSlots: 0 };  
  let divBTotals \= { fridays: 0, saturdays: 0, lateSlots: 0 };  
    
  for (const info of dateInfo) {  
    // Pick division that needs more of this resource type  
    const div \= pickDivisionToBalance(info, divATotals, divBTotals);  
    assignment.set(info.date, div);  
    // Update totals...  
  }  
    
  return assignment;  
}

## **5.2 Phase 2: Matchup Generation**

Generate all required matchups for each division. With N teams and G games per team:

* Total games in division \= (N × G) / 2

* Each pairing plays G / (N-1) times, ±1

* Use round-robin repeated as needed

**Pseudo-code:**

function generateMatchups(teams: Team\[\], totalSlots: number): Matchup\[\] {  
  const n \= teams.length;  
  const gamesNeeded \= totalSlots; // One game per slot assigned to this division  
    
  // Generate all possible pairings  
  const pairings: \[Team, Team\]\[\] \= \[\];  
  for (let i \= 0; i \< n; i++) {  
    for (let j \= i \+ 1; j \< n; j++) {  
      pairings.push(\[teams\[i\], teams\[j\]\]);  
    }  
  }  
    
  // Repeat round-robin until we have enough games  
  const matchups: Matchup\[\] \= \[\];  
  let pairingCounts \= new Map\<string, number\>(); // Track how many times each pairing used  
    
  while (matchups.length \< gamesNeeded) {  
    // Find pairing with lowest count  
    const nextPairing \= pairings.reduce((min, p) \=\> {  
      const key \= pairingKey(p);  
      const count \= pairingCounts.get(key) || 0;  
      const minCount \= pairingCounts.get(pairingKey(min)) || 0;  
      return count \< minCount ? p : min;  
    });  
      
    matchups.push({ team1: nextPairing\[0\], team2: nextPairing\[1\] });  
    pairingCounts.set(pairingKey(nextPairing),   
      (pairingCounts.get(pairingKey(nextPairing)) || 0\) \+ 1);  
  }  
    
  return matchups;  
}

## **5.3 Phase 3: Slot Assignment (The Hard Part)**

This is where fairness optimization happens. We use simulated annealing to assign matchups to ice slots while minimizing unfairness.

### **5.3.1 Fairness Scoring Function**

The scoring function quantifies "unfairness" as a single number. Lower is better. We weight constraints by priority:

| Constraint | Weight | Rationale |
| :---- | :---- | :---- |
| Late slot variance (per time) | 1000 | Highest priority per PRD. Players hate late games. |
| Weekend variance | 100 | Second priority. Friday/Saturday games are undesirable. |
| Consecutive opponent penalty | 50 | Avoid playing same team in back-to-back weeks. |
| Rest day violation (\<2 days) | 25 | Soft constraint. Less than 2 days rest is bad. |
| Max games/week violation | 10000 | Hard constraint. Massive penalty ensures this is never violated. |

**Scoring Function Pseudo-code:**

function calculateFairnessScore(games: Game\[\], slots: IceSlot\[\], teams: Team\[\]): number {  
  let score \= 0;  
  const teamStats \= computeTeamStats(games, slots);  
    
  // 1\. Late slot variance (per distinct late time)  
  const lateTimeSlots \= \[...new Set(slots.filter(s \=\> s.isLate).map(s \=\> s.startTime))\];  
  for (const timeSlot of lateTimeSlots) {  
    const counts \= teams.map(t \=\> teamStats\[t.id\].gamesByTimeSlot\[timeSlot\] || 0);  
    const variance \= Math.max(...counts) \- Math.min(...counts);  
    score \+= variance \* variance \* 1000;  // Squared to penalize large gaps more  
  }  
    
  // 2\. Weekend variance  
  const weekendCounts \= teams.map(t \=\>   
    teamStats\[t.id\].fridayGames \+ teamStats\[t.id\].saturdayGames);  
  const weekendVariance \= Math.max(...weekendCounts) \- Math.min(...weekendCounts);  
  score \+= weekendVariance \* weekendVariance \* 100;  
    
  // 3\. Consecutive opponent penalty  
  const consecutiveCount \= countConsecutiveOpponentGames(games, slots);  
  score \+= consecutiveCount \* 50;  
    
  // 4\. Rest day violations  
  const restViolations \= countRestDayViolations(games, slots, teams);  
  score \+= restViolations \* 25;  
    
  // 5\. Max games per week violations (HARD constraint)  
  const maxGameViolations \= countMaxGamesPerWeekViolations(games, slots, teams);  
  score \+= maxGameViolations \* 10000;  
    
  return score;  
}

### **5.3.2 Simulated Annealing**

We use simulated annealing because it's simple to implement, handles soft constraints well, and reliably finds good solutions. The "temperature" starts high (accepting worse solutions sometimes) and gradually cools (becoming more selective).

**Algorithm Pseudo-code:**

function optimizeSchedule(  
  matchups: Matchup\[\],   
  slots: IceSlot\[\],  
  maxIterations: number \= 50000  
): Game\[\] {  
  // Initial assignment: random shuffle of matchups to slots  
  let current \= createInitialAssignment(matchups, slots);  
  let currentScore \= calculateFairnessScore(current);  
  let best \= current;  
  let bestScore \= currentScore;  
    
  // Annealing parameters  
  let temperature \= 1000;  
  const coolingRate \= 0.9997;  // Slow cooling for better results  
  const minTemperature \= 0.1;  
    
  for (let i \= 0; i \< maxIterations && temperature \> minTemperature; i++) {  
    // Generate neighbor by swapping two random games (same division)  
    const neighbor \= swapTwoGames(current);  
    const neighborScore \= calculateFairnessScore(neighbor);  
    const delta \= neighborScore \- currentScore;  
      
    // Accept if better, or probabilistically if worse  
    if (delta \< 0 || Math.random() \< Math.exp(-delta / temperature)) {  
      current \= neighbor;  
      currentScore \= neighborScore;  
        
      if (currentScore \< bestScore) {  
        best \= current;  
        bestScore \= currentScore;  
      }  
    }  
      
    temperature \*= coolingRate;  
  }  
    
  return best;  
}

**Why these parameters?**

* 50,000 iterations: Enough to explore the solution space for 150 games. Takes \~5-10 seconds.

* Initial temperature 1000: Matches the scale of our scoring weights.

* Cooling rate 0.9997: Slow enough to avoid getting stuck in local minima.

## **5.4 Phase 4: Home/Away Assignment**

After slots are assigned, we designate home/away for each game. This is a simpler optimization problem.

**Pseudo-code:**

function assignHomeAway(games: Game\[\]): Game\[\] {  
  const homeCount \= new Map\<string, number\>();  // teamId \-\> home game count  
    
  // Sort games by date so we can balance as we go  
  const sorted \= \[...games\].sort((a, b) \=\> a.date.localeCompare(b.date));  
    
  return sorted.map(game \=\> {  
    const team1Home \= homeCount.get(game.team1Id) || 0;  
    const team2Home \= homeCount.get(game.team2Id) || 0;  
      
    // Give home to team with fewer home games  
    // Ties broken randomly for variety  
    let homeTeam, awayTeam;  
    if (team1Home \< team2Home ||   
        (team1Home \=== team2Home && Math.random() \< 0.5)) {  
      homeTeam \= game.team1Id;  
      awayTeam \= game.team2Id;  
    } else {  
      homeTeam \= game.team2Id;  
      awayTeam \= game.team1Id;  
    }  
      
    homeCount.set(homeTeam, (homeCount.get(homeTeam) || 0\) \+ 1);  
    return { ...game, homeTeamId: homeTeam, awayTeamId: awayTeam };  
  });  
}

# **6\. Module Structure**

The codebase is organized into isolated modules. The scheduling algorithm is deliberately separated so we can swap implementations later.

src/  
├── components/          \# React UI components  
│   ├── IceTimesTab.tsx  
│   ├── TeamsTab.tsx  
│   ├── ScheduleTab.tsx  
│   ├── ExportTab.tsx  
│   ├── SettingsPanel.tsx  
│   └── FairnessReport.tsx  
├── scheduler/           \# ← ISOLATED: Can swap this entire module  
│   ├── index.ts         \# Public API: generateSchedule()  
│   ├── dayAssignment.ts \# Phase 1  
│   ├── matchups.ts      \# Phase 2  
│   ├── slotOptimizer.ts \# Phase 3 (simulated annealing)  
│   ├── homeAway.ts      \# Phase 4  
│   ├── scoring.ts       \# Fairness scoring function  
│   └── types.ts         \# Internal types  
├── parsers/             \# File parsing (CSV, Excel)  
│   ├── csvParser.ts  
│   └── excelParser.ts  
├── state/               \# React context \+ reducers  
│   ├── AppContext.tsx  
│   └── reducer.ts  
├── utils/               \# Helpers (date formatting, etc.)  
├── types.ts             \# Shared TypeScript types  
└── App.tsx              \# Main app shell

**Key Design Decisions:**

* scheduler/ has a single public function: generateSchedule(slots, teams, settings) → Schedule

* All internal algorithm details (phases, annealing, scoring) are hidden from the rest of the app.

* If we later want to use OR-Tools or a different approach, we replace only scheduler/.

# **7\. Data Flow**

The application follows a linear workflow with clear data transformations at each step.

┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐  
│  CSV/Excel  │ ──► │  IceSlot\[\]  │ ──► │             │ ──► │  Schedule   │  
│  Upload     │     │             │     │  Scheduler  │     │  (games,    │  
└─────────────┘     └─────────────┘     │  Module     │     │   seed,     │  
                                        │             │     │   score)    │  
┌─────────────┐     ┌─────────────┐     │             │     └─────────────┘  
│  Team       │ ──► │  Team\[\]     │ ──► │             │            │  
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

# **8\. Persistence Strategy**

All data is stored in localStorage. This is sufficient for a single-user application and avoids any backend complexity.

| Key | Data | When Updated |
| :---- | :---- | :---- |
| hockey\_slots | IceSlot\[\] \- imported ice times | After file upload |
| hockey\_teams | Team\[\] \- entered teams | After team add/delete |
| hockey\_schedule | Schedule \- generated schedule | After generate/edit |
| hockey\_settings | Settings \- fairness thresholds | After settings save |

# **9\. Future Considerations**

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

# **10\. Risks & Mitigations**

| Risk | Mitigation |
| :---- | :---- |
| Algorithm too slow on weak hardware | Progress indicator \+ "this may take up to 30 seconds". If chronic, move to serverless function. |
| Commissioner clears browser data | Prominent warning to export. Schedule loss is recoverable by re-importing and regenerating. |
| Unfair schedules despite algorithm | Manual swap feature as escape hatch. Fairness report makes any unfairness visible and quantified. |
| Edge cases in input data | Validate on import. Reject invalid rows with clear error messages. Don't crash — fail gracefully. |

*— End of Architecture Document —*
