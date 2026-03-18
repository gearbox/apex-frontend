import { describe, it, expect } from 'vitest';
import {
  isJobStatusPayload,
  isJobProgressPayload,
  isBalanceUpdatedPayload,
  isSystemNotificationPayload,
  SSE_EVENTS,
} from './events';

describe('SSE_EVENTS', () => {
  it('has expected event name constants', () => {
    expect(SSE_EVENTS.JOB_STATUS).toBe('job.status_changed');
    expect(SSE_EVENTS.JOB_PROGRESS).toBe('job.progress');
    expect(SSE_EVENTS.BALANCE_UPDATED).toBe('balance.updated');
    expect(SSE_EVENTS.SYSTEM_NOTIFICATION).toBe('system.notification');
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
    expect(
      isJobProgressPayload({ job_id: 'abc', progress_pct: 50, generation_type: 't2i' }),
    ).toBe(true);
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

describe('isBalanceUpdatedPayload()', () => {
  it('returns true for valid payload', () => {
    expect(
      isBalanceUpdatedPayload({
        account_id: 'acc1',
        balance: 100,
        delta: -5,
        transaction_type: 'debit',
      }),
    ).toBe(true);
  });

  it('returns false when missing required fields', () => {
    expect(isBalanceUpdatedPayload({ account_id: 'acc1', balance: 100 })).toBe(false);
    expect(isBalanceUpdatedPayload({ balance: 100, delta: -5 })).toBe(false);
    expect(isBalanceUpdatedPayload({ account_id: 'acc1', delta: -5 })).toBe(false);
  });

  it('returns false for non-object values', () => {
    expect(isBalanceUpdatedPayload(null)).toBe(false);
    expect(isBalanceUpdatedPayload([])).toBe(false);
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
