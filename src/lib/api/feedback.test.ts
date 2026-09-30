import { beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { setAuth } from '$lib/stores/auth';
import { makeUserProfile } from '../../mocks/factories/user';
import { submitFeedback } from './feedback';

const BASE = 'http://localhost:8000';

beforeEach(() => {
  setAuth(
    {
      accessToken: 'test-access',
      refreshToken: 'test-refresh',
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      contentCookieExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    },
    makeUserProfile(),
  );
});

describe('submitFeedback()', () => {
  it('returns a submitted report and sends only the typed payload', async () => {
    let body: unknown;
    server.use(
      http.post(`${BASE}/v1/feedback`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          {
            id: '55555555-5555-4555-8555-555555555555',
            status: 'open',
            created_at: '2026-09-29T00:00:00Z',
          },
          { status: 201 },
        );
      }),
    );

    await expect(
      submitFeedback({
        category: 'bug',
        message: 'A sufficiently descriptive report',
        client_path: '/app/create',
        app_version: '0.27.1+abc1234',
      }),
    ).resolves.toMatchObject({ status: 'open' });
    expect(body).toEqual({
      category: 'bug',
      message: 'A sufficiently descriptive report',
      client_path: '/app/create',
      app_version: '0.27.1+abc1234',
    });
  });

  it('preserves Retry-After on a normalized feedback error', async () => {
    server.use(
      http.post(`${BASE}/v1/feedback`, () =>
        HttpResponse.json(
          { error: 'rate_limited', message: 'Too many reports', status_code: 429 },
          { status: 429, headers: { 'Retry-After': '42' } },
        ),
      ),
    );
    await expect(
      submitFeedback({ category: 'bug', message: 'A sufficiently descriptive report' }),
    ).rejects.toMatchObject({
      error: 'rate_limited',
      retry_after_seconds: 42,
    });
  });
});
