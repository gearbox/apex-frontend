import { http, HttpResponse } from 'msw';
import { makeUserProfile } from '../factories/user';
import { MOCK_BASE_URL as BASE } from '../config';

export const userHandlers = [
  http.get(`${BASE}/v1/users/me`, () => HttpResponse.json(makeUserProfile())),

  http.patch(`${BASE}/v1/users/me`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(makeUserProfile(body as Parameters<typeof makeUserProfile>[0]));
  }),

  http.get(`${BASE}/v1/users/me/stats`, () =>
    HttpResponse.json({ total_jobs: 5, completed_jobs: 4, failed_jobs: 1, total_tokens_spent: 100 }),
  ),
];
