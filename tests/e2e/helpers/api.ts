import type { Route } from '@playwright/test';

/** Fulfill a route with a JSON response. */
export function jsonRoute(body: unknown, status = 200) {
  return (route: Route) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
}
