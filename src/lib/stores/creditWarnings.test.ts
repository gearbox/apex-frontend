import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  creditWarnings,
  mostUrgentCreditWarning,
  upsertCreditWarning,
  dismissCreditWarning,
  dismissAllCreditWarnings,
} from './creditWarnings';
import type { GpuSessionCreditWarningPayload } from '$lib/api/events';

function makePayload(
  overrides: Partial<GpuSessionCreditWarningPayload> = {},
): GpuSessionCreditWarningPayload {
  return {
    session_id: 'sess_001',
    level: 'warning',
    minutes_remaining: 10,
    terminate_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    balance: 50,
    ...overrides,
  };
}

beforeEach(() => {
  dismissAllCreditWarnings();
});

describe('upsertCreditWarning()', () => {
  it('adds a warning to the store', () => {
    upsertCreditWarning(makePayload());
    const map = get(creditWarnings);
    expect(map.has('sess_001')).toBe(true);
    expect(map.get('sess_001')?.level).toBe('warning');
  });

  it('overwrites existing entry on re-emit', () => {
    upsertCreditWarning(makePayload({ level: 'warning' }));
    upsertCreditWarning(makePayload({ level: 'critical' }));
    const map = get(creditWarnings);
    expect(map.size).toBe(1);
    expect(map.get('sess_001')?.level).toBe('critical');
  });

  it('dismisses on level=info (forward-compat clear)', () => {
    upsertCreditWarning(makePayload({ level: 'warning' }));
    upsertCreditWarning(makePayload({ level: 'info' }));
    expect(get(creditWarnings).has('sess_001')).toBe(false);
  });

  it('stores multiple sessions independently', () => {
    upsertCreditWarning(makePayload({ session_id: 'sess_001', level: 'warning' }));
    upsertCreditWarning(makePayload({ session_id: 'sess_002', level: 'critical' }));
    expect(get(creditWarnings).size).toBe(2);
  });
});

describe('dismissCreditWarning()', () => {
  it('removes only the specified session', () => {
    upsertCreditWarning(makePayload({ session_id: 'sess_001' }));
    upsertCreditWarning(makePayload({ session_id: 'sess_002' }));
    dismissCreditWarning('sess_001');
    const map = get(creditWarnings);
    expect(map.has('sess_001')).toBe(false);
    expect(map.has('sess_002')).toBe(true);
  });
});

describe('dismissAllCreditWarnings()', () => {
  it('clears the entire store', () => {
    upsertCreditWarning(makePayload({ session_id: 'sess_001' }));
    upsertCreditWarning(makePayload({ session_id: 'sess_002' }));
    dismissAllCreditWarnings();
    expect(get(creditWarnings).size).toBe(0);
  });
});

describe('mostUrgentCreditWarning', () => {
  it('returns null when store is empty', () => {
    expect(get(mostUrgentCreditWarning)).toBeNull();
  });

  it('returns the only warning when one exists', () => {
    upsertCreditWarning(makePayload({ session_id: 'sess_001', level: 'warning' }));
    expect(get(mostUrgentCreditWarning)?.session_id).toBe('sess_001');
  });

  it('prefers critical over warning', () => {
    upsertCreditWarning(makePayload({ session_id: 'sess_w', level: 'warning' }));
    upsertCreditWarning(makePayload({ session_id: 'sess_c', level: 'critical' }));
    expect(get(mostUrgentCreditWarning)?.session_id).toBe('sess_c');
  });

  it('among same level, null terminate_at is most urgent', () => {
    const soon = new Date(Date.now() + 30_000).toISOString();
    upsertCreditWarning(
      makePayload({ session_id: 'sess_soon', level: 'critical', terminate_at: soon }),
    );
    upsertCreditWarning(
      makePayload({ session_id: 'sess_null', level: 'critical', terminate_at: null }),
    );
    expect(get(mostUrgentCreditWarning)?.session_id).toBe('sess_null');
  });

  it('among same level and non-null, picks the soonest terminate_at', () => {
    const sooner = new Date(Date.now() + 30_000).toISOString();
    const later = new Date(Date.now() + 300_000).toISOString();
    upsertCreditWarning(
      makePayload({ session_id: 'sess_later', level: 'warning', terminate_at: later }),
    );
    upsertCreditWarning(
      makePayload({ session_id: 'sess_sooner', level: 'warning', terminate_at: sooner }),
    );
    expect(get(mostUrgentCreditWarning)?.session_id).toBe('sess_sooner');
  });
});
