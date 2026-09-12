import { expect, type Page } from '@playwright/test';
import type { components } from '../../../src/lib/api/types';
import {
  makeGpuSessionResponse,
  makeGpuSessionListItemResponse,
  makeOperationResponse,
  makeStopConfirmationResponse,
} from '../../../src/mocks/factories/session';
import { makeAishaImageModelInfo } from '../../../src/mocks/factories/providers';
import { jsonRoute } from './api';

type ModelType = components['schemas']['ModelType'];
type ModelInfo = components['schemas']['ModelInfo'];
type ModelRuntimeResponse = components['schemas']['ModelRuntimeResponse'];
type GpuSessionResponse = components['schemas']['GpuSessionResponse'];
type GpuSessionListItemResponse = components['schemas']['GpuSessionListItemResponse'];
type GpuSessionStatus = components['schemas']['GpuSessionStatus'];
type DeploymentResponse = components['schemas']['DeploymentResponse'];
type OperationResponse = components['schemas']['OperationResponse'];
type OperationKind = components['schemas']['OperationKind'];
type StopConfirmationResponse = components['schemas']['StopConfirmationResponse'];

const NOW = '2026-06-20T00:00:00Z';
const SESSION_ID = 'sess_lifecycle';

function emptyRuntime(): ModelRuntimeResponse {
  return { state: 'none', session_id: null, deployment_id: null, operation_id: null };
}

export interface ScenarioModel {
  modelType: ModelType;
  name: string;
}

/** Installs the stateful lifecycle fake without concealing any state transition. */
export async function createInstalledGpuSessionScenario(
  page: Page,
  models: ScenarioModel[],
): Promise<GpuSessionScenario> {
  const scenario = new GpuSessionScenario(models);
  await scenario.install(page);
  return scenario;
}

/**
 * For tests that require an already-active session but do not verify bootstrap itself. Tests
 * covering bootstrap transitions should keep `startSession()` and `completeBootstrap()` explicit.
 */
export async function startActiveGpuSessionScenario(
  page: Page,
  models: ScenarioModel[],
  primaryModel: ModelType,
): Promise<GpuSessionScenario> {
  const scenario = await createInstalledGpuSessionScenario(page, models);
  scenario.startSession(primaryModel);
  scenario.completeBootstrap();
  return scenario;
}

/**
 * A small stateful fake of the GPU-session backend surface for Playwright.
 *
 * One coherent mutable state backs `/v1/providers`, `/v1/sessions`, and the deployment/operation
 * mutation endpoints, so a lifecycle test can drive one backend narrative (start -> attach ->
 * pause/resume -> remove -> stop) across both `/app/create` and `/app/sessions` without
 * hand-authoring contradictory JSON per route, and without migrating the existing focused
 * session specs (see agent_prompts/apex-frontend-phase-3-gpu-session-integration-closure-prompt.md
 * — "duplication cleanup is deferred" / "do not migrate the entire existing session suite").
 *
 * SSE is not exercised here: every existing E2E spec forces `/v1/events/sse-ticket` to 503 (see
 * `tests/e2e/fixtures/auth.fixture.ts`) so the app runs in bounded-fallback-poll mode, which is
 * the only SSE-adjacent behavior Playwright can deterministically drive. That fallback mode is
 * exactly what exercises "bounded GET while non-terminal" / "zero GET once terminal" here.
 */
export class GpuSessionScenario {
  private sessionStatus: GpuSessionStatus = 'active';
  private inFlightJobCount = 0;
  private deployments: DeploymentResponse[] = [];
  private operations = new Map<string, OperationResponse>();
  private runtimeByModel = new Map<ModelType, ModelRuntimeResponse>();
  private stopPreview: StopConfirmationResponse = makeStopConfirmationResponse({
    session_id: SESSION_ID,
  });
  private opCounter = 0;
  private hasSession = false;
  private providerFrozen: ModelInfo[] | null = null;
  private sessionFrozen: GpuSessionResponse | null = null;
  private readonly requestCounts = new Map<string, number>();
  private readonly deleteQueries: string[] = [];
  private readonly attachBodies: unknown[] = [];
  private readonly cohortsByOperation = new Map<string, ModelType[]>();

  constructor(private readonly models: ScenarioModel[]) {
    for (const model of models) {
      this.runtimeByModel.set(model.modelType, emptyRuntime());
    }
  }

  // ── request accounting ────────────────────────────────────────────────────

  private count(key: string): void {
    this.requestCounts.set(key, (this.requestCounts.get(key) ?? 0) + 1);
  }

  requestCount(key: string): number {
    return this.requestCounts.get(key) ?? 0;
  }

  deleteRequestUrls(): readonly string[] {
    return this.deleteQueries;
  }

  attachRequestBodies(): readonly unknown[] {
    return this.attachBodies;
  }

  // ── operation helpers ────────────────────────────────────────────────────

  private createOperation(kind: OperationKind, deploymentId: string | null): OperationResponse {
    this.opCounter += 1;
    const op = makeOperationResponse({
      id: `op_${this.opCounter}`,
      session_id: SESSION_ID,
      deployment_id: deploymentId,
      kind,
      status: 'queued',
      revision: 0,
    });
    this.operations.set(op.id, op);
    return op;
  }

  /** Bumps revision and merges fields — mirrors a real backend `operation_updated` frame. */
  private advanceOperation(id: string, partial: Partial<OperationResponse>): OperationResponse {
    const current = this.operations.get(id);
    if (!current) throw new Error(`gpuSessionScenario: unknown operation ${id}`);
    const next: OperationResponse = { ...current, ...partial, revision: current.revision + 1 };
    this.operations.set(id, next);
    return next;
  }

  private findDeployment(id: string): DeploymentResponse {
    const found = this.deployments.find((d) => d.id === id);
    if (!found) throw new Error(`gpuSessionScenario: unknown deployment ${id}`);
    return found;
  }

  deploymentIdFor(model: ModelType): string {
    const found = this.deployments.find((d) => d.model_type === model);
    if (!found) throw new Error(`gpuSessionScenario: no deployment for ${model}`);
    return found.id;
  }

  private setRuntime(model: ModelType, runtime: Partial<ModelRuntimeResponse>): void {
    const current = this.runtimeByModel.get(model) ?? emptyRuntime();
    this.runtimeByModel.set(model, { ...current, ...runtime });
  }

  // ── A. initial state — nothing to do; constructor already sets runtime: none ──────────────────

  // ── B. start ────────────────────────────────────────────────────────────

  /** `none -> provisioning`, with a valid `session_bootstrap` operation at revision 0. */
  startSession(model: ModelType): void {
    this.hasSession = true;
    this.sessionStatus = 'provisioning';
    const bootstrapOp = this.createOperation('session_bootstrap', 'deploy_primary');
    this.deployments = [
      {
        id: 'deploy_primary',
        model_type: model,
        bundle_name: 'aisha',
        bundle_version: null,
        status: 'deploying',
        pending_restart: false,
        routing_suspended: false,
        is_primary: true,
        created_at: NOW,
        activated_at: null,
        current_operation: bootstrapOp,
      },
    ];
    this.setRuntime(model, {
      state: 'provisioning',
      session_id: SESSION_ID,
      deployment_id: 'deploy_primary',
      operation_id: bootstrapOp.id,
    });
  }

  /** Backend-driven: bootstrap operation succeeds, primary deployment and runtime become active. */
  completeBootstrap(): void {
    const primary = this.findDeployment('deploy_primary');
    if (!primary.current_operation) throw new Error('no bootstrap operation to complete');
    const finished = this.advanceOperation(primary.current_operation.id, {
      status: 'succeeded',
      finished_at: NOW,
    });
    primary.status = 'active';
    primary.activated_at = NOW;
    primary.current_operation = finished;
    this.sessionStatus = 'active';
    this.setRuntime(primary.model_type, { state: 'active', operation_id: null });
  }

  // ── C. attach another model ────────────────────────────────────────────

  /** `none -> provisioning` for the attached model, via `POST .../deployments`. */
  attachModel(model: ModelType, deploymentId = 'deploy_attach'): void {
    const op = this.createOperation('bundle_provision', deploymentId);
    this.deployments.push({
      id: deploymentId,
      model_type: model,
      bundle_name: 'aisha',
      bundle_version: null,
      status: 'deploying',
      pending_restart: false,
      routing_suspended: false,
      is_primary: false,
      created_at: NOW,
      activated_at: null,
      current_operation: op,
    });
    this.setRuntime(model, {
      state: 'provisioning',
      session_id: SESSION_ID,
      deployment_id: deploymentId,
      operation_id: op.id,
    });
  }

  /**
   * `provisioning -> suspended` for every deployment in the cohort restart, via a
   * `comfyui_restart` operation whose `deployment_id` is deliberately `null` — modeling the
   * contract's cohort-restart shape rather than a simpler invented one. Every model in the
   * cohort — not only the one being attached — is suspended and later restored together, since a
   * cohort restart affects sibling deployments sharing the same GPU.
   */
  beginCohortRestart(models: ModelType[]): string {
    const op = this.createOperation('comfyui_restart', null);
    this.cohortsByOperation.set(op.id, models);
    for (const model of models) {
      this.setRuntime(model, { state: 'suspended', operation_id: op.id });
    }
    return op.id;
  }

  /**
   * `suspended -> active` for the whole cohort once the restart succeeds, plus the attached
   * deployment's own transition to `active`.
   */
  completeAttach(model: ModelType, restartOperationId: string): void {
    this.advanceOperation(restartOperationId, { status: 'succeeded', finished_at: NOW });
    const deployment = this.deployments.find(
      (d) => d.model_type === model && d.status === 'deploying',
    );
    if (!deployment) throw new Error(`gpuSessionScenario: no pending attach for ${model}`);
    deployment.status = 'active';
    deployment.activated_at = NOW;
    if (deployment.current_operation) {
      deployment.current_operation = this.advanceOperation(deployment.current_operation.id, {
        status: 'succeeded',
        finished_at: NOW,
      });
    }
    const cohort = this.cohortsByOperation.get(restartOperationId) ?? [model];
    for (const cohortModel of cohort) {
      this.setRuntime(cohortModel, { state: 'active', operation_id: null });
    }
  }

  /** A failed additive attach: `provisioning -> none`, with the failure retained in session detail. */
  failAttach(model: ModelType, message = 'Bundle provisioning failed: disk quota exceeded'): void {
    const deployment = this.deployments.find(
      (d) => d.model_type === model && d.status === 'deploying',
    );
    if (!deployment) throw new Error(`gpuSessionScenario: no pending attach for ${model}`);
    deployment.status = 'failed';
    if (deployment.current_operation) {
      deployment.current_operation = this.advanceOperation(deployment.current_operation.id, {
        status: 'failed',
        finished_at: NOW,
        error: { message },
      });
    }
    // RuntimeState has no `failed` member — the provider overlay reports `none`, indistinguishable
    // from "never provisioned" on the catalog alone. Session detail is where the failure persists.
    this.setRuntime(model, emptyRuntime());
  }

  // ── D. pause / resume ───────────────────────────────────────────────────

  pauseSession(): void {
    this.sessionStatus = 'paused';
    for (const deployment of this.liveDeployments()) {
      this.setRuntime(deployment.model_type, { state: 'paused' });
    }
  }

  resumeSession(): void {
    this.sessionStatus = 'active';
    for (const deployment of this.liveDeployments()) {
      this.setRuntime(deployment.model_type, { state: 'active' });
    }
  }

  /** A backend-reported unreachable session: `active -> stale`. Not a client-invented failure. */
  markStale(): void {
    this.sessionStatus = 'stale';
    for (const deployment of this.liveDeployments()) {
      this.setRuntime(deployment.model_type, { state: 'stale' });
    }
  }

  // ── E. remove an additive deployment ───────────────────────────────────

  /** `active -> removing` for the target deployment, via `DELETE .../deployments/{id}`. */
  removeDeployment(deploymentId: string): string {
    const deployment = this.findDeployment(deploymentId);
    const op = this.createOperation('bundle_removal', deploymentId);
    deployment.status = 'removing';
    deployment.current_operation = op;
    this.setRuntime(deployment.model_type, { state: 'removing', operation_id: op.id });
    return op.id;
  }

  /** `removing -> none`: the deployment record is retained (status `removed`), not deleted. */
  completeRemoval(deploymentId: string): void {
    const deployment = this.findDeployment(deploymentId);
    if (deployment.current_operation) {
      deployment.current_operation = this.advanceOperation(deployment.current_operation.id, {
        status: 'succeeded',
        finished_at: NOW,
      });
    }
    deployment.status = 'removed';
    this.setRuntime(deployment.model_type, emptyRuntime());
  }

  private liveDeployments(): DeploymentResponse[] {
    return this.deployments.filter(
      (d) => d.status === 'active' || d.status === 'deploying' || d.status === 'removing',
    );
  }

  // ── F. stop (two-call preview/confirm protocol) ────────────────────────

  setStopPreview(partial: Partial<StopConfirmationResponse>): void {
    this.stopPreview = { ...this.stopPreview, ...partial };
  }

  confirmStop(): void {
    this.sessionStatus = 'stopping';
  }

  /** Terminal teardown: session leaves the active list; every live model's runtime returns to `none`. */
  finishStop(): void {
    this.sessionStatus = 'stopped';
    for (const deployment of this.liveDeployments()) {
      this.setRuntime(deployment.model_type, emptyRuntime());
    }
    this.hasSession = false;
  }

  // ── cross-surface out-of-order snapshot delivery ───────────────────────

  /** Freezes `/v1/providers` on its current runtime snapshot until `unfreezeProviders()`. */
  freezeProviders(): void {
    this.providerFrozen = this.buildModelList();
  }

  unfreezeProviders(): void {
    this.providerFrozen = null;
  }

  /** Freezes `GET /v1/sessions/{id}` on its current detail snapshot until `unfreezeSessionDetail()`. */
  freezeSessionDetail(): void {
    this.sessionFrozen = this.buildDetail();
  }

  unfreezeSessionDetail(): void {
    this.sessionFrozen = null;
  }

  // ── response builders ───────────────────────────────────────────────────

  private buildModelList(): ModelInfo[] {
    return this.models.map(({ modelType, name }) =>
      makeAishaImageModelInfo({
        model_key: modelType,
        name,
        runtime: this.runtimeByModel.get(modelType) ?? emptyRuntime(),
        provisioning: { typical_bootstrap_seconds: 90, typical_attach_seconds: 45 },
      }),
    );
  }

  private buildProviders() {
    return {
      providers: [
        {
          provider: 'aisha',
          name: 'Aisha',
          available: true,
          provisioning_mode: 'on_demand',
          models: this.providerFrozen ?? this.buildModelList(),
        },
      ],
      user_context: null,
    };
  }

  private buildDetail(): GpuSessionResponse {
    const primary = this.deployments.find((d) => d.is_primary) ?? null;
    return makeGpuSessionResponse({
      id: SESSION_ID,
      status: this.sessionStatus,
      in_flight_job_count: this.inFlightJobCount,
      bootstrap_operation: primary?.current_operation ?? null,
      deployments: this.deployments,
    });
  }

  private buildListItem(): GpuSessionListItemResponse {
    return makeGpuSessionListItemResponse({
      id: SESSION_ID,
      status: this.sessionStatus,
      deployments: this.deployments.map(({ id, model_type, status, is_primary }) => ({
        id,
        model_type,
        status,
        is_primary,
      })),
    });
  }

  // ── Playwright route installation ──────────────────────────────────────

  async install(page: Page): Promise<void> {
    await page.route(
      (url) => url.pathname === '/v1/providers',
      (route) => {
        this.count('GET /v1/providers');
        return jsonRoute(this.buildProviders())(route);
      },
    );

    await page.route(
      (url) => url.pathname.startsWith('/v1/sessions'),
      async (route) => {
        const url = new URL(route.request().url());
        const method = route.request().method();
        const path = url.pathname;

        if (method === 'POST' && path === '/v1/sessions') {
          const body = JSON.parse(route.request().postData() ?? '{}') as { model: ModelType };
          this.startSession(body.model);
          this.count('POST /v1/sessions');
          return route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify(this.buildDetail()),
          });
        }

        if (method === 'POST' && path.endsWith('/pause')) {
          this.pauseSession();
          this.count('POST pause');
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(this.buildDetail()),
          });
        }

        if (method === 'POST' && path.endsWith('/resume')) {
          this.resumeSession();
          this.count('POST resume');
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(this.buildDetail()),
          });
        }

        if (method === 'POST' && path.endsWith('/stop')) {
          const body = JSON.parse(route.request().postData() ?? '{}') as { confirmed: boolean };
          this.count(body.confirmed ? 'POST stop confirmed' : 'POST stop preview');
          if (!body.confirmed) {
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify(this.stopPreview),
            });
          }
          this.confirmStop();
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(this.buildDetail()),
          });
        }

        if (method === 'POST' && path.endsWith('/deployments')) {
          const body = JSON.parse(route.request().postData() ?? '{}') as { model: ModelType };
          this.attachBodies.push(body);
          const deploymentId = `deploy_${this.deployments.length + 1}`;
          this.attachModel(body.model, deploymentId);
          this.count('POST attach');
          const deployment = this.findDeployment(deploymentId);
          return route.fulfill({
            status: 202,
            contentType: 'application/json',
            body: JSON.stringify({ deployment, operation: deployment.current_operation }),
          });
        }

        if (method === 'DELETE' && path.includes('/deployments/')) {
          this.deleteQueries.push(url.toString());
          const deploymentId = path.split('/deployments/')[1];
          const operationId = this.removeDeployment(deploymentId);
          this.count('DELETE deployment');
          const deployment = this.findDeployment(deploymentId);
          return route.fulfill({
            status: 202,
            contentType: 'application/json',
            body: JSON.stringify({
              deployment,
              operation: this.operations.get(operationId),
            }),
          });
        }

        if (method === 'GET' && path.includes('/operations/')) {
          const operationId = path.split('/operations/')[1];
          this.count(`GET operation ${operationId}`);
          const operation = this.operations.get(operationId);
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(operation ?? makeOperationResponse({ id: operationId })),
          });
        }

        if (method === 'GET' && path === `/v1/sessions/${SESSION_ID}`) {
          this.count('GET session detail');
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(this.sessionFrozen ?? this.buildDetail()),
          });
        }

        // GET /v1/sessions — the thin list projection.
        this.count('GET session list');
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ sessions: this.hasSession ? [this.buildListItem()] : [] }),
        });
      },
    );
  }
}

/** Drives the focused Add Model UI flow while leaving the scenario transition under test visible. */
export async function attachScenarioModelFromSessionsPage(
  page: Page,
  scenario: GpuSessionScenario,
  modelName: string,
): Promise<void> {
  await page.goto('/app/sessions');
  await expect(page.getByRole('button', { name: 'Add model' })).toBeVisible({ timeout: 8000 });
  await page.getByRole('button', { name: 'Add model' }).click();
  await page.getByRole('dialog').getByText(modelName).click();
  await expect.poll(() => scenario.attachRequestBodies().length).toBe(1);
}
