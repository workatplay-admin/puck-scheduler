# **Product Requirements Document**

**Beer League Hockey Scheduler**

| Version | 1.0 |
| :---- | :---- |
| Date | December 2024 |
| Target User | League Commissioner (single user) |
| Status | Draft |

# **1. Overview**

## **1.1 Problem Statement**

Scheduling a beer league hockey season with 300-320 games across two divisions is time-consuming and error-prone when done manually. The most contentious issue is fairness—teams complain when they're stuck with more late-night games or undesirable weekend slots than other teams. Currently, there's no simple tool that automatically generates a fair schedule while distributing undesirable ice fairly.

## **1.2 Solution**

A simple web application that:

* Accepts arena ice times and team rosters as input
* Automatically generates a season schedule optimized for fairness
* Allows manual tweaking before export
* Produces a schedule with a built-in fairness report

## **1.3 Target Audience**

A single league commissioner with no coding experience but solid understanding of the scheduling constraints. The app will serve a league of approximately 10-16 teams across two divisions, playing 300-320 total games per season.

## **1.4 Success Criteria**

* Schedule generation completes in under 30 seconds
* No team plays more than 1 game more than any other team in their division
* Late time slots and undesirable days are distributed as evenly as possible across teams
* Commissioner can go from "upload" to "exported schedule" in under 30 minutes

# **2. Definitions**

| Term | Definition |
| :---- | :---- |
| Division | A group of teams that only play against each other (no cross-division play) |
| Ice Slot | A specific date and start time when one game can be played |
| Late Game | Any game starting at the configured threshold time or later (default: 8:45pm) |
| Undesirable Day | Friday or Saturday (at any time). May not occur at all — many seasons contain no Friday/Saturday ice, in which case this dimension is inert. |
| Game Day | A calendar date on which games are played. Since v0.6 a date may be shared by both divisions (see *Slot Block*). |
| Slot Block | A contiguous run of ice slots on one date assigned to a single division. A date with few enough slots forms a single block; a date large enough to force same-day double-headers is split into two contiguous blocks, one per division. |
| Desirability Band | One of three tiers a slot falls into by start time: **afternoon** (before the prime window), **prime** (most desirable), or **late** (at/after the late-game threshold). Configurable in Settings. |
| Same-Day Game | A second (or third) game for the same team on one calendar date. **Never permitted** — an invariant, not a configurable option. |
| Fairness | Even distribution of late ice slots and undesirable days across teams |

# **3. Functional Requirements**

## **3.1 Data Input**

### **3.1.1 Ice Time Upload**

**Input format:** CSV or Excel file with two columns:

* Date (e.g., "2025-01-15" or "January 15, 2025")
* Start Time (e.g., "21:15" or "9:15 PM")

**Validation:** Reject files missing required columns. Flag and skip rows with unparseable dates or times. Display count of successfully imported ice slots.

**Example input:**

| Date | Start Time |
| :---- | :---- |
| 2025-01-15 | 17:00 |
| 2025-01-15 | 21:00 |
| 2025-01-15 | 22:15 |
| 2025-01-17 | 18:45 |
| 2025-01-17 | 20:00 |

### **3.1.2 Team Entry**

**Input method:** Manual entry via web form

**Required fields:** Team name (text), Division (dropdown: "Division A" or "Division B")

**Functionality:** Add teams one at a time. View list of entered teams grouped by division. Delete a team before schedule generation.

**Constraints:** Minimum 2 teams per division to generate a schedule. No maximum (though typical range is 5-8 per division).

## **3.2 Schedule Generation**

### **3.2.1 Division-to-Slot-Block Assignment**

The algorithm must first assign every ice slot to exactly one division, in contiguous per-date blocks. Most dates are assigned whole; a date is split between the two divisions only when keeping it whole would force teams to play twice in one day.

**Rules:**

1. **Slot blocks.** Ice slots on a date are assigned in *contiguous blocks*, each block to one division. A date is kept whole where possible; it is split into two contiguous blocks only when a whole-date assignment would force teams into same-day games (i.e. `2 × slots > division team count`). Both divisions may therefore play on the same date, but each plays a consecutive run of slots so teams in a division still overlap at the rink afterwards — the socialisation purpose this rule exists to serve.
2. Alternate divisions where practical (A, B, A, B...) but deviations are acceptable
3. **Cross-division balance is limited to slot count.** Divisions should receive an equal number of ice slots (hence equal games per team). Cross-division balance of *late* or *prime* slots is explicitly **not** a goal: there is no cross-division play in either the regular season or the playoffs, so no team is ever compared against a team in the other division. Fairness comparisons are within-division only
4. **Proportional date allocation.** Dates are assigned to divisions so that each division's total slot count is proportional to its team count, targeting `target_slots[div] ≈ team_count[div] × total_slots / total_teams`. This is what makes the global games-per-team ±1 guarantee in §3.2.2 achievable. Rounding errors are absorbed into the ±1 tolerance.

### **3.2.2 Game Count Balancing**

**Rules (in priority order):**

1. Each team must play the same number of games as every other team **across all divisions**, ±1 (highest priority). This is a global guarantee, not a per-division one — a team in Division A cannot play more than one game more or fewer than any team in Division B.
2. Each team should play every other team in their division an equal number of times, ±1.
3. Home/away splits should be approximately 50/50 per team (lowest priority).

**Note:** Cross-division balance is enforced by allocating ice-slot dates to divisions in proportion to each division's team count (see §3.2.1 rule 4 and ADR §5.1). If the user's slot/team configuration cannot satisfy ±1 across all teams, the importer surfaces a warning in the Ice Times tab before generation so the commissioner can add or remove slots.

**Typical math:** 8 teams per division, ~38 games per team. Each team plays ~38 games → division total = (8 × 38) / 2 = 152 games. 7 unique opponents → ~5-6 games against each opponent.

### **3.2.3 Fairness Optimization**

**Priority order (highest to lowest):**

**1. Late time slot distribution (8:45pm or later by default)**

* The user-facing fairness metric is **Late Surplus** — total late games per team, compared against the team with the fewest late games in the same division (among teams that have at least one scheduled game)
* `lateSurplus(team) = totalLateGames(team) − divisionFloor`; a team is flagged when this exceeds the configured threshold (strict-greater)
* Teams with no scheduled games are excluded from the floor calculation so they cannot artificially inflate every other team's surplus
* A 10:15pm game and an 8:45pm game are both "late games" and count equally toward the aggregate. Distribution across individual late times is a secondary optimization signal (prevents stacking a team's late games on the latest slot specifically) but is not the primary fairness measure
* The per-time grid is still shown in the Time Slot Distribution table for reference
* Not tracked for fairness: Distribution of early/prime slots (5:00pm, 6:30pm, 7:45pm, etc.) is shown for reference but not graded

**2. Same-day games**

* A team must never play more than one game on the same calendar date
* Enforced structurally (slot blocks, §3.2.1 rule 1) and reinforced by a heavy optimizer penalty
* Not configurable — there is no circumstance in which the league wants same-day games
* Every ice slot must be used — an empty slot is wasted ice. This never conflicts with the no-same-day rule in practice: ice is booked against the league's own capacity, so a date never carries more slots than the two divisions can host. Where a *roster* is misconfigured badly enough to break that (e.g. one division left with a single team), the importer warns before generation rather than producing a compromised schedule

**3. Desirability band distribution (prime vs afternoon)**

* Slots fall into three bands by start time: afternoon, prime, and late (§2, *Desirability Band*)
* Each team's **total** prime games and **total** afternoon games are balanced against its divisionmates — per-band totals, not per-individual-time-slot
* Best-effort, and always weighted below late-slot fairness: where the two conflict, late fairness wins
* Defaults reflect a typical senior men's season — afternoon before 5:45pm, prime 5:45pm until the late threshold — and are configurable

**4. Undesirable day distribution (Friday and Saturday)**

* Count Friday and Saturday games per team
* Minimize imbalance across teams within each division
* Cross-division: Division A's Friday/Saturday game count should be roughly proportional to Division B's

**5. Opponent variety**

* Avoid scheduling the same two teams against each other in consecutive weeks
* Spread matchups throughout the season where possible

**6. Rest days**

* Target: 2 games per team per week
* Hard constraint: No more than max games per week (configurable, default 3) in any 7-day rolling window
* Soft constraint: At least 2 days between games for the same team

### **3.2.4 Algorithm Approach**

Given the scale (~150 games per division) and constraints, the algorithm should:

**Phase 1 - Slot-Block Assignment:** Assign every ice slot to a division in contiguous per-date blocks. Most dates go whole to one division; a date is split between divisions only where keeping it whole would force teams to play twice in one day. Balance total slot count between divisions.

**Phase 2 - Matchup Generation:** Generate required matchups per division (round-robin, repeated as needed). Ensure each pairing count is balanced (±1).

**Phase 3 - Slot Assignment:** Assign matchups to ice slots. Use constraint satisfaction or optimization (e.g., simulated annealing, greedy with swapping). Optimize for fairness metrics in priority order.

**Phase 4 - Home/Away Assignment:** Assign home/away designation to balance each team's home game count.

## **3.3 Schedule Display**

### **3.3.1 Web View**

After generation, display the schedule on a webpage with:

**Schedule Table:** Columns for Date, Day of Week, Start Time, Division, Home Team, Away Team. Sortable by any column. Filterable by division, team, or day of week. Visual indicator for late games. Visual indicator for weekend games (Friday/Saturday).

**Summary Panel:** Total games generated, games per division, date range of season.

### **3.3.2 Fairness Report**

Displayed below the schedule. Contains the following sections:

**Section A: Games Per Team**

| Team | Division | Total Games |
| :---- | :---- | :---- |
| Sluggers | A | 38 |
| Icehogs | A | 38 |
| ... | ... | ... |

**Section B: Time of Day**

Defaults to three summary columns — Afternoon (before the prime window), Prime, and Late (⚠, graded for fairness). The full per-time-slot grid is available behind a **Show all time slots** disclosure: a team can look balanced on every individual column while still collecting a disproportionate share of a whole part of the day, which is what the summary makes visible.

| Team | Div | 5:00pm | 6:30pm | 7:45pm | 8:45pm ⚠ | 9:15pm ⚠ | 10:15pm ⚠ |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| Sluggers | A | 4 | 6 | 8 | 3 | 2 | 2 |
| Icehogs | A | 5 | 7 | 6 | 2 | 3 | 1 |
| ... |  | ... | ... | ... | ... | ... | ... |

**Section C: Late Slot Fairness Summary**

| Team | Total Late | Late Surplus | Flagged? |
| :---- | :---- | :---- | :---- |
| Sluggers | 10 | +1 | ✓ OK |
| Icehogs | 10 | +1 | ✓ OK |
| Rebels | 12 | +3 | ⚠ FLAG |

*Late Surplus = team's total late games minus the lowest total in their division. Flagged if it strictly exceeds the configured threshold (default +2).*

**Section D: Friday & Saturday Games** *(hidden when the season contains no Friday or Saturday ice, which is common — an all-zero table of "✓ OK" tells the commissioner nothing)*

| Team | Division | Friday | Saturday | Total Weekend | Flagged? |
| :---- | :---- | :---- | :---- | :---- | :---- |
| Sluggers | A | 5 | 4 | 9 | ✓ OK |
| Icehogs | A | 4 | 5 | 9 | ✓ OK |
| Rebels | A | 6 | 6 | 12 | ⚠ FLAG |

**Section E: Day-of-Week Distribution** *(includes a "2+ same day" column; should read zero for every team)*

| Team | Mon | Tue | Wed | Thu | Fri | Sat | Sun |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| Sluggers | 6 | 5 | 7 | 6 | 5 | 4 | 5 |
| Icehogs | 5 | 6 | 6 | 7 | 4 | 5 | 5 |

**Section F: Opponent Distribution**

| Team | vs Icehogs | vs Penguins | vs Hawks | vs Grizzlies | vs Mustangs | vs Rebels |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| Sluggers | 6 | 5 | 6 | 5 | 6 | 5 |

**Section G: Division Balance Summary** *(informational only — teams never play across divisions, so a difference between them is not an unfairness. Friday/Saturday rows are hidden when the season has no weekend ice.)*

| Metric | Division A | Division B |
| :---- | :---- | :---- |
| Teams | 7 | 8 |
| Total Games | 133 | 152 |
| Games Per Team | 38 | 38 |
| Friday Game Days | 8 | 9 |
| Saturday Game Days | 7 | 8 |
| Total Late Slots Used | 45 | 52 |

## **3.4 Manual Editing**

### **3.4.1 Swap Teams**

Select any game from the schedule. Choose "Swap with another game". Select a second game (from same division only). The two matchups exchange ice slots. Home/away designations remain with the original slot.

### **3.4.2 Remove Game**

Select any game from the schedule. Choose "Remove game". Confirm deletion. Ice slot becomes unassigned (shown in a separate "Unused Slots" list).

### **3.4.3 Recalculate Fairness Report**

Button: "Recalculate Fairness Report". Regenerates all fairness statistics based on current schedule state. Does not change the schedule itself.

### **3.4.4 Regenerate Schedule**

Button: "Regenerate Schedule". Confirmation dialog: "This will discard all manual edits. Continue?" Runs the full algorithm again (may produce different results due to randomization in optimization).

## **3.5 Export**

### **3.5.1 Export Format**

**File type:** CSV (compatible with Excel, Google Sheets)

**File contents:** Two sections in one file:

**Section 1 - Schedule:** Date, Day, Start Time, Division, Home Team, Away Team

**Section 2 - Fairness Report:** All fairness report sections (Games Per Team, Time Slot Distribution, Late Slot Summary, Weekend Games, Day-of-Week Distribution, Opponent Distribution, Division Balance)

### **3.5.2 Export Trigger**

Button: "Export to CSV". Downloads file immediately with filename: hockey_schedule_YYYY-MM-DD.csv

## **3.6 Data Persistence**

### **3.6.1 Session Storage**

* The most recent schedule (including edits) is retained in browser local storage
* When returning to the app, the last schedule loads automatically
* No guarantee of persistence: Clearing browser data will erase the schedule
* A warning displays: "Your schedule is saved locally in this browser. Export to CSV for a permanent copy."

### **3.6.2 Fresh Start**

Button: "Start New Season". Clears all data (teams, ice slots, schedule). Confirmation required.

## **3.7 Configuration Settings**

A simple settings panel accessible from the main interface, allowing the commissioner to adjust thresholds before or after schedule generation.

### **3.7.1 Fairness Thresholds**

| Setting | Description | Default | Range |
| :---- | :---- | :---- | :---- |
| Late game threshold | Start time at or after which a game is considered "late" | 8:45pm | Any time |
| Late slot variance flag | Flag a team if they play this many more late-slot games in total than the team with the fewest in their division | 2 | 1–5 |
| Weekend variance flag | Flag a team if they have this many more Friday/Saturday games than another team | 3 | 1–10 |
| Max games per week | Hard cap on games per team in any 7-day window | 3 | 2–5 |
| Prime window start | Start time of the most-desirable band. Slots earlier than this are "afternoon"; slots from here until the late threshold are "prime". Must be earlier than the late-game threshold | 5:45pm | Any time before the late threshold |

### **3.7.2 Settings Behavior**

* Settings are saved to browser local storage (persists between sessions)
* Changing settings does not automatically regenerate the schedule
* Changing thresholds does immediately update which teams are flagged when you click "Recalculate Fairness Report"
* Settings apply to both schedule generation (algorithm uses thresholds as targets) and fairness report display (flagging)

# **4. Non-Functional Requirements**

## **4.1 Performance**

* Schedule generation: < 30 seconds for ~300 games
* Page load: < 3 seconds
* Export generation: < 5 seconds

## **4.2 Browser Compatibility**

* Modern browsers: Chrome, Firefox, Safari, Edge (latest 2 versions)
* Mobile: Functional but not optimized (commissioner uses desktop)

## **4.3 Deployment**

* Simple web app hosted on a single URL
* No authentication required
* No backend database (all processing client-side or simple serverless functions)

## **4.4 Accessibility**

* Basic accessibility: keyboard navigation, readable fonts
* Full WCAG compliance not required (single known user)

# **5. User Interface**

## **5.1 Main Workflow**

The application follows a 4-step tab-based workflow: Ice Times → Teams → Schedule → Export. A Settings button is accessible from all tabs.

## **5.2 Tab 1: Ice Times**

* Drag-and-drop area for CSV/Excel file upload
* Display expected format reminder
* Show import summary (count of slots, unique dates, date range)
* Preview table of imported slots with late game indicator (⚠)
* Clear and Next buttons

## **5.3 Tab 2: Teams**

* Text input for team name
* Dropdown for division selection
* Add Team button
* Two-column display showing teams in each division with delete buttons
* Back and Generate Schedule buttons

## **5.4 Tab 3: Schedule**

* Regenerate and Edit Mode toggle buttons
* Filter dropdowns (Division, Team, Day)
* Sortable schedule table with visual indicators for late (⚠) and weekend (🔶) games
* Pagination for large schedules
* Collapsible fairness report sections below schedule
* Recalculate Report button
* Back and Export buttons

## **5.5 Tab 4: Export**

* Summary of schedule (total games, games per division, date range)
* Checklist of what's included in export
* Download CSV button
* Warning about local storage
* Back to Schedule button

## **5.6 Settings Panel**

* Accessible via gear icon in header
* Time picker for late game threshold
* Dropdowns for variance thresholds
* Reset to Defaults and Save buttons
* Explanatory text for each setting

# **6. Out of Scope (Version 1.0)**

The following features are explicitly not included in this version:

* Playoff scheduling
* Multi-user access or authentication
* Game rescheduling assistant (mid-season changes)
* Team contact information or notifications
* Integration with external calendars (Google Calendar, iCal)
* Mobile-optimized interface
* Historical season comparisons
* Referee or timekeeper assignments

# **7. Open Questions for Development**

1. **Algorithm library:** Should we use an existing constraint-solving library (e.g., OR-Tools) or implement a custom greedy/swapping algorithm? Trade-off: complexity vs. optimization quality.
2. **Exact vs. heuristic:** Given 150+ games per division, is a guaranteed optimal solution feasible, or should we accept "good enough" heuristic results?
3. **Randomization:** Should the algorithm produce the same schedule given the same inputs, or is variation acceptable (useful for "regenerate and pick best")?
4. **Hosting:** Preference for static hosting (GitHub Pages, Netlify) with client-side processing, or simple backend (Vercel, Railway) for heavier computation?

# **8. Glossary**

| Term | Definition |
| :---- | :---- |
| CSV | Comma-Separated Values, a simple spreadsheet format |
| Constraint satisfaction | An algorithmic approach that finds solutions meeting all specified rules |
| Round-robin | A tournament format where each team plays every other team |
| Simulated annealing | An optimization technique that explores solutions by accepting occasional "worse" moves to escape local optima |
| Local storage | Browser feature that saves data on the user's computer |
| DXA | Device-independent units used in document formatting (1440 DXA = 1 inch) |

*— End of Document —*
