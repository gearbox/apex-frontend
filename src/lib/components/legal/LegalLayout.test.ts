import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/svelte-query';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { STORAGE_KEYS } from '$lib/utils/constants';
import { ROUTES } from '$lib/utils/routes';
import { MOCK_BASE_URL as BASE } from '../../../mocks/config';
import { server } from '../../../mocks/server';

const silentRefresh = vi.fn();
vi.mock('$lib/api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/api/auth')>()),
  silentRefresh: () => silentRefresh(),
}));

import LegalLayoutTestHost from '../../../routes/(legal)/testing/LegalLayoutTestHost.svelte';

let refreshRequests = 0;

beforeEach(() => {
  localStorage.clear();
  silentRefresh.mockReset();
  refreshRequests = 0;
  server.use(
    http.post(`${BASE}/v1/auth/refresh`, () => {
      refreshRequests += 1;
      return HttpResponse.json({});
    }),
  );
});

afterEach(() => cleanup());

function renderLegalLayout() {
  render(LegalLayoutTestHost, {
    props: {
      queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    },
  });
}

describe('(legal) layout', () => {
  it('never refreshes a stored session while rendering a public legal document', async () => {
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, 'persisted-refresh-token');

    renderLegalLayout();

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Terms of Use' })).toBeTruthy());
    expect(screen.getByRole('link', { name: /back to the app/i }).getAttribute('href')).toBe(
      ROUTES.create,
    );
    expect(refreshRequests).toBe(0);
    expect(silentRefresh).not.toHaveBeenCalled();
  });

  it('uses the public home back link without a stored session and makes no auth request', async () => {
    renderLegalLayout();

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Terms of Use' })).toBeTruthy());
    expect(screen.getByRole('link', { name: /back to the app/i }).getAttribute('href')).toBe('/');
    expect(refreshRequests).toBe(0);
    expect(silentRefresh).not.toHaveBeenCalled();
  });
});
