import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import SessionCard from './SessionCard.svelte';
import type { GpuSessionListItemResponse, GpuSessionResponse } from '$lib/api/sessions';

const { mutations } = vi.hoisted(() => ({
  mutations: [] as Array<{ mutate: ReturnType<typeof vi.fn> }>,
}));

vi.mock('@tanstack/svelte-query', () => ({
  useQueryClient: () => ({}),
  createMutation: () => {
    const mutation = { isPending: false, mutate: vi.fn() };
    mutations.push(mutation);
    return mutation;
  },
}));

function makeSession(
  overrides: Partial<GpuSessionListItemResponse> = {},
): GpuSessionListItemResponse {
  return {
    id: 'sess_001',
    product_id: 'prod_001',
    status: 'active',
    created_at: '2026-06-20T00:00:00Z',
    started_at: '2026-06-20T00:00:00Z',
    deployments: [
      { id: 'deploy_001', model_type: 'aisha-image', status: 'active', is_primary: true },
    ],
    ...overrides,
  };
}

function makeDetailedSession(overrides: Partial<GpuSessionResponse> = {}): GpuSessionResponse {
  return {
    id: 'sess_001',
    user_id: 'user_001',
    product_id: 'prod_001',
    status: 'active',
    tunnel_hostname: null,
    vastai_gpu_name: null,
    vastai_cost_per_hour_micros: null,
    created_at: '2026-06-20T00:00:00Z',
    started_at: '2026-06-20T00:00:00Z',
    in_flight_job_count: 0,
    deployments: [
      {
        id: 'deploy_001',
        model_type: 'aisha-image',
        bundle_name: 'aisha',
        bundle_version: null,
        status: 'active',
        pending_restart: false,
        routing_suspended: false,
        is_primary: true,
        created_at: '2026-06-20T00:00:00Z',
        activated_at: '2026-06-20T00:00:00Z',
      },
    ],
    ...overrides,
  };
}

beforeEach(() => mutations.splice(0));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SessionCard — Stop button', () => {
  it('renders Stop button for active session', () => {
    render(SessionCard, {
      props: { session: makeSession(), onStop: vi.fn() },
    });
    const btn = screen.queryByRole('button', { name: /stop/i });
    expect(btn).not.toBeNull();
  });

  it('disables Stop when status is stopping', () => {
    render(SessionCard, {
      props: { session: makeSession({ status: 'stopping' }), onStop: vi.fn() },
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
  it('does not parse legacy provisioning progress payloads', () => {
    const { container } = render(SessionCard, {
      props: {
        session: makeSession({ status: 'provisioning', started_at: null }),
        onStop: vi.fn(),
      },
    });
    expect(container.querySelector('.progress-wrap')).toBeNull();
  });
});

describe('SessionCard — deployment identity', () => {
  it('renders deployed model keys and no internal bundle string', () => {
    render(SessionCard, {
      props: { session: makeSession(), onStop: vi.fn() },
    });
    expect(screen.getByText('aisha-image')).not.toBeNull();
    expect(screen.queryByText('aisha-bundle')).toBeNull();
    expect(document.querySelector('.bundle-name')).toBeNull();
  });
});

describe('SessionCard — detailed deployment operations', () => {
  it('offers Remove only for active deployments on an active session', () => {
    const session = makeDetailedSession({
      deployments: [
        ...makeDetailedSession().deployments!,
        {
          ...makeDetailedSession().deployments![0],
          id: 'deploy_deploying',
          status: 'deploying',
          model_type: 'aisha-image-lite',
        },
      ],
    });
    render(SessionCard, { props: { session, onStop: vi.fn() } });
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(1);
  });

  it('uses force only after the final-active warning confirmation', async () => {
    render(SessionCard, { props: { session: makeDetailedSession(), onStop: vi.fn() } });

    await fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(
      screen.getByText(/GPU session will keep running and billing until you stop it/i),
    ).toBeTruthy();
    const confirm = screen.getByRole('button', { name: 'Remove last model anyway' });
    await fireEvent.click(confirm);

    expect(mutations[3]?.mutate).toHaveBeenCalledWith(
      { sessionId: 'sess_001', deploymentId: 'deploy_001', force: true },
      expect.any(Object),
    );
  });

  it('does not send DELETE when the current snapshot changes before confirmation', async () => {
    const current = makeDetailedSession();
    const rendered = render(SessionCard, { props: { session: current, onStop: vi.fn() } });
    await fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await rendered.rerender({
      session: makeDetailedSession({ status: 'paused' }),
      onStop: vi.fn(),
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Remove last model anyway' }));

    expect(mutations[3]?.mutate).not.toHaveBeenCalled();
  });

  it('shows an explicit detail error with retry while retaining list-level Stop', () => {
    const retry = vi.fn();
    render(SessionCard, {
      props: {
        session: makeSession(),
        detailState: 'error',
        onDetailRetry: retry,
        onStop: vi.fn(),
      },
    });
    expect(screen.getByText("Couldn't load session details.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
  });

  it('summarizes only current model deployments and deduplicates names', () => {
    const { container } = render(SessionCard, {
      props: {
        session: makeDetailedSession({
          deployments: [
            ...makeDetailedSession().deployments!,
            { ...makeDetailedSession().deployments![0], id: 'old', status: 'removed' },
            { ...makeDetailedSession().deployments![0], id: 'retry', status: 'active' },
          ],
        }),
        onStop: vi.fn(),
      },
    });
    expect(container.querySelector('.card-model strong')?.textContent).toBe('aisha-image');
  });

  it('updates detailed active-session uptime with a local minute clock', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-20T00:01:00Z'));
    render(SessionCard, {
      props: {
        session: makeDetailedSession({ started_at: '2026-06-20T00:00:00Z' }),
        onStop: vi.fn(),
      },
    });
    expect(screen.getByText('Uptime: 1m')).toBeTruthy();

    await tick();
    vi.advanceTimersByTime(60_000);
    await tick();
    expect(screen.getByText('Uptime: 2m')).toBeTruthy();
  });
});
