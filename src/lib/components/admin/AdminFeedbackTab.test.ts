import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/svelte-query';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { server } from '../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../mocks/config';
import { feedbackReportFixture } from '../../../mocks/handlers/feedback';
import type { FeedbackStatus } from '$lib/api/feedback';
import { setAuth } from '$lib/stores/auth';
import { locale } from '$lib/stores/locale';
import { makeUserProfile } from '../../../mocks/factories/user';
import { FEEDBACK_STATUS_COLORS } from '$lib/utils/feedback';
import AdminFeedbackTab from './AdminFeedbackTab.svelte';
import QueryHost, { hostProps } from '$lib/components/legal/testing/QueryHost.svelte';

beforeEach(() => {
  locale.set('en');
  setAuth(
    {
      accessToken: 'test-access',
      refreshToken: 'test-refresh',
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      contentCookieExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    },
    makeUserProfile({ role: 'admin' }),
  );
});

afterEach(() => {
  cleanup();
  locale.set('en');
});

describe('AdminFeedbackTab', () => {
  it('applies the explicit raw-status colour in both table and card badges under Russian labels', async () => {
    locale.set('ru');
    const statuses: FeedbackStatus[] = ['open', 'in_progress', 'resolved', 'dismissed'];
    server.use(
      http.get(`${BASE}/v1/admin/feedback`, () =>
        HttpResponse.json({
          items: statuses.map((status, index) => ({
            ...feedbackReportFixture,
            id: `${index + 1}1111111-1111-4111-8111-111111111111`,
            status,
          })),
          limit: 30,
          has_more: false,
          next_cursor: null,
        }),
      ),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(QueryHost, {
      props: hostProps(queryClient, AdminFeedbackTab, {}),
    });

    await waitFor(() => expect(container.querySelectorAll('.badge')).toHaveLength(8));
    expect(screen.getAllByText('В работе').length).toBeGreaterThanOrEqual(3);
    for (const status of statuses) {
      expect(container.querySelectorAll(`.badge-${FEEDBACK_STATUS_COLORS[status]}`)).toHaveLength(
        2,
      );
    }
  });
});
