import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import MediaImage from './MediaImage.svelte';
import { setAuthFailureReason, __resetAuthFailureReasonForTesting } from '$lib/stores/auth';
import type { components } from '$lib/api/types';

const { silentRefreshMock, remintContentCookieMock } = vi.hoisted(() => ({
  silentRefreshMock: vi.fn<() => Promise<{ ok: true } | { ok: false; reason: string }>>(),
  remintContentCookieMock: vi.fn<() => Promise<Date | null>>(),
}));

vi.mock('$lib/api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/api/auth')>()),
  silentRefresh: silentRefreshMock,
  remintContentCookie: remintContentCookieMock,
}));

type MediaObject = components['schemas']['MediaObject'];

const ORIGIN = 'http://localhost:8000';

/**
 * `vi.waitFor` only guarantees the mock was *called* — the component's async continuation after
 * that awaited call (updating `failure` state, calling `reloadSameSource()`) still needs its own
 * microtask turn. A macrotask flush guarantees every already-queued microtask has drained before
 * the next assertion (or the next `fireEvent.error`) runs.
 */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeImageMedia(overrides: Partial<MediaObject> = {}): MediaObject {
  return {
    media_type: 'image',
    original: {
      url: '/v1/content/outputs/orig',
      width: 1024,
      height: 768,
      content_type: 'image/png',
      size_bytes: 100000,
    },
    variants: [
      { label: 'sm', width: 150, height: 113, url: '/v1/content/outputs/orig_sm' },
      { label: 'md', width: 512, height: 384, url: '/v1/content/outputs/orig_md' },
    ],
    ...overrides,
  };
}

describe('MediaImage', () => {
  beforeEach(() => {
    __resetAuthFailureReasonForTesting();
    // Default: rung 1 (content-cookie re-mint) fails so tests exercise rung 2 (full refresh),
    // mirroring the pre-two-rung test setup unless a test overrides it.
    remintContentCookieMock.mockReset().mockResolvedValue(null);
    silentRefreshMock.mockReset().mockResolvedValue({ ok: true });
  });

  it('renders an img with srcset containing 150w and 512w from variants', () => {
    const { container } = render(MediaImage, {
      props: { media: makeImageMedia(), alt: 'test' },
    });
    const img = container.querySelector('img')!;
    expect(img.getAttribute('srcset')).toContain('150w');
    expect(img.getAttribute('srcset')).toContain('512w');
  });

  it('sets width and height from original for CLS box', () => {
    const { container } = render(MediaImage, {
      props: { media: makeImageMedia(), alt: 'test' },
    });
    const img = container.querySelector('img')!;
    expect(img.getAttribute('width')).toBe('1024');
    expect(img.getAttribute('height')).toBe('768');
  });

  it('src is origin-prefixed original path', () => {
    const { container } = render(MediaImage, {
      props: { media: makeImageMedia(), alt: 'test' },
    });
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe(`${ORIGIN}/v1/content/outputs/orig`);
  });

  it('empty variants: no srcset, src = original', () => {
    const { container } = render(MediaImage, {
      props: { media: makeImageMedia({ variants: [] }), alt: 'test' },
    });
    const img = container.querySelector('img')!;
    expect(img.getAttribute('srcset')).toBeNull();
    expect(img.getAttribute('src')).toBe(`${ORIGIN}/v1/content/outputs/orig`);
  });

  it('rung 1 success: a re-minted content cookie reloads the same source without a full refresh (C3)', async () => {
    remintContentCookieMock.mockResolvedValue(new Date(Date.now() + 86_400_000));
    const { container } = render(MediaImage, {
      props: { media: makeImageMedia(), alt: 'test' },
    });
    const img = container.querySelector('img')!;
    const srcset = img.getAttribute('srcset');

    await fireEvent.error(img);

    await vi.waitFor(() => expect(remintContentCookieMock).toHaveBeenCalledTimes(1));
    expect(silentRefreshMock).not.toHaveBeenCalled();
    expect(img.getAttribute('src')).toBe(`${ORIGIN}/v1/content/outputs/orig`);
    expect(img.getAttribute('srcset')).toBe(srcset);
  });

  it('rung 2: falls back to a full refresh when the re-mint fails, then reloads the same source', async () => {
    const { container } = render(MediaImage, {
      props: { media: makeImageMedia(), alt: 'test' },
    });
    const img = container.querySelector('img')!;
    const srcset = img.getAttribute('srcset');

    await fireEvent.error(img);

    await vi.waitFor(() => expect(remintContentCookieMock).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(silentRefreshMock).toHaveBeenCalledTimes(1));
    expect(img.getAttribute('src')).toBe(`${ORIGIN}/v1/content/outputs/orig`);
    expect(img.getAttribute('srcset')).toBe(srcset);
  });

  it('shows the neutral placeholder only after the retry also errors', async () => {
    const { container, getByRole } = render(MediaImage, {
      props: { media: makeImageMedia(), alt: 'test' },
    });
    const img = container.querySelector('img')!;

    await fireEvent.error(img);
    await vi.waitFor(() => expect(silentRefreshMock).toHaveBeenCalledTimes(1));
    await flushMicrotasks();
    await fireEvent.error(img);

    expect(container.querySelector('img')).toBeNull();
    expect(getByRole('img', { name: 'Image unavailable' })).toBeTruthy();
  });

  it('both rungs failing on the first error goes straight to the placeholder', async () => {
    silentRefreshMock.mockResolvedValue({ ok: false, reason: 'invalid_token' });
    const { container, getByRole } = render(MediaImage, {
      props: { media: makeImageMedia(), alt: 'test' },
    });

    await fireEvent.error(container.querySelector('img')!);

    await vi.waitFor(() => expect(container.querySelector('img')).toBeNull());
    expect(getByRole('img', { name: 'Image unavailable' })).toBeTruthy();
  });

  it('B3: a known-revoked session skips both rungs entirely and goes straight to the placeholder', async () => {
    setAuthFailureReason('token_reuse_detected');
    const { container, getByRole } = render(MediaImage, {
      props: { media: makeImageMedia(), alt: 'test' },
    });

    await fireEvent.error(container.querySelector('img')!);

    expect(container.querySelector('img')).toBeNull();
    expect(getByRole('img', { name: 'Image unavailable' })).toBeTruthy();
    expect(remintContentCookieMock).not.toHaveBeenCalled();
    expect(silentRefreshMock).not.toHaveBeenCalled();
  });

  it('B3: account_inactive also skips both rungs', async () => {
    setAuthFailureReason('account_inactive');
    const { container } = render(MediaImage, {
      props: { media: makeImageMedia(), alt: 'test' },
    });

    await fireEvent.error(container.querySelector('img')!);

    expect(container.querySelector('img')).toBeNull();
    expect(remintContentCookieMock).not.toHaveBeenCalled();
    expect(silentRefreshMock).not.toHaveBeenCalled();
  });

  it('an ordinary invalid_token reason keeps the existing ladder behavior (B3)', async () => {
    setAuthFailureReason('invalid_token');
    const { container } = render(MediaImage, {
      props: { media: makeImageMedia(), alt: 'test' },
    });

    await fireEvent.error(container.querySelector('img')!);

    await vi.waitFor(() => expect(remintContentCookieMock).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(silentRefreshMock).toHaveBeenCalledTimes(1));
  });

  it('resets a failed retry state when a new media prop arrives', async () => {
    const first = makeImageMedia();
    const second = makeImageMedia({
      original: { ...first.original, url: '/v1/content/outputs/next' },
    });
    const { container, rerender } = render(MediaImage, {
      props: { media: first, alt: 'test' },
    });

    await fireEvent.error(container.querySelector('img')!);
    await vi.waitFor(() => expect(silentRefreshMock).toHaveBeenCalledTimes(1));
    await flushMicrotasks();
    await fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();

    await rerender({ media: second, alt: 'test' });
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      `${ORIGIN}/v1/content/outputs/next`,
    );
  });

  it('does not reset a failed retry state on a rerender carrying an identical URL in a new object', async () => {
    const first = makeImageMedia();
    // Same URL, brand-new object — the bug this guards against reset retryState on identity
    // alone, which would remount the <img> and retrigger the recovery ladder needlessly.
    const second = makeImageMedia();
    const { container, rerender } = render(MediaImage, {
      props: { media: first, alt: 'test' },
    });

    await fireEvent.error(container.querySelector('img')!);
    await vi.waitFor(() => expect(silentRefreshMock).toHaveBeenCalledTimes(1));
    await flushMicrotasks();
    await fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();

    await rerender({ media: second, alt: 'test' });

    expect(container.querySelector('img')).toBeNull();
    expect(silentRefreshMock).toHaveBeenCalledTimes(1);
  });
});

describe('MediaImage — srcOverride', () => {
  beforeEach(() => {
    __resetAuthFailureReasonForTesting();
    remintContentCookieMock.mockReset().mockResolvedValue(null);
    silentRefreshMock.mockReset().mockResolvedValue({ ok: true });
  });

  it('renders a single src with no srcset/sizes when srcOverride is set', () => {
    const { container } = render(MediaImage, {
      props: { media: makeImageMedia(), alt: 'test', srcOverride: 'blob:http://localhost/abc' },
    });
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('blob:http://localhost/abc');
    expect(img.getAttribute('srcset')).toBeNull();
    expect(img.getAttribute('sizes')).toBeNull();
  });

  it('calls onObjectUrlError instead of the recovery ladder when the override source fails', async () => {
    const onObjectUrlError = vi.fn();
    const { container } = render(MediaImage, {
      props: {
        media: makeImageMedia(),
        alt: 'test',
        srcOverride: 'blob:http://localhost/abc',
        onObjectUrlError,
      },
    });

    await fireEvent.error(container.querySelector('img')!);

    expect(onObjectUrlError).toHaveBeenCalledTimes(1);
    expect(remintContentCookieMock).not.toHaveBeenCalled();
    expect(silentRefreshMock).not.toHaveBeenCalled();
    // No placeholder — the owner is expected to drop srcOverride so the variant repaints.
    expect(container.querySelector('img')).not.toBeNull();
  });
});
