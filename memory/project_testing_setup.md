---
name: Testing infrastructure setup
description: MSW + Vitest + Playwright testing stack is fully implemented
type: project
---

MSW (Mock Service Worker), Vitest unit tests, and Playwright E2E tests were implemented in March 2026.

**Why:** No tests existed previously; CLAUDE.md mandates tests for all new features.

**How to apply:** When adding new features, follow the patterns established:
- Add MSW handlers to `src/mocks/handlers/` for new API endpoints
- Add factories to `src/mocks/factories/` for new data shapes
- Add unit tests alongside source files as `*.test.ts`
- Add E2E specs under `tests/e2e/<feature>/`
- Use `authenticatedPage` fixture from `tests/e2e/fixtures/auth.fixture.ts` for protected pages
- MSW handlers use `http://localhost:8000` as base URL (matches VITE_API_BASE_URL default)
- Vitest only picks up `src/**/*.test.ts` (not e2e specs)
