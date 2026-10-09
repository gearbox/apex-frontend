import { server } from '../mocks/server';
import { afterAll, afterEach, beforeAll, expect } from 'vitest';

const unhandledRequests: string[] = [];

beforeAll(() =>
  server.listen({
    onUnhandledRequest(request) {
      const description = `${request.method} ${request.url}`;
      unhandledRequests.push(description);
      // Throwing is the only way to stop MSW from performing the request for real: in MSW 2.x a
      // custom callback that only logs and returns bypasses to the network.
      // MSW resolves the aborted request with a synthetic 500; the afterEach assertion fails the test.
      throw new Error(`Unhandled request in a unit test: ${description}`);
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

/** Test-only: lets the harness self-test consume the requests it deliberately leaves unmocked. */
export function takeUnhandledRequests(): string[] {
  return unhandledRequests.splice(0);
}
