# CLAUDE.md — Puck Scheduler

Operational context for AI agents working in this repo. Engineering policy lives in [`standards.md`](./standards.md).

## What this project is

A sports-team (beer-league hockey) scheduler that generates round-robin / balanced schedules and produces a fairness report (ice times, opponent distribution).

## Stack

- **Framework**: Vite + React 18 + TypeScript
- **Routing**: react-router-dom
- **UI**: shadcn/ui (Radix primitives) + Tailwind CSS
- **State**: custom React `useState` store hook (`src/hooks/useSchedulerStore.ts`) — *not* Zustand; see ADR §Deviations
- **Concurrency**: schedule generation runs in a web worker (`src/scheduler/worker.ts`)
- **Forms**: react-hook-form + Zod
- **Data viz**: recharts
- **Parsing**: PapaParse (CSV) + SheetJS (Excel), validated with Zod
- **Testing**: Vitest
- **Tooling**: ESLint 9, TypeScript 5.8, bun/npm

## Layout

```
src/
  components/     UI components (tabs, panels, reports)
    ui/           shadcn primitives — do not edit by hand
  hooks/          useSchedulerStore (state + localStorage) + UI hooks
  lib/            csvExport, debouncedStorage, generateId; csvParser (display
                  formatters only — parseCSV is superseded by src/parsers/)
  pages/          Top-level routes (Index, NotFound)
  parsers/        File ingest: csvParser (PapaParse), excelParser (SheetJS),
                  iceSlotRow (shared Zod schema + column aliases)
  scheduler/      Scheduling pipeline (extracted from lib in v0.5)
                    index.ts         — generateSchedule entry point + re-exports
                    types.ts         — internal types (DivisionId, ScoreFn, …)
                    dayAssignment.ts — partition slots by division
                    matchups.ts      — round-robin pair generation
                    scoring.ts       — default ScoreFn implementation
                    slotOptimizer.ts — simulated-annealing slot assignment
                    homeAway.ts      — convert assignments → Game records
                    fairness.ts      — calculateFairnessReport
                    rng.ts           — seeded mulberry32 PRNG
                    worker.ts        — web-worker entry point
                    workerTypes.ts   — main-thread ↔ worker message contract
  types/          scheduler.ts — domain types
docs/
  adr.md          Architecture decision record (canonical)
  prd.md          Product requirements document (canonical)
  v0.6-fairness-plan.md  Active implementation plan — reviewed, not yet
                  implemented (slot-block assignment, time-of-day fairness,
                  same-day elimination)
  archive/        Completed migration plans, governance reviews, superseded specs
```

Core scheduling logic is in `src/scheduler/` (entry: `src/scheduler/index.ts`). File import lives in `src/parsers/`; CSV export in `src/lib/csvExport.ts`.

## Commands

| Task | Command |
|------|---------|
| Dev server | `npm run dev` |
| Production build | `npm run build` |
| Dev-mode build | `npm run build:dev` |
| Lint | `npm run lint` |
| Preview build | `npm run preview` |
| Tests | `npx vitest run` |
| Standards audit | `npm run audit:standards` |

Vitest is configured (see `vitest.config.ts`); the suite currently covers the
scheduler, parsers, and storage helpers. Note there is no `npm test` alias — run
`npx vitest run` directly. Lint, build, tests, and the standards audit are the
automated gates.

## Conventions

- Domain types live in `src/types/scheduler.ts` — extend there, don't redefine inline.
- Scheduling pipeline logic lives in `src/scheduler/`; file ingest in `src/parsers/`; export helpers in `src/lib/`; components consume all three through the `useSchedulerStore` hook.
- shadcn components in `src/components/ui/` are generated — re-generate rather than hand-editing.
- Path alias `@/` maps to `src/` (see `tsconfig.json`, `vite.config.ts`).

## Governance

This repo uses the [governance Claude skill](https://github.com/wrsmith108/governance-claude-skill). When asked to "review", "commit", or discuss "standards", the skill activates and surfaces checklists from `standards.md`.
