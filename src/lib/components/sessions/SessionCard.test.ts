import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import SessionCard from './SessionCard.svelte';
import type { GpuSessionListItemResponse } from '$lib/api/sessions';

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
