import { http, HttpResponse } from 'msw';
import { makeTokenResponse } from '../factories/auth';
import { MOCK_BASE_URL as BASE } from '../config';

/** Default product info — vex with checkbox age gate */
const vexProductInfo = {
  product: 'vex',
  display_name: 'Vex.pics',
  age_gate: 'checkbox',
  allowed_auth_methods: ['email_password'],
  content_rating: 'permissive',
  payment_providers: ['stripe', 'nowpayments'],
};

export const authHandlers = [
  http.get(`${BASE}/v1/auth/product-info`, () => HttpResponse.json(vexProductInfo)),

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

/** Override for simulating a 401 from refresh — the benign, silent "session ended elsewhere" case. */
export const failedRefreshHandler = http.post(`${BASE}/v1/auth/refresh`, () =>
  HttpResponse.json(
    { error: 'invalid_token', message: 'Refresh token is invalid or expired', status_code: 401 },
    { status: 401 },
  ),
);

/** Override: refresh-token reuse detected — a genuine security event (B2/B3). */
export const tokenReuseDetectedRefreshHandler = http.post(`${BASE}/v1/auth/refresh`, () =>
  HttpResponse.json(
    {
      error: 'token_reuse_detected',
      message: 'All sessions have been invalidated',
      status_code: 401,
    },
    { status: 401 },
  ),
);

/** Override: the account has been deactivated. */
export const accountInactiveRefreshHandler = http.post(`${BASE}/v1/auth/refresh`, () =>
  HttpResponse.json(
    { error: 'account_inactive', message: 'This account has been deactivated', status_code: 401 },
    { status: 401 },
  ),
);

/** Override: POST /v1/auth/content-cookie succeeds with a fresh expiry. */
export const contentCookieRemintHandler = http.post(`${BASE}/v1/auth/content-cookie`, () =>
  HttpResponse.json({ expires_at: new Date(Date.now() + 86_400_000).toISOString() }),
);

/** Override: POST /v1/auth/content-cookie fails (e.g. a dead Bearer token). */
export const failedContentCookieRemintHandler = http.post(`${BASE}/v1/auth/content-cookie`, () =>
  HttpResponse.json(
    { error: 'invalid_token', message: 'Access token is invalid or expired', status_code: 401 },
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

/** Override for simulating a 429 on login (rate limited, with Retry-After and remaining count). */
export const rateLimitedLoginHandler = http.post(`${BASE}/v1/auth/login`, () =>
  HttpResponse.json(
    { error: 'rate_limit_exceeded', message: 'Too many login attempts', status_code: 429 },
    {
      status: 429,
      headers: {
        'X-RateLimit-Limit': '10',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': '1710345600',
        'Retry-After': '45',
      },
    },
  ),
);

/**
 * Override that returns rate limit warning headers (low remaining count)
 * on an otherwise successful login response.
 */
export const rateLimitWarningLoginHandler = http.post(`${BASE}/v1/auth/login`, () =>
  HttpResponse.json(makeTokenResponse(), {
    headers: {
      'X-RateLimit-Limit': '10',
      'X-RateLimit-Remaining': '2',
      'X-RateLimit-Reset': '1710345600',
    },
  }),
);

/** Override: Synthara product — SFW, no age gate, Stripe only. */
export const syntharaProductHandler = http.get(`${BASE}/v1/auth/product-info`, () =>
  HttpResponse.json({
    product: 'synthara',
    display_name: 'Synthara',
    age_gate: 'none',
    allowed_auth_methods: ['email_password'],
    content_rating: 'sfw',
    payment_providers: ['stripe'],
  }),
);

/** Override: vex product with no age gate (for simplified test scenarios). */
export const vexNoAgeGateProductHandler = http.get(`${BASE}/v1/auth/product-info`, () =>
  HttpResponse.json({ ...vexProductInfo, age_gate: 'none' }),
);

/** Override: product-info fetch fails (network error). */
export const productInfoErrorHandler = http.get(`${BASE}/v1/auth/product-info`, () =>
  HttpResponse.json(
    { error: 'unknown_product', message: 'Unknown product', status_code: 400 },
    { status: 400 },
  ),
);
