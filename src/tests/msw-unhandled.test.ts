import { expect, it } from 'vitest';
import { takeUnhandledRequests } from './setup';

it('records a request without a matching MSW handler', async () => {
  await fetch('http://localhost:8000/unhandled-test').catch(() => undefined);

  expect(takeUnhandledRequests()).toEqual(['GET http://localhost:8000/unhandled-test']);
});
