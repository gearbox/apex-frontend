import type { Page, Route } from '@playwright/test';

/** Fulfill a route with a JSON response. */
export function jsonRoute(body: unknown, status = 200) {
  return (route: Route) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
}

/** Intercept an API route to return an error response. */
export async function mockApiError(page: Page, pattern: string, status: number, body: unknown) {
  await page.route(pattern, jsonRoute(body, status));
}
