import { http, HttpResponse } from 'msw';

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

/** Default happy-path handler for SSE ticket */
export const sseTicketHandler = http.post(`${BASE}/v1/events/sse-ticket`, () =>
  HttpResponse.json({ ticket: 'mock-sse-ticket-abc123' }, { status: 201 }),
);

/** Override: SSE unavailable (no Redis) */
export const sseTicketUnavailableHandler = http.post(`${BASE}/v1/events/sse-ticket`, () =>
  HttpResponse.json(
    { error: 'service_unavailable', message: 'Redis not configured', status_code: 503 },
    { status: 503 },
  ),
);

/** Override: rate limited (Retry-After: 0 so client's retry loop completes instantly in tests) */
export const sseTicketRateLimitedHandler = http.post(`${BASE}/v1/events/sse-ticket`, () =>
  HttpResponse.json(
    { error: 'rate_limited', message: 'Too many requests', status_code: 429 },
    { status: 429, headers: { 'Retry-After': '0' } },
  ),
);

/** Override: generic server error (for testing consecutive-failure fallback) */
export const sseTicketServerErrorHandler = http.post(`${BASE}/v1/events/sse-ticket`, () =>
  HttpResponse.json({ error: 'server_error', status_code: 500 }, { status: 500 }),
);

export const eventHandlers = [sseTicketHandler];
