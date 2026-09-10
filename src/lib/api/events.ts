import type { components } from '$lib/api/types';

type JobStatus = components['schemas']['JobStatus'];
type GpuSessionStatus = components['schemas']['GpuSessionStatus'];
type DeploymentStatus = components['schemas']['DeploymentStatus'];
type ModelType = components['schemas']['ModelType'];
export type OperationResponse = components['schemas']['OperationResponse'];

/* ─── SSE Event Names ─── */
export const SSE_EVENTS = {
  JOB_STATUS: 'job.status_changed',
  JOB_PROGRESS: 'job.progress',
  BALANCE_UPDATED: 'balance.updated',
  SYSTEM_NOTIFICATION: 'system.notification',
  GPU_SESSION_STATUS: 'gpu_session.status_changed',
  GPU_SESSION_DEPLOYMENT_STATUS: 'gpu_session.deployment_status_changed',
  GPU_SESSION_OPERATION_UPDATED: 'gpu_session.operation_updated',
  GPU_SESSION_CREDIT_WARNING: 'gpu_session.credit_warning',
} as const;

export type SSEEventType = (typeof SSE_EVENTS)[keyof typeof SSE_EVENTS];

/* ─── Payload Interfaces ─── */
export interface JobStatusPayload {
  job_id: string;
  status: JobStatus;
  previous_status: string;
  generation_type: string;
  provider: string;
}

export interface JobProgressPayload {
  job_id: string;
  progress_pct: number;
  generation_type: string;
}

export interface BalanceUpdatedPayload {
  account_id: string;
  balance: number;
  delta: number;
  transaction_type: string;
}

/**
 * The backend's transaction_type enum is open — new values can ship without a
 * FE release. Only reference this where behavior genuinely branches (toast
 * copy, reconciliation triggers); unknown values must still update the
 * balance silently rather than being rejected by the payload guard.
 */
export const KNOWN_TRANSACTION_TYPES = {
  DEBIT: 'debit',
  CREDIT: 'credit',
  REFUND: 'refund',
  ADMIN_ADJUSTMENT: 'admin_adjustment',
  TOPUP: 'topup',
} as const;

export type KnownTransactionType =
  (typeof KNOWN_TRANSACTION_TYPES)[keyof typeof KNOWN_TRANSACTION_TYPES];

export type SystemNotificationLevel = 'info' | 'warning' | 'critical';

export interface SystemNotificationPayload {
  level: SystemNotificationLevel;
  title: string;
  message: string;
  expires_at: string | null;
}

export interface GpuSessionStatusPayload {
  session_id: string;
  status: GpuSessionStatus;
  previous_status: GpuSessionStatus | 'none';
  tunnel_hostname: string | null;
  error_message: string | null;
  reason: string | null;
}

export interface GpuDeploymentStatusPayload {
  deployment_id: string;
  session_id: string;
  model_type: ModelType;
  status: DeploymentStatus;
  pending_restart: boolean;
  routing_suspended: boolean;
  operation_id: string | null;
  error_message: string | null;
}

export interface GpuSessionCreditWarningPayload {
  session_id: string;
  level: 'info' | 'warning' | 'critical';
  minutes_remaining: number;
  terminate_at: string | null;
  balance: number;
}

/* ─── Union Type ─── */
export type SSEPayload =
  | { event: typeof SSE_EVENTS.JOB_STATUS; data: JobStatusPayload }
  | { event: typeof SSE_EVENTS.JOB_PROGRESS; data: JobProgressPayload }
  | { event: typeof SSE_EVENTS.BALANCE_UPDATED; data: BalanceUpdatedPayload }
  | { event: typeof SSE_EVENTS.SYSTEM_NOTIFICATION; data: SystemNotificationPayload }
  | { event: typeof SSE_EVENTS.GPU_SESSION_STATUS; data: GpuSessionStatusPayload }
  | { event: typeof SSE_EVENTS.GPU_SESSION_DEPLOYMENT_STATUS; data: GpuDeploymentStatusPayload }
  | { event: typeof SSE_EVENTS.GPU_SESSION_OPERATION_UPDATED; data: OperationResponse }
  | { event: typeof SSE_EVENTS.GPU_SESSION_CREDIT_WARNING; data: GpuSessionCreditWarningPayload };

/* ─── Type Guards ─── */
export function isJobStatusPayload(data: unknown): data is JobStatusPayload {
  return (
    typeof data === 'object' &&
    data !== null &&
    'job_id' in data &&
    'status' in data &&
    'previous_status' in data
  );
}

export function isJobProgressPayload(data: unknown): data is JobProgressPayload {
  return typeof data === 'object' && data !== null && 'job_id' in data && 'progress_pct' in data;
}

export function isBalanceUpdatedPayload(data: unknown): data is BalanceUpdatedPayload {
  if (typeof data !== 'object' || data === null) return false;
  const payload = data as Record<string, unknown>;
  return (
    typeof payload.account_id === 'string' &&
    typeof payload.balance === 'number' &&
    typeof payload.delta === 'number' &&
    typeof payload.transaction_type === 'string'
  );
}

export function isSystemNotificationPayload(data: unknown): data is SystemNotificationPayload {
  return (
    typeof data === 'object' &&
    data !== null &&
    'level' in data &&
    'title' in data &&
    'message' in data
  );
}

export function isGpuSessionStatusPayload(data: unknown): data is GpuSessionStatusPayload {
  if (!isRecord(data)) return false;
  return (
    typeof data.session_id === 'string' &&
    typeof data.status === 'string' &&
    typeof data.previous_status === 'string' &&
    isNullableString(data.tunnel_hostname) &&
    isNullableString(data.error_message) &&
    isNullableString(data.reason)
  );
}

export function isGpuDeploymentStatusPayload(data: unknown): data is GpuDeploymentStatusPayload {
  if (!isRecord(data)) return false;
  return (
    typeof data.deployment_id === 'string' &&
    typeof data.session_id === 'string' &&
    typeof data.model_type === 'string' &&
    typeof data.status === 'string' &&
    typeof data.pending_restart === 'boolean' &&
    typeof data.routing_suspended === 'boolean' &&
    isNullableString(data.operation_id) &&
    isNullableString(data.error_message)
  );
}

/** The server event is a full public OperationResponse, without a parallel FE schema. */
export function isOperationResponse(data: unknown): data is OperationResponse {
  if (!isRecord(data)) return false;
  return (
    typeof data.id === 'string' &&
    typeof data.session_id === 'string' &&
    isNullableString(data.deployment_id) &&
    typeof data.kind === 'string' &&
    typeof data.status === 'string' &&
    isNullableString(data.phase) &&
    typeof data.revision === 'number' &&
    isNullableObject(data.target) &&
    isNullableObject(data.progress) &&
    isNullableString(data.message) &&
    isNullableObject(data.error) &&
    isNullableString(data.started_at) &&
    typeof data.updated_at === 'string' &&
    isNullableString(data.finished_at)
  );
}

export function isGpuSessionCreditWarningPayload(d: unknown): d is GpuSessionCreditWarningPayload {
  return (
    typeof d === 'object' &&
    d !== null &&
    'session_id' in d &&
    'level' in d &&
    'minutes_remaining' in d &&
    'balance' in d
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNullableObject(value: unknown): value is Record<string, unknown> | null {
  return value === null || isRecord(value);
}
