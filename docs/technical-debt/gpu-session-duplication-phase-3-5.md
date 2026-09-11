# Phase 3.5 handoff — GPU-session structural duplication cleanup

This is a **handoff**, not the cleanup itself. Phase 3 deliberately did not perform broad
duplication refactoring (see `agent_prompts/apex-frontend-phase-3-gpu-session-integration-closure-prompt.md`,
"Important scope decision — duplication cleanup is deferred"). This document records the measured
baseline and hotspots so Phase 3.5 can start from real data.

## Baseline

**No duplication-analyzer config exists anywhere in this repository** — no `.jscpd.json`, no
`jscpd`/similar devDependency, no CI step computing a duplication metric, and no checked-in report
substantiating the "Phase 2 raised code duplication above 7%" figure cited in the Phase 3 prompt.
That figure most likely came from an external tool (e.g. a hosted code-quality service run outside
this repo) that is not reproducible from inside this environment.

Rather than inventing a number, this session ran a fresh, disclosed, reproducible substitute:

- **Analyzer**: [`jscpd`](https://github.com/kucherenko/jscpd) `5.2.0`, invoked ad-hoc via
  `npx --yes jscpd@5.2.0` (not installed as a project dependency, not added to CI).
- **Date**: 2026-09-11.
- **Commit**: branch `feat/gpu-session-phase-3-closure`, based on `main` @
  `7f6c8c34020c2b26c9f46823320afc2e5fd06e38`, with Phase 3's own new files present at analysis
  time (see [Phase 3 contributed some of this](#phase-3-contributed-some-of-this-too) below).
- **Settings**: `--min-lines 5 --min-tokens 40` (jscpd defaults), scanning `src` and `tests`,
  excluding `**/*.test.ts` and `src/paraglide/**` (generated).
- **Scope of the headline number**: **overall project duplication**, not new-code/diff duplication
  — this is a whole-tree snapshot, not a PR-diff delta.

| Run | Scope | Files | Duplicated lines | Duplicated tokens |
| --- | --- | ---: | ---: | ---: |
| A | `src` + `tests`, generated `lib/api/types.ts` **included** | 596 | 8.81% | 10.03% |
| B | Same as A, generated `lib/api/types.ts` / `schema.json` **excluded** | 595 | 5.04% | 6.52% |
| C | GPU-session feature files only (components/sessions, queries, eventStream.ts, sessionState.ts, deploymentEligibility.ts, api/sessions.ts, api/events.ts, mocks, tests/e2e/sessions, tests/e2e/create) | 104 | 5.75% | 7.63% |

Run A's higher number is an artifact of `src/lib/api/types.ts`, the generated OpenAPI types file
(8,172 duplicated lines on its own — openapi-typescript output is inherently repetitive across
similarly-shaped endpoint definitions). **Do not target the generated types file for cleanup** —
per this repo's conventions, it is regenerated from `schema.json` via `pnpm gen:api` and must not
be hand-edited. Run B, which excludes it, is the more meaningful whole-project baseline. Run C
— scoped to exactly the GPU-session feature surface — lands close to the "above 7%" figure the
Phase 3 prompt cites, which is plausible corroboration even though the exact original analyzer
is unavailable.

**Headline number for Phase 3.5 to beat**: **6.52% duplicated tokens, whole-project, excluding
generated files** (Run B), with the GPU-session feature subset separately tracked at **7.63%**
(Run C) since that is the arc this phase is closing.

## Hotspots

Ranked by duplicated lines contributed, from Run B's clone report (not assumed — inspected):

1. **CSS, whole project (~29% of CSS tokens duplicated)** — the single largest concentration by
   percentage, and **not primarily GPU-session code**. Dominated by modal/dialog chrome repeated
   near-verbatim across `src/lib/components/admin/*.svelte` (`AccountAdjustModal`, `AdminOrgsTab`,
   `DeletePricingConfirm`, `AdminManageTab`, `AdminUsersTab`, `AdminPaymentsTab`,
   `AdminPricingTab`, `EditUserModal`, `PricingRuleModal`) and profile/create modals
   (`ChangePasswordModal`, `DeleteAccountModal`, `AgeVerificationModal`). `StopSessionModal.svelte`
   contributes a much smaller amount (~58 duplicated lines) of the same pattern — confirms the
   prompt's predicted "responsive CSS" / "repeated modal/layout fragments" category, but the bulk
   of it sits outside this Phase 3 arc entirely.
2. **Playwright route/session-test fixtures, within the GPU-session arc** — `tests/e2e/sessions/sessions.spec.ts`
   (~399 duplicated lines, mostly repeated inline provider/session mock builders across its 14
   tests — matches the existing inventory finding that each spec file hand-rolls its own
   `makeAishaProvider`/`makeSession`-style helpers rather than sharing one), plus
   `tests/e2e/create/card-state-machine.spec.ts` (~257 lines, same pattern). This is exactly the
   "duplicate session API route harnesses" / "session lifecycle test payloads" category the Phase
   3 prompt predicted.
3. **`src/lib/queries/sessions.ts`** (~24 duplicated lines) — the mutation-options factories
   (`pauseSessionMutationOptions`, `resumeSessionMutationOptions`,
   `attachDeploymentMutationOptions`, `removeDeploymentMutationOptions`) share a near-identical
   `mutationFn` + `onSuccess: (session) => writeSessionMutationSnapshot(...)` shape already
   partially deduplicated via `writeSessionMutationSnapshot`/`reconcileDeploymentMutation` — a
   small residual "repeated lifecycle action/error plumbing" pattern remains between those two
   helpers themselves.
4. **`src/mocks/factories/session.ts`** (~22 duplicated lines) — minor repetition inside the
   `OperationResponse`-shaped defaults across factory functions.

### Phase 3 contributed some of this, too

This session's own new files are part of the Run B/C corpus and are not exempt from the honest
accounting:

- `tests/e2e/sessions/gpu-session-lifecycle.spec.ts` and `tests/e2e/sessions/sessions-mobile.spec.ts`
  share a repeated "construct a `GpuSessionScenario`, install it, start+bootstrap a session"
  setup sequence across roughly a dozen tests combined (~180 duplicated lines between the two
  files). This is the same category as hotspot #2 above, just newly added rather than
  inherited. It was an accepted, explicit trade-off for Phase 3 (a small per-test setup helper
  was judged not worth extracting yet, to avoid combining new test-helper abstraction with the
  large lifecycle test itself in one phase — see the Phase 3 prompt's "introduce a small dedicated
  helper... if necessary" allowance) — but it is real duplication a `GpuSessionScenario`-aware
  fixture (e.g. an `authenticatedPage`-style fixture that constructs+installs+bootstraps a
  scenario) could remove in Phase 3.5.
- `tests/e2e/helpers/gpuSessionScenario.ts` shares a small amount of structure with
  `src/mocks/factories/session.ts` (~58 lines) — both build `OperationResponse`/`GpuSessionResponse`
  defaults; the scenario helper already reuses the mock factories directly rather than
  reimplementing them, so this residual is mostly the state-machine coordination code jscpd still
  flags as similar due to repeated `advanceOperation`/`setRuntime` call shapes, not truly
  duplicated logic.

## Candidate cleanup order

In order of expected value for the least behavioral risk:

1. **Duplicate test fixtures/builders (highest value, lowest risk)**: consolidate the
   provider/session mock builders that `sessions.spec.ts`, `card-state-machine.spec.ts`,
   `gpu-session-lifecycle.spec.ts`, and `sessions-mobile.spec.ts` each currently define inline
   (`makeAishaProvider`, `makeSession`, and this phase's `GpuSessionScenario` setup boilerplate)
   behind one shared fixture or a small `startBootstrappedScenario(page, models)` helper. This is
   the single largest, safest win — pure test-code consolidation with the full existing suite as
   the regression safety net.
2. **Duplicate session API route harnesses**: consider whether `GpuSessionScenario` (introduced
   this phase, currently used only by the two new spec files) is worth extending to some of the
   older hand-rolled route handlers in `sessions.spec.ts`/`card-state-machine.spec.ts` — but only
   where it removes real duplication without a wholesale rewrite of passing, focused tests (the
   Phase 3 prompt explicitly warns against "rewrite all current session E2E fixtures").
3. **Repeated presentation formatting**: minor — `src/lib/queries/sessions.ts`'s two near-identical
   mutation-options factories could share a tiny `sessionMutationOptions(mutationFn)` wrapper.
4. **Repeated lifecycle action/error plumbing**: same file, same opportunity as #3.
5. **Repeated modal/layout fragments**: the CSS hotspot (#1 above) is the largest single number in
   this report but is **explicitly out of the GPU-session arc's scope** — it belongs to a
   separate admin/profile modal-chrome cleanup effort, not this feature's Phase 3.5. Flagging it
   here only so it isn't mistaken for a GPU-session-specific problem if someone re-runs this
   analysis and sees the CSS format bucket dominate the total.

Avoid merging components merely because their markup looks similar; none of the hotspots above
require a component-hierarchy redesign.

## Phase 3.5 goal

- Reduce measured duplication materially within the GPU-session test scope (Run C, currently
  7.63% duplicated tokens) — a plausible, non-fabricated target is bringing it under 5%, in line
  with Run B's whole-project (non-generated) baseline of 6.52%, but Phase 3.5 should re-run this
  same `jscpd` invocation (or whatever quality-gate tool is authoritative at that time) rather than
  trust this number as still current.
- Preserve Phase 3's integration tests (`gpu-session-lifecycle.spec.ts`, `sessions-mobile.spec.ts`)
  as the safety net — any fixture consolidation must keep all of them, plus the pre-existing
  `sessions.spec.ts`/`card-state-machine.spec.ts`, green.
- No feature-behavior changes — this is refactoring test/query plumbing, not product code paths.
- Report a real before/after duplication metric using whatever tool is run, with the same
  transparency about scope (whole-project vs. feature-scoped, generated files included or not)
  as this document.

Do not set a fake target solely to satisfy this handoff. If Phase 3.5 starts with a different,
already-configured quality-gate tool, use that tool's own baseline instead of this one.
