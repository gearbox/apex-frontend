import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { server } from '../../../mocks/server';
import { MOCK_BASE_URL } from '../../../mocks/config';
import {
  makeLibraryAssetDetail,
  makeLibraryGroupDetail,
  makeLibraryOutputItem,
} from '../../../mocks/factories/library';
import { makeMediaObject } from '../../../mocks/factories/media';
import AssetDetailsSheetQueryHost from './AssetDetailsSheetQueryHost.svelte';

beforeAll(() => {
  vi.stubGlobal(
    'matchMedia',
    vi
      .fn()
      .mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
});

afterAll(() => vi.unstubAllGlobals());

describe('AssetDetailsSheet dynamic selection', () => {
  it('fetches and renders the selected sibling without remounting the dialog', async () => {
    const requestedRefs: string[] = [];
    const firstMedia = makeMediaObject({
      original: {
        url: '/v1/content/outputs/a',
        width: 512,
        height: 512,
        content_type: 'image/jpeg',
        size_bytes: 1,
      },
    });
    const secondMedia = makeMediaObject({
      original: {
        url: '/v1/content/outputs/b',
        width: 512,
        height: 512,
        content_type: 'image/jpeg',
        size_bytes: 1,
      },
    });
    server.use(
      http.get(`${MOCK_BASE_URL}/v1/library/groups/job-dynamic`, () =>
        HttpResponse.json(
          makeLibraryGroupDetail({
            job_id: 'job-dynamic',
            outputs: [
              makeLibraryOutputItem({ id: 'a', asset_ref: 'output:a', media: firstMedia }),
              makeLibraryOutputItem({ id: 'b', asset_ref: 'output:b', media: secondMedia }),
            ],
          }),
        ),
      ),
      http.get(`${MOCK_BASE_URL}/v1/library/assets/:asset_ref`, ({ params }) => {
        const assetRef = params.asset_ref as string;
        requestedRefs.push(assetRef);
        return HttpResponse.json(
          makeLibraryAssetDetail({
            asset_ref: assetRef,
            job_id: 'job-dynamic',
            output_count: 2,
            display_title: assetRef === 'output:a' ? 'First variation' : 'Second variation',
            prompt: assetRef === 'output:a' ? 'first prompt' : 'second prompt',
            media: assetRef === 'output:a' ? firstMedia : secondMedia,
            available_actions: assetRef === 'output:a' ? ['delete'] : ['download'],
          }),
        );
      }),
    );

    const { container } = render(AssetDetailsSheetQueryHost, {
      props: { assetRef: 'output:a', jobIdHint: 'job-dynamic' },
    });
    const dialog = await screen.findByRole('dialog', { name: 'Asset details' });
    await screen.findByText('First variation');

    await fireEvent.click(screen.getByRole('button', { name: 'Variation 2 of 2' }));
    expect(screen.queryByText('First variation')).toBeNull();
    expect(screen.queryByLabelText('Delete')).toBeNull();

    await waitFor(() => expect(requestedRefs).toContain('output:b'));
    expect(await screen.findByText('Second variation')).toBeTruthy();
    expect(screen.getByText('second prompt')).toBeTruthy();
    expect(screen.getAllByLabelText('Download')).toHaveLength(1);
    expect(container.querySelector('[role="dialog"]')).toBe(dialog);
  });
});
