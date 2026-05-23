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
| Utilities | camelCase | `scheduleGenerator.ts` |
| Types/Interfaces | PascalCase | `interface Team {}` |
| Constants | SCREAMING_SNAKE | `const MAX_ROUNDS = 20` |
| Environment vars | SCREAMING_SNAKE | `VITE_API_URL` |

### 1.3 File Organization

- Max **500 lines** per file — split if larger.
- One component per file.
- Pure logic in `src/lib/`, UI in `src/components/`, state in `src/hooks/`.
- Domain types live in `src/types/scheduler.ts`.

### 1.4 Documentation

- JSDoc on exported functions in `src/lib/` (the scheduling/CSV logic that other modules depend on).
- Inline comments only for non-obvious algorithmic choices (e.g., why a particular pairing heuristic is used).
- Significant architectural changes get an ADR in `docs/`.

### 1.5 Code Review

| Category | Criteria |
|----------|----------|
| Correctness | Schedule fairness invariants hold; CSV round-trips losslessly |
| Security | No secrets committed; user-supplied CSV/text sanitized before render |
| Performance | Schedule generation completes in <1s for typical league sizes |
| Type safety | No `any`; Zod at boundaries |

---

## 2. Testing

No test runner is configured yet. When tests are introduced:

- **Vitest** for unit tests (pairs naturally with Vite).
- **Playwright** for E2E once flows stabilize.
- Pure functions in `src/lib/` are the priority targets — `scheduleGenerator`, `csvParser`, `csvExport`.
- Write tests alongside code, not after.

Until then, `npm run audit:standards` and `npm run lint` are the automated gates.

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
