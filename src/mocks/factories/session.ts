import type { components } from '$lib/api/types';

type GpuSessionResponse = components['schemas']['GpuSessionResponse'];
type StopConfirmationResponse = components['schemas']['StopConfirmationResponse'];

export function makeGpuSessionResponse(
  overrides: Partial<GpuSessionResponse> = {},
): GpuSessionResponse {
  return {
    id: 'sess_mock_001',
    user_id: 'usr_mock_001',
    product_id: 'prod_mock_001',
    status: 'active',
    model_type: 'aisha-image',
    bundle_name: 'aisha-bundle',
    bundle_version: '1.0.0',
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
    provisioning_phase: null,
    provisioning_progress: null,
    ...overrides,
  };
}

export function makeStopConfirmationResponse(
  overrides: Partial<StopConfirmationResponse> = {},
): StopConfirmationResponse {
  return {
    session_id: 'sess_mock_001',
    model_type: 'aisha-image',
    bundle_name: 'aisha-bundle',
    vastai_gpu_name: 'RTX 4090',
    vastai_cost_per_hour_micros: 50000,
    active_duration_seconds: 3600,
    paused_duration_seconds: 0,
    estimated_final_tokens: 500,
    message: 'Stopping this session will finalize billing.',
    ...overrides,
  };
}
