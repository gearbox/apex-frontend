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
    HttpResponse.json({
      total_jobs: 42,
      completed_jobs: 38,
      failed_jobs: 4,
      total_outputs: 76,
      total_uploads: 12,
      storage_used_bytes: 157_286_400, // ~150 MB
    }),
  ),

  http.post(`${BASE}/v1/users/me/password`, async ({ request }) => {
    const body = (await request.json()) as { current_password: string; new_password: string };
    if (body.current_password === 'wrong-password') {
      return HttpResponse.json(
        { error: 'invalid_password', message: 'Current password is incorrect', status_code: 400 },
        { status: 400 },
      );
    }
    return new HttpResponse(JSON.stringify({ message: 'Password changed successfully' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  }),

  http.post(`${BASE}/v1/users/me/logout-all`, () => {
    return new HttpResponse(JSON.stringify({ message: 'All sessions revoked' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  }),

  http.delete(`${BASE}/v1/users/me`, () => {
    return HttpResponse.json({
      message: 'Account deactivated',
      deactivated_at: new Date().toISOString(),
    });
  }),
];
