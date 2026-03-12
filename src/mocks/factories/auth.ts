export function makeTokenResponse(overrides: Record<string, unknown> = {}) {
  return {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    token_type: 'bearer',
    expires_in: 900,
    expires_at: new Date(Date.now() + 900_000).toISOString(),
    ...overrides,
  };
}
