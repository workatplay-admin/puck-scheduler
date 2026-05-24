# Puck Scheduler

A browser-based scheduling tool for beer-league hockey commissioners. Upload your ice times, enter your teams, and it generates a balanced round-robin schedule with a fairness report covering ice-time distribution (per-team **Late Surplus**, weekend exposure) and opponent variety. Everything runs client-side; schedules are saved in `localStorage` and exported to CSV.

## Getting started

```bash
npm install
npm run dev
```

The dev server prints a local URL (default `http://localhost:5173`). Open it in a browser.

## Commands

| Task | Command |
|------|---------|
| Dev server | `npm run dev` |
| Production build | `npm run build` |
| Preview production build | `npm run preview` |
| Lint | `npm run lint` |
| Tests | `npx vitest run` |
| Standards audit | `npm run audit:standards` |

## Project layout

```text
src/
  components/   UI (tabs, dialogs, reports). shadcn primitives live in components/ui/.
  hooks/        Zustand-style store (useSchedulerStore).
  scheduler/    Scheduling pipeline: day assignment, matchup generation,
                slot optimization (simulated annealing), fairness scoring.
  parsers/      CSV / Excel ingest.
  lib/          CSV export + small utilities.
  types/        Domain types (Schedule, IceSlot, Team, FairnessReport).
  pages/        Top-level routes.
```

Heavy schedule generation runs in a web worker (`src/scheduler/worker.ts`) so the UI stays responsive during the 50k-iteration annealing pass.

## Testing

`npx vitest run` exercises 83 tests across 10 files, covering: hard invariants on the matchup pool (per-pair and per-team game-count spread ≤ 1 across a sweep of team and slot counts), fairness scoring (Late Surplus metric and a two-level concentration guard), 10-run convergence on weekend variance, seed reproducibility, and a perf-regression baseline that asserts `bestScore` and iteration count stay within ±25% of a stored fixture. Parser tests cover CSV and Excel ice-slot ingest.

## Documentation

- [`docs/prd.md`](docs/prd.md) — product requirements
- [`docs/adr.md`](docs/adr.md) — architecture decisions and pipeline details
- [`docs/archive/`](docs/archive/) — superseded plans and completed governance reviews
- [`CLAUDE.md`](CLAUDE.md) — context for AI agents working in this repo
- [`standards.md`](standards.md) — engineering standards enforced by the governance skill

## Deployment

The app is a static Vite build with no backend.

```bash
npm run build      # writes static assets to dist/
```

Deploy `dist/` to any static host (Vercel, Netlify, GitHub Pages, S3+CloudFront). On Vercel the default Vite preset works without configuration.
