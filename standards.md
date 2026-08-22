# Engineering Standards — Puck Scheduler

**Version**: 1.0
**Status**: Active
**Owner**: David Gratton

> Project-specific policy. Operational context (stack, layout, commands) lives in [`CLAUDE.md`](./CLAUDE.md).

---

## 1. Code Quality

### 1.1 Language Standards

- TypeScript strict mode required (`"strict": true` in `tsconfig.json`).
- No `any` types — use `unknown` for external/untyped data, then narrow with Zod.
- All exported functions and types must be explicitly typed.
- Validate at system boundaries (CSV import, user form input) with Zod.

### 1.2 Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Components | PascalCase | `ScheduleTab.tsx` |
| Hooks | camelCase, `use` prefix | `useSchedulerStore.ts` |
| Utilities | camelCase | `csvExport.ts` |
| Types/Interfaces | PascalCase | `interface Team {}` |
| Constants | SCREAMING_SNAKE | `const MAX_ROUNDS = 20` |
| Environment vars | SCREAMING_SNAKE | `VITE_API_URL` |

### 1.3 File Organization

- Max **500 lines** per file — split if larger.
- One component per file.
- Pure logic in `src/scheduler/` (scheduling) and `src/parsers/` (file ingest); shared helpers in `src/lib/`; UI in `src/components/`; state in `src/hooks/`.
- Domain types live in `src/types/scheduler.ts`.

### 1.4 Documentation

- JSDoc on exported functions in `src/scheduler/`, `src/parsers/`, and `src/lib/` (the logic other modules depend on).
- Inline comments only for non-obvious algorithmic choices (e.g., why a particular pairing heuristic is used).
- Significant architectural changes get an ADR in `docs/`.

### 1.5 Code Review

| Category | Criteria |
|----------|----------|
| Correctness | Schedule fairness invariants hold; CSV round-trips losslessly |
| Security | No secrets committed; user-supplied CSV/text sanitized before render |
| Performance | Schedule generation completes in under 90s for a full season (~236 slots, 16 teams); see §2.1 |
| Type safety | No `any`; Zod at boundaries |

---

## 2. Testing

**Vitest** is configured (`vitest.config.ts`). Run the suite with `npx vitest run`
— there is deliberately no `npm test` alias yet.

- Pure functions are the priority targets: `src/scheduler/`, `src/parsers/`, `src/lib/`.
- Scheduler correctness is guarded by hard-invariant tests (per-pair and per-team
  game-count spread ≤ 1) rather than snapshots, since output is seed-dependent.
- **Playwright** for E2E once flows stabilize — still not adopted.
- Write tests alongside code, not after.

`npm run lint`, `npm run build`, `npx vitest run`, and `npm run audit:standards`
are the automated gates.

### 2.1 Performance budget

Measured against a real season file (236 slots, 16 teams, 8 per division):

| Iterations | Best score | Wall time |
|-----------:|-----------:|----------:|
| 20,000 | 3569 | 21s |
| 30,000 | 3469 | 30s |
| **50,000** | **3394** | **49s** |
| 200,000 | 3394 | 193s |

The simulated-annealing pass converges at the shipped 50,000-iteration setting;
150,000 further iterations yield no improvement. Generation time is therefore ~50s
for a full season, and the budget is set at 90s to leave headroom for slower
hardware. Fairness is valued above speed here — a once-a-season wait of under a
minute is acceptable, and the iteration count is not to be cut without re-measuring.

Do **not** tune this against synthetic fixtures. A synthetic 16-team / 320-slot
league converged at 30,000 and suggested cutting the budget; it had two distinct
start times where the real file has ten. Re-measure against real data whenever the
scoring function changes (see `docs/v0.6-fairness-plan.md` Phase 5).

---

## 3. Development Workflow

### 3.1 Branching

- Protected `main` branch.
- Short-lived feature branches: `feature/<short-description>` or `fix/<short-description>`.
- Squash-merge on completion.

### 3.2 Commit Messages

```
<type>(scope?): <description>
```

Types: `feat`, `fix`, `docs`, `refactor`, `chore`. Scope is optional but useful (`feat(schedule): ...`).

### 3.3 Definition of Done

- [ ] Implements the stated requirement.
- [ ] `npm run lint` passes.
- [ ] `npm run build` succeeds.
- [ ] `npm run audit:standards` passes (or warnings are acknowledged).
- [ ] No hardcoded secrets, no stray `console.log`.
- [ ] Manually verified in the dev server for UI changes.

---

## 4. Security

- Never commit secrets — use environment variables prefixed `VITE_` only for values safe to expose to the client.
- CSV input is user-controlled — never `dangerouslySetInnerHTML` parsed cells; rely on React's default escaping.
- Validate uploaded CSVs with Zod before they touch the store.

---

*Based on the [Governance Claude Skill](https://github.com/wrsmith108/governance-claude-skill).*
