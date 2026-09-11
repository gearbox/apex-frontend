# GPU session — live/staging smoke checklist

This is **manual/live integration coverage**, distinct from automated CI coverage. It exercises a
real backend and real (billable) GPU provisioning. It is intentionally **not** part of the
`Verify` GitHub Actions workflow — see [Automated vs. manual coverage](#automated-vs-manual-coverage)
below.

## Status of this checklist

**Live smoke not executed — environment/credentials not available.** This document was authored
during a coding-agent session with no staging backend URL, no staging account credentials, and no
disposable GPU budget available in the environment. Nothing below has been run against a real
backend; do not treat this file as evidence that the live path works. Run it manually against
staging before relying on it, and record the result (date, browser/device, backend SHA) at the
bottom of this file.

## Prerequisites

1. A staging (not production) Apex backend (`gearbox/apex`) with GPU provisioning enabled and at
   least one on-demand-provisioned model configured and enabled.
2. A staging user account with sufficient token balance to cover session bootstrap, at least one
   additive attach, and a minimal generation job.
3. Access to the staging environment's billing/admin view (or equivalent logs) to confirm the GPU
   session actually terminates and billing stops after the checklist's Stop step.
4. A disposable GPU budget explicitly approved for this test run — GPU-minute costs are real and
   billed the moment a session reaches `active`, independent of whether generation jobs run.

## Cost / billing caution

- Starting a session begins metered billing immediately on `active`, before any generation job is
  submitted.
- Attaching a second model can trigger a cohort restart that keeps the GPU (and its billing)
  running for the whole cohort, not only the newly attached model.
- Do not leave a session running unattended after the checklist. If a step is interrupted, stop
  the session before ending the session.
- Do not perform the "exercise final-active removal warning" step's actual confirmation unless
  you are intentionally testing force-removal billing continuation — canceling out of the warning
  is sufficient to verify the UI copy.

## Checklist

Run all steps against the deployed staging frontend build (not `pnpm dev`), in one browser/device
session, in order:

1. **Prerequisites** — confirm staging backend reachability, staging account balance, and that at
   least one on-demand model reports `available: true` on `GET /v1/providers`.
2. **Start one on-demand model** — from `/app/sessions` (or `/app/create`), start a session for
   the chosen model. Confirm the UI shows a provisioning/starting state immediately, without a
   client-side error.
3. **Observe the bootstrap operation** — confirm operation phase/progress text updates over time
   (`preflight` → … → `verifying`/`restart` as applicable), and that no ETA or percentage appears
   to be fabricated when the backend has not supplied one.
4. **Wait for active** — confirm the session reaches `active` on both `/app/create` (Generate
   becomes enabled) and `/app/sessions` (Pause/Add model/Stop become available), without manually
   refreshing.
5. **Generate one minimal job if needed to prove routing** — submit the smallest/cheapest
   supported generation for the active model and confirm it completes and appears in the gallery.
6. **Attach another compatible model** — from `/app/sessions`, use "Add model" to attach a second
   on-demand model eligible under the current provider/session state.
7. **Observe provisioning/restart as backend dictates** — do not assume a specific transition
   sequence; record what actually happens (e.g. `none → provisioning → active`, or an intermediate
   restart/suspended phase affecting the original deployment too).
8. **Pause with zero jobs** — confirm Pause is available only when there is no in-flight job, and
   that pausing is reflected on both surfaces.
9. **Resume** — confirm the session returns to `active` and Generate re-enables.
10. **Remove the additive deployment** — remove the second model while the first remains active;
    confirm this is a plain (non-force) removal with no billing-continuation warning.
11. **Exercise the final-active removal warning without confirming** (unless intentionally testing
    it) — attempt to remove the last remaining live deployment and confirm the UI clearly warns
    that the session keeps running and billing until stopped; cancel out rather than confirming,
    unless you specifically intend to test the force path and have budgeted for it.
12. **Stop via preview + confirmation** — use the Stop control; confirm the preview step alone
    does not terminate the session (no billing/state change from preview), then confirm the
    session actually stops after explicit confirmation.
13. **Verify provider runtime returns to `none`** — confirm `GET /v1/providers` (or the UI) shows
    the model's runtime back at `none`, and that the session no longer appears as active on
    `/app/sessions`.
14. **Simulate/recover from an SSE interruption if feasible** — e.g. briefly disable network to
    the SSE endpoint (dev tools network throttling/offline toggle) during an active operation,
    confirm the UI falls back to polling without erroring, then restore connectivity and confirm
    normal behavior resumes.
15. **Record the browser/device used** — fill in the record below.

## Automated vs. manual coverage

| | Automated CI | Manual/live smoke (this document) |
| --- | --- | --- |
| Backend | Mocked (`page.route()` / MSW) | Real staging backend |
| GPU provisioning | Simulated state machine (`tests/e2e/helpers/gpuSessionScenario.ts`) | Real, billed |
| Runs on every PR | Yes (`Verify` workflow) | No — manual only |
| Purpose | Regression safety net for frontend logic | Confirms the real contract still matches what the frontend assumes |

Do not add real GPU provisioning to the `Verify` workflow, and do not add staging credentials or
secrets to this repository.

## Result log

| Date | Backend SHA | Browser/device | Result | Notes |
| --- | --- | --- | --- | --- |
| _(none yet)_ | | | Not executed | Environment/credentials not available in the authoring session. |
