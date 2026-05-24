# CLAUDE.md — Puck Scheduler

Operational context for AI agents working in this repo. Engineering policy lives in [`standards.md`](./standards.md).

## What this project is

A sports-team (beer-league hockey) scheduler that generates round-robin / balanced schedules and produces a fairness report (ice times, opponent distribution).

## Stack

- **Framework**: Vite + React 18 + TypeScript
- **Routing**: react-router-dom
- **UI**: shadcn/ui (Radix primitives) + Tailwind CSS
- **State**: Zustand (`src/hooks/useSchedulerStore.ts`)
- **Forms**: react-hook-form + Zod
- **Data viz**: recharts
- **Tooling**: ESLint 9, TypeScript 5.8, bun/npm

## Layout

```
src/
  components/     UI components (tabs, panels, reports)
    ui/           shadcn primitives — do not edit by hand
  hooks/          Zustand store + UI hooks
  lib/            Pure logic: csvParser, csvExport; legacy scheduleGenerator (deprecated)
  pages/          Top-level routes (Index, NotFound)
  scheduler/      Scheduling pipeline (extracted from lib in v0.5)
                    index.ts         — generateSchedule entry point + re-exports
                    types.ts         — internal types (DivisionId, ScoreFn, …)
                    dayAssignment.ts — partition slots by division
                    matchups.ts      — round-robin pair generation
                    scoring.ts       — default ScoreFn implementation
                    slotOptimizer.ts — greedy slot-assignment pass
                    homeAway.ts      — convert assignments → Game records
                    fairness.ts      — calculateFairnessReport
  types/          scheduler.ts — domain types
docs/
  adr.md          Architecture decision record (canonical)
  prd.md          Product requirements document (canonical)
  archive/        Completed migration plans, governance reviews, superseded specs
```

Core scheduling logic is in `src/scheduler/` (entry: `src/scheduler/index.ts`). CSV import/export in `src/lib/csvParser.ts` and `src/lib/csvExport.ts`.

## Commands

| Task | Command |
|------|---------|
| Dev server | `npm run dev` |
| Production build | `npm run build` |
| Dev-mode build | `npm run build:dev` |
| Lint | `npm run lint` |
| Preview build | `npm run preview` |
| Standards audit | `npm run audit:standards` |

There is currently no test runner configured. The standards audit is the closest thing to an automated quality gate.

## Conventions

- Domain types live in `src/types/scheduler.ts` — extend there, don't redefine inline.
- Scheduling pipeline logic lives in `src/scheduler/`; CSV utilities stay in `src/lib/`; components consume both through the Zustand store.
- shadcn components in `src/components/ui/` are generated — re-generate rather than hand-editing.
- Path alias `@/` maps to `src/` (see `tsconfig.json`, `vite.config.ts`).

## Governance

This repo uses the [governance Claude skill](https://github.com/wrsmith108/governance-claude-skill). When asked to "review", "commit", or discuss "standards", the skill activates and surfaces checklists from `standards.md`.
