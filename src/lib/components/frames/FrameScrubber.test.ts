import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { FrameExtractionSession } from './frameExtractionSession';
import { ASSET_REF, videoMedia, installMediaMocks } from './frameTestFixtures';
import FrameScrubber from './FrameScrubber.svelte';
let session: FrameExtractionSession;
afterEach(() => {
  cleanup();
  session?.dispose();
  vi.restoreAllMocks();
});
describe('FrameScrubber', () => {
  it('reuses the session canvas, debounces without encoding, and encodes only on Add frame', async () => {
    const mocks = installMediaMocks();
    session = new FrameExtractionSession({
      assetRef: ASSET_REF,
      media: videoMedia,
      createVideo: mocks.createVideo,
    });
    await session.load();
    const before = mocks.encodes.length;
    const onadd = vi.fn();
    render(FrameScrubber, {
      props: {
        session,
        timestamp: 0,
        maxTimestamp: 2999,
        canAdd: true,
        onscrub: (value) => value,
        onadd,
        onerror: vi.fn(),
      },
    });
    expect(screen.getByRole('slider').closest('section')?.querySelector('canvas')).toBe(
      session.canvas,
    );
    await fireEvent.input(screen.getByRole('slider'), { target: { value: '1250' } });
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Add frame' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    expect(mocks.encodes).toHaveLength(before);
    await fireEvent.click(screen.getByRole('button', { name: 'Add frame' }));
    await waitFor(() => expect(onadd).toHaveBeenCalledOnce());
    expect(onadd.mock.calls[0][0].timestampMs).toBe(1250);
    expect(mocks.encodes).toHaveLength(before + 1);
  });
});
