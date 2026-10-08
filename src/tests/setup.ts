import { server } from '../mocks/server';
import { afterAll, afterEach, beforeAll, expect } from 'vitest';

const unhandledRequests: string[] = [];

beforeAll(() =>
  server.listen({
    onUnhandledRequest(request) {
      unhandledRequests.push(`${request.method} ${request.url}`);
    },
  }),
);

afterEach(() => {
  server.resetHandlers();
  // Drain before asserting, so one failing test cannot leak entries into the next.
  const unhandled = unhandledRequests.splice(0);
  expect(unhandled, 'unit tests must mock every request').toEqual([]);
});

afterAll(() => server.close());

export function takeUnhandledRequests(): string[] {
  return unhandledRequests.splice(0);
}
