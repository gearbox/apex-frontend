import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ProgressiveImage from './ProgressiveImage.svelte';
import { makeMediaObject } from '../../mocks/factories/media';

const { silentRefreshMock } = vi.hoisted(() => ({
  silentRefreshMock: vi.fn<() => Promise<boolean>>(),
}));

vi.mock('$lib/api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/api/auth')>()),
  silentRefresh: silentRefreshMock,
}));

const ORIGIN = 'http://localhost:8000';

/** The upgrade fetch never settles, so the base responsive variant stays painted for the
 *  lifetime of the test — any <img> error must be handled by MediaImage's own ladder. */
function neverSettles(): Promise<Response> {
  return new Promise(() => {});
}

function streamedResponse(chunks: string[], headers: Record<string, string> = {}): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'image/png', ...headers } },
  );
}

beforeEach(() => {
  silentRefreshMock.mockReset().mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ProgressiveImage — base variant error ladder (delegated to MediaImage)', () => {
  it('refreshes once and reloads the same responsive candidates after a variant error', async () => {
    vi.stubGlobal('fetch', vi.fn(neverSettles));
    const media = makeMediaObject();

    const { container } = render(ProgressiveImage, { props: { media, alt: 'test' } });
    const img = container.querySelector('img')!;
    const srcset = img.getAttribute('srcset');

    await fireEvent.error(img);

    await vi.waitFor(() => expect(silentRefreshMock).toHaveBeenCalledTimes(1));
    expect(img.getAttribute('src')).toBe(`${ORIGIN}${media.original.url}`);
    expect(img.getAttribute('srcset')).toBe(srcset);
  });

  it('shows the neutral placeholder only after the retry also errors', async () => {
    vi.stubGlobal('fetch', vi.fn(neverSettles));
    const media = makeMediaObject();

    const { container, getByRole } = render(ProgressiveImage, { props: { media, alt: 'test' } });
    const img = container.querySelector('img')!;

    await fireEvent.error(img);
    await vi.waitFor(() => expect(silentRefreshMock).toHaveBeenCalledTimes(1));
    await fireEvent.error(img);

    expect(container.querySelector('img')).toBeNull();
    expect(getByRole('img', { name: 'Image unavailable' })).toBeTruthy();
  });
});

describe('ProgressiveImage — URL-keyed upgrade effect (D3)', () => {
  it('does not abort or restart the in-flight upgrade when a rerender supplies a new object with an identical URL', async () => {
    const fetchMock = vi.fn(neverSettles);
    vi.stubGlobal('fetch', fetchMock);
    const first = makeMediaObject();
    const second = makeMediaObject(); // Same URL, brand-new object — see fix-review D3.

    const { rerender } = render(ProgressiveImage, { props: { media: first, alt: 'test' } });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await rerender({ media: second, alt: 'test' });
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('ProgressiveImage — upgraded object URL failure', () => {
  it('drops back to the responsive variant without calling silentRefresh', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(streamedResponse(['bytes'], { 'content-length': '5' })),
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-upgrade');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const media = makeMediaObject();

    const { container } = render(ProgressiveImage, { props: { media, alt: 'test' } });

    await vi.waitFor(() =>
      expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:mock-upgrade'),
    );

    await fireEvent.error(container.querySelector('img')!);

    await vi.waitFor(() =>
      expect(container.querySelector('img')?.getAttribute('src')).toBe(
        `${ORIGIN}${media.original.url}`,
      ),
    );
    expect(silentRefreshMock).not.toHaveBeenCalled();
  });
});
