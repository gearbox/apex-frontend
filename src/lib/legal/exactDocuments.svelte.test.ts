import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { QueryClient } from '@tanstack/svelte-query';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../mocks/config';
import type { LegalDocumentMeta } from '$lib/api/legal';
import { legalKeys } from '$lib/queries/legal';
import { createExactDocuments, type ExactDocuments } from './exactDocuments.svelte';

function meta(doc_type: LegalDocumentMeta['doc_type'], version = '2026-10-01'): LegalDocumentMeta {
  return { doc_type, version, sha256: 'a'.repeat(64), requires_reacceptance: true };
}

function documentBody(docType: string, version: string) {
  return {
    doc_type: docType,
    version,
    sha256: 'a'.repeat(64),
    requires_reacceptance: true,
    content_md: `# ${docType} ${version}`,
  };
}

let destroy: (() => void) | undefined;
afterEach(() => destroy?.());

function setup(initial: LegalDocumentMeta[] | undefined) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const state = $state<{ current: LegalDocumentMeta[] | undefined }>({ current: initial });
  const onPayloadChange = vi.fn();
  let exact!: ExactDocuments;
  destroy = $effect.root(() => {
    exact = createExactDocuments(() => state.current, { queryClient, onPayloadChange });
  });
  flushSync();
  return { queryClient, state, onPayloadChange, exact: () => exact };
}

describe('createExactDocuments', () => {
  it('stays not-ready while there is no /current payload', () => {
    const { exact } = setup(undefined);
    expect(exact().ready).toBe(false);
    expect(exact().error).toBe(false);
  });

  it('prefetches every body by exact version and then becomes ready', async () => {
    const { exact, queryClient } = setup([meta('terms'), meta('privacy')]);

    await expect.poll(() => exact().ready).toBe(true);

    expect(exact().error).toBe(false);
    expect(queryClient.getQueryData(legalKeys.document('terms', '2026-10-01'))).toBeDefined();
    expect(queryClient.getQueryData(legalKeys.document('privacy', '2026-10-01'))).toBeDefined();
  });

  it('reports an error when an exact body cannot be fetched', async () => {
    server.use(
      http.get(`${BASE}/v1/legal/documents/:docType`, () =>
        HttpResponse.json(
          { error: 'server_error', message: 'boom', status_code: 500 },
          { status: 500 },
        ),
      ),
    );
    const { exact } = setup([meta('terms')]);

    await expect.poll(() => exact().error).toBe(true);
    expect(exact().ready).toBe(false);
  });

  it('reload() retries the same payload after a failure', async () => {
    let fail = true;
    server.use(
      http.get(`${BASE}/v1/legal/documents/:docType`, ({ params, request }) => {
        if (fail) {
          return HttpResponse.json(
            { error: 'server_error', message: 'boom', status_code: 500 },
            { status: 500 },
          );
        }
        const version = new URL(request.url).searchParams.get('version') ?? '';
        return HttpResponse.json(documentBody(params.docType as string, version));
      }),
    );
    const { exact } = setup([meta('terms')]);
    await expect.poll(() => exact().error).toBe(true);

    fail = false;
    await exact().reload();

    expect(exact().error).toBe(false);
    expect(exact().ready).toBe(true);
  });

  it('keeps ready when a refetch returns the same set under a new reference', async () => {
    const { exact, state, onPayloadChange } = setup([meta('terms')]);
    await expect.poll(() => exact().ready).toBe(true);

    state.current = [meta('terms')];
    flushSync();

    expect(exact().ready).toBe(true);
    expect(onPayloadChange).not.toHaveBeenCalled();
  });

  it('notifies a content change, but not the first payload', async () => {
    const { exact, state, onPayloadChange } = setup([meta('terms')]);
    await expect.poll(() => exact().ready).toBe(true);
    expect(onPayloadChange).not.toHaveBeenCalled();

    state.current = [meta('terms', '2026-11-01')];
    flushSync();

    expect(onPayloadChange).toHaveBeenCalledTimes(1);
  });

  it('never flips ready for a payload that a newer /current superseded', async () => {
    let releaseOld!: () => void;
    const oldGate = new Promise<void>((resolve) => (releaseOld = resolve));
    let releaseNew!: () => void;
    const newGate = new Promise<void>((resolve) => (releaseNew = resolve));
    server.use(
      http.get(`${BASE}/v1/legal/documents/:docType`, async ({ params, request }) => {
        const version = new URL(request.url).searchParams.get('version') ?? '';
        await (version === '2026-10-01' ? oldGate : newGate);
        return HttpResponse.json(documentBody(params.docType as string, version));
      }),
    );
    const { exact, state } = setup([meta('terms', '2026-10-01')]);

    state.current = [meta('terms', '2026-11-01')];
    flushSync();
    releaseOld();
    // Give the superseded fetch every chance to (incorrectly) resolve the flag.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(exact().ready).toBe(false);

    releaseNew();
    await expect.poll(() => exact().ready).toBe(true);
  });
});
