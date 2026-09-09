import { describe, it, expect } from 'vitest';
import {
  isJobStatusPayload,
  isJobProgressPayload,
  isBalanceUpdatedPayload,
  isSystemNotificationPayload,
  isGpuSessionStatusPayload,
  isGpuDeploymentStatusPayload,
  isOperationResponse,
  SSE_EVENTS,
  KNOWN_TRANSACTION_TYPES,
} from './events';

describe('SSE_EVENTS', () => {
  it('has expected event name constants', () => {
    expect(SSE_EVENTS.JOB_STATUS).toBe('job.status_changed');
    expect(SSE_EVENTS.JOB_PROGRESS).toBe('job.progress');
    expect(SSE_EVENTS.BALANCE_UPDATED).toBe('balance.updated');
    expect(SSE_EVENTS.SYSTEM_NOTIFICATION).toBe('system.notification');
    expect(SSE_EVENTS.GPU_SESSION_STATUS).toBe('gpu_session.status_changed');
    expect(SSE_EVENTS.GPU_SESSION_DEPLOYMENT_STATUS).toBe('gpu_session.deployment_status_changed');
    expect(SSE_EVENTS.GPU_SESSION_OPERATION_UPDATED).toBe('gpu_session.operation_updated');
  });
});

describe('isJobStatusPayload()', () => {
  it('returns true for valid payload', () => {
    expect(
      isJobStatusPayload({
        job_id: 'abc',
        status: 'running',
        previous_status: 'pending',
        generation_type: 't2i',
        provider: 'grok',
      }),
    ).toBe(true);
  });

  it('returns false when missing required fields', () => {
    expect(isJobStatusPayload({ job_id: 'abc', status: 'running' })).toBe(false);
    expect(isJobStatusPayload({ job_id: 'abc', previous_status: 'pending' })).toBe(false);
    expect(isJobStatusPayload({ status: 'running', previous_status: 'pending' })).toBe(false);
  });

  it('returns false for non-object values', () => {
    expect(isJobStatusPayload(null)).toBe(false);
    expect(isJobStatusPayload('string')).toBe(false);
    expect(isJobStatusPayload(42)).toBe(false);
    expect(isJobStatusPayload(undefined)).toBe(false);
  });
});

describe('isJobProgressPayload()', () => {
  it('returns true for valid payload', () => {
    expect(isJobProgressPayload({ job_id: 'abc', progress_pct: 50, generation_type: 't2i' })).toBe(
      true,
    );
  });

  it('returns false when missing required fields', () => {
    expect(isJobProgressPayload({ job_id: 'abc' })).toBe(false);
    expect(isJobProgressPayload({ progress_pct: 50 })).toBe(false);
  });

  it('returns false for non-object values', () => {
    expect(isJobProgressPayload(null)).toBe(false);
    expect(isJobProgressPayload('string')).toBe(false);
  });
});

describe('isBalanceUpdatedPayload', () => {
  it('returns true for existing valid transaction events', () => {
    expect(
      isBalanceUpdatedPayload({
        account_id: 'acc1',
        balance: 100,
        delta: -5,
        transaction_type: 'debit',
      }),
    ).toBe(true);
  });

  it('accepts top-up settlement events', () => {
    expect(
      isBalanceUpdatedPayload({
        account_id: 'account-1',
        balance: 500,
        delta: 100,
        transaction_type: 'topup',
      }),
    ).toBe(true);
  });

  it('accepts unknown/future transaction types — the enum is open', () => {
    // The FE contract treats backend string enums as open (same rule as the
    // provider list): a type the FE doesn't recognize yet must still pass
    // shape validation so the balance keeps updating.
    expect(
      isBalanceUpdatedPayload({
        account_id: 'a',
        balance: 1,
        delta: 1,
        transaction_type: 'future_bonus_type',
      }),
    ).toBe(true);
  });

  it('rejects malformed payloads (missing fields or non-string transaction_type)', () => {
    expect(isBalanceUpdatedPayload({ account_id: 'acc1', balance: 100 })).toBe(false);
    expect(isBalanceUpdatedPayload({ balance: 100, delta: -5 })).toBe(false);
    expect(isBalanceUpdatedPayload({ account_id: 'acc1', delta: -5 })).toBe(false);
    expect(isBalanceUpdatedPayload({ account_id: 'a', balance: 1, delta: 1 })).toBe(false);
    expect(
      isBalanceUpdatedPayload({ account_id: 'a', balance: 1, delta: 1, transaction_type: 42 }),
    ).toBe(false);
    expect(isBalanceUpdatedPayload(null)).toBe(false);
    expect(isBalanceUpdatedPayload([])).toBe(false);
  });
});

describe('KNOWN_TRANSACTION_TYPES', () => {
  it('lists the backend transaction types the FE branches on', () => {
    expect(Object.values(KNOWN_TRANSACTION_TYPES)).toEqual([
      'debit',
      'credit',
      'refund',
      'admin_adjustment',
      'topup',
    ]);
  });
});

describe('isSystemNotificationPayload()', () => {
  it('returns true for valid payload', () => {
    expect(
      isSystemNotificationPayload({
        level: 'info',
        title: 'Test',
        message: 'A message',
        expires_at: null,
      }),
    ).toBe(true);
  });

  it('returns false when missing required fields', () => {
    expect(isSystemNotificationPayload({ level: 'info', title: 'Test' })).toBe(false);
    expect(isSystemNotificationPayload({ level: 'info', message: 'msg' })).toBe(false);
    expect(isSystemNotificationPayload({ title: 'Test', message: 'msg' })).toBe(false);
  });

  it('returns false for non-object values', () => {
    expect(isSystemNotificationPayload(null)).toBe(false);
    expect(isSystemNotificationPayload('string')).toBe(false);
  });
});

describe('isGpuSessionStatusPayload()', () => {
  it('returns true for valid payload', () => {
    expect(
      isGpuSessionStatusPayload({
        session_id: 'sess_001',
        status: 'active',
        previous_status: 'provisioning',
        tunnel_hostname: null,
        error_message: null,
        reason: null,
      }),
    ).toBe(true);
  });

  it('does not require model_type on the parent session event', () => {
    expect(
      isGpuSessionStatusPayload({
        session_id: 'sess_001',
        status: 'active',
        previous_status: 'provisioning',
        tunnel_hostname: null,
        error_message: null,
        reason: null,
      }),
    ).toBe(true);
  });

  it('returns false when missing required fields', () => {
    expect(isGpuSessionStatusPayload({ session_id: 'sess_001', status: 'active' })).toBe(false);
    expect(isGpuSessionStatusPayload({ session_id: 'sess_001', previous_status: 'none' })).toBe(
      false,
    );
    expect(isGpuSessionStatusPayload({ status: 'active', previous_status: 'none' })).toBe(false);
  });

  it('returns false for non-object values', () => {
    expect(isGpuSessionStatusPayload(null)).toBe(false);
    expect(isGpuSessionStatusPayload('string')).toBe(false);
    expect(isGpuSessionStatusPayload(42)).toBe(false);
  });
});

describe('GPU deployment and operation payloads', () => {
  it('recognizes deployment status invalidations', () => {
    expect(
      isGpuDeploymentStatusPayload({
        deployment_id: 'deploy_001',
        session_id: 'sess_001',
        model_type: 'aisha-image',
        status: 'deploying',
        pending_restart: false,
        routing_suspended: false,
        operation_id: 'op_001',
        error_message: null,
      }),
    ).toBe(true);
  });

  it('recognizes a full operation_updated projection', () => {
    expect(
      isOperationResponse({
        id: 'op_001',
        session_id: 'sess_001',
        deployment_id: null,
        kind: 'comfyui_restart',
        status: 'queued',
        phase: null,
        revision: 0,
        target: null,
        progress: null,
        message: null,
        error: null,
        started_at: null,
        updated_at: '2026-09-09T00:00:00Z',
        finished_at: null,
      }),
    ).toBe(true);
  });
});
