import type { components } from '$lib/api/types';

type JobStatus = components['schemas']['JobStatus'];

/* ─── SSE Event Names ─── */
export const SSE_EVENTS = {
  JOB_STATUS: 'job.status_changed',
  JOB_PROGRESS: 'job.progress',
  BALANCE_UPDATED: 'balance.updated',
  SYSTEM_NOTIFICATION: 'system.notification',
  GPU_SESSION_STATUS: 'gpu_session.status_changed',
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
  transaction_type: 'debit' | 'credit' | 'refund' | 'admin_adjustment';
}

export type SystemNotificationLevel = 'info' | 'warning' | 'critical';

export interface SystemNotificationPayload {
  level: SystemNotificationLevel;
  title: string;
  message: string;
  expires_at: string | null;
}

export interface GpuSessionStatusPayload {
  session_id: string;
  status: string;
  previous_status: string;
  model_type: string;
  bundle_name: string;
  tunnel_hostname: string | null;
  error_message: string | null;
}

/* ─── Union Type ─── */
export type SSEPayload =
  | { event: typeof SSE_EVENTS.JOB_STATUS; data: JobStatusPayload }
  | { event: typeof SSE_EVENTS.JOB_PROGRESS; data: JobProgressPayload }
  | { event: typeof SSE_EVENTS.BALANCE_UPDATED; data: BalanceUpdatedPayload }
  | { event: typeof SSE_EVENTS.SYSTEM_NOTIFICATION; data: SystemNotificationPayload }
  | { event: typeof SSE_EVENTS.GPU_SESSION_STATUS; data: GpuSessionStatusPayload };

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
  return (
    typeof data === 'object' &&
    data !== null &&
    'account_id' in data &&
    'balance' in data &&
    'delta' in data
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
  return (
    typeof data === 'object' &&
    data !== null &&
    'session_id' in data &&
    'status' in data &&
    'model_type' in data
  );
}
