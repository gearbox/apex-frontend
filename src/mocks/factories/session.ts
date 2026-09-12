import type { components } from '$lib/api/types';

type GpuSessionResponse = components['schemas']['GpuSessionResponse'];
type GpuSessionListItemResponse = components['schemas']['GpuSessionListItemResponse'];
type StopConfirmationResponse = components['schemas']['StopConfirmationResponse'];
type OperationResponse = components['schemas']['OperationResponse'];
type DeploymentMutationResponse = components['schemas']['DeploymentMutationResponse'];
type DeploymentResponse = components['schemas']['DeploymentResponse'];

export function makeDeploymentResponse(
  overrides: Partial<DeploymentResponse> = {},
): DeploymentResponse {
  return {
    id: 'deploy_mock_001',
    model_type: 'aisha-image',
    bundle_name: 'aisha',
    bundle_version: null,
    status: 'active',
    pending_restart: false,
    routing_suspended: false,
    is_primary: true,
    created_at: '2026-06-20T00:00:00Z',
    activated_at: '2026-06-20T00:01:00Z',
    current_operation: null,
    ...overrides,
  };
}

export function makeGpuSessionResponse(
  overrides: Partial<GpuSessionResponse> = {},
): GpuSessionResponse {
  return {
    id: 'sess_mock_001',
    user_id: 'usr_mock_001',
    product_id: 'prod_mock_001',
    status: 'active',
    tunnel_hostname: 'tunnel.example.com',
    vastai_gpu_name: 'RTX 4090',
    vastai_cost_per_hour_micros: 50000,
    created_at: '2026-06-20T00:00:00Z',
    started_at: '2026-06-20T00:01:00Z',
    paused_at: null,
    resumed_at: null,
    stopped_at: null,
    error_message: null,
    in_flight_job_count: 0,
    deployments: [makeDeploymentResponse()],
    ...overrides,
  };
}

/** Matches the thin `GET /v1/sessions` list projection — deliberately free of operation bodies. */
export function makeGpuSessionListItemResponse(
  overrides: Partial<GpuSessionListItemResponse> = {},
): GpuSessionListItemResponse {
  return {
    id: 'sess_mock_001',
    status: 'active',
    product_id: 'prod_mock_001',
    created_at: '2026-06-20T00:00:00Z',
    started_at: '2026-06-20T00:01:00Z',
    deployments: [
      { id: 'deploy_mock_001', model_type: 'aisha-image', status: 'active', is_primary: true },
    ],
    ...overrides,
  };
}

/** Projects a detailed session fixture into the intentionally thinner list contract. */
export function makeGpuSessionListItemFromSession(
  session: GpuSessionResponse,
): GpuSessionListItemResponse {
  return makeGpuSessionListItemResponse({
    id: session.id,
    status: session.status,
    product_id: session.product_id,
    created_at: session.created_at,
    started_at: session.started_at ?? null,
    deployments: (session.deployments ?? []).map(({ id, model_type, status, is_primary }) => ({
      id,
      model_type,
      status,
      is_primary,
    })),
  });
}

export function makeGpuSessionListResponse(sessions: readonly GpuSessionResponse[]) {
  return { sessions: sessions.map(makeGpuSessionListItemFromSession) };
}

export function makeStopConfirmationResponse(
  overrides: Partial<StopConfirmationResponse> = {},
): StopConfirmationResponse {
  return {
    session_id: 'sess_mock_001',
    model_type: 'aisha-image',
    vastai_gpu_name: 'RTX 4090',
    vastai_cost_per_hour_micros: 50000,
    active_duration_seconds: 3600,
    paused_duration_seconds: 0,
    estimated_final_tokens: 500,
    message: 'Stopping this session will finalize billing.',
    ...overrides,
  };
}

export function makeOperationResponse(
  overrides: Partial<OperationResponse> = {},
): OperationResponse {
  return {
    id: 'op_mock_001',
    session_id: 'sess_mock_001',
    deployment_id: null,
    kind: 'bundle_provision',
    status: 'queued',
    phase: null,
    revision: 0,
    target: null,
    progress: null,
    message: null,
    error: null,
    started_at: null,
    updated_at: '2026-06-20T00:02:00Z',
    finished_at: null,
    ...overrides,
  };
}

export function makeDeploymentMutationResponse(
  overrides: Partial<DeploymentMutationResponse> = {},
): DeploymentMutationResponse {
  return {
    deployment: makeDeploymentResponse({
      id: 'deploy_mock_002',
      model_type: 'aisha-image-lite',
      status: 'deploying',
      is_primary: false,
      created_at: '2026-06-20T00:02:00Z',
      activated_at: null,
      current_operation: makeOperationResponse(),
    }),
    operation: makeOperationResponse(),
    ...overrides,
  };
}
