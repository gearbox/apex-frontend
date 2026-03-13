import { http, HttpResponse } from 'msw';
import { makeTokenResponse } from '../factories/auth';
import { MOCK_BASE_URL as BASE } from '../config';

export const authHandlers = [
  http.post(`${BASE}/v1/auth/login`, () => HttpResponse.json(makeTokenResponse())),

  http.post(`${BASE}/v1/auth/register`, () =>
    HttpResponse.json(makeTokenResponse(), { status: 201 }),
  ),

  http.post(`${BASE}/v1/auth/refresh`, () => HttpResponse.json(makeTokenResponse())),

  http.post(`${BASE}/v1/auth/logout`, () =>
    HttpResponse.json({ message: 'Logged out successfully' }),
  ),

  http.post(`${BASE}/v1/auth/forgot-password`, () =>
    HttpResponse.json({ message: 'Password reset email sent' }),
  ),

  http.post(`${BASE}/v1/auth/reset-password`, () =>
    HttpResponse.json({ message: 'Password reset successfully' }),
  ),

  http.post(`${BASE}/v1/auth/verify-email`, () =>
    HttpResponse.json({ message: 'Email verified successfully' }),
  ),
];

/** Override for simulating a 401 from refresh (token expired/revoked). */
export const failedRefreshHandler = http.post(`${BASE}/v1/auth/refresh`, () =>
  HttpResponse.json(
    { error: 'token_revoked', message: 'Refresh token has been revoked', status_code: 401 },
    { status: 401 },
  ),
);

/** Override for simulating a 401 login response. */
export const failedLoginHandler = http.post(`${BASE}/v1/auth/login`, () =>
  HttpResponse.json(
    { error: 'invalid_credentials', message: 'Invalid email or password', status_code: 401 },
    { status: 401 },
  ),
);
