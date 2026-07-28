import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withAuthOperation } from '$lib/api/authedFetch';
import { clearAuth } from '$lib/stores/auth';
import { invalidateAuthOperations } from '$lib/stores/authLifecycle';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  clearAuth();
});

afterEach(() => {
  clearAuth();
});

describe('withAuthOperation', () => {
  it('does not invoke a handler for a superseded non-401 failure response', async () => {
    const response = deferred<Response>();
    const requestStarted = deferred<void>();
    const handle = vi.fn(async (_response: Response) => 'handled');

    const operation = withAuthOperation(
      async () => {
        requestStarted.resolve();
        return response.promise;
      },
      handle,
    );

    await requestStarted.promise;
    invalidateAuthOperations();
    response.resolve(new Response('Internal Server Error', { status: 500 }));

    await expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    expect(handle).not.toHaveBeenCalled();
  });

  it('aborts when the session is superseded while the handler is awaiting', async () => {
    const handlerStarted = deferred<void>();
    const handlerResult = deferred<string>();
    const handle = vi.fn(async (_response: Response) => {
      handlerStarted.resolve();
      return handlerResult.promise;
    });

    const operation = withAuthOperation(async () => new Response(null, { status: 200 }), handle);

    await handlerStarted.promise;
    invalidateAuthOperations();
    handlerResult.resolve('parsed response');

    await expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    expect(handle).toHaveBeenCalledOnce();
  });
});
