import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import type { QueryClient } from '@tanstack/svelte-query';
import type { components } from '$lib/api/types';
import { server } from '../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../mocks/config';
import { makeLibraryGroupDetail, makeLibraryOutputItem } from '../../../mocks/factories/library';
import { makeStandardImageMedia } from '../../../mocks/factories/media';
import { libraryKeys } from '$lib/queries/library';

type LibraryGroupDetail = components['schemas']['LibraryGroupDetail'];

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import GroupSheetTestHost from './GroupSheetTestHost.svelte';

function makeGroup(jobId = 'job-group'): LibraryGroupDetail {
  return makeLibraryGroupDetail({
    job_id: jobId,
    prompt: 'Three distinct variations',
    outputs: [
      makeLibraryOutputItem({
        id: 'a',
        asset_ref: 'output:a',
        media: makeStandardImageMedia('variation-a'),
      }),
      makeLibraryOutputItem({
        id: 'b',
        asset_ref: 'output:b',
        media: makeStandardImageMedia('variation-b'),
      }),
      makeLibraryOutputItem({
        id: 'c',
        asset_ref: 'output:c',
        media: makeStandardImageMedia('variation-c'),
      }),
    ],
  });
}

let groupDetail: LibraryGroupDetail;
let queryClient: QueryClient | null;
let groupRequestCount = 0;

function renderSheet(initialAssetRef?: string | null, jobId = 'job-group') {
  groupDetail = makeGroup(jobId);
  server.use(
    http.get(`${BASE}/v1/library/groups/:job_id`, () => {
      groupRequestCount += 1;
      return HttpResponse.json(groupDetail);
    }),
  );
  const onOpenAsset = vi.fn();
  const view = render(GroupSheetTestHost, {
    props: {
      jobId,
      initialAssetRef,
      onclose: vi.fn(),
      onOpenAsset,
      onQueryClient: (client: QueryClient) => (queryClient = client),
    },
  });
  return { ...view, onOpenAsset };
}

beforeEach(() => {
  queryClient = null;
  groupRequestCount = 0;
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
});

describe('GroupSheet initial output selection', () => {
  it('selects the requested output for the thumbnail, preview, and Details action', async () => {
    const { onOpenAsset } = renderSheet('output:b');

    expect(
      (await screen.findByRole('button', { name: 'Output 2' })).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getByRole('button', { name: 'Output 1' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(screen.getByAltText('Three distinct variations').getAttribute('src')).toContain(
      'variation-b',
    );

    await fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(onOpenAsset).toHaveBeenCalledWith('output:b');
  });

  it('defaults safely to the first output for missing or unknown asset references', async () => {
    const { unmount } = renderSheet();
    expect(
      (await screen.findByRole('button', { name: 'Output 1' })).getAttribute('aria-pressed'),
    ).toBe('true');
    unmount();

    renderSheet('output:missing');
    expect(
      (await screen.findByRole('button', { name: 'Output 1' })).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('keeps a later thumbnail choice after the group query refetches', async () => {
    renderSheet('output:b');

    await fireEvent.click(await screen.findByRole('button', { name: 'Output 3' }));

    groupDetail = { ...groupDetail };
    expect(queryClient).not.toBeNull();
    await queryClient!.invalidateQueries({ queryKey: libraryKeys.group('job-group') });
    expect(groupRequestCount).toBeGreaterThan(1);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Output 3' }).getAttribute('aria-pressed')).toBe(
        'true',
      ),
    );
    expect(screen.getByAltText('Three distinct variations').getAttribute('src')).toContain(
      'variation-c',
    );
  });

  it('initializes each newly mounted group request independently', async () => {
    const { unmount } = renderSheet('output:b');
    expect(
      (await screen.findByRole('button', { name: 'Output 2' })).getAttribute('aria-pressed'),
    ).toBe('true');
    unmount();

    renderSheet('output:c', 'job-next');
    expect(
      (await screen.findByRole('button', { name: 'Output 3' })).getAttribute('aria-pressed'),
    ).toBe('true');
  });
});
