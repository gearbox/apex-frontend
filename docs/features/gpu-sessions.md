# GPU sessions — implementation map

This is an implementation map, not a restatement of the contract. For lifecycle semantics, card
states, SSE event payloads, and the operation-cache merge rule, see
[`docs/contracts/session-state-ux-contract.md`](../contracts/session-state-ux-contract.md) — this
document says where each rule is implemented and how the pieces recover from failure.

## Ownership

| Concern | Owner | Notes |
| --- | --- | --- |
| Provider catalog / runtime | `GET /v1/providers` via `src/lib/queries/providers.ts` | Sole authority for Create model-card readiness (`deriveCardState` in `src/lib/utils/sessionState.ts`). Never combined with session/deployment scalars to derive a third state. |
| Session list | `src/lib/queries/sessions.ts` (`sessionsListQueryOptions`) | Navigation/list summary only — thin `GpuSessionListItemResponse` projection, no operation bodies. |
| Session detail | `src/lib/queries/sessions.ts` (`sessionDetailQueryOptions`) | Session/deployment management surface. Full `GpuSessionResponse`, ingested through the operation cache on every fetch. |
| Operation cache | `src/lib/queries/operations.ts` | Live progress. Canonical, revision-ordered store for every `OperationResponse`, regardless of source. |
| SSE | `src/lib/services/eventStream.ts` | Incremental operation updates (`operation_updated`) applied directly; `status_changed`/`deployment_status_changed` treated as debounced REST-invalidation signals only. |
| Fallback GET | `operationQueryOptions` in `src/lib/queries/operations.ts` | Recovery only — bounded polling while SSE is down, and only for non-terminal operations. |

## Query/cache keys

```ts
providerKeys.catalog()                 // src/lib/queries/providers.ts
sessionKeys.list(includeTerminal)      // src/lib/queries/sessions.ts
sessionKeys.detail(sessionId)          // src/lib/queries/sessions.ts
operationKeys.detail(operationId)      // src/lib/queries/operations.ts — gcTime: Infinity
```

Every embedded `OperationResponse` — a session's `bootstrap_operation`, a deployment's
`current_operation`, an attach/remove mutation's `202` body, an `operation_updated` SSE frame, or
the SSE-down fallback GET — merges into `operationKeys.detail(id)` through
`upsertOperation()`/`ingestSessionSnapshot()`, gated by `incoming.revision > cached.revision`
(revision `0` is a valid first write, never treated as absent).

## Main frontend surfaces

Current as of this branch; use `git log`/the source tree as authority if files have since moved.

| Surface | File |
| --- | --- |
| Create page session integration | `src/routes/(app)/app/create/+page.svelte` |
| Sessions page | `src/routes/(app)/app/sessions/+page.svelte` |
| Start-a-session panel (Sessions page) | `src/lib/components/sessions/StartSessionPanel.svelte` |
| Session status panel (Create page) | `src/lib/components/sessions/CreateSessionPanel.svelte` |
| SessionCardContainer | `src/lib/components/sessions/SessionCardContainer.svelte` |
| SessionCard | `src/lib/components/sessions/SessionCard.svelte` |
| DeploymentRow | `src/lib/components/sessions/DeploymentRow.svelte` |
| OperationProgress | `src/lib/components/sessions/OperationProgress.svelte` |
| AttachDeploymentSheet | `src/lib/components/sessions/AttachDeploymentSheet.svelte` |
| RemoveDeploymentModal | `src/lib/components/sessions/RemoveDeploymentModal.svelte` |
| StopSessionModal | `src/lib/components/sessions/StopSessionModal.svelte` |
| EventStreamService | `src/lib/services/eventStream.ts` |
| Card-state derivation | `src/lib/utils/sessionState.ts` (`deriveCardState`, `isGenerateEnabled`, `canStartSession`) |
| Attach/remove eligibility | `src/lib/utils/deploymentEligibility.ts` |
| Session/provider/operation query modules | `src/lib/queries/{sessions,operations,providers}.ts` |
| REST client functions | `src/lib/api/sessions.ts`, `src/lib/api/events.ts` (SSE payload types/guards) |

## Recovery model

- **Healthy SSE**: zero normal operation polling. `operation_updated` frames apply directly by
  revision; `status_changed`/`deployment_status_changed` invalidate session detail + the
  authenticated providers query under one per-session ~250ms trailing debounce
  (`EventStreamService`'s `gpuReconciliations` map).
- **Fallback**: `isSSEFallback` (from `src/lib/stores/eventStream.ts`) switches session
  list/detail queries to bounded polling (8s) and `operationQueryOptions` to bounded polling (3s),
  but only while the cached operation is non-terminal — a known-terminal operation causes zero
  fallback GET.
- **Reconnect**: a fresh connection triggers REST reconciliation (session-detail refetch), then
  resumes normal zero-polling SSE behavior.
- **Revision-safe operations**: only `incoming.revision > cached.revision` may replace a cached
  operation, so a stale REST response arriving after a newer SSE frame can never regress the UI,
  and vice versa.
- **Independent provider/session snapshots**: `GET /v1/providers` and `GET /v1/sessions/{id}` are
  unversioned and may transiently disagree after an invalidation. Rendering never blocks on them
  agreeing, and the frontend never synthesizes a third state from the disagreement — Create reads
  card readiness only from provider runtime; Sessions reads deployment/session lifecycle only from
  session detail.

## Browser floor

See [`docs/contracts/browser-support.md`](../contracts/browser-support.md) for the current
supported-browser policy; this feature introduces no exceptions to it.

## Non-goals

- The frontend does not own GPU capacity policy (admission control, scheduling, or bin-packing)
  — that is entirely backend-authoritative.
- The frontend never derives `RuntimeState` from session or deployment status scalars; it only
  renders the server-provided `model.runtime`.
- The frontend never estimates operation ETA, throughput, or percentage from `work`/`items`
  counts — `progress.eta_seconds` is the only ETA, and it is `null` unless backend-derived from
  live throughput. `model.provisioning` hints are coarse display text only.
- Worker pooling, multiplexing, or predictive capacity management are out of scope for this
  frontend arc entirely.

## Coverage matrix

| Behavior | Unit/component | Mocked E2E | Live smoke |
| --- | ---: | ---: | ---: |
| Start/bootstrap | yes | yes | checklist |
| Active/Generate readiness | yes | yes | checklist |
| Attach (incl. `none→provisioning→suspended→active`) | yes | yes | checklist |
| Pause/resume | yes | yes | checklist |
| Remove non-force | yes | yes | checklist |
| Final-active force warning | yes | yes | checklist |
| Stop preview/confirm | yes | yes | checklist |
| Failed attach (runtime `none`, error retained in detail) | yes (`SessionCard.test.ts`) | yes (new: `gpu-session-lifecycle.spec.ts`) | checklist if practical |
| Stale/unreachable session | yes (`card-state-machine.spec.ts` covers Create) | yes (new: Sessions-page stale coverage added) | checklist |
| SSE healthy (zero polling) | yes (`OperationProgress.fallback.test.ts`) | not re-exercised in E2E — see note below | indirect/live |
| SSE fallback/reconnect | yes (`OperationProgress.fallback.test.ts`, `eventStream.test.ts`) | not re-exercised in E2E — see note below | optional |
| Out-of-order provider/session snapshots | n/a (REST-shape unit tests) | yes (new: `gpu-session-lifecycle.spec.ts`, both directions) | n/a |
| Mobile dialogs/layout | n/a | yes (new: `sessions-mobile.spec.ts`, Chromium + WebKit) | device smoke |
| Auth/caller cancellation | yes (`eventStream.test.ts`, `api/client.test.ts`) | not required | n/a |

**Note on SSE rows**: every existing Playwright spec in this repo forces `/v1/events/sse-ticket`
to `503` (see `tests/e2e/fixtures/auth.fixture.ts`) so the app runs in bounded-fallback-poll mode
deterministically — no E2E spec, old or new, drives real `EventSource` push frames. The "healthy
SSE → zero polling → fallback → bounded polling → reconnect → zero polling again" chain is
exercised as a genuine mounted-component integration test (real `QueryClient`, real MSW, real
Svelte components) in `OperationProgress.fallback.test.ts`, which is the right layer for it. The
new lifecycle E2E spec instead exercises the *consequence* of always-fallback mode: bounded
operation/session polling picking up backend-driven transitions the user didn't trigger
(bootstrap completion, cohort restart, deployment removal, stop finishing).
