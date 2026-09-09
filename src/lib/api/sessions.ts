import apiClient from '$lib/api/client';
import type { components } from '$lib/api/types';
import { throwApiError } from '$lib/api/errors';

export type GpuSessionResponse = components['schemas']['GpuSessionResponse'];
export type GpuSessionListItemResponse = components['schemas']['GpuSessionListItemResponse'];
export type StopConfirmationResponse = components['schemas']['StopConfirmationResponse'];
export type OperationResponse = components['schemas']['OperationResponse'];
type ModelType = components['schemas']['ModelType'];

export async function listSessions(includeTerminal = false): Promise<GpuSessionListItemResponse[]> {
  const { data, error } = await apiClient.GET('/v1/sessions', {
    params: { query: { include_terminal: includeTerminal } },
  });
  if (error || !data) throwApiError(error, 'Failed to load sessions');
  return data.sessions;
}

export async function getSession(id: string): Promise<GpuSessionResponse> {
  const { data, error } = await apiClient.GET('/v1/sessions/{session_id}', {
    params: { path: { session_id: id } },
  });
  if (error || !data) throwApiError(error, 'Failed to load session');
  return data as GpuSessionResponse;
}

/** Reserved for the SSE-down operation fallback; normal hydration uses session snapshots. */
export async function getOperation(
  sessionId: string,
  operationId: string,
): Promise<OperationResponse> {
  const { data, error } = await apiClient.GET(
    '/v1/sessions/{session_id}/operations/{operation_id}',
    {
      params: { path: { session_id: sessionId, operation_id: operationId } },
    },
  );
  if (error || !data) throwApiError(error, 'Failed to load operation');
  return data as OperationResponse;
}

export async function startSession(model: ModelType): Promise<GpuSessionResponse> {
  const { data, error } = await apiClient.POST('/v1/sessions', { body: { model } });
  if (error || !data) throwApiError(error, 'Failed to start session');
  if ('error' in data) throwApiError(data, 'Failed to start session');
  return data as GpuSessionResponse;
}

/** First stop call (confirmed:false) — returns a cost preview, does NOT tear down. */
export async function previewStop(id: string): Promise<StopConfirmationResponse> {
  const { data, error } = await apiClient.POST('/v1/sessions/{session_id}/stop', {
    params: { path: { session_id: id } },
    body: { confirmed: false },
  });
  if (error || !data) throwApiError(error, 'Failed to preview stop');
  if ('error' in data) throwApiError(data, 'Failed to preview stop');
  if (!('estimated_final_tokens' in data)) throwApiError(data, 'Unexpected stop preview response');
  return data as StopConfirmationResponse;
}

/** Second stop call (confirmed:true) — executes teardown. */
export async function stopSession(id: string): Promise<GpuSessionResponse> {
  const { data, error } = await apiClient.POST('/v1/sessions/{session_id}/stop', {
    params: { path: { session_id: id } },
    body: { confirmed: true },
  });
  if (error || !data) throwApiError(error, 'Failed to stop session');
  if ('error' in data) throwApiError(data, 'Failed to stop session');
  return data as GpuSessionResponse;
}
