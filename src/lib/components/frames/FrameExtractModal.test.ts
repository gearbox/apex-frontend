import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import { ASSET_REF, videoMedia, uploaded, installMediaMocks } from './testing/frameTestFixtures';
import { FrameExtractionSession } from './frameExtractionSession';
import { ApiRequestError } from '$lib/api/errors';
import { feedbackDialog } from '$lib/stores/feedbackDialog.svelte';

const { upload, invalidate, goto, prefill, recover } = vi.hoisted(() => ({
  upload: vi.fn(),
  invalidate: vi.fn(),
  goto: vi.fn(),
  prefill: vi.fn<(options: { source: { assetRef: string } }) => boolean>(() => true),
  recover: vi.fn(),
}));
vi.mock('$lib/api/upload', () => ({ uploadMedia: upload }));
vi.mock('$lib/media/mediaErrorRecovery', () => ({ recoverFromMediaError: recover }));
vi.mock('$app/navigation', () => ({ goto }));
vi.mock('@tanstack/svelte-query', () => ({
  useQueryClient: () => ({ invalidateQueries: invalidate }),
  createQuery: () => ({ data: { providers: [] } }),
}));
vi.mock('$lib/services/generationPrefill', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/services/generationPrefill')>()),
  prefillSourceForGeneration: prefill,
}));
vi.mock('$lib/utils/breakpoints', () => ({ isDesktop: writable(false) }));
import FrameExtractModal from './FrameExtractModal.svelte';

beforeEach(() => {
  vi.clearAllMocks();
  installMediaMocks();
  upload.mockResolvedValue(uploaded);
  recover.mockResolvedValue({ retry: false, failure: 'unsupported' });
  feedbackDialog.reset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  feedbackDialog.reset();
});
function modal(media = videoMedia, trigger?: HTMLElement) {
  const onclose = vi.fn();
  const result = render(FrameExtractModal, {
    props: { assetRef: ASSET_REF, media, onclose, trigger },
  });
  return { ...result, onclose };
}
async function ready() {
  await screen.findByRole('heading', { name: 'Automatic' }, { timeout: 3000 });
}

describe('client frame modal', () => {
  it('renders six local automatic previews', async () => {
    modal();
    await ready();
    expect(screen.getAllByRole('button', { name: /^Automatic:/ })).toHaveLength(6);
    expect(screen.getByText('Frames added from the scrubber will appear here.')).toBeTruthy();
  });
  it('traps focus, handles Escape and restores focus on destruction', async () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const f = modal(videoMedia, trigger);
    await ready();
    const close = screen.getByRole('button', { name: 'Close' });
    expect(document.activeElement).toBe(close);
    await fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).not.toBe(close);
    await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(f.onclose).toHaveBeenCalledOnce();
    f.unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
  it('shows unavailable videos without decoding and reports with canonical asset and bug category', async () => {
    const media = structuredClone(videoMedia);
    media.original.duration_ms = null;
    const trigger = document.createElement('button');
    document.body.append(trigger);
    const f = modal(media, trigger);
    await screen.findByText("Frame extraction isn't available for this video");
    expect(screen.getByRole('dialog').querySelector('video')?.hasAttribute('src')).toBe(false);
    await fireEvent.click(screen.getByRole('button', { name: 'Report this video' }));
    expect(f.onclose).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(feedbackDialog.context).toEqual({ assetRef: ASSET_REF, initialCategory: 'bug' }),
    );
    f.unmount();
    trigger.remove();
  });
  it('shows the unsupported state for a non-decodable video', async () => {
    vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(0);
    modal();
    await screen.findByText("This video can't be opened in this browser");
    expect(screen.getByRole('button', { name: 'Report this video' })).toBeTruthy();
  });
  it('adds and removes manual frames and gives duplicate feedback', async () => {
    modal();
    await ready();
    const slider = screen.getByRole('slider');
    await fireEvent.input(slider, { target: { value: '1250' } });
    const add = screen.getByRole('button', { name: 'Add frame' });
    await waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(false));
    await fireEvent.click(add);
    await screen.findByRole('button', { name: 'Manually chosen frames: 00:01.250' });
    await fireEvent.click(add);
    await screen.findByText('Frame already added');
    await fireEvent.click(
      screen.getByRole('button', { name: 'Remove manually chosen frame at 00:01.250' }),
    );
    expect(screen.queryByRole('button', { name: 'Manually chosen frames: 00:01.250' })).toBeNull();
  });
  it('uploads selection and uses the resulting upload as a generation source', async () => {
    modal();
    await ready();
    await fireEvent.click(screen.getByRole('button', { name: 'Automatic: 00:00.000' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Extract frames' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Use as input' }));
    expect(upload.mock.calls[0][1]).toMatchObject({
      lineage: { sourceAssetRef: ASSET_REF, timestampMs: 0 },
    });
    expect(prefill.mock.calls[0][0].source.assetRef).toBe(`upload:${uploaded.id}`);
    expect(goto).toHaveBeenCalledWith('/app/create');
    expect(invalidate).toHaveBeenCalledTimes(2);
  });
  it('keeps completed uploads when retrying a scrub after a partial batch failure', async () => {
    upload
      .mockResolvedValueOnce(uploaded)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ...uploaded, id: 'c0000000-0000-4000-8000-000000000003' });
    modal();
    await ready();
    await fireEvent.click(screen.getByRole('button', { name: 'Automatic: 00:00.000' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Automatic: 00:00.500' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Extract frames' }));
    await screen.findByRole('button', { name: 'Retry' });
    const scrub = vi
      .spyOn(FrameExtractionSession.prototype, 'scrub')
      .mockImplementation((_timestamp, onError) => onError(new Error('network')));
    await fireEvent.input(screen.getByRole('slider'), { target: { value: '1250' } });
    scrub.mockRestore();
    await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Extract frames' }));
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Use as input' })).toHaveLength(2),
    );
    expect(upload.mock.calls.map((call) => call[1].lineage.timestampMs)).toEqual([0, 500, 500]);
  });
  it('lets Retry recover after an earlier successful recovery and a transient preview failure', async () => {
    recover
      .mockResolvedValueOnce({ retry: true })
      .mockResolvedValueOnce({ retry: false, failure: 'network' })
      .mockResolvedValueOnce({ retry: true });
    modal();
    await ready();
    const video = screen.getByRole('dialog').querySelector('video');
    if (!video) throw new Error('Expected the decoder video');
    let nativeError: MediaError | null = null;
    Object.defineProperty(video, 'error', { configurable: true, get: () => nativeError });
    const reload = vi.spyOn(video, 'load').mockImplementation(() => {
      nativeError = null;
    });
    reload.mockClear();

    nativeError = { code: 4 } as MediaError;
    await fireEvent.input(screen.getByRole('slider'), { target: { value: '1500' } });
    await waitFor(() => expect(recover).toHaveBeenCalledOnce());
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());

    nativeError = { code: 2 } as MediaError;
    await fireEvent.input(screen.getByRole('slider'), { target: { value: '1700' } });
    await screen.findByRole('button', { name: 'Retry' });
    expect(recover).toHaveBeenCalledTimes(2);

    nativeError = { code: 4 } as MediaError;
    await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(recover).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.getByRole('slider')).toBeTruthy();
  });
  it('shows completed frames alongside the unavailable state after a lineage error', async () => {
    upload.mockResolvedValueOnce(uploaded).mockRejectedValueOnce(
      new ApiRequestError({
        error: 'invalid_frame_lineage',
        message: 'source missing',
        status_code: 400,
      }),
    );
    modal();
    await ready();
    for (const timestamp of ['00:00.000', '00:00.500', '00:01.000']) {
      await fireEvent.click(screen.getByRole('button', { name: `Automatic: ${timestamp}` }));
    }
    await fireEvent.click(screen.getByRole('button', { name: 'Extract frames' }));

    await screen.findByText("Frame extraction isn't available for this video");
    expect(screen.getAllByRole('button', { name: 'Use as input' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Report this video' })).toBeTruthy();
  });
  it('shows partial results beside Retry and resumes only the remaining uploads', async () => {
    const first = { ...uploaded, id: 'c0000000-0000-4000-8000-000000000012' };
    const second = { ...uploaded, id: 'c0000000-0000-4000-8000-000000000013' };
    const third = { ...uploaded, id: 'c0000000-0000-4000-8000-000000000014' };
    upload
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(second)
      .mockResolvedValueOnce(third);
    modal();
    await ready();
    for (const timestamp of ['00:00.000', '00:00.500', '00:01.000']) {
      await fireEvent.click(screen.getByRole('button', { name: `Automatic: ${timestamp}` }));
    }
    await fireEvent.click(screen.getByRole('button', { name: 'Extract frames' }));

    await screen.findByRole('button', { name: 'Retry' });
    expect(screen.getAllByRole('button', { name: 'Use as input' })).toHaveLength(1);
    await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Use as input' })).toHaveLength(3),
    );
    expect(upload.mock.calls.map((call) => call[1].lineage.timestampMs)).toEqual([
      0, 500, 500, 1000,
    ]);
  });
  it('updates the saving progress after each upload completes', async () => {
    const pending: Array<(value: typeof uploaded) => void> = [];
    upload.mockImplementation(
      () => new Promise((resolve) => pending.push(resolve as (value: typeof uploaded) => void)),
    );
    modal();
    await ready();
    for (const timestamp of ['00:00.000', '00:00.500', '00:01.000']) {
      await fireEvent.click(screen.getByRole('button', { name: `Automatic: ${timestamp}` }));
    }
    await fireEvent.click(screen.getByRole('button', { name: 'Extract frames' }));
    await waitFor(() => expect(upload).toHaveBeenCalledOnce());
    expect(screen.getByText('Saving 0 of 3')).toBeTruthy();

    pending[0]({ ...uploaded, id: 'c0000000-0000-4000-8000-000000000015' });
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Saving 1 of 3')).toBeTruthy();
    pending[1]({ ...uploaded, id: 'c0000000-0000-4000-8000-000000000016' });
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(3));
    expect(screen.getByText('Saving 2 of 3')).toBeTruthy();
    pending[2]({ ...uploaded, id: 'c0000000-0000-4000-8000-000000000017' });
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Use as input' })).toHaveLength(3),
    );
  });
});
