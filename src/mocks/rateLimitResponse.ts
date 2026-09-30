import { HttpResponse } from 'msw';

export function rateLimitResponse(retryAfter?: string) {
  const headers = retryAfter ? { 'Retry-After': retryAfter } : undefined;
  return HttpResponse.json(
    { error: 'rate_limit_exceeded', message: 'Too many requests', status_code: 429 },
    { status: 429, headers },
  );
}
