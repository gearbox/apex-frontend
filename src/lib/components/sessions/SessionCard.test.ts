import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import SessionCard from './SessionCard.svelte';
import type { GpuSessionResponse } from '$lib/api/sessions';

function makeSession(overrides: Partial<GpuSessionResponse> = {}): GpuSessionResponse {
  return {
    id: 'sess_001',
    user_id: 'usr_001',
    product_id: 'prod_001',
    status: 'active',
    model_type: 'aisha-image',
    bundle_name: 'aisha-bundle',
    bundle_version: '1.0.0',
    tunnel_hostname: null,
    vastai_gpu_name: 'RTX 4090',
    vastai_cost_per_hour_micros: 50000,
    created_at: '2026-06-20T00:00:00Z',
    started_at: '2026-06-20T00:00:00Z',
    in_flight_job_count: 0,
    ...overrides,
  };
}

describe('SessionCard — Stop button', () => {
  it('renders Stop button for active session', () => {
    render(SessionCard, {
      props: { session: makeSession(), onStop: vi.fn() },
    });
    const btn = screen.queryByRole('button', { name: /stop/i });
    expect(btn).not.toBeNull();
  });

  it('disables Stop when in_flight_job_count > 0', () => {
    render(SessionCard, {
      props: { session: makeSession({ in_flight_job_count: 2 }), onStop: vi.fn() },
    });
    const btn = screen.getByRole('button', { name: /stop/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('disables Stop when status is stopping', () => {
    render(SessionCard, {
      props: { session: makeSession({ status: 'stopping' }), onStop: vi.fn() },
    });
    const btn = screen.getByRole('button', { name: /stopping/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('disables Stop when stopping prop is true', () => {
    render(SessionCard, {
      props: { session: makeSession(), onStop: vi.fn(), stopping: true },
    });
    const btn = screen.getByRole('button', { name: /stopping/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('disables Stop for terminal statuses', () => {
    render(SessionCard, {
      props: { session: makeSession({ status: 'failed' }), onStop: vi.fn() },
    });
    const btn = screen.getByRole('button', { name: /stop/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

describe('SessionCard — provisioning state', () => {
  it('renders SessionProgressBar when status is provisioning', () => {
    const { container } = render(SessionCard, {
      props: {
        session: makeSession({ status: 'provisioning', started_at: null }),
        onStop: vi.fn(),
      },
    });
    expect(container.querySelector('.progress-wrap')).not.toBeNull();
  });
});

describe('SessionCard — in-flight hint', () => {
  it('shows in-flight hint when jobs are running', () => {
    render(SessionCard, {
      props: { session: makeSession({ in_flight_job_count: 3 }), onStop: vi.fn() },
    });
    const hint = screen.queryByText(/3 job/i);
    expect(hint).not.toBeNull();
  });
});
