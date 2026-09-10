import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { ApiRequestError } from '$lib/api/errors';
import { fetchProviders } from './providers';

const BASE = 'http://localhost:8000';

describe('fetchProviders()', () => {
  it('accepts a successful empty provider catalog', async () => {
    server.use(
      http.get(`${BASE}/v1/providers`, () =>
        HttpResponse.json({ providers: [], user_context: null }),
      ),
    );

    await expect(fetchProviders()).resolves.toEqual({ providers: [], user_context: null });
  });

  it('throws on a failed provider request instead of treating it as an empty catalog', async () => {
    server.use(
      http.get(`${BASE}/v1/providers`, () =>
        HttpResponse.json(
          { error: 'server_error', message: 'Provider service unavailable', status_code: 500 },
          { status: 500 },
        ),
      ),
    );

    await expect(fetchProviders()).rejects.toBeInstanceOf(ApiRequestError);
  });
});
