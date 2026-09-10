import { afterEach, describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/svelte-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { server } from '../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../mocks/config';
import type { GpuSessionListItemResponse } from '$lib/api/sessions';
import { sessionKeys } from '$lib/queries/sessions';
import SessionCardContainerQueryHost from './testing/SessionCardContainerQueryHost.svelte';

const listSession = {
  id: 'sess_001',
  product_id: 'prod_001',
  status: 'active',
  created_at: '2026-06-20T00:00:00Z',
  started_at: '2026-06-20T00:00:00Z',
  deployments: [
    { id: 'deploy_001', model_type: 'aisha-image', status: 'active', is_primary: true },
  ],
} as GpuSessionListItemResponse;

const detailedSession = {
  ...listSession,
  user_id: 'user_001',
  tunnel_hostname: null,
  vastai_gpu_name: null,
  vastai_cost_per_hour_micros: null,
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
};

afterEach(() => server.resetHandlers());

describe('SessionCardContainer detail query', () => {
  it('recovers from a detail error through Retry using a real QueryClient', async () => {
    let attempts = 0;
    server.use(
      http.get(`${BASE}/v1/sessions/sess_001`, () => {
        attempts += 1;
        return attempts === 1
          ? HttpResponse.json(
              { error: 'unavailable', message: 'Temporary failure' },
              { status: 503 },
            )
          : HttpResponse.json(detailedSession);
      }),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(SessionCardContainerQueryHost, { props: { queryClient, session: listSession } });

    await waitFor(() => expect(screen.getByText("Couldn't load session details.")).toBeTruthy());
    await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy());
    expect(screen.queryByText("Couldn't load session details.")).toBeNull();
    expect(attempts).toBe(2);
  });

  it('keeps cached detail rendered through a background refetch error, then updates on the next success', async () => {
    let attempts = 0;
    server.use(
      http.get(`${BASE}/v1/sessions/sess_001`, () => {
        attempts += 1;
        if (attempts === 2) {
          return HttpResponse.json(
            { error: 'unavailable', message: 'Temporary failure' },
            { status: 503 },
          );
        }
        return HttpResponse.json(
          attempts === 3 ? { ...detailedSession, vastai_gpu_name: 'RTX 5090' } : detailedSession,
        );
      }),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(SessionCardContainerQueryHost, { props: { queryClient, session: listSession } });

    // Initial request succeeds — deployments/actions render.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy());
    expect(screen.getByLabelText('Deployed models')).toBeTruthy();

    // A background refetch fails while cached data is still present. The card must keep rendering
    // from the retained data — no "couldn't load details" replacement, no action disappearance.
    const detailKey = sessionKeys.detail('sess_001');
    await queryClient.refetchQueries({ queryKey: detailKey, exact: true });
    await waitFor(() => expect(attempts).toBe(2));
    expect(screen.queryByText("Couldn't load session details.")).toBeNull();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    expect(screen.getByLabelText('Deployed models')).toBeTruthy();

    // The next refetch succeeds — new detail replaces the old data normally.
    await queryClient.refetchQueries({ queryKey: detailKey, exact: true });
    await waitFor(() => expect(screen.getByText('RTX 5090')).toBeTruthy());
  });
});
